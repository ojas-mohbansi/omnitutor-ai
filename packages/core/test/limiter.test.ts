// Rate limiter + usage ledger with a fake clock (no Gemini calls). Run: npm run test
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { LlmError } from "../src/errors";
import { RateLimiter, UsageLedger, limitsFromEnv, pacificDay, type Limits } from "../src/limiter";

let dir: string;
before(async () => { dir = await mkdtemp(path.join(tmpdir(), "sc-limiter-")); });
after(async () => { await rm(dir, { recursive: true, force: true }); });

/** Fake clock: sleeping advances time instantly but still yields to the event loop. */
function fakeClock(start = Date.UTC(2026, 9, 14, 12)) {
  let t = start;
  return { now: () => t, sleep: (ms: number) => { t += ms; return new Promise<void>((r) => setImmediate(r)); }, advance: (ms: number) => { t += ms; } };
}
const make = (limits: Partial<Limits>, clock = fakeClock(), ledger = new UsageLedger(null)) =>
  ({ clock, l: new RateLimiter("generate", { rpm: 100, tpm: 1e9, rpd: 1e6, concurrency: 100, ...limits }, ledger, clock) });
const isLocalLimit = (pattern: RegExp) => (e: unknown) => e instanceof LlmError && e.kind === "rate_limit" && e.cause === "local-limit" && pattern.test(e.message);

describe("per-minute window", () => {
  it("RPM: the 4th request in a minute waits until the window frees", async () => {
    const { clock, l } = make({ rpm: 3 });
    const t0 = clock.now();
    const times: number[] = [];
    for (let i = 0; i < 5; i++) { (await l.acquire(1, 0)).settle(); times.push(clock.now() - t0); }
    assert.deepEqual(times.slice(0, 3), [0, 0, 0]);
    assert.ok(times[3] >= 60_000 && times[4] >= 60_000, String(times));
  });
  it("TPM: a reservation that doesn't fit waits; settling with fewer real tokens frees room", async () => {
    const { clock, l } = make({ tpm: 1_000 });
    const t0 = clock.now();
    const a = await l.acquire(1, 600);
    a.settle(100); // real usage was much lower than estimated
    await l.acquire(1, 600); // 100 + 600 fits immediately
    assert.equal(clock.now() - t0, 0);
    await l.acquire(1, 600); // 700 + 600 > 1000 → waits for the window
    assert.ok(clock.now() - t0 >= 60_000);
  });
  it("a single call bigger than the per-minute limits fails fast (never retried)", async () => {
    const { l } = make({ rpm: 10, tpm: 1_000 });
    await assert.rejects(l.acquire(11, 0), isLocalLimit(/exceeds the 10\/min/));
    await assert.rejects(l.acquire(1, 5_000), isLocalLimit(/more than the 1000\/min/));
  });
});

describe("concurrency", () => {
  it("at most N calls in flight; the next starts when one settles", async () => {
    const { l } = make({ concurrency: 2 });
    const r1 = await l.acquire(1, 0);
    await l.acquire(1, 0);
    let third = false;
    const p3 = l.acquire(1, 0).then((r) => { third = true; return r; });
    await new Promise((r) => setImmediate(r));
    assert.equal(third, false);
    assert.equal(l.usage().inFlight, 2);
    r1.settle();
    await p3;
    assert.equal(third, true);
  });
});

describe("daily budget (ledger)", () => {
  it("stops at RPD, survives a restart, resets on the next Pacific day", async () => {
    const file = path.join(dir, "usage.json");
    const clock = fakeClock(Date.UTC(2026, 9, 14, 18)); // 11:00 PDT
    const ledger = new UsageLedger(file, () => new Date(clock.now()));
    const { l } = make({ rpd: 3 }, clock, ledger);
    for (let i = 0; i < 3; i++) (await l.acquire(1, 50)).settle(40);
    await assert.rejects(l.acquire(1, 0), isLocalLimit(/Daily generate budget reached \(3\/3/));

    const restarted = new UsageLedger(file, () => new Date(clock.now()));
    assert.deepEqual(restarted.today().generate, { requests: 3, inputTokens: 120 });

    clock.advance(14 * 3_600_000); // 01:00 PDT next day
    assert.equal(restarted.today().day, "2026-10-15");
    assert.deepEqual(restarted.today().generate, { requests: 0, inputTokens: 0 });
  });
  it("two processes sharing the file both count (no lost updates)", () => {
    const file = path.join(dir, "shared-usage.json");
    const server = new UsageLedger(file); // e.g. the dev server
    const script = new UsageLedger(file); // e.g. an ingestion script running next to it
    server.reserve("generate", 1, 5);
    script.reserve("generate", 2, 5);
    server.addTokens("generate", 100);
    script.addTokens("generate", 50);
    server.reserve("generate", 1, 5);
    assert.deepEqual(script.today().generate, { requests: 4, inputTokens: 150 });
    assert.throws(() => script.reserve("generate", 2, 5), isLocalLimit(/Daily generate budget reached \(4\/5/));
  });
  it("embeddings count one request per text", async () => {
    const ledger = new UsageLedger(null);
    const l = new RateLimiter("embed", { rpm: 100, tpm: 1e9, rpd: 1e6, concurrency: 2 }, ledger, fakeClock());
    (await l.acquire(25, 500)).settle();
    assert.equal(ledger.today().embed.requests, 25);
  });
});

describe("config", () => {
  it("pacificDay uses America/Los_Angeles", () => {
    assert.equal(pacificDay(new Date("2026-10-14T06:30:00Z")), "2026-10-13"); // 23:30 PDT
    assert.equal(pacificDay(new Date("2026-10-14T08:00:00Z")), "2026-10-14"); // 01:00 PDT
    assert.equal(pacificDay(new Date("2026-12-01T07:30:00Z")), "2026-11-30"); // 23:30 PST
  });
  it("limitsFromEnv: defaults below the verified free tier; valid overrides apply", () => {
    assert.deepEqual(limitsFromEnv("generate", {}), { rpm: 12, tpm: 200_000, rpd: 450, concurrency: 4 });
    assert.deepEqual(limitsFromEnv("embed", {}), { rpm: 80, tpm: 24_000, rpd: 900, concurrency: 2 });
    assert.deepEqual(limitsFromEnv("generate", { LLM_RPM: "5", LLM_RPD: "abc", LLM_TPM: "-1" }), { rpm: 5, tpm: 200_000, rpd: 450, concurrency: 4 });
  });
});
