// REAL-DATA check for Module 12 (quiz generation). Criteria fixed BEFORE the first run:
//  1 diagnostic (new learner) covers ≥ 80% of topics, ≤ 1 question each
//  2 every kept question: topic in scope, difficulty 1–3, source chunks tagged to its topic, verified;
//    GET /api/quiz/[id] leaks no answer
//  3 mock = 10 questions; MCQ, SHORT and NUMERIC all appear across the runs
//  4 adaptivity: strong topic → difficulty 3, weak topic → difficulty 1 and ≥ as many questions
//  5 no repeats: a second mock shares 0 stems with everything the learner had
//  6 generalization: a diagnostic on another real course (pptx-vm) passes 1–2
// Answer keys are printed for manual review. Usage: npm run stage1:quiz  (dev server running)
import { REPO_ROOT, api, requireServer } from "./setup";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { applyObservation } from "@sc/core";
import { prisma } from "@sc/db";
import type { Quiz } from "@sc/schemas";

await requireServer();
const before = (await api.health()).usage!;
const checks: [string, boolean][] = [];
const add = (name: string, ok: boolean) => checks.push([name, ok]);
const review: unknown[] = [];

async function inspect(label: string, quiz: Quiz, courseId: string, scope: string[]) {
  const rows = await prisma.question.findMany({ where: { assessmentId: quiz.assessmentId }, orderBy: { position: "asc" } });
  const chunkTopic = new Map((await prisma.chunk.findMany({ where: { id: { in: rows.flatMap((r) => r.sourceChunkIds) } }, select: { id: true, topicId: true } })).map((c) => [c.id, c.topicId]));
  const rejected = await prisma.question.count({ where: { assessmentId: null, topic: { courseId }, createdAt: { gte: new Date(Date.parse(quiz.createdAt) - 120_000) } } });
  console.log(`\n=== ${label}: ${rows.length} questions (rejected around this build: ${rejected})`);
  for (const r of rows) {
    const t = quiz.questions.find((q) => q.id === r.id)!;
    console.log(`  [${r.type} d${r.difficulty}] ${t.topicName}: ${r.stem}`);
    if (r.type === "MCQ") console.log(`      options: ${(r.options as string[]).map((o, i) => `${i}) ${o}`).join(" | ")}\n      key: ${(r.answer as { index: number }).index}`);
    else console.log(`      key: ${JSON.stringify(r.answer).slice(0, 260)}`);
    review.push({ quiz: label, type: r.type, difficulty: r.difficulty, topic: t.topicName, stem: r.stem, options: r.options, answer: r.answer, misconceptions: r.distractorMisconceptions, explanation: r.explanation });
  }
  const ok = rows.every((r) => scope.includes(r.topicId) && r.difficulty >= 1 && r.difficulty <= 3 && r.verified && r.sourceChunkIds.length > 0 && r.sourceChunkIds.every((id) => chunkTopic.get(id) === r.topicId));
  add(`${label}: every question in scope, difficulty 1–3, verified, sources from its own topic`, ok);
  const leaked = quiz.questions.some((q) => ["answer", "explanation", "distractorMisconceptions", "correctOption"].some((k) => k in q));
  add(`${label}: GET quiz leaks no answer fields`, !leaked && JSON.stringify(await api.getQuiz(quiz.assessmentId)) === JSON.stringify(quiz));
  return rows;
}

// 1–2: diagnostic for a new learner (demo course)
const topics = await api.listTopics();
const ids = topics.map((t) => t.id);
const student = await api.createLearner({ name: `Quiz check ${new Date().toISOString().slice(11, 19)}` });
const diag = await api.createQuiz({ learnerId: student.id, kind: "DIAGNOSTIC" });
const diagRows = await inspect("diagnostic (demo course)", diag, "demo-course", ids);
const perTopic = new Map<string, number>();
for (const r of diagRows) perTopic.set(r.topicId, (perTopic.get(r.topicId) ?? 0) + 1);
add(`diagnostic covers ≥ 80% of ${ids.length} topics, ≤ 1 each (${perTopic.size} covered)`, perTopic.size / ids.length >= 0.8 && [...perTopic.values()].every((n) => n === 1));

// 3 + 5: mock, then a second mock (no repeats)
const mock1 = await api.createQuiz({ learnerId: student.id, kind: "MOCK" });
const m1 = await inspect("mock 1", mock1, "demo-course", ids);
add(`mock has 10 questions (${m1.length})`, m1.length === 10);
const mock2 = await api.createQuiz({ learnerId: student.id, kind: "MOCK" });
const m2 = await inspect("mock 2", mock2, "demo-course", ids);
const earlier = new Set([...diagRows, ...m1].map((r) => r.stemHash));
add(`no repeats: mock 2 shares ${m2.filter((r) => earlier.has(r.stemHash)).length} stems with earlier quizzes`, m2.every((r) => !earlier.has(r.stemHash)));
const types = new Set([...diagRows, ...m1, ...m2].map((r) => r.type));
add(`MCQ, SHORT and NUMERIC all appear (${[...types].join(", ")})`, types.size === 3);

// 4: adaptivity (strong vs weak topic)
const [strong, weak] = [topics[0], topics.at(-1)!];
const adaptive = await api.createLearner({ name: `Adaptive check ${new Date().toISOString().slice(11, 19)}` });
for (let i = 0; i < 4; i++) await applyObservation({ learnerId: adaptive.id, topicId: strong.id, correct: true, type: "MCQ", source: "QUIZ" });
await applyObservation({ learnerId: adaptive.id, topicId: weak.id, correct: false, type: "MCQ", source: "QUIZ" });
const mastery = await prisma.mastery.findMany({ where: { learnerId: adaptive.id } });
console.log(`\nadaptive learner mastery: ${mastery.map((m) => `${m.topicId === strong.id ? strong.name : weak.name}=${m.p.toFixed(2)}`).join(", ")}`);
const aq = await api.createQuiz({ learnerId: adaptive.id, kind: "QUIZ", topicIds: [strong.id, weak.id], count: 6 });
const aRows = await inspect("adaptive quiz (strong + weak topic)", aq, "demo-course", [strong.id, weak.id]);
const sRows = aRows.filter((r) => r.topicId === strong.id);
const wRows = aRows.filter((r) => r.topicId === weak.id);
add(`adaptivity: weak topic gets ≥ questions (${wRows.length} vs ${sRows.length}), difficulty weak=1 strong=3`, wRows.length >= sRows.length && wRows.every((r) => r.difficulty === 1) && sRows.every((r) => r.difficulty === 3));

// 6: generalization (another real course)
const vmTopics = (await api.listTopics("pptx-vm")).map((t) => t.id);
const vmDiag = await api.createQuiz({ learnerId: student.id, courseId: "pptx-vm", kind: "DIAGNOSTIC" });
const vmRows = await inspect("diagnostic (VM deck course)", vmDiag, "pptx-vm", vmTopics);
add(`VM diagnostic covers ≥ 80% of ${vmTopics.length} topics (${new Set(vmRows.map((r) => r.topicId)).size})`, new Set(vmRows.map((r) => r.topicId)).size / vmTopics.length >= 0.8);

const after = (await api.health()).usage!;
console.log(`\nGemini usage: generate ${after.generate.requests - before.generate.requests} requests (${after.generate.inputTokens - before.generate.inputTokens} input tokens)`);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
await writeFile(path.join(REPO_ROOT, "data/demo/quiz-report.json"), JSON.stringify({ ranAt: new Date().toISOString(), checks, review }, null, 2));
console.log("full report (answer keys for review): data/demo/quiz-report.json");
await prisma.$disconnect();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
