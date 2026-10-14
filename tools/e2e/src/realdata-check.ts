// REAL-DATA check: runs the UNCHANGED ingestion + retrieval code on real files (each in its own
// course) and compares the result with ground truth written before the first run.
// Ingestion runs in this process through @sc/core (the same functions the API routes call; the
// upload route has no courseId parameter); retrieval goes through the live POST /api/search.
// Spends Gemini quota on the first run only; the second ingestion of each file must hit the cache.
// Usage: npx tsx src/realdata-check.ts <spec relative to tools/e2e>   (dev server running)
//   npm run holdout:generalize   → holdout/generalization.json (other PDF + other video)
//   npm run stage1:pptx          → pptx/decks.json (Module 6)
import { REPO_ROOT, api, requireServer } from "./setup";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requestIngestion, sha256Bytes, todayUsage, uploadSource } from "@sc/core";
import { prisma } from "@sc/db";
import type { Citation } from "@sc/schemas";

type Question = { q: string; page?: number; slide?: number; tStart?: number; tEnd?: number };
type Fact = { id: string; pattern: string; tStart: number; tEnd: number };
type Spec = {
  kind: "PDF" | "PPTX" | "VIDEO";
  label: string;
  courseId: string;
  courseName: string;
  file: string;
  filename: string;
  sha256: string;
  pages?: Record<string, string[]>; // PDF: regexes per page
  slides?: Record<string, string[]>; // PPTX: regexes per slide
  titles?: Record<string, string>; // PPTX: exact slide titles
  expectChunks?: number; // PPTX: chunks = slides with content
  decorative?: number[]; // PPTX: slides whose pictures carry no information (quality: no [Figure] expected)
  durationSec?: number;
  toleranceSec?: number;
  boundaries?: number[];
  facts?: Fact[]; // VIDEO
  questions: Question[];
  offMaterial: string[];
};

const K = 6;
const VIDEO_TOL = 2; // seconds, same rule as the Stage-1 retrieval check
const BOUNDARY_TOL = 1.5;

await requireServer();
const specArg = process.argv[2] ?? "holdout/generalization.json";
const specPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", specArg);
const spec: { sources: Spec[] } = JSON.parse(await readFile(specPath, "utf8"));
console.log(`ground truth: ${path.relative(REPO_ROOT, specPath)}`);
const report: Record<string, unknown>[] = [];
let allOk = true;

async function ingestOnce(sourceId: string) {
  const before = todayUsage();
  const t0 = Date.now();
  const { job } = await requestIngestion(sourceId);
  const result = await job;
  const after = todayUsage();
  return {
    result,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    generate: after.generate.requests - before.generate.requests,
    inputTokens: after.generate.inputTokens - before.generate.inputTokens,
    embed: after.embed.requests - before.embed.requests,
  };
}

const where = (c: { page: number | null; slide: number | null; tStart: number | null; tEnd: number | null }) =>
  c.page !== null ? `p.${c.page}` : c.slide !== null ? `slide ${c.slide}` : `${c.tStart?.toFixed(1)}–${c.tEnd?.toFixed(1)}s`;

for (const s of spec.sources) {
  console.log(`\n=== ${s.kind}: ${s.label}\n    course "${s.courseName}" (${s.courseId}) · ${s.file}`);
  const abs = path.join(REPO_ROOT, s.file);
  const bytes = await readFile(abs);
  if (sha256Bytes(bytes) !== s.sha256) throw new Error(`${s.file} does not match the ground-truth hash`);

  await prisma.course.upsert({ where: { id: s.courseId }, create: { id: s.courseId, name: s.courseName }, update: { name: s.courseName } });
  const existing = await prisma.source.findFirst({ where: { courseId: s.courseId, filename: s.filename, sizeBytes: bytes.length } });
  const sourceId = existing?.id ?? (await uploadSource({ body: createReadStream(abs), filename: s.filename, contentLength: bytes.length, courseId: s.courseId })).id;
  console.log(`    source ${sourceId} (${existing ? "reused" : "uploaded"})`);

  const run1 = await ingestOnce(sourceId);
  const run2 = await ingestOnce(sourceId);
  for (const [name, r] of [["run 1", run1], ["run 2 (cache)", run2]] as const) {
    console.log(`    ${name}: ${r.result.ok ? `READY, ${r.result.chunks} chunks` : `FAILED: ${r.result.error}`} · ${r.seconds} s · Gemini generate ${r.generate} (${r.inputTokens} input tokens), embed ${r.embed}`);
  }
  if (!run1.result.ok || !run2.result.ok) {
    allOk = false;
    report.push({ file: s.file, failed: true, run1, run2 });
    continue;
  }
  if (run1.result.deck) {
    const d = run1.result.deck;
    console.log(`    deck: ${d.slides} slides, ${d.batches} batches, ${d.imagesSent} pictures sent, empty slides [${d.emptySlides.join(", ")}]`);
    for (const k of d.skippedImages) console.log(`      skipped picture: slide ${k.slide} ${k.media} (${k.reason})`);
  }

  const chunks = await prisma.chunk.findMany({ where: { sourceId }, orderBy: { seq: "asc" } });
  const text = (c: (typeof chunks)[number]) => `${c.title ?? ""}\n${c.content}`;
  console.log("    chunks:");
  for (const c of chunks.slice(0, 60)) console.log(`      ${where(c).padEnd(12)} ${c.kind.padEnd(10)} ${(c.title ?? "").slice(0, 40).padEnd(40)} ${c.content.replace(/\s+/g, " ").slice(0, 70)}`);

  // ── Extraction vs ground truth ──
  const factRows: { fact: string; ok: boolean }[] = [];
  const quality: { check: string; ok: boolean }[] = [];
  let boundary: Record<string, unknown> | undefined;
  const regexFacts = (unit: "page" | "slide", table: Record<string, string[]> | undefined) => {
    for (const [n, patterns] of Object.entries(table ?? {})) {
      const unitText = chunks.filter((c) => c[unit] === Number(n)).map(text).join("\n");
      for (const p of patterns) factRows.push({ fact: `${unit} ${n} /${p}/`, ok: new RegExp(p, "i").test(unitText) });
    }
  };
  if (s.kind === "PDF") regexFacts("page", s.pages);
  if (s.kind === "PPTX") {
    regexFacts("slide", s.slides);
    for (const [n, title] of Object.entries(s.titles ?? {})) {
      const got = chunks.find((c) => c.slide === Number(n))?.title ?? null;
      factRows.push({ fact: `slide ${n} title = ${JSON.stringify(title)} (got ${JSON.stringify(got)})`, ok: got === title });
    }
    if (s.expectChunks !== undefined) factRows.push({ fact: `${s.expectChunks} chunks (got ${chunks.length})`, ok: chunks.length === s.expectChunks });
    const order = chunks.map((c) => c.slide ?? 0);
    factRows.push({ fact: "one chunk per slide, in slide order", ok: order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1])) });
    for (const n of s.decorative ?? []) quality.push({ check: `slide ${n}: decorative picture not described`, ok: !chunks.some((c) => c.slide === n && c.content.includes("[Figure]")) });
  }
  if (s.kind === "VIDEO") {
    const tol = s.toleranceSec ?? 3;
    for (const f of s.facts ?? []) {
      const re = new RegExp(f.pattern, "i");
      factRows.push({ fact: `${f.id} [${f.tStart}–${f.tEnd}] /${f.pattern}/`, ok: chunks.some((c) => c.tStart! < f.tEnd + tol && c.tEnd! > f.tStart - tol && re.test(text(c))) });
    }
    const starts = chunks.map((c) => c.tStart!).filter((t) => t > 0);
    const cuts = s.boundaries ?? [];
    const found = cuts.filter((b) => starts.some((t) => Math.abs(t - b) <= BOUNDARY_TOL));
    const extra = starts.filter((t) => !cuts.some((b) => Math.abs(t - b) <= BOUNDARY_TOL));
    const startErr = [0, ...cuts].map((b) => Math.min(...chunks.map((c) => Math.abs(c.tStart! - b))));
    boundary = {
      recall: `${found.length}/${cuts.length}`,
      missed: cuts.filter((b) => !found.includes(b)),
      extraBoundaries: extra,
      meanStartErrorSec: +(startErr.reduce((a, b) => a + b, 0) / startErr.length).toFixed(2),
      covers: `${Math.min(...chunks.map((c) => c.tStart!))}–${Math.max(...chunks.map((c) => c.tEnd!))} of ${s.durationSec}`,
    };
    console.log(`    boundaries vs measured slide cuts (±${BOUNDARY_TOL}s): ${JSON.stringify(boundary)}`);
  }
  const factsOk = factRows.filter((f) => f.ok).length;
  console.log(`    ground-truth facts: ${factsOk}/${factRows.length}`);
  for (const f of factRows.filter((x) => !x.ok)) console.log(`      MISSING ${f.fact}`);
  for (const q of quality) console.log(`    quality (reported, not a pass criterion): ${q.ok ? "ok  " : "FAIL"} ${q.check}`);
  if (factsOk !== factRows.length) allOk = false;

  // ── Retrieval in this course only (live API) ──
  const hits = (c: Citation, q: Question) =>
    c.sourceType === "PDF" ? c.page === q.page : c.sourceType === "PPTX" ? c.slide === q.slide : c.tStart < q.tEnd! + VIDEO_TOL && c.tEnd > q.tStart! - VIDEO_TOL;
  const loc = (c: Citation) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `slide ${c.slide}` : `${c.tStart}–${c.tEnd}s`);
  const rows = [];
  let foreign = 0;
  for (const q of [...s.questions, ...s.offMaterial.map((o): Question => ({ q: o }))]) {
    const res = await api.search({ query: q.q, k: K, courseId: s.courseId });
    foreign += res.results.filter((r) => r.citation.sourceId !== sourceId).length;
    const answerable = q.page !== undefined || q.slide !== undefined || q.tStart !== undefined;
    const rank = answerable ? res.results.findIndex((r) => hits(r.citation, q)) + 1 : null;
    rows.push({
      question: q.q.slice(0, 70),
      expected: !answerable ? "off-material" : q.page !== undefined ? `p.${q.page}` : q.slide !== undefined ? `slide ${q.slide}` : `${q.tStart}–${q.tEnd}s`,
      rank: rank === null ? "n/a" : rank || "miss",
      top1: `${loc(res.results[0].citation)} (${res.topScore.toFixed(3)})`,
      candidates: res.candidates,
    });
  }
  console.table(rows);
  const answerableRows = rows.filter((r) => r.expected !== "off-material");
  const hit1 = answerableRows.filter((r) => r.rank === 1).length;
  console.log(`    retrieval: hit@1 ${hit1}/${answerableRows.length} · results from other courses: ${foreign} (must be 0)`);
  if (foreign > 0) allOk = false;

  report.push({
    file: s.file, label: s.label, courseId: s.courseId, sourceId, run1, run2, chunks: chunks.length,
    facts: `${factsOk}/${factRows.length}`, missing: factRows.filter((f) => !f.ok), quality, boundary, retrieval: rows, foreignResults: foreign,
    chunkText: s.kind === "PPTX" ? chunks.map((c) => ({ slide: c.slide, title: c.title, content: c.content })) : undefined,
  });
}

const reportPath = path.join(REPO_ROOT, "data", "demo", path.dirname(specArg), `${path.basename(specArg, ".json")}-report.json`);
await writeFile(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), spec: specArg, report }, null, 2));
console.log(`\nfull report: ${path.relative(REPO_ROOT, reportPath)}\n${allOk ? "PASS" : "FAIL"}  all ground-truth facts found, no cross-course results`);
await prisma.$disconnect();
process.exit(allOk ? 0 : 1);
