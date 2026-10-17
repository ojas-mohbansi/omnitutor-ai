// Module 15/19: RAG evaluation on the team-built test sets (Stage-1, holdout and slides: 58 questions).
// Metrics use the RAGAS definitions, re-implemented with a Gemini judge (NOT the ragas package: its
// per-metric LLM calls would exceed the free-tier daily quota for this set):
//   faithfulness      = supported claims / claims in the answer (material blocks; also full answer)
//   answer relevancy  = mean cosine(question, each of 3 questions generated from the answer)  [embeddings]
//   context precision = Σ_k precision@k · rel_k / #relevant, over the ranked retrieved contexts
//   context recall    = reference statements attributable to the contexts / reference statements
// Plus, in code: refusal precision/recall on off-material queries and citation accuracy.
// Answers come from POST /api/eval/answer (the shared evaluation course; cached). One judge call per answered
// question (cached), made with LLM_MODEL_VERIFY: a DIFFERENT model from the tutor's, to avoid self-preference.
// Output: data/eval/rag-report.json (validated against RagReport in @sc/schemas; shown on /evaluation).
// Usage: npm run eval:rag   (dev/prod server running)
import { REPO_ROOT, api, requireServer } from "./setup";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EVAL_DIR, RAG_REPORT_FILE, cosine, embed, generateJson, modelFor, sha256 } from "@sc/core";
import { RagReport, TestSet, type Citation, type ExpectedLocation, type RagRow, type RagSlice } from "@sc/schemas";

const Judge = z.object({
  answerClaims: z.array(z.object({ claim: z.string(), fromMaterialBlock: z.boolean(), supported: z.boolean() })),
  generatedQuestions: z.array(z.string()),
  contextVerdicts: z.array(z.object({ id: z.string(), relevant: z.boolean() })),
  referenceStatements: z.array(z.object({ statement: z.string(), attributed: z.boolean() })),
});

const JUDGE_SYSTEM = `You are an evaluation judge for a retrieval-augmented tutor. Follow the definitions exactly; be strict and literal.
Given a question, the retrieved contexts (numbered), the tutor's answer split into blocks labelled MATERIAL or OUTSIDE, and a reference answer:
- answerClaims: break the ANSWER into atomic factual claims. For each: fromMaterialBlock = it comes from a MATERIAL block; supported = it can be directly inferred from the retrieved contexts alone (not from general knowledge).
- generatedQuestions: write exactly 3 different questions that the ANSWER answers (as a student would ask them).
- contextVerdicts: for EACH context id, relevant = true if that context is useful for arriving at the reference answer.
- referenceStatements: break the REFERENCE ANSWER into atomic statements (ignore any "Source:" or "PARTIAL COVERAGE" notes). For each: attributed = it can be found in or inferred from the retrieved contexts.`;

const VIDEO_TOL = 2;
const matches = (c: Citation, e: ExpectedLocation) =>
  c.filename === e.filename && c.sourceType === e.sourceType &&
  (e.sourceType === "PDF" ? c.sourceType === "PDF" && c.page === e.page
    : e.sourceType === "PPTX" ? c.sourceType === "PPTX" && c.slide === e.slide
    : c.sourceType === "VIDEO" && c.tStart < e.tEnd + VIDEO_TOL && c.tEnd > e.tStart - VIDEO_TOL);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const num = (x: number) => (Number.isFinite(x) ? x : null);
const where = (l: ExpectedLocation | Citation) =>
  l.sourceType === "PDF" ? `${l.filename} p.${l.page}` : l.sourceType === "PPTX" ? `${l.filename} s.${l.slide}` : `${l.filename} ${Math.round(l.tStart)}–${Math.round(l.tEnd)} s`;

await requireServer();
const t0 = (await api.health()).usage!;
const SETS = ["stage1", "holdout", "slides"] as const;
const items = (
  await Promise.all(
    SETS.map(async (set) => TestSet.parse(JSON.parse(await readFile(path.join(REPO_ROOT, `data/demo/testset.${set}.json`), "utf8"))).map((i) => ({ ...i, set }))),
  )
).flat();

type Row = RagRow & { faithfulnessAll: number | null };
const rows: Row[] = [];
for (const item of items) {
  const r = await api.evalAnswer({ question: item.question });
  const answerable = item.modality !== "off_material";
  const row: Row = {
    id: item.id, set: item.set, modality: item.modality, question: item.question,
    expected: item.expected.map(where), cited: [...new Set(r.citations.map(where))],
    refused: r.refused, coverage: r.coverage, topScore: r.topScore,
    citationCorrect: null, faithfulness: null, faithfulnessAll: null, answerRelevancy: null, contextPrecision: null, contextRecall: null, claims: null,
  };
  if (answerable && !r.refused) {
    row.citationCorrect = r.citations.some((c) => item.expected.some((e) => matches(c, e)));
    const text = [
      `Question: ${item.question}`,
      `Retrieved contexts:\n${r.contexts.map((c, i) => `[K${i + 1}] ${c}`).join("\n\n")}`,
      `Answer blocks:\n${r.blocks.map((b) => `${b.origin === "material" ? "MATERIAL" : "OUTSIDE"}: ${b.text}`).join("\n")}`,
      `Reference answer: ${item.groundTruth}`,
    ].join("\n\n");
    const j = await generateJson({ role: "verify", schema: Judge, system: JUDGE_SYSTEM, parts: [{ text }], temperature: 0, cacheKey: `eval-judge|v2|${sha256(JUDGE_SYSTEM).slice(0, 16)}|${sha256(text)}` });
    const claims = j.data.answerClaims;
    const material = claims.filter((c) => c.fromMaterialBlock);
    row.faithfulness = material.length ? material.filter((c) => c.supported).length / material.length : null;
    row.faithfulnessAll = claims.length ? claims.filter((c) => c.supported).length / claims.length : null;
    // context precision (RAGAS): mean of precision@k at each relevant rank
    const rel = r.contexts.map((_, i) => j.data.contextVerdicts.find((v) => v.id.trim().toUpperCase() === `K${i + 1}`)?.relevant ?? false);
    let hits = 0;
    let sum = 0;
    rel.forEach((v, k) => {
      if (v) {
        hits++;
        sum += hits / (k + 1);
      }
    });
    row.contextPrecision = hits ? sum / hits : 0;
    const refs = j.data.referenceStatements;
    row.contextRecall = refs.length ? refs.filter((st) => st.attributed).length / refs.length : null;
    // answer relevancy (RAGAS): cosine between the question and questions generated from the answer
    const qs = j.data.generatedQuestions.slice(0, 3).filter((q) => q.trim());
    if (qs.length) {
      const [qv, ...gv] = await embed([item.question, ...qs], "RETRIEVAL_QUERY");
      row.answerRelevancy = num(mean(gv.map((v) => cosine(qv, v))));
    }
    row.claims = claims.length;
  }
  rows.push(row);
  process.stdout.write(".");
}
console.log("");

const avg = (xs: (number | null)[]) => num(mean(xs.filter((x): x is number => typeof x === "number")));
const slice = (set: Row[]): RagSlice => {
  const answered = set.filter((r) => r.modality !== "off_material" && !r.refused);
  return {
    questions: set.length,
    answered: answered.length,
    faithfulness: avg(answered.map((r) => r.faithfulness)),
    faithfulnessAll: avg(answered.map((r) => r.faithfulnessAll)),
    answerRelevancy: avg(answered.map((r) => r.answerRelevancy)),
    contextPrecision: avg(answered.map((r) => r.contextPrecision)),
    contextRecall: avg(answered.map((r) => r.contextRecall)),
    citationAccuracy: answered.length ? answered.filter((r) => r.citationCorrect).length / answered.length : null,
  };
};
const ans = rows.filter((r) => r.modality !== "off_material");
const off = rows.filter((r) => r.modality === "off_material");
const declined = rows.filter((r) => r.refused);
const { questions: _q, answered: _a, ...overallMetrics } = slice(ans);
const t1 = (await api.health()).usage!;
const report = RagReport.parse({
  ranAt: new Date().toISOString(),
  models: { tutor: modelFor("strong"), judge: modelFor("verify"), embed: process.env.EMBED_MODEL ?? "unknown" },
  testSets: SETS.map((name) => ({ name, questions: items.filter((i) => i.set === name).length })),
  counts: { questions: rows.length, answerable: ans.length, offMaterial: off.length, answered: ans.filter((r) => !r.refused).length },
  overall: {
    ...overallMetrics,
    refusalRecall: off.length ? off.filter((r) => r.refused).length / off.length : null,
    refusalPrecision: declined.length ? off.filter((r) => r.refused).length / declined.length : null,
    falseRefusalRate: ans.length ? ans.filter((r) => r.refused).length / ans.length : null,
  },
  byModality: { pdf: slice(rows.filter((r) => r.modality === "pdf")), pptx: slice(rows.filter((r) => r.modality === "pptx")), video: slice(rows.filter((r) => r.modality === "video")) },
  bySet: Object.fromEntries(SETS.map((name) => [name, slice(ans.filter((r) => r.set === name))])),
  rows: rows.map(({ faithfulnessAll: _drop, ...r }) => r),
  geminiRequests: { generate: t1.generate.requests - t0.generate.requests, embed: t1.embed.requests - t0.embed.requests },
});

const f2 = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));
console.log(`\n| Metric | All answered (${report.counts.answered}) | PDF | Slides | Video |`);
console.log("|---|---|---|---|---|");
for (const k of ["faithfulness", "faithfulnessAll", "answerRelevancy", "contextPrecision", "contextRecall", "citationAccuracy"] as const) {
  console.log(`| ${k} | ${f2(report.overall[k])} | ${f2(report.byModality.pdf[k])} | ${f2(report.byModality.pptx[k])} | ${f2(report.byModality.video[k])} |`);
}
console.log(`\nrefusal recall ${f2(report.overall.refusalRecall)} · refusal precision ${f2(report.overall.refusalPrecision)} · false refusals ${f2(report.overall.falseRefusalRate)}`);
console.log(`models: tutor ${report.models.tutor} · judge ${report.models.judge} · embed ${report.models.embed}`);
console.log(`Gemini usage: generate ${report.geminiRequests.generate} requests, embed ${report.geminiRequests.embed}`);
await mkdir(path.join(REPO_ROOT, EVAL_DIR), { recursive: true });
await writeFile(path.join(REPO_ROOT, EVAL_DIR, RAG_REPORT_FILE), JSON.stringify(report, null, 2));
console.log(`full report: ${EVAL_DIR}/${RAG_REPORT_FILE}`);
