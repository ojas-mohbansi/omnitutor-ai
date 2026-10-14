// Client-side Gemini quota guard. Keeps us under the free-tier limits instead of
// discovering them through 429s:
//   - per-minute requests (RPM) and input tokens (TPM), as a sliding 60 s window
//   - max concurrent calls
//   - requests per day (RPD), counted per Pacific-time day in data/cache/usage.json
// Embedding requests count once PER TEXT (verified on the AI Studio dashboard: 4 texts
// in 2 calls showed as 4 requests). Defaults sit below the verified limits; override via env.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LlmError } from "./errors";
import { repoRoot } from "./storage";

export type LimitKind = "generate" | "embed";
export type Limits = { rpm: number; tpm: number; rpd: number; concurrency: number };

/** Verified free-tier limits (AI Studio → Rate limits, 2026-10-14) and the defaults we enforce. */
export const FREE_TIER: Record<LimitKind, { model: string; rpm: number; tpm: number; rpd: number }> = {
  generate: { model: "gemini-3.1-flash-lite", rpm: 15, tpm: 250_000, rpd: 500 },
  embed: { model: "gemini-embedding-001", rpm: 100, tpm: 30_000, rpd: 1_000 },
};
export const DEFAULT_LIMITS: Record<LimitKind, Limits> = {
  generate: { rpm: 12, tpm: 200_000, rpd: 450, concurrency: 4 },
  embed: { rpm: 80, tpm: 24_000, rpd: 900, concurrency: 2 },
};

/** Env override: LLM_RPM / LLM_TPM / LLM_RPD / LLM_CONCURRENCY and EMBED_* (positive numbers). */
export function limitsFromEnv(kind: LimitKind, env: NodeJS.ProcessEnv = process.env): Limits {
  const prefix = kind === "generate" ? "LLM" : "EMBED";
  const d = DEFAULT_LIMITS[kind];
  const n = (key: string, fallback: number) => {
    const v = Number(env[`${prefix}_${key}`]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
  };
  // Limits are per Gemini key; with several keys (APP_GEMINI_API_KEYS) the budget scales with them.
  const keys = new Set([...(env.APP_GEMINI_API_KEYS ?? "").split(","), env.APP_GEMINI_API_KEY ?? ""].map((k) => k.trim()).filter(Boolean)).size || 1;
  return { rpm: n("RPM", d.rpm * keys), tpm: n("TPM", d.tpm * keys), rpd: n("RPD", d.rpd * keys), concurrency: n("CONCURRENCY", d.concurrency) };
}

/** Gemini daily quotas reset at midnight Pacific time. */
export function pacificDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export type KindUsage = { requests: number; inputTokens: number };
export type DayUsage = { day: string; generate: KindUsage; embed: KindUsage };
type LedgerFile = { days: Record<string, Omit<DayUsage, "day">> };

/**
 * Per-day request/token counts, persisted so restarts don't reset the daily budget. Keeps 14 days.
 * The file is re-read before every update: the dev server and scripts that call Gemini through
 * @sc/core share it, and a cached copy would overwrite the other process's counts.
 */
export class UsageLedger {
  private memory: LedgerFile = { days: {} };

  constructor(
    private file: string | null,
    private now: () => Date = () => new Date(),
  ) {}

  private load(): LedgerFile {
    if (!this.file) return this.memory;
    try {
      return JSON.parse(readFileSync(this.file, "utf8")) as LedgerFile;
    } catch {
      return { days: {} };
    }
  }

  private save(data: LedgerFile) {
    if (!this.file) return;
    const days = Object.keys(data.days).sort().slice(-14);
    data.days = Object.fromEntries(days.map((d) => [d, data.days[d]]));
    mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(data, null, 2);
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, json);
    try {
      renameSync(tmp, this.file); // atomic: a concurrent reader never sees half a file
    } catch {
      writeFileSync(this.file, json); // Windows can refuse the rename while another process reads the file
      rmSync(tmp, { force: true });
    }
  }

  private bucket(data: LedgerFile, kind: LimitKind): KindUsage {
    const day = pacificDay(this.now());
    data.days[day] ??= { generate: { requests: 0, inputTokens: 0 }, embed: { requests: 0, inputTokens: 0 } };
    return data.days[day][kind];
  }

  /** Counts `requests` against today's budget, or throws (rate_limit) if it would exceed `rpd`. */
  reserve(kind: LimitKind, requests: number, rpd: number): void {
    const data = this.load();
    const b = this.bucket(data, kind);
    if (b.requests + requests > rpd) {
      throw new LlmError(
        "rate_limit",
        `Daily ${kind} budget reached (${b.requests}/${rpd} requests used today, Pacific time). It resets at midnight Pacific; raise ${kind === "generate" ? "LLM" : "EMBED"}_RPD only if AI Studio shows headroom.`,
        "local-limit",
      );
    }
    b.requests += requests;
    this.save(data);
  }

  addTokens(kind: LimitKind, tokens: number): void {
    const data = this.load();
    this.bucket(data, kind).inputTokens += Math.max(0, Math.round(tokens));
    this.save(data);
  }

  today(): DayUsage {
    const data = this.load();
    return { day: pacificDay(this.now()), generate: { ...this.bucket(data, "generate") }, embed: { ...this.bucket(data, "embed") } };
  }
}

export type Reservation = {
  /** Release the concurrency slot; replace the token estimate with the actual input tokens if known. */
  settle(actualInputTokens?: number): void;
};

type WindowEntry = { t: number; requests: number; tokens: number };
const WINDOW_MS = 60_000;

export class RateLimiter {
  private window: WindowEntry[] = [];
  private inFlight = 0;
  private waiters: Array<() => void> = [];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    readonly kind: LimitKind,
    readonly limits: Limits,
    readonly ledger: UsageLedger,
    deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private prune() {
    const cutoff = this.now() - WINDOW_MS;
    while (this.window.length && this.window[0].t <= cutoff) this.window.shift();
  }

  /** Requests and tokens used in the current 60 s window. */
  usage(): { requests: number; tokens: number; inFlight: number } {
    this.prune();
    return {
      requests: this.window.reduce((s, e) => s + e.requests, 0),
      tokens: this.window.reduce((s, e) => s + e.tokens, 0),
      inFlight: this.inFlight,
    };
  }

  /** Waits until `requests` / `estTokens` fit the per-minute window and a concurrency slot is free. */
  async acquire(requests: number, estTokens: number): Promise<Reservation> {
    const { rpm, tpm, rpd, concurrency } = this.limits;
    if (requests > rpm) throw new LlmError("rate_limit", `A single ${this.kind} call of ${requests} requests exceeds the ${rpm}/min limit; split it.`, "local-limit");
    if (estTokens > tpm) {
      throw new LlmError("rate_limit", `A single ${this.kind} call needs ~${estTokens} input tokens, more than the ${tpm}/min limit (use a shorter input).`, "local-limit");
    }
    for (;;) {
      const used = this.usage();
      const windowFull = used.requests + requests > rpm || used.tokens + estTokens > tpm;
      if (!windowFull && this.inFlight < concurrency) break;
      const untilFree = windowFull ? this.window[0].t + WINDOW_MS - this.now() + 1 : 1_000;
      await Promise.race([this.sleep(Math.max(1, untilFree)), new Promise<void>((r) => this.waiters.push(r))]);
    }
    this.ledger.reserve(this.kind, requests, rpd); // may throw: daily budget
    const entry: WindowEntry = { t: this.now(), requests, tokens: estTokens };
    this.window.push(entry);
    this.inFlight++;
    let settled = false;
    return {
      settle: (actual) => {
        if (settled) return;
        settled = true;
        if (actual !== undefined && actual >= 0) entry.tokens = actual;
        this.ledger.addTokens(this.kind, entry.tokens);
        this.inFlight--;
        const w = this.waiters;
        this.waiters = [];
        w.forEach((wake) => wake());
      },
    };
  }
}

let ledger: UsageLedger | undefined;
const limiters: Partial<Record<LimitKind, RateLimiter>> = {};

export function usageLedger(): UsageLedger {
  ledger ??= new UsageLedger(path.join(repoRoot(), "data", "cache", "usage.json"));
  return ledger;
}

export function limiter(kind: LimitKind): RateLimiter {
  limiters[kind] ??= new RateLimiter(kind, limitsFromEnv(kind), usageLedger());
  return limiters[kind]!;
}

/** Today's usage as counted by this app (AI Studio remains the source of truth). */
export function todayUsage(): DayUsage & { limits: Record<LimitKind, Limits> } {
  return { ...usageLedger().today(), limits: { generate: limiter("generate").limits, embed: limiter("embed").limits } };
}
