// Module 9 routes against the running server WITHOUT spending Gemini quota: every case here is
// refused before the planner is called (usage is asserted unchanged). The real build is checked by
// `npm run stage1:build`. Run: npm run test:e2e
import { TAG, api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { ApiErrorBody } from "@sc/schemas";

const EMPTY_COURSE = `${TAG}-empty-course`;
before(async () => {
  await requireServer();
  await prisma.course.create({ data: { id: EMPTY_COURSE, name: "E2E course with nothing ingested" } });
});
after(async () => {
  await prisma.course.deleteMany({ where: { id: EMPTY_COURSE } });
  await prisma.$disconnect();
});

const post = (body: string) => raw("/api/build", { method: "POST", headers: { "Content-Type": "application/json" }, body });
const expectError = async (res: Response, status: number, code: string, pattern?: RegExp) => {
  assert.equal(res.status, status);
  const { error } = ApiErrorBody.parse(await res.json());
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
};

describe("GET /api/topics", () => {
  it("lists topics in seq order (any course) and refuses an unknown course (409)", async () => {
    const topics = await api.listTopics();
    assert.deepEqual(topics.map((t) => t.seq), [...topics.map((t) => t.seq)].sort((a, b) => a - b));
    assert.deepEqual(await api.listTopics(EMPTY_COURSE), []);
    await expectError(await raw("/api/topics?courseId=__e2e__no_such_course"), 409, "not_ready", /not found/);
  });
});

describe("POST /api/build (no Gemini calls)", () => {
  it("validates the body, refuses unknown and empty courses, and spends no quota", async () => {
    const before = (await api.health()).usage;
    await expectError(await post('{"force":"yes"}'), 400, "bad_request");
    await expectError(await post("not json"), 400, "bad_request");
    await expectError(await post('{"courseId":"__e2e__no_such_course"}'), 409, "not_ready", /not found/);
    await expectError(await post(JSON.stringify({ courseId: EMPTY_COURSE })), 409, "not_ready", /Nothing to build from/);
    const after = (await api.health()).usage;
    assert.deepEqual([after?.generate.requests, after?.embed.requests], [before?.generate.requests, before?.embed.requests]);
  });
});
