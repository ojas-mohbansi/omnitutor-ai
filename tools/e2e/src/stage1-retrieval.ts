// REAL-DATA retrieval check (Module 8). Runs every question of a test set through the live
// POST /api/search (1 embedding request per new question; repeats are cached) and checks whether
// the cited locations contain the expected page / video time.
// Usage: npm run stage1:retrieval [-- <test set path, default data/demo/testset.stage1.json>]
import { REPO_ROOT, api, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@sc/db";
import { sha256Bytes, DEFAULT_COURSE_ID } from "@sc/core";
import { TestSet, type Citation, type ExpectedLocation } from "@sc/schemas";

const K = 6;
const VIDEO_TOL = 2; // seconds
/** Fixed before any holdout run: 0.55 = .env.example placeholder, 0.60 = floor proposed after Stage-1 (docs/PROGRESS.md). Never fitted to the set being evaluated. */
const PREREGISTERED_TAUS = [0.55, 0.6];

await requireServer();
const setPath = path.resolve(REPO_ROOT, process.argv[2] ?? path.join("data", "demo", "testset.stage1.json"));
const setBytes = await readFile(setPath);
const items = TestSet.parse(JSON.parse(setBytes.toString("utf8")));
console.log(`test set: ${path.relative(REPO_ROOT, setPath)} · ${items.length} items · sha256 ${sha256Bytes(setBytes).slice(0, 16)}`);
const before = (await api.health()).usage!;

type Loc = { sourceType: Citation["sourceType"]; filename: string; page?: number | null; slide?: number | null; tStart?: number | null; tEnd?: number | null };
const matches = (c: Loc, e: ExpectedLocation) => {
  if (c.filename !== e.filename || c.sourceType !== e.sourceType) return false;
  if (e.sourceType === "PDF") return c.page === e.page;
  if (e.sourceType === "PPTX") return c.slide === e.slide;
  return c.tStart != null && c.tEnd != null && c.tStart < e.tEnd + VIDEO_TOL && c.tEnd > e.tStart - VIDEO_TOL;
};
const loc = (c: Loc) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `slide ${c.slide}` : `${c.tStart}–${c.tEnd}s`);
const offGroup = (id: string) => (/near/.test(id) ? "near-miss" : /unrelated|injection/.test(id) ? "unrelated" : "same-domain");

// Every searchable chunk (same filter as retrieve()), for the random-ranking baseline.
const pool = (
  await prisma.chunk.findMany({
    where: { source: { courseId: DEFAULT_COURSE_ID, status: "READY" }, NOT: { embedding: { isEmpty: true } } },
    select: { page: true, slide: true, tStart: true, tEnd: true, source: { select: { type: true, filename: true } } },
  })
).map((c) => ({ ...c, sourceType: c.source.type, filename: c.source.filename }));
const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** Expected hit@k and reciprocal rank when the R relevant chunks sit at uniformly random positions among N. */
function randomBaseline(relevant: number, n: number) {
  const hit = (k: number) => (relevant ? 1 - choose(n - relevant, k) / choose(n, k) : 0);
  let mrr = 0;
  for (let i = 1; i <= n - relevant + 1; i++) mrr += (choose(n - i, relevant - 1) / choose(n, relevant)) / i;
  return { hit1: hit(1), hit3: hit(3), hit6: hit(K), mrr: relevant ? mrr : 0 };
}

const rows = [];
const details = [];
const rejected: { id: string; modality: string; chars: number; error: string }[] = [];
for (const item of items) {
  let res;
  try {
    res = await api.search({ query: item.question, k: K });
  } catch (e) {
    // The API refused the request (e.g. query too long). Recorded as a failure, never skipped silently.
    rejected.push({ id: item.id, modality: item.modality, chars: item.question.length, error: e instanceof Error ? e.message.replace(/\s+/g, " ") : String(e) });
    rows.push({ id: item.id, modality: item.modality, rank: "REJECTED", relevant: "", topScore: NaN, top3: "" });
    continue;
  }
  const answerable = item.modality !== "off_material";
  const rank = answerable ? res.results.findIndex((r) => item.expected.some((e) => matches(r.citation, e))) + 1 : null;
  const relevant = answerable ? pool.filter((c) => item.expected.some((e) => matches(c, e))).length : 0;
  rows.push({
    id: item.id,
    modality: item.modality,
    rank: rank === null ? "n/a" : rank || "miss",
    relevant: answerable ? `${relevant}/${res.candidates}` : "",
    topScore: +res.topScore.toFixed(3),
    top3: res.results.slice(0, 3).map((r) => `${r.citation.sourceType === "VIDEO" ? "V" : ""}${loc(r.citation)}(${r.score.toFixed(3)})`).join(" "),
  });
  details.push({ id: item.id, modality: item.modality, question: item.question, rank, relevant, candidates: res.candidates, results: res.results });
}
const after = (await api.health()).usage!;
console.table(rows);

// ── Answerable: rank metrics vs a random ranking of the same pool ──
if (rejected.length) {
  console.log(`\nREJECTED by the API (${rejected.length}); answerable ones count as misses below:`);
  for (const r of rejected) console.log(`  ${r.id} (${r.modality}, ${r.chars} chars): ${r.error}`);
}
const ans = details.filter((d) => d.modality !== "off_material");
const rejectedAnswerable = rejected.filter((r) => r.modality !== "off_material").length;
const ranks = [...ans.map((d) => d.rank ?? 0), ...Array<number>(rejectedAnswerable).fill(0)];
const hitAt = (k: number) => ranks.filter((r) => r > 0 && r <= k).length / ranks.length;
const mrr = ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / ranks.length;
const base = ans.map((d) => randomBaseline(d.relevant, d.candidates));
const avg = (f: (b: ReturnType<typeof randomBaseline>) => number) => base.reduce((s, b) => s + f(b), 0) / base.length;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`\nanswerable: ${ranks.length}${rejectedAnswerable ? ` (${rejectedAnswerable} rejected = miss)` : ""} · hit@1 ${pct(hitAt(1))} · hit@3 ${pct(hitAt(3))} · hit@6 ${pct(hitAt(6))} · MRR ${mrr.toFixed(2)}`);
console.log(`random ranking of the same ${pool.length} chunks: hit@1 ${pct(avg((b) => b.hit1))} · hit@3 ${pct(avg((b) => b.hit3))} · hit@6 ${pct(avg((b) => b.hit6))} · MRR ${avg((b) => b.mrr).toFixed(2)}`);
for (const m of ["pdf", "pptx", "video"] as const) {
  const r = ans.filter((d) => d.modality === m).map((d) => d.rank ?? 0);
  if (r.length) console.log(`  ${m}: ${r.length} items · hit@1 ${pct(r.filter((x) => x === 1).length / r.length)} · hit@6 ${pct(r.filter((x) => x > 0).length / r.length)}`);
}

// ── Off-material: what retrieval returns for questions the material can't answer ──
const off = details.filter((d) => d.modality === "off_material");
if (off.length) {
  console.log("\noff-material: top-3 retrieved chunks");
  for (const d of off) {
    console.log(`  [${offGroup(d.id)}] ${d.id}: "${d.question.slice(0, 90)}${d.question.length > 90 ? "…" : ""}"`);
    for (const r of d.results.slice(0, 3)) {
      const c = r.citation;
      console.log(`      ${r.score.toFixed(3)}  ${c.filename} ${loc(c)} ${c.kind}${c.title ? ` "${c.title}"` : ""}: ${c.excerpt.slice(0, 100)}${c.excerpt.length > 100 ? "…" : ""}`);
    }
  }
}

// ── Refusal by score alone, at thresholds fixed BEFORE this run ──
const ansScores = ans.map((d) => d.results[0].score).sort((a, b) => a - b);
const offScores = off.map((d) => d.results[0].score).sort((a, b) => a - b);
const med = (s: number[]) => s[Math.floor(s.length / 2)];
console.log(`\ntopScore answerable:   min ${ansScores[0]?.toFixed(3)} · median ${med(ansScores)?.toFixed(3)} · max ${ansScores.at(-1)?.toFixed(3)}`);
for (const g of ["unrelated", "same-domain", "near-miss"]) {
  const s = off.filter((d) => offGroup(d.id) === g).map((d) => d.results[0].score).sort((a, b) => a - b);
  if (s.length) console.log(`topScore off (${g}): min ${s[0].toFixed(3)} · median ${med(s).toFixed(3)} · max ${s.at(-1)!.toFixed(3)} (${s.length})`);
}
const atTau = (tau: number) => ({
  answeredOk: ansScores.filter((s) => s >= tau).length,
  refusedOk: offScores.filter((s) => s < tau).length,
});
for (const tau of PREREGISTERED_TAUS) {
  const r = atTau(tau);
  console.log(`τ=${tau} (pre-registered): keeps ${r.answeredOk}/${ansScores.length} answerable · refuses ${r.refusedOk}/${offScores.length} off-material · balanced acc ${pct((r.answeredOk / ansScores.length + r.refusedOk / (offScores.length || 1)) / 2)}`);
}
let oracle = { tau: 0, acc: 0 };
for (const tau of [...ansScores, ...offScores]) {
  const r = atTau(tau);
  const acc = (r.answeredOk / ansScores.length + r.refusedOk / (offScores.length || 1)) / 2;
  if (acc > oracle.acc) oracle = { tau, acc };
}
console.log(`oracle τ fitted on THIS set (upper bound, not a calibration): ${oracle.tau.toFixed(3)} → balanced acc ${pct(oracle.acc)}`);
console.log(`Gemini usage for this run: embed ${after.embed.requests - before.embed.requests} requests, generate ${after.generate.requests - before.generate.requests}`);

const reportPath = setPath.replace(/\.json$/, ".report.json");
await writeFile(reportPath, JSON.stringify({ testSet: path.relative(REPO_ROOT, setPath), sha256: sha256Bytes(setBytes), ranAt: new Date().toISOString(), k: K, poolSize: pool.length, rejected, details }, null, 2));
console.log(`full results: ${path.relative(REPO_ROOT, reportPath)}`);
await prisma.$disconnect();

const checks = {
  [`hit@6 ≥ 80% (${pct(hitAt(6))})`]: hitAt(6) >= 0.8,
  "no Gemini generate calls (retrieval only embeds)": after.generate.requests === before.generate.requests,
};
console.log("");
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
