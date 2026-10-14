// Cache + Gemini wrapper helpers without network: cached calls must work with NO API key.
// Run: npm run test
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { z } from "zod";
import { readCache, writeCache } from "../src/cache";
import { LlmError } from "../src/errors";
import { EMBED_DIM, embed, embedCacheKey, estimateInputTokens, generateCacheKey, generateJson, retryDelayMs } from "../src/llm";

let dir: string;
const saved = { ...process.env };
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sc-cache-"));
  process.env.REPO_ROOT = dir;
  delete process.env.APP_GEMINI_API_KEY; // any real call would fail with a config error
  process.env.LLM_MODEL_FAST = "test-model";
  process.env.EMBED_MODEL = "test-embed";
  delete process.env.LLM_CACHE;
});
after(async () => {
  process.env = saved;
  await rm(dir, { recursive: true, force: true });
});

const Schema = z.object({ answer: z.number() });

describe("disk cache", () => {
  it("round-trips, misses on another key, and is disabled by LLM_CACHE=off", async () => {
    await writeCache("t", "k1", { v: 1 });
    assert.deepEqual(await readCache("t", "k1"), { v: 1 });
    assert.equal(await readCache("t", "k2"), undefined);
    process.env.LLM_CACHE = "off";
    assert.equal(await readCache("t", "k1"), undefined);
    await writeCache("t", "k3", { v: 3 });
    delete process.env.LLM_CACHE;
    assert.equal(await readCache("t", "k3"), undefined);
  });
});

describe("generateJson cache", () => {
  it("a miss tries Gemini (here: no key → config error, proving no silent success)", async () => {
    await assert.rejects(
      generateJson({ role: "fast", schema: Schema, parts: [{ text: "q" }], cacheKey: "miss" }),
      (e: unknown) => e instanceof LlmError && e.kind === "config",
    );
  });
  it("a hit returns the stored data with zero usage and no network", async () => {
    await writeCache("generate", generateCacheKey("test-model", Schema, "page-1"), { data: { answer: 17 }, usage: { inputTokens: 600, outputTokens: 50 } });
    const r = await generateJson({ role: "fast", schema: Schema, parts: [{ text: "q" }], cacheKey: "page-1" });
    assert.deepEqual(r, { data: { answer: 17 }, usage: { inputTokens: 0, outputTokens: 0 }, cached: true });
  });
  it("a cached value that no longer matches the schema is ignored", async () => {
    await writeCache("generate", generateCacheKey("test-model", Schema, "stale"), { data: { answer: "seventeen" }, usage: {} });
    await assert.rejects(generateJson({ role: "fast", schema: Schema, parts: [{ text: "q" }], cacheKey: "stale" }), (e: unknown) => e instanceof LlmError && e.kind === "config");
  });
  it("the key changes with model, schema and caller key", () => {
    const k = generateCacheKey("m", Schema, "a");
    assert.notEqual(k, generateCacheKey("m2", Schema, "a"));
    assert.notEqual(k, generateCacheKey("m", z.object({ answer: z.string() }), "a"));
    assert.notEqual(k, generateCacheKey("m", Schema, "b"));
  });
});

describe("embed cache", () => {
  it("fully cached texts embed without network, in order", async () => {
    const v1 = Array.from({ length: EMBED_DIM }, (_, i) => i / EMBED_DIM);
    const v2 = Array.from({ length: EMBED_DIM }, (_, i) => 1 - i / EMBED_DIM);
    await writeCache("embed", embedCacheKey("test-embed", "RETRIEVAL_DOCUMENT", "alpha"), v1);
    await writeCache("embed", embedCacheKey("test-embed", "RETRIEVAL_DOCUMENT", "beta"), v2);
    assert.deepEqual(await embed(["beta", "alpha"], "RETRIEVAL_DOCUMENT"), [v2, v1]);
  });
  it("task type is part of the key (a query embedding is not a document embedding)", async () => {
    await assert.rejects(embed(["alpha"], "RETRIEVAL_QUERY"), (e: unknown) => e instanceof LlmError && e.kind === "config");
  });
});

describe("helpers", () => {
  it("retryDelayMs reads Gemini's RetryInfo", () => {
    assert.equal(retryDelayMs(new Error('{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"36s"}')), 36_000);
    assert.equal(retryDelayMs(new Error("Please retry in 12.4s.")), 12_400);
    assert.equal(retryDelayMs(new Error("quota exceeded")), undefined);
  });
  it("estimateInputTokens: text by length, PDF pages and images by measured averages", () => {
    assert.equal(estimateInputTokens([{ text: "x".repeat(400) }]), 20 + 100);
    assert.equal(estimateInputTokens([{ inlineData: { mimeType: "application/pdf", data: "" } }]), 20 + 1_800);
    assert.equal(estimateInputTokens([{ inlineData: { mimeType: "image/png", data: "" } }], "y".repeat(40)), 20 + 10 + 1_300);
  });
});
