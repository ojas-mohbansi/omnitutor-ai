// Module 10 routes WITHOUT spending Gemini quota: every case is refused before retrieval or the model.
// The real tutor is checked by `npm run stage1:tutor`. Run: npm run test:e2e
import { api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ApiErrorBody } from "@sc/schemas";

before(requireServer);

const post = (path: string, body: string) => raw(path, { method: "POST", headers: { "Content-Type": "application/json" }, body });
const expectError = async (res: Response, status: number, code: string, pattern?: RegExp) => {
  assert.equal(res.status, status);
  const { error } = ApiErrorBody.parse(await res.json());
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
};

describe("tutor routes (no Gemini calls)", () => {
  it("POST /api/chat validates the body and the learner; GET history 404s for an unknown learner", async () => {
    const before = (await api.health()).usage;
    await expectError(await post("/api/chat", '{"learnerId":"demo-learner"}'), 400, "bad_request");
    await expectError(await post("/api/chat", JSON.stringify({ learnerId: "demo-learner", message: "x".repeat(2001) })), 400, "bad_request");
    await expectError(await post("/api/chat", '{"learnerId":"__e2e__nobody","message":"hi"}'), 404, "not_found");
    await expectError(await raw("/api/chat?learnerId=__e2e__nobody"), 404, "not_found");
    await expectError(await raw("/api/chat"), 400, "bad_request");
    await expectError(await post("/api/eval/answer", '{"question":"  "}'), 400, "bad_request");
    const after = (await api.health()).usage;
    assert.deepEqual([after?.generate.requests, after?.embed.requests], [before?.generate.requests, before?.embed.requests]);
  });
  it("GET /api/chat returns a contract-valid history for an existing learner", async () => {
    assert.ok(Array.isArray(await api.chatHistory("demo-learner")));
  });
});
