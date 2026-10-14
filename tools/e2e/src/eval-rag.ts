// Module 15 (basic): RAG evaluation on the team-built test sets (Stage-1 + holdout, 51 questions).
// Metrics use the RAGAS definitions, re-implemented with a Gemini judge (NOT the ragas package: its
// per-metric LLM calls would exceed the free-tier daily quota for this set):
//   faithfulness      = supported claims / claims in the answer (material blocks; also full answer)
//   answer relevancy  = mean cosine(question, each of 3 questions generated from the answer)  [embeddings]
//   context precision = Σ_k precision@k · rel_k / #relevant, over the ranked retrieved contexts
//   context recall    = reference statements attributable to the contexts / reference statements
// Plus, in code: refusal precision/recall on off-material queries and citation accuracy.
// Answers come from POST /api/eval/answer (cached). One judge call per answered question (cached).
// Usage: npm run eval:rag   (dev/prod server running)
import { REPO_ROOT, api, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cosine, embed, generateJson, sha256 } from "@sc/core";
import { TestSet, type Citation, type ExpectedLocation } from "@sc/schemas";

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
const f2 = (x: number) => (Number.isNaN(x) ? "n/a" : x.toFixed(2));

await requireServer();
const t0 = (await api.health()).usage!;
const items = [
  ...TestSet.parse(JSON.parse(await readFile(path.join(REPO_ROOT, "data/demo/testset.stage1.json"), "utf8"))).map((i) => ({ ...i, set: "stage1" })),
  ...TestSet.parse(JSON.parse(await readFile(path.join(REPO_ROOT, "data/demo/testset.holdout.json"), "utf8"))).map((i) => ({ ...i, set: "holdout" })),
];

const rows: Record<string, unknown>[] = [];
for (const item of items) {
  const r = await api.evalAnswer({ question: item.question });
  const answerable = item.modality !== "off_material";
  const row: Record<string, unknown> = { id: item.id, set: item.set, modality: item.modality, refused: r.refused, coverage: r.coverage, topScore: r.topScore };
  if (answerable && !r.refused) {
    row.citationCorrect = r.citations.some((c) => item.expected.some((e) => matches(c, e)));
    const text = [
      `Question: ${item.question}`,
      `Retrieved contexts:\n${r.contexts.map((c, i) => `[K${i + 1}] ${c}`).join("\n\n")}`,
      `Answer blocks:\n${r.blocks.map((b) => `${b.origin === "material" ? "MATERIAL" : "OUTSIDE"}: ${b.text}`).join("\n")}`,
      `Reference answer: ${item.groundTruth}`,
    ].join("\n\n");
    const j = await generateJson({ role: "strong", schema: Judge, system: JUDGE_SYSTEM, parts: [{ text }], temperature: 0, cacheKey: `eval-judge|v1|${sha256(JUDGE_SYSTEM).slice(0, 16)}|${sha256(text)}` });
    const claims = j.data.answerClaims;
    const material = claims.filter((c) => c.fromMaterialBlock);
    row.faithfulnessMaterial = material.length ? material.filter((c) => c.supported).length / material.length : NaN;
    row.faithfulnessAll = claims.length ? claims.filter((c) => c.supported).length / claims.length : NaN;
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
    row.contextRecall = refs.length ? refs.filter((s) => s.attributed).length / refs.length : NaN;
    // answer relevancy (RAGAS): cosine between the question and questions generated from the answer
    const qs = j.data.generatedQuestions.slice(0, 3).filter((q) => q.trim());
    if (qs.length) {
      const [qv, ...gv] = await embed([item.question, ...qs], "RETRIEVAL_QUERY");
      row.answerRelevancy = mean(gv.map((v) => cosine(qv, v)));
    }
    row.claims = claims.length;
  }
  rows.push(row);
  process.stdout.write(".");
}
console.log("");

const ans = rows.filter((r) => r.modality !== "off_material");
const answered = ans.filter((r) => !r.refused);
const off = rows.filter((r) => r.modality === "off_material");
const allRefused = rows.filter((r) => r.refused);
const metric = (k: string, set = answered) => mean(set.map((r) => r[k] as number).filter((x) => typeof x === "number" && !Number.isNaN(x)));
const summary = {
  questions: rows.length,
  answerable: ans.length,
  offMaterial: off.length,
  faithfulnessMaterial: metric("faithfulnessMaterial"),
  faithfulnessAll: metric("faithfulnessAll"),
  answerRelevancy: metric("answerRelevancy"),
  contextPrecision: metric("contextPrecision"),
  contextRecall: metric("contextRecall"),
  citationAccuracy: answered.filter((r) => r.citationCorrect).length / (answered.length || 1),
  refusalRecall: off.filter((r) => r.refused).length / off.length,
  refusalPrecision: off.filter((r) => r.refused).length / (allRefused.length || 1),
  falseRefusalRate: ans.filter((r) => r.refused).length / ans.length,
};
const bySet = (set: string) => ({
  faithfulnessMaterial: metric("faithfulnessMaterial", answered.filter((r) => r.set === set)),
  answerRelevancy: metric("answerRelevancy", answered.filter((r) => r.set === set)),
  contextPrecision: metric("contextPrecision", answered.filter((r) => r.set === set)),
  contextRecall: metric("contextRecall", answered.filter((r) => r.set === set)),
});
const t1 = (await api.health()).usage!;

console.table(rows.filter((r) => r.modality !== "off_material").map((r) => ({ id: String(r.id).slice(0, 28), faith: f2(r.faithfulnessMaterial as number), rel: f2(r.answerRelevancy as number), cPrec: f2(r.contextPrecision as number), cRec: f2(r.contextRecall as number), cite: r.citationCorrect ? "yes" : "NO" })));
console.log(`\n| Metric (RAGAS definitions, Gemini judge) | All answered (${answered.length}) | Stage-1 | Holdout |`);
console.log("|---|---|---|---|");
for (const k of ["faithfulnessMaterial", "answerRelevancy", "contextPrecision", "contextRecall"] as const) {
  console.log(`| ${k} | ${f2(summary[k])} | ${f2(bySet("stage1")[k])} | ${f2(bySet("holdout")[k])} |`);
}
console.log(`| faithfulness (full answer incl. outside blocks) | ${f2(summary.faithfulnessAll)} | | |`);
console.log(`\ncitation accuracy ${f2(summary.citationAccuracy)} · refusal recall ${f2(summary.refusalRecall)} · refusal precision ${f2(summary.refusalPrecision)} · false refusals ${f2(summary.falseRefusalRate)}`);
console.log(`Gemini usage: generate ${t1.generate.requests - t0.generate.requests} requests, embed ${t1.embed.requests - t0.embed.requests}`);
await writeFile(path.join(REPO_ROOT, "data/demo/eval-rag-report.json"), JSON.stringify({ ranAt: new Date().toISOString(), summary, bySet: { stage1: bySet("stage1"), holdout: bySet("holdout") }, rows }, null, 2));
console.log("full report: data/demo/eval-rag-report.json");
