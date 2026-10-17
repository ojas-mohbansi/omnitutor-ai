// Regression tests for the audit fixes (2026-10-14), against the real DB with no Gemini calls.
// Each test uses its own temporary course, so the demo course's topics never interfere. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { AppError } from "../src/errors";
import { submitQuiz } from "../src/grading";
import { requestIngestion, type ExtractPage } from "../src/ingest/index";
import { ApiError } from "@google/genai";
import { fallbackModel, isFileAccessDenied, isKeyRejected, requestTimeoutMs } from "../src/llm";
import { uploadSource } from "../src/sources";
import { chunked, makePdf } from "../src/testing";
import { chat } from "../src/tutor";

const TAG = `__test__regress${Date.now()}`;
const DIM = 768;
const axis = (i: number) => Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));
const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;

let tempRoot: string;
let courseId: string;
before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "sc-regress-"));
  process.env.REPO_ROOT = tempRoot;
  courseId = (await prisma.course.create({ data: { name: `${TAG} course` } })).id;
});
after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } }); // cascades sources, chunks, topics, quizzes
  await prisma.$disconnect();
  await rm(tempRoot, { recursive: true, force: true });
});

describe("requestTimeoutMs", () => {
  it("defaults to 120 s; LLM_TIMEOUT_MS overrides with a positive number only", () => {
    assert.equal(requestTimeoutMs({}), 120_000);
    assert.equal(requestTimeoutMs({ LLM_TIMEOUT_MS: "5000" }), 5000);
    for (const bad of ["0", "-1", "abc", ""]) assert.equal(requestTimeoutMs({ LLM_TIMEOUT_MS: bad }), 120_000);
  });
});

describe("fallbackModel", () => {
  it("never falls back to the same (overloaded) model", () => {
    const env = { LLM_MODEL_FAST: "lite-a", LLM_MODEL_VERIFY: "lite-b" };
    assert.equal(fallbackModel("lite-a", env), "lite-b");
    assert.equal(fallbackModel("lite-b", env), "lite-a");
    assert.equal(fallbackModel("lite-a", { ...env, LLM_MODEL_FALLBACK: "other" }), "other");
    assert.equal(fallbackModel("lite-a", { LLM_MODEL_FAST: "lite-a" }), undefined);
  });
});

describe("isKeyRejected (rotate to the next key instead of failing)", () => {
  it("invalid/expired keys and 401/403 are key problems; quota, overload and bad requests are not", () => {
    const err = (status: number, message: string) => new ApiError({ status, message });
    assert.ok(isKeyRejected(err(400, '{"error":{"message":"API key not valid. Please pass a valid API key.","reason":"API_KEY_INVALID"}}')));
    assert.ok(isKeyRejected(err(400, "API key expired. Please renew the API key.")));
    assert.ok(isKeyRejected(err(403, "PERMISSION_DENIED")));
    assert.ok(isKeyRejected(err(401, "UNAUTHENTICATED")));
    for (const [status, msg] of [[400, "Invalid JSON payload"], [429, "RESOURCE_EXHAUSTED"], [503, "overloaded"]] as const) assert.ok(!isKeyRejected(err(status, msg)), msg);
    assert.ok(!isKeyRejected(new Error("API key not valid")));
  });
  it("a 403 on an uploaded file is a file-access problem (other project's key), never a rejected key", () => {
    const denied = new ApiError({ status: 403, message: '{"error":{"code":403,"message":"You do not have permission to access the File abc123 or it may not exist.","status":"PERMISSION_DENIED"}}' });
    assert.ok(isFileAccessDenied(denied));
    assert.ok(!isKeyRejected(denied));
    assert.ok(!isFileAccessDenied(new ApiError({ status: 403, message: "PERMISSION_DENIED" })));
  });
});

describe("ingestion keeps the course's topic structure", () => {
  it("once topics exist, (re-)ingested chunks are tagged to the nearest stored topic vector", async () => {
    const [a, b] = await Promise.all([
      prisma.topic.create({ data: { courseId, seq: 1, name: "A", description: "", prereqIds: [], embedding: axis(1) } }),
      prisma.topic.create({ data: { courseId, seq: 2, name: "B", description: "", prereqIds: [], embedding: axis(0) } }),
    ]);
    const extractPage: ExtractPage = async (_bytes, { pageIndex }) => ({
      extraction: { blocks: [{ kind: "text", title: "", content: `page ${pageIndex + 1}` }], conceptLabels: [] },
      cached: false,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const embed = async (texts: string[]) => texts.map((_, i) => axis(i % 2)); // page 1 ≈ B, page 2 ≈ A
    const id = (await uploadSource({ body: chunked(await makePdf(2)), filename: `${TAG}.pdf`, courseId })).id;
    for (let run = 0; run < 2; run++) {
      const result = await (await requestIngestion(id, { extractPage, embed })).job;
      assert.ok(result.ok, JSON.stringify(result));
      const chunks = await prisma.chunk.findMany({ where: { sourceId: id }, orderBy: { seq: "asc" } });
      assert.deepEqual(chunks.map((c) => c.topicId), [b.id, a.id], `run ${run + 1}`);
    }
  });
});

async function mcqQuiz() {
  const topic = await prisma.topic.findFirstOrThrow({ where: { courseId } });
  const learner = await prisma.learner.create({ data: { name: `${TAG} learner` } });
  const quiz = await prisma.assessment.create({ data: { learnerId: learner.id, courseId, kind: "QUIZ", scopeTopicIds: [topic.id] } });
  const base = { topicId: topic.id, assessmentId: quiz.id, difficulty: 1, explanation: "Because.", sourceChunkIds: [], verified: true };
  const [mcq, short] = await Promise.all([
    prisma.question.create({ data: { ...base, position: 0, type: "MCQ", stem: `${TAG} mcq`, stemHash: `${TAG}1`, options: ["a", "b", "c", "d"], answer: { index: 1 } } }),
    prisma.question.create({ data: { ...base, position: 1, type: "SHORT", stem: `${TAG} short`, stemHash: `${TAG}2`, answer: { reference: "ref", keyPoints: ["k"] } } }),
  ]);
  return { learner, quiz, mcq, short };
}

describe("submitQuiz", () => {
  it("concurrent submits grade the quiz once (one 409), so mastery is updated once per question", async () => {
    const { learner, quiz, mcq } = await mcqQuiz();
    const req = { responses: [{ questionId: mcq.id, response: { type: "MCQ" as const, index: 1 } }] };
    const results = await Promise.allSettled([submitQuiz(quiz.id, req), submitQuiz(quiz.id, req)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected");
    assert.ok(failed && isCode("not_ready")(failed.reason), String(failed && (failed as PromiseRejectedResult).reason));
    assert.equal(await prisma.attempt.count({ where: { assessmentId: quiz.id } }), 2);
    assert.equal(await prisma.masteryEvent.count({ where: { learnerId: learner.id } }), 2);
  });

  it("a blank SHORT answer counts as unanswered (no grading call, clear feedback)", async () => {
    const { quiz, short } = await mcqQuiz();
    const report = await submitQuiz(quiz.id, { responses: [{ questionId: short.id, response: { type: "SHORT", text: "   " } }] });
    const attempt = report.attempts.find((x) => x.questionId === short.id)!;
    assert.equal(attempt.response, null);
    assert.equal(attempt.correct, false);
    assert.match(attempt.feedback.text, /^Not answered/);
  });
});

describe("chat", () => {
  it("a turn that fails stores nothing (no unanswered question left in the history)", async () => {
    const empty = await prisma.course.create({ data: { name: `${TAG} empty course` } });
    const learner = await prisma.learner.create({ data: { name: `${TAG} chatter` } });
    // No sources: retrieval refuses (409) before any Gemini call.
    await assert.rejects(chat({ learnerId: learner.id, courseId: empty.id, message: "What is a process?" }), isCode("not_ready"));
    assert.equal(await prisma.chatMessage.count({ where: { learnerId: learner.id } }), 0);
  });
});
