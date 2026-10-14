// REAL-DATA check for Module 13 (submit, grading, report). Criteria fixed BEFORE the first run:
//  A perfect student (stored keys; SHORT = reference answers) on a fresh mock: objective 100% correct · ≥ 90% of SHORT pass ·
//    mastery rises for every topic · every attempt's feedback cites ≥ 1 source excerpt
//  B wrong student: MCQ picks a distractor with a misconception label (must be reported) · NUMERIC wrong · SHORT = the
//    reference answer of a DIFFERENT question (≤ 20% may pass) · objective 0% · mastery falls for every topic ·
//    revisit non-empty and only cites sources of missed questions
//  C empty submission: everything wrong, 0 Gemini calls
//  D resubmit → 409; GET report equals the submit response
// Usage: npm run stage1:grading   (dev server running)
import { REPO_ROOT, api, raw, requireServer } from "./setup";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@sc/db";
import type { QuizReport, SubmitRequest } from "@sc/schemas";

await requireServer();
const t0 = (await api.health()).usage!;
const checks: [string, boolean][] = [];
const add = (n: string, ok: boolean) => checks.push([n, ok]);
type Key = { index?: number; value?: number; reference?: string };

async function newMock(name: string) {
  const learner = await api.createLearner({ name: `${name} ${new Date().toISOString().slice(11, 19)}` });
  const quiz = await api.createQuiz({ learnerId: learner.id, kind: "MOCK" });
  const rows = await prisma.question.findMany({ where: { assessmentId: quiz.assessmentId }, orderBy: { position: "asc" } });
  return { learner, quiz, rows };
}
const sourcesOf = (rows: { id: string; sourceChunkIds: string[] }[], qid: string) => rows.find((r) => r.id === qid)!.sourceChunkIds;
function show(label: string, r: QuizReport) {
  console.log(`\n=== ${label}: ${r.score.correct}/${r.score.total}`);
  for (const t of r.perTopic) console.log(`  ${t.topicName}: ${t.correct}/${t.total} · mastery ${t.masteryBefore.toFixed(3)} → ${t.masteryAfter.toFixed(3)}`);
  for (const m of r.misconceptions) console.log(`  misconception (${m.topicName}) ×${m.count}: ${m.label}`);
  for (const x of r.attempts.filter((x) => x.type === "SHORT")) console.log(`  [SHORT ${x.correct ? "pass" : "fail"} ${x.score.toFixed(2)}] ${x.feedback.text.slice(0, 180)}`);
  console.log(`  revisit: ${r.revisit.map((c) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `s.${c.slide}` : `${c.tStart}s`)).join(" ")}`);
}

// A. perfect student
const A = await newMock("Perfect student");
const aReq: SubmitRequest = {
  responses: A.rows.map((q) => {
    const k = q.answer as Key;
    return { questionId: q.id, response: q.type === "MCQ" ? { type: "MCQ", index: k.index! } : q.type === "NUMERIC" ? { type: "NUMERIC", value: k.value! } : { type: "SHORT", text: k.reference! } };
  }),
};
const aRep = await api.submitQuiz(A.quiz.assessmentId, aReq);
show("A perfect student", aRep);
const aObj = aRep.attempts.filter((x) => x.type !== "SHORT");
const aShort = aRep.attempts.filter((x) => x.type === "SHORT");
add(`A: objective 100% correct (${aObj.filter((x) => x.correct).length}/${aObj.length})`, aObj.every((x) => x.correct));
add(`A: ≥ 90% of SHORT reference answers pass (${aShort.filter((x) => x.correct).length}/${aShort.length})`, aShort.length === 0 || aShort.filter((x) => x.correct).length / aShort.length >= 0.9);
add("A: mastery rises for every topic", aRep.perTopic.every((t) => t.masteryAfter > t.masteryBefore));
add("A: every attempt's feedback cites ≥ 1 source excerpt", aRep.attempts.every((x) => x.feedback.citations.length > 0));

// B. wrong student
const B = await newMock("Wrong student");
const shorts = B.rows.filter((q) => q.type === "SHORT");
const chosenMisconceptions: string[] = [];
const bReq: SubmitRequest = {
  responses: B.rows.map((q) => {
    const k = q.answer as Key;
    if (q.type === "MCQ") {
      const labels = (q.distractorMisconceptions ?? {}) as Record<string, string>;
      const pick = Number(Object.keys(labels)[0] ?? (k.index! + 1) % 4);
      if (labels[String(pick)]) chosenMisconceptions.push(labels[String(pick)]);
      return { questionId: q.id, response: { type: "MCQ", index: pick } };
    }
    if (q.type === "NUMERIC") return { questionId: q.id, response: { type: "NUMERIC", value: k.value! * 2 + 1 } };
    const other = shorts[(shorts.indexOf(q) + 1) % shorts.length];
    const otherRef = other !== q ? (other.answer as Key).reference! : "I am not sure.";
    return { questionId: q.id, response: { type: "SHORT", text: otherRef } };
  }),
};
const bRep = await api.submitQuiz(B.quiz.assessmentId, bReq);
show("B wrong student", bRep);
const bObj = bRep.attempts.filter((x) => x.type !== "SHORT");
const bShort = bRep.attempts.filter((x) => x.type === "SHORT");
add(`B: objective 0% correct (${bObj.filter((x) => x.correct).length}/${bObj.length})`, bObj.every((x) => !x.correct));
add(`B: ≤ 20% of wrong SHORT answers pass (${bShort.filter((x) => x.correct).length}/${bShort.length})`, bShort.length === 0 || bShort.filter((x) => x.correct).length / bShort.length <= 0.2);
add(`B: every chosen distractor's misconception is reported (${chosenMisconceptions.length})`, chosenMisconceptions.every((m) => bRep.misconceptions.some((x) => x.label === m)));
add("B: mastery falls for every topic", bRep.perTopic.every((t) => t.masteryAfter < t.masteryBefore));
const missedSources = new Set(bRep.attempts.filter((x) => !x.correct).flatMap((x) => sourcesOf(B.rows, x.questionId)));
add(`B: revisit non-empty and only cites missed questions' sources (${bRep.revisit.length})`, bRep.revisit.length > 0 && bRep.revisit.every((c) => missedSources.has(c.chunkId)));

// C. empty submission
const C = await newMock("Empty submission");
const g0 = (await api.health()).usage!.generate.requests;
const cRep = await api.submitQuiz(C.quiz.assessmentId, { responses: [] });
const g1 = (await api.health()).usage!.generate.requests;
add(`C: empty submission → 0/${cRep.score.total}, 0 Gemini calls (${g1 - g0})`, cRep.score.correct === 0 && cRep.attempts.every((x) => x.response === null) && g1 === g0);

// D. idempotency
const again = await raw(`/api/quiz/${A.quiz.assessmentId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aReq) });
add(`D: resubmit → 409 (${again.status})`, again.status === 409);
add("D: GET report equals the submit response", JSON.stringify(await api.getReport(A.quiz.assessmentId)) === JSON.stringify(aRep));

const t1 = (await api.health()).usage!;
console.log(`\nGemini usage: generate ${t1.generate.requests - t0.generate.requests} requests (${t1.generate.inputTokens - t0.generate.inputTokens} input tokens)`);
for (const [n, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${n}`);
await writeFile(path.join(REPO_ROOT, "data/demo/grading-report.json"), JSON.stringify({ ranAt: new Date().toISOString(), checks, reports: { aRep, bRep, cRep } }, null, 2));
await prisma.$disconnect();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
