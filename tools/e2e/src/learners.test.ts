// GET/POST /api/learners against the running server. Run: npm run test:e2e
import { TAG, api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ApiError } from "@sc/client";
import { prisma } from "@sc/db";
import { ApiErrorBody } from "@sc/schemas";

before(requireServer);
after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.$disconnect();
});

const expectError = async (res: Response, status: number, code: string) => {
  assert.equal(res.status, status);
  assert.equal(ApiErrorBody.parse(await res.json()).error.code, code);
};

describe("learners", () => {
  it("POST creates a learner (name trimmed), GET lists it with the seeded demo learner", async () => {
    const created = await api.createLearner({ name: `  ${TAG} Asha  ` });
    assert.equal(created.name, `${TAG} Asha`);
    const all = await api.listLearners();
    assert.ok(all.some((l) => l.id === created.id));
    assert.ok(all.some((l) => l.id === "demo-learner"), "seed learner present");
  });
  it("server rejects invalid bodies with 400 bad_request", async () => {
    const post = (body: string) => raw("/api/learners", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    await expectError(await post(JSON.stringify({ name: "   " })), 400, "bad_request");
    await expectError(await post(JSON.stringify({ name: "x".repeat(61) })), 400, "bad_request");
    await expectError(await post(JSON.stringify({})), 400, "bad_request");
    await expectError(await post("{not json"), 400, "bad_request");
  });
  it("client validates before sending", async () => {
    await assert.rejects(api.createLearner({ name: "" }), (e: unknown) => e instanceof ApiError && e.code === "bad_request" && e.status === 0);
  });
});
