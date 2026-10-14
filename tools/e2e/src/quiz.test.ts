// Module 12 routes WITHOUT spending Gemini quota: every case is refused before generation.
// The real pipeline is checked by `npm run stage1:quiz`. Run: npm run test:e2e
import { TAG, api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { ApiErrorBody } from "@sc/schemas";

const NO_TOPICS = `${TAG}-quiz-course`;
before(async () => {
  await requireServer();
  await prisma.course.create({ data: { id: NO_TOPICS, name: "E2E course without topics" } });
});
after(async () => {
  await prisma.course.deleteMany({ where: { id: NO_TOPICS } });
  await prisma.$disconnect();
});

const post = (body: unknown) => raw("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const expectError = async (res: Response, status: number, code: string, pattern?: RegExp) => {
  assert.equal(res.status, status);
  const { error } = ApiErrorBody.parse(await res.json());
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
};

describe("quiz routes (no Gemini calls)", () => {
  it("validates the request, the learner, the scope and that the course is built", async () => {
    const before = (await api.health()).usage;
    await expectError(await post({ learnerId: "demo-learner", kind: "QUIZ" }), 400, "bad_request", /topicIds/);
    await expectError(await post({ learnerId: "demo-learner", kind: "EXAM" }), 400, "bad_request");
    await expectError(await post({ learnerId: "demo-learner", kind: "MOCK", count: 99 }), 400, "bad_request");
    await expectError(await post({ learnerId: "__e2e__nobody", kind: "DIAGNOSTIC" }), 404, "not_found");
    await expectError(await post({ learnerId: "demo-learner", kind: "QUIZ", topicIds: ["__e2e__not_a_topic"] }), 400, "bad_request", /don't belong/);
    await expectError(await post({ learnerId: "demo-learner", courseId: NO_TOPICS, kind: "DIAGNOSTIC" }), 409, "not_ready", /build the course/);
    await expectError(await raw("/api/quiz/__e2e__no_such_quiz"), 404, "not_found");
    const after = (await api.health()).usage;
    assert.deepEqual(after?.generate.requests, before?.generate.requests);
  });
});
