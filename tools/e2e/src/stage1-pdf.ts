// Stage-1 REAL-DATA check for Module 5 (PDF ingestion). Spends Gemini quota on the first run
// (≈1 request per page + 1 embedding request per chunk); the re-run must be free (cache).
// Usage: npm run stage1:pdf   (dev server running)
import { REPO_ROOT, api, fileOf, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Bytes } from "@sc/core";
import { prisma } from "@sc/db";

type Expectations = { file: string; sha256: string; pages: Record<string, { mustMatch: string[]; figure?: boolean; imageOnly?: boolean }> };

const expectations: Expectations = JSON.parse(await readFile(new URL("../stage1/expectations.json", import.meta.url), "utf8"));
const file = path.join(REPO_ROOT, expectations.file);
const filename = path.basename(file);

async function waitForTerminal(id: string, label: string) {
  const t0 = Date.now();
  let last = "";
  for (;;) {
    const s = (await api.listSources()).find((x) => x.id === id);
    if (!s) throw new Error("source disappeared");
    const line = `${s.status} ${s.progressDone}/${s.progressTotal}`;
    if (line !== last) console.log(`  ${label}: ${line}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    last = line;
    if (s.status === "READY" || s.status === "FAILED") return { ...s, seconds: (Date.now() - t0) / 1000 };
    if (Date.now() - t0 > 10 * 60_000) throw new Error("timed out after 10 min");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function usageNow() {
  const u = (await api.health()).usage;
  if (!u) throw new Error("health has no usage");
  return u;
}

async function ingestOnce(id: string, label: string) {
  const before = await usageNow();
  await api.ingestSource(id);
  const end = await waitForTerminal(id, label);
  const after = await usageNow();
  return {
    end,
    generate: after.generate.requests - before.generate.requests,
    embed: after.embed.requests - before.embed.requests,
    inputTokens: after.generate.inputTokens - before.generate.inputTokens,
  };
}

await requireServer();
const bytes = new Uint8Array(await readFile(file));
const sha = sha256Bytes(bytes);
if (sha !== expectations.sha256) throw new Error(`${filename}: sha256 ${sha.slice(0, 16)} does not match the expectations (${expectations.sha256.slice(0, 16)})`);
console.log(`file ${filename} (${(bytes.length / 1024).toFixed(0)} KB, sha ${sha.slice(0, 16)}) matches the ground truth`);

const existing = await prisma.source.findFirst({ where: { filename, sizeBytes: bytes.length }, orderBy: { createdAt: "asc" } });
const id = existing?.id ?? (await api.uploadSource(fileOf(bytes, filename))).id;
console.log(existing ? `reusing source ${id}` : `uploaded as source ${id}`);

// Run 1 (Gemini unless already cached) and run 2 (must be served from the cache).
const run1 = await ingestOnce(id, "run 1");
if (run1.end.status !== "READY") throw new Error(`run 1 FAILED: ${run1.end.error}`);
const run2 = await ingestOnce(id, "run 2 (cache)");

const chunks = await prisma.chunk.findMany({ where: { sourceId: id }, orderBy: { seq: "asc" } });
const pages = Object.keys(expectations.pages).map(Number).sort((a, b) => a - b);

// Locator + embedding integrity.
const integrity = {
  pageInRange: chunks.every((c) => c.page !== null && c.page >= 1 && c.page <= pages.length),
  onlyPageLocator: chunks.every((c) => c.slide === null && c.tStart === null && c.tEnd === null),
  embeddings768: chunks.every((c) => c.embedding.length === 768),
  seqContiguous: chunks.every((c, i) => c.seq === i),
  nonEmpty: chunks.every((c) => c.content.trim().length > 0),
};

// Ground-truth fact recall per page.
let matched = 0;
let total = 0;
const report = pages.map((p) => {
  const exp = expectations.pages[String(p)];
  const onPage = chunks.filter((c) => c.page === p);
  const text = onPage.map((c) => `${c.title ?? ""}\n${c.content}`).join("\n");
  const missing = exp.mustMatch.filter((re) => !new RegExp(re, "i").test(text));
  matched += exp.mustMatch.length - missing.length;
  total += exp.mustMatch.length;
  const figures = onPage.filter((c) => c.kind === "FIGURE").length;
  return {
    page: p,
    chunks: `${onPage.length - figures} text + ${figures} figure`,
    facts: `${exp.mustMatch.length - missing.length}/${exp.mustMatch.length}`,
    figureOk: !exp.figure || figures > 0,
    imageOnly: !!exp.imageOnly,
    missing,
  };
});

const recall = matched / total;
const checks = {
  [`fact recall ≥ 90% (${(recall * 100).toFixed(1)}%)`]: recall >= 0.9,
  "every page has ≥ 1 chunk": report.every((r) => !r.chunks.startsWith("0 text + 0")),
  "figure chunk on every figure page (3, 5, 9)": report.every((r) => r.figureOk),
  "locators: page only, 1..9": integrity.pageInRange && integrity.onlyPageLocator,
  "embeddings: 768 numbers each": integrity.embeddings768,
  "seq contiguous, no empty chunks": integrity.seqContiguous && integrity.nonEmpty,
  [`re-run free (generate ${run2.generate}, embed ${run2.embed} requests)`]: run2.generate === 0 && run2.embed === 0 && run2.end.status === "READY",
};

console.log(`\nrun 1: ${run1.end.status} in ${run1.end.seconds.toFixed(0)} s · Gemini generate ${run1.generate} requests (${run1.inputTokens} input tokens) · embed ${run1.embed} requests`);
console.log(`run 2: ${run2.end.status} in ${run2.end.seconds.toFixed(0)} s · Gemini generate ${run2.generate} · embed ${run2.embed}`);
console.log(`chunks: ${chunks.length} (${chunks.filter((c) => c.kind === "FIGURE").length} figures)\n`);
console.table(report.map(({ missing, ...r }) => ({ ...r, missing: missing.join(" | ") })));
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);

const out = path.join(REPO_ROOT, "data", "demo", "stage1-ingest-report.json");
await writeFile(out, JSON.stringify({ sourceId: id, run1, run2, checks, report, chunks: chunks.map(({ embedding, ...c }) => ({ ...c, embedding: `${embedding.length} numbers` })) }, null, 2));
console.log(`\nfull chunk dump: ${path.relative(REPO_ROOT, out)}`);
await prisma.$disconnect();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
