// The ONLY module that calls Gemini. Everything else goes through these helpers.
// Every call passes the rate limiter (limiter.ts); deterministic calls can be cached (cache.ts).
import { ApiError, FileState, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { readCache, writeCache } from "./cache";
import { LlmError } from "./errors";
import { limiter, type LimitKind } from "./limiter";

/** fast: bulk extraction + grading · strong: tutor, generation, video, course build · verify: blind quiz check (a DIFFERENT model = cross-model validation). */
export type ModelRole = "fast" | "strong" | "verify";
export type Usage = { inputTokens: number; outputTokens: number };

export const EMBED_DIM = 768;

// Keys: APP_GEMINI_API_KEYS="k1,k2,…" and/or APP_GEMINI_API_KEY. When Google reports a key out of
// quota (429), calls move to the next key. Explicit keys only: never the SDK's GEMINI_API_KEY fallback.
const clients = new Map<string, GoogleGenAI>();
let keyIndex = 0;

export function geminiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const all = [...(env.APP_GEMINI_API_KEYS ?? "").split(","), env.APP_GEMINI_API_KEY ?? ""].map((k) => k.trim()).filter(Boolean);
  return [...new Set(all)];
}

/** Client for key `index` (default: the current key). */
function getClient(index: number = keyIndex): GoogleGenAI {
  const keys = geminiKeys();
  if (keys.length === 0) throw new LlmError("config", "No Gemini key: set APP_GEMINI_API_KEY (or APP_GEMINI_API_KEYS) in .env");
  const key = keys[index % keys.length];
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(key, c);
  }
  return c;
}

/**
 * Moves past key `failed` (the index the failing call used); false if there is only one key.
 * Concurrent calls that fail on the same key rotate once, not once each (which would cycle back to it).
 */
function rotateKey(failed: number): boolean {
  const n = geminiKeys().length;
  if (n < 2) return false;
  if (keyIndex % n !== failed % n) return true; // another call already moved on
  keyIndex = (keyIndex + 1) % n;
  console.warn(`[llm] Gemini key ${((keyIndex + n - 1) % n) + 1}/${n} is out of quota or was rejected; switched to key ${keyIndex + 1}/${n}`);
  return true;
}

function envModel(name: "LLM_MODEL_FAST" | "LLM_MODEL_STRONG" | "LLM_MODEL_VERIFY" | "EMBED_MODEL"): string {
  const id = process.env[name];
  if (!id) throw new LlmError("config", `${name} is not set in .env`);
  return id;
}

export function modelFor(role: ModelRole): string {
  if (role === "verify") return process.env.LLM_MODEL_VERIFY?.trim() || envModel("LLM_MODEL_FAST");
  return envModel(role === "fast" ? "LLM_MODEL_FAST" : "LLM_MODEL_STRONG");
}

/**
 * A Files API file belongs to the project of the key that uploaded it; another key gets 403
 * "You do not have permission to access the File … or it may not exist". That is not a bad key.
 */
export function isFileAccessDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 404) && /\bfile\b/i.test(e.message) && /permission|not exist|not found/i.test(e.message);
}

/** Google refused the key itself (invalid, revoked, or not allowed for this model/project). */
export function isKeyRejected(e: unknown): boolean {
  if (!(e instanceof ApiError) || isFileAccessDenied(e)) return false;
  return e.status === 401 || e.status === 403 || (e.status === 400 && /API_KEY_INVALID|API key not valid|API key expired/i.test(e.message));
}

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (isFileAccessDenied(e)) {
    return new LlmError("file", `The uploaded video isn't available to this Gemini key (HTTP ${(e as ApiError).status}); run ingest again to re-upload it.`, e);
  }
  if (isKeyRejected(e)) {
    const reason = /API_KEY_INVALID|not valid/i.test((e as ApiError).message) ? "invalid" : /expired/i.test((e as ApiError).message) ? "expired" : "not permitted";
    return new LlmError("config", `Gemini rejected the API key (HTTP ${(e as ApiError).status}, ${reason}). Check APP_GEMINI_API_KEY / APP_GEMINI_API_KEYS in .env.`, e);
  }
  if (e instanceof ApiError) {
    return new LlmError(e.status === 429 ? "rate_limit" : "api", `HTTP ${e.status}: ${e.message}`, e);
  }
  return new LlmError("api", e instanceof Error ? e.message : String(e), e);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-request timeout (ms) for Gemini HTTP calls; LLM_TIMEOUT_MS overrides. Without one the SDK waits
 * forever on a hung connection. A timeout surfaces as a network error (retried once, like a 5xx).
 */
export function requestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.LLM_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 120_000;
}

/** Gemini's 429 body carries a RetryInfo delay ("retryDelay": "36s" / "Please retry in 36.4s"). */
export function retryDelayMs(e: unknown): number | undefined {
  const s = e instanceof Error ? e.message : String(e);
  const m = s.match(/retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? s.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

/** Rough input-token estimate used to reserve TPM before a call (replaced by the real count after). */
export function estimateInputTokens(parts: Part[], system?: string): number {
  let t = 20 + Math.ceil((system?.length ?? 0) / 4);
  for (const p of parts) {
    if (p.text) t += Math.ceil(p.text.length / 4);
    else if (p.inlineData?.mimeType === "application/pdf") t += 1_800; // one page; measured ~600 for a simple page
    else if (p.inlineData) t += 1_300; // one image; measured ~1.1K for a small slide image
    else if (p.fileData) t += 60_000; // video/file: callers should pass a real estimate
  }
  return t;
}

/**
 * Runs `call` under the limiter: reserve → call → settle with actual tokens.
 * Gemini 429s are retried after their retryDelay (clamped 5–60 s), up to 3 attempts; transient
 * 5xx/network errors once. The limiter's own stops (cause "local-limit") are never retried.
 */
async function limited<T>(
  kind: LimitKind,
  requests: number,
  estTokens: number,
  call: () => Promise<{ value: T; inputTokens?: number }>,
  /** Calls that use an uploaded file must stay on the key that uploaded it: no rotation. */
  pinned = false,
): Promise<T> {
  let rotations = 0;
  for (let attempt = 1; ; attempt++) {
    const reservation = await limiter(kind).acquire(requests, estTokens);
    const usedKey = keyIndex; // `call` picks its client synchronously from the current key
    try {
      const { value, inputTokens } = await call();
      reservation.settle(inputTokens);
      return value;
    } catch (e) {
      reservation.settle();
      const err = toLlmError(e);
      // A rejected key (revoked, invalid): try the next configured key before giving up.
      if (!pinned && isKeyRejected(e) && rotations < geminiKeys().length - 1 && rotateKey(usedKey)) {
        rotations++;
        attempt--;
        continue;
      }
      if (err.kind === "rate_limit" && err.cause !== "local-limit") {
        // Another key first (no waiting), then Google's suggested delay.
        if (!pinned && rotations < geminiKeys().length - 1 && rotateKey(usedKey)) {
          rotations++;
          attempt--;
          continue;
        }
        if (attempt < 3) {
          await sleep(Math.min(60_000, Math.max(5_000, retryDelayMs(e) ?? 15_000)));
          continue;
        }
      }
      // Transient server/network failure (5xx, "overloaded", fetch failed): one retry.
      const status = e instanceof ApiError ? e.status : undefined;
      // 503 "high demand" spikes get more patience (and the other key) than other 5xx.
      const maxAttempts = status === 503 ? 4 : 2;
      if (err.kind === "api" && attempt < maxAttempts && (status === undefined || status >= 500)) {
        if (status === 503 && !pinned) rotateKey(usedKey);
        await sleep([2_000, 5_000, 10_000][attempt - 1] ?? 10_000);
        continue;
      }
      throw err;
    }
  }
}

/** Gemini's responseJsonSchema doesn't need the $schema marker Zod adds. */
function geminiJsonSchema(schema: z.ZodType): unknown {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** Cache identity of a structured call: changing the model, the schema or the caller's key misses. */
export function generateCacheKey(model: string, schema: z.ZodType, cacheKey: string): string {
  return `${model}|${JSON.stringify(geminiJsonSchema(schema))}|${cacheKey}`;
}

/** Cache identity of one embedded text. */
export function embedCacheKey(model: string, taskType: EmbedTask, text: string): string {
  return `${model}|${EMBED_DIM}|${taskType}|${text}`;
}

/**
 * Structured call: response is constrained to `schema` and validated with Zod.
 * Parse/validation failures get one retry. With `cacheKey`, an identical earlier result
 * (same model, schema and key) is returned from disk without calling Gemini.
 */
export async function generateJson<S extends z.ZodType>(opts: {
  role: ModelRole;
  schema: S;
  parts: Part[];
  system?: string;
  temperature?: number;
  /** Stable identity of this request (e.g. file hash + page + prompt version). Enables the cache. */
  cacheKey?: string;
  /** Override the input-token estimate (required for long videos). */
  estimatedInputTokens?: number;
  /** Use exactly this key (UploadedFile.keyIndex) and never rotate: required when `parts` reference an uploaded file. */
  keyIndex?: number;
}): Promise<{ data: z.infer<S>; usage: Usage; cached: boolean }> {
  const primary = modelFor(opts.role);
  try {
    return await generateWith(primary, opts);
  } catch (e) {
    // The model is overloaded (5xx) or out of quota/unavailable on every key (429/404) after retries:
    // answer with the fallback model rather than fail. The limiter's own stops are never bypassed.
    const fallback = fallbackModel(primary);
    const status = e instanceof LlmError && e.cause instanceof ApiError ? e.cause.status : undefined;
    const retryable = status !== undefined && (status >= 500 || status === 429 || status === 404);
    if (!fallback || fallback === primary || !retryable) throw e;
    console.warn(`[llm] ${primary} unavailable (HTTP ${status}); using fallback ${fallback}`);
    return generateWith(fallback, opts);
  }
}

/**
 * The model to use when `primary` is overloaded or unavailable: LLM_MODEL_FALLBACK, else another
 * configured model (VERIFY, then FAST) that differs from `primary` (falling back to the same model
 * would just hit the same overload). Undefined when there is none.
 */
export function fallbackModel(primary: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [env.LLM_MODEL_FALLBACK, env.LLM_MODEL_VERIFY, env.LLM_MODEL_FAST].map((m) => m?.trim()).filter((m): m is string => !!m);
  return candidates.find((m) => m !== primary);
}

async function generateWith<S extends z.ZodType>(
  model: string,
  opts: { schema: S; parts: Part[]; system?: string; temperature?: number; cacheKey?: string; estimatedInputTokens?: number; keyIndex?: number },
): Promise<{ data: z.infer<S>; usage: Usage; cached: boolean }> {
  const responseJsonSchema = geminiJsonSchema(opts.schema);
  const fullKey = opts.cacheKey && generateCacheKey(model, opts.schema, opts.cacheKey);
  if (fullKey) {
    const hit = await readCache<{ data: unknown; usage: Usage }>("generate", fullKey);
    const parsed = hit && opts.schema.safeParse(hit.data);
    if (parsed?.success) return { data: parsed.data, usage: { inputTokens: 0, outputTokens: 0 }, cached: true };
  }

  const est = opts.estimatedInputTokens ?? estimateInputTokens(opts.parts, opts.system);
  let lastErr: LlmError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1000);
    const res = await limited("generate", 1, est, async () => {
      const r = await getClient(opts.keyIndex).models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: { systemInstruction: opts.system, temperature: opts.temperature, responseMimeType: "application/json", responseJsonSchema, httpOptions: { timeout: requestTimeoutMs() } },
      });
      return { value: r, inputTokens: r.usageMetadata?.promptTokenCount };
    }, opts.keyIndex !== undefined);
    const usage: Usage = {
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    };
    const text = res.text;
    if (!text) {
      lastErr = new LlmError("parse", "empty response");
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      lastErr = new LlmError("parse", `invalid JSON: ${text.slice(0, 200)}`, e);
      continue;
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      lastErr = new LlmError("validation", z.prettifyError(parsed.error), parsed.error);
      continue;
    }
    if (fullKey) await writeCache("generate", fullKey, { data: parsed.data, usage });
    return { data: parsed.data, usage, cached: false };
  }
  throw lastErr ?? new LlmError("api", "unknown failure");
}

/** Cache-only lookup for a structured call (no network): lets callers skip expensive prep such as a video upload. */
export async function cachedGenerateJson<S extends z.ZodType>(role: ModelRole, schema: S, cacheKey: string): Promise<z.infer<S> | undefined> {
  const hit = await readCache<{ data: unknown }>("generate", generateCacheKey(modelFor(role), schema, cacheKey));
  const parsed = hit && schema.safeParse(hit.data);
  return parsed?.success ? parsed.data : undefined;
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const estimateTextTokens = (s: string) => Math.ceil(s.length / 4) + 2;

/**
 * Embeds texts into EMBED_DIM vectors (order preserved). Each text is cached on disk; misses are
 * batched so every call fits the per-minute request (1 per text) and token limits.
 */
export async function embed(texts: string[], taskType: EmbedTask): Promise<number[][]> {
  const model = envModel("EMBED_MODEL");
  const keyOf = (t: string) => embedCacheKey(model, taskType, t);
  const out: (number[] | undefined)[] = new Array(texts.length);
  const missing: number[] = [];
  for (const [i, t] of texts.entries()) {
    const v = await readCache<number[]>("embed", keyOf(t));
    if (v?.length === EMBED_DIM) out[i] = v;
    else missing.push(i);
  }

  const lim = limiter("embed").limits;
  const maxTexts = Math.min(100, lim.rpm);
  const batches: number[][] = [];
  let batch: number[] = [];
  let batchTokens = 0;
  for (const i of missing) {
    const tok = estimateTextTokens(texts[i]);
    if (batch.length && (batch.length >= maxTexts || batchTokens + tok > lim.tpm)) {
      batches.push(batch);
      batch = [];
      batchTokens = 0;
    }
    batch.push(i);
    batchTokens += tok;
  }
  if (batch.length) batches.push(batch);

  for (const b of batches) {
    const contents = b.map((i) => texts[i]);
    const est = contents.reduce((s, t) => s + estimateTextTokens(t), 0);
    const vectors = await limited("embed", b.length, est, async () => {
      const res = await getClient().models.embedContent({ model, contents, config: { taskType, outputDimensionality: EMBED_DIM, httpOptions: { timeout: requestTimeoutMs() } } });
      return { value: (res.embeddings ?? []).map((e) => e.values ?? []) };
    });
    if (vectors.length !== b.length || vectors.some((v) => v.length !== EMBED_DIM)) {
      throw new LlmError("validation", `expected ${b.length}×${EMBED_DIM} embeddings, got ${vectors.length}`);
    }
    for (const [j, i] of b.entries()) {
      out[i] = vectors[j];
      await writeCache("embed", keyOf(texts[i]), vectors[j]);
    }
  }
  return out as number[][];
}

/** `keyIndex`: the key that uploaded it. Only that key's project can read the file. */
export type UploadedFile = { name: string; uri: string; mimeType: string; expiresAt: Date | null; keyIndex: number };

/** Uploads a local file to the Gemini Files API and waits until it is ACTIVE (not a generate request). */
export async function uploadFile(
  path: string,
  mimeType: string,
  { timeoutMs = 5 * 60_000 } = {},
): Promise<UploadedFile> {
  const uploader = keyIndex % Math.max(1, geminiKeys().length);
  const ai = getClient(uploader);
  try {
    let file = await ai.files.upload({ file: path, config: { mimeType } });
    const deadline = Date.now() + timeoutMs;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) throw new LlmError("file", `timed out waiting for ${file.name}`);
      await sleep(2000);
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state !== FileState.ACTIVE || !file.uri || !file.name) {
      throw new LlmError("file", `file ${file.name} ended in state ${file.state}`);
    }
    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType, expiresAt: file.expirationTime ? new Date(file.expirationTime) : null, keyIndex: uploader };
  } catch (e) {
    throw toLlmError(e);
  }
}

export async function deleteFile(name: string, index?: number): Promise<void> {
  try {
    await getClient(index).files.delete({ name });
  } catch (e) {
    throw toLlmError(e);
  }
}

/** Cheap reachability check: fetches model metadata (no generation, no tokens). */
export async function checkModels(): Promise<Record<string, { ok: boolean; error?: string }>> {
  const ids = {
    LLM_MODEL_FAST: process.env.LLM_MODEL_FAST,
    LLM_MODEL_STRONG: process.env.LLM_MODEL_STRONG,
    ...(process.env.LLM_MODEL_VERIFY && { LLM_MODEL_VERIFY: process.env.LLM_MODEL_VERIFY }),
    EMBED_MODEL: process.env.EMBED_MODEL,
  };
  const result: Record<string, { ok: boolean; error?: string }> = {};
  for (const [key, id] of Object.entries(ids)) {
    if (!id) {
      result[key] = { ok: false, error: "not set" };
      continue;
    }
    try {
      await getClient().models.get({ model: id });
      result[key] = { ok: true };
    } catch (e) {
      result[key] = { ok: false, error: toLlmError(e).message };
    }
  }
  return result;
}
