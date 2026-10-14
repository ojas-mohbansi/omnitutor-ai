// Registry ↔ running server: every live endpoint answers with contract-valid JSON through
// @sc/client; every planned endpoint is genuinely absent. Run: npm run test:e2e
import { BASE_URL, api, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ApiError } from "@sc/client";
import { ApiErrorBody, endpoints, type EndpointName } from "@sc/schemas";

before(requireServer);

describe(`registry vs ${BASE_URL}`, () => {
  it("health is live and valid (with and without Gemini check)", async () => {
    assert.equal((await api.health()).ok, true);
    const g = await api.health({ gemini: true });
    assert.ok(g.gemini && Object.values(g.gemini).every((m) => m.ok), JSON.stringify(g.gemini));
  });
  it("read-only live endpoints return contract-valid data", async () => {
    assert.ok(Array.isArray(await api.listLearners()));
    assert.ok(Array.isArray(await api.listSources()));
    assert.ok(Array.isArray(await api.listTopics()));
  });
  const planned = (Object.keys(endpoints) as EndpointName[]).filter((n) => (endpoints[n].status as string) === "planned");
  for (const name of planned) {
    it(`planned ${name} is not served yet (HTML 404 → http_error, not a crash)`, async () => {
      const e = endpoints[name];
      const url = e.path.replace(/\[[^\]]+\]/g, "x") + (e.query ? "?learnerId=demo-learner" : "");
      const res = await raw(url, { method: e.method, headers: { "Content-Type": "application/json" }, body: e.method === "POST" ? "{}" : undefined });
      assert.equal(res.status, 404, `${e.method} ${url}`);
    });
  }
  it("client maps a missing route to ApiError(http_error, 404)", async () => {
    const { createApiClient } = await import("@sc/client");
    // Every endpoint is live, so point the client at a prefix that serves nothing.
    const live = createApiClient({ mode: "live", baseUrl: `${BASE_URL}/__no_such_prefix__` });
    await assert.rejects(live.listLearners(), (e: unknown) => e instanceof ApiError && e.code === "http_error" && e.status === 404);
  });
  it("live routes answer wrong methods with 405", async () => {
    assert.equal((await raw("/api/learners", { method: "DELETE" })).status, 405);
    assert.equal((await raw("/api/files/x", { method: "POST" })).status, 405);
  });
  it("errors from live routes are ApiErrorBody JSON", async () => {
    const res = await raw("/api/sources/does-not-exist", { method: "DELETE" });
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(ApiErrorBody.parse(await res.json()).error.code, "not_found");
  });
});
