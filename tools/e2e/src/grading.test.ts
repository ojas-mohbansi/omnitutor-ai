// Module 13 routes WITHOUT Gemini: a quiz is created directly in the DB (no generation), and only
// objective questions are submitted, so grading never calls the model. Real check: `npm run stage1:grading`.
import { TAG, api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { ApiErrorBody } from "@sc/schemas";

const COURSE = `${TAG}-grading`;
let learnerId = "";
let quizId = "";
let mcqId = "";
let numId = "";
before(async () => {
  await requireServer();
  await prisma.course.create({ data: { id: COURSE, name: "E2E grading" } });
  const topic = await prisma.topic.create({ data: { courseId: COURSE, seq: 1, name: "E2E topic", description: "" } });
  learnerId = (await prisma.learner.create({ data: { name: `${TAG} learner` } })).id;
  quizId = (await prisma.assessment.create({ data: { learnerId, courseId: COURSE, kind: "QUIZ", scopeTopicIds: [topic.id] } })).id;
  const base = { topicId: topic.id, assessmentId: quizId, difficulty: 1, explanation: "Because.", sourceChunkIds: [], verified: true };
  mcqId = (await prisma.question.create({ data: { ...base, position: 0, type: "MCQ", stem: "Pick B", stemHash: `${TAG}1`, options: ["A", "B", "C", "D"], answer: { index: 1 }, distractorMisconceptions: { "0": "thinks A" } } })).id;
  numId = (await prisma.question.create({ data: { ...base, position: 1, type: "NUMERIC", stem: "2+2", stemHash: `${TAG}2`, answer: { value: 4 } } })).id;
});
after(async () => {
  await prisma.learner.deleteMany({ where: { id: learnerId } });
  await prisma.course.deleteMany({ where: { id: COURSE } });
  await prisma.$disconnect();
});

const submit = (body: unknown) => raw(`/api/quiz/${quizId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const expectError = async (res: Response, status: number, code: string, pattern?: RegExp) => {
  assert.equal(res.status, status);
  const { error } = ApiErrorBody.parse(await res.json());
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
};

describe("submit + report routes (no Gemini calls)", () => {
  it("rejects bad submissions, grades objective answers in code, reports misconceptions, then refuses a resubmit", async () => {
    const before = (await api.health()).usage;
    await expectError(await raw(`/api/quiz/${quizId}/report`), 409, "not_ready", /hasn't been submitted/);
    await expectError(await submit({ responses: [{ questionId: "nope", response: { type: "MCQ", index: 0 } }] }), 400, "bad_request", /not part of this quiz/);
    await expectError(await submit({ responses: [{ questionId: mcqId, response: { type: "NUMERIC", value: 1 } }] }), 400, "bad_request", /is MCQ/);
    await expectError(await submit({ responses: [{ questionId: mcqId, response: { type: "MCQ", index: 7 } }] }), 400, "bad_request", /no option 7/);
    await expectError(await raw("/api/quiz/__e2e__none/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"responses":[]}' }), 404, "not_found");

    const report = await api.submitQuiz(quizId, { responses: [{ questionId: mcqId, response: { type: "MCQ", index: 0 } }, { questionId: numId, response: { type: "NUMERIC", value: 4.02 } }] });
    assert.deepEqual(report.score, { correct: 1, total: 2 });
    assert.deepEqual(report.attempts.map((a) => [a.correct, a.misconception]), [[false, "thinks A"], [true, null]]);
    assert.equal(report.attempts[0].correctAnswer, "B");
    assert.deepEqual(report.misconceptions.map((m) => [m.label, m.count]), [["thinks A", 1]]);
    assert.equal(report.perTopic[0].total, 2);
    assert.deepEqual(await api.getReport(quizId), report);
    await expectError(await submit({ responses: [] }), 409, "not_ready", /already submitted/);
    assert.equal(await prisma.masteryEvent.count({ where: { learnerId } }), 2, "one BKT update per question");
    const after = (await api.health()).usage;
    assert.deepEqual(after?.generate.requests, before?.generate.requests);
  });
});
