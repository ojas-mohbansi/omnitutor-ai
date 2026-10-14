// Stage-1 REAL-DATA check for Module 7 (video ingestion). Spends Gemini quota on the first run
// (1 Files API upload + 1 request ≈ 14K input tokens + 1 embedding request per segment); the re-run must be free.
// Usage: npm run stage1:video   (dev server running)
import { REPO_ROOT, api, fileOf, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Bytes } from "@sc/core";
import { prisma } from "@sc/db";

type Fact = { id: string; pattern: string; tStart: number; tEnd: number };
type Expectations = { file: string; sha256: string; durationSec: number; toleranceSec: number; facts: Fact[] };
const exp: Expectations = JSON.parse(await readFile(new URL("../stage1/video-expectations.json", import.meta.url), "utf8"));
const file = path.join(REPO_ROOT, exp.file);
const filename = path.basename(file);

async function usageNow() {
  const u = (await api.health()).usage;
  if (!u) throw new Error("health has no usage");
  return u;
}
async function ingestOnce(id: string, label: string) {
  const before = await usageNow();
  await api.ingestSource(id);
  const t0 = Date.now();
  let last = "";
  for (;;) {
    const s = (await api.listSources()).find((x) => x.id === id)!;
    const line = `${s.status} ${s.progressDone}/${s.progressTotal}`;
    if (line !== last) console.log(`  ${label}: ${line}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    last = line;
    if (s.status === "READY" || s.status === "FAILED") {
      const after = await usageNow();
      return { s, seconds: (Date.now() - t0) / 1000, generate: after.generate.requests - before.generate.requests, embed: after.embed.requests - before.embed.requests, inputTokens: after.generate.inputTokens - before.generate.inputTokens };
    }
    if (Date.now() - t0 > 10 * 60_000) throw new Error("timed out after 10 min");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await requireServer();
const bytes = new Uint8Array(await readFile(file));
if (sha256Bytes(bytes) !== exp.sha256) throw new Error(`${filename} does not match the ground truth hash`);
const existing = await prisma.source.findFirst({ where: { filename, sizeBytes: bytes.length }, orderBy: { createdAt: "asc" } });
const id = existing?.id ?? (await api.uploadSource(fileOf(bytes, filename))).id;
console.log(`${filename}: ${existing ? "reusing" : "uploaded as"} source ${id}`);

const run1 = await ingestOnce(id, "run 1");
if (run1.s.status !== "READY") {
  console.log(`run 1 FAILED: ${run1.s.error}`);
  await prisma.$disconnect();
  process.exit(1);
}
const run2 = await ingestOnce(id, "run 2 (cache)");

const chunks = await prisma.chunk.findMany({ where: { sourceId: id }, orderBy: { seq: "asc" } });
const tol = exp.toleranceSec;
const overlaps = (c: { tStart: number | null; tEnd: number | null }, f: Fact) => c.tStart !== null && c.tEnd !== null && c.tStart < f.tEnd + tol && c.tEnd > f.tStart - tol;

const facts = exp.facts.map((f) => {
  const re = new RegExp(f.pattern, "i");
  const matching = chunks.filter((c) => re.test(`${c.title ?? ""}\n${c.content}`));
  const hit = matching.find((c) => overlaps(c, f));
  return {
    fact: f.id,
    truth: `${f.tStart}–${f.tEnd}`,
    found: matching.length > 0,
    chunk: hit ? `${hit.tStart}–${hit.tEnd}` : matching.map((c) => `${c.tStart}–${c.tEnd}`).join(", ") || "—",
    timeOk: !!hit,
    startErr: hit ? Math.abs((hit.tStart ?? 0) - f.tStart) : null,
  };
});

const spans = chunks.map((c) => (c.tEnd ?? 0) - (c.tStart ?? 0));
const coverage = spans.reduce((a, b) => a + b, 0) / exp.durationSec;
const words = chunks.reduce((n, c) => n + (c.content.split("\n[On screen]")[0].match(/\S+/g)?.length ?? 0), 0);
const found = facts.filter((f) => f.found).length;
const timed = facts.filter((f) => f.timeOk).length;
const errs = facts.flatMap((f) => (f.startErr === null ? [] : [f.startErr]));

console.log(`\nrun 1: READY in ${run1.seconds.toFixed(0)} s · Gemini generate ${run1.generate} (${run1.inputTokens} input tokens) · embed ${run1.embed}`);
console.log(`run 2: ${run2.s.status} in ${run2.seconds.toFixed(0)} s · Gemini generate ${run2.generate} · embed ${run2.embed}`);
console.log(`segments: ${chunks.length} · coverage ${(coverage * 100).toFixed(0)}% · longest ${Math.max(...spans).toFixed(1)} s · spoken words ${words} (≈${(words / (exp.durationSec / 60)).toFixed(0)}/min)\n`);
console.table(facts);
for (const c of chunks) console.log(`  [${c.tStart}–${c.tEnd}] ${c.title ?? ""} :: ${c.content.replace(/\s+/g, " ").slice(0, 150)}`);

const checks = {
  [`on-screen facts found (${found}/${facts.length})`]: found === facts.length,
  [`facts in a segment overlapping the true time ±${tol}s (${timed}/${facts.length})`]: timed >= Math.ceil(facts.length * 0.9),
  [`mean start error ≤ 3 s (${errs.length ? (errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1) : "n/a"} s)`]: errs.length > 0 && errs.reduce((a, b) => a + b, 0) / errs.length <= 3,
  [`coverage ≥ 90% (${(coverage * 100).toFixed(0)}%)`]: coverage >= 0.9,
  [`no segment longer than 60 s`]: Math.max(...spans) <= 60,
  "locators: tStart/tEnd only": chunks.every((c) => c.page === null && c.slide === null && c.tStart !== null && c.tEnd !== null && c.tEnd > c.tStart),
  "embeddings: 768 each": chunks.every((c) => c.embedding.length === 768),
  [`re-run free (generate ${run2.generate}, embed ${run2.embed})`]: run2.generate === 0 && run2.embed === 0 && run2.s.status === "READY",
};
console.log("");
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
console.log("NOT VERIFIED: transcript accuracy (no reference transcript exists for this video).");

await writeFile(path.join(REPO_ROOT, "data", "demo", "stage1-video-report.json"), JSON.stringify({ sourceId: id, run1, run2, checks, facts, chunks: chunks.map(({ embedding, ...c }) => c) }, null, 2));
await prisma.$disconnect();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
