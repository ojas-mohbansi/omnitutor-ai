// REAL-DATA check for Module 14 (GET /api/mastery) on learners created by the real runs. Criteria fixed BEFORE the run:
//  perfect student: needsDiagnostic true (never took one), no weak topics, every topic's p = its last history "after",
//    history = 10 QUIZ events
//  wrong student: weak topics = assessed topics in the weak band, lowest p first, each with 1–3 citations from missed questions
//  tutor-check student: history contains CHAT events
//  new student: after submitting a diagnostic (keyed answers), needsDiagnostic turns false
// Usage: npm run stage1:mastery   (dev server running; run stage1:grading and stage1:tutor first)
import { api, requireServer } from "./setup";
import { prisma } from "@sc/db";
import { masteryBand, type MasteryView, type SubmitRequest } from "@sc/schemas";

await requireServer();
const checks: [string, boolean][] = [];
const add = (n: string, ok: boolean) => checks.push([n, ok]);
const latest = async (prefix: string) => (await prisma.learner.findFirstOrThrow({ where: { name: { startsWith: prefix } }, orderBy: { createdAt: "desc" } })).id;
const consistent = (v: MasteryView) =>
  v.topics.every((t) => {
    const last = v.history.filter((h) => h.topicId === t.topicId).at(-1);
    return last ? Math.abs(last.after - t.p) < 1e-9 && t.band === masteryBand(t.p) : t.n === 0;
  });
function show(label: string, v: MasteryView) {
  console.log(`\n=== ${label}: needsDiagnostic=${v.needsDiagnostic} · history ${v.history.length} (${[...new Set(v.history.map((h) => h.source))].join("/")})`);
  for (const t of v.topics) console.log(`  ${t.seq}. ${t.name}: p=${t.p.toFixed(3)} ${t.band} (n=${t.n})`);
  for (const w of v.weakTopics) console.log(`  weak: ${w.name} p=${w.p.toFixed(3)} → revise ${w.citations.map((c) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `s.${c.slide}` : `${c.tStart}s`)).join(", ")}`);
}

const perfect = await api.mastery(await latest("Perfect student"));
show("perfect student", perfect);
add("perfect: needsDiagnostic true, no weak topics, 10 QUIZ events, p consistent with history", perfect.needsDiagnostic && perfect.weakTopics.length === 0 && perfect.history.length === 10 && perfect.history.every((h) => h.source === "QUIZ") && consistent(perfect));

const wrongId = await latest("Wrong student");
const wrong = await api.mastery(wrongId);
show("wrong student", wrong);
const expectedWeak = wrong.topics.filter((t) => t.n > 0 && t.band === "weak").map((t) => t.topicId);
const missedChunks = new Set((await prisma.attempt.findMany({ where: { correct: false, assessment: { learnerId: wrongId } }, select: { question: { select: { sourceChunkIds: true } } } })).flatMap((a) => a.question.sourceChunkIds));
add(
  `wrong: ${expectedWeak.length} weak topics, lowest first, 1–3 citations each from missed questions`,
  expectedWeak.length > 0 && wrong.weakTopics.length === expectedWeak.length &&
    wrong.weakTopics.every((w, i) => i === 0 || wrong.weakTopics[i - 1].p <= w.p) &&
    wrong.weakTopics.every((w) => w.citations.length >= 1 && w.citations.length <= 3 && missedChunks.has(w.citations[0].chunkId)) && consistent(wrong),
);

const chatty = await api.mastery(await latest("Tutor check"));
show("tutor-check student", chatty);
add("tutor-check: history has CHAT events", chatty.history.some((h) => h.source === "CHAT") && consistent(chatty));

const fresh = await api.createLearner({ name: `Diagnostic check ${new Date().toISOString().slice(11, 19)}` });
const v0 = await api.mastery(fresh.id);
const diag = await api.createQuiz({ learnerId: fresh.id, kind: "DIAGNOSTIC" });
const rows = await prisma.question.findMany({ where: { assessmentId: diag.assessmentId } });
type Key = { index?: number; value?: number; reference?: string };
const req: SubmitRequest = {
  responses: rows.map((q) => {
    const k = q.answer as Key;
    return { questionId: q.id, response: q.type === "MCQ" ? { type: "MCQ", index: k.index! } : q.type === "NUMERIC" ? { type: "NUMERIC", value: k.value! } : { type: "SHORT", text: k.reference! } };
  }),
};
await api.submitQuiz(diag.assessmentId, req);
const v1 = await api.mastery(fresh.id);
show("new student after diagnostic", v1);
add(`new student: needsDiagnostic ${v0.needsDiagnostic} → ${v1.needsDiagnostic}; all topics at prior before`, v0.needsDiagnostic && !v1.needsDiagnostic && v0.topics.every((t) => t.n === 0 && t.p === 0.3) && v0.weakTopics.length === 0);

for (const [n, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${n}`);
await prisma.$disconnect();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
