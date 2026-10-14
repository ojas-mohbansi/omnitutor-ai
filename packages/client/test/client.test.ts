// @sc/client behaviour with a fake fetch: modes, error mapping, validation. Run: npm run test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_UPLOAD_BYTES, endpoints, type EndpointName } from "@sc/schemas";
import { mocks } from "@sc/schemas/mocks";
import { ApiError, createApiClient } from "../src/index";

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html404 = () => new Response("<!DOCTYPE html><html>404</html>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

async function rejectsWith(p: Promise<unknown>, code: string, status?: number) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof ApiError, `expected ApiError, got ${e}`);
    assert.equal(e.code, code);
    if (status !== undefined) assert.equal(e.status, status);
    return true;
  });
}

describe("modes", () => {
  it("mock: returns a deep copy of the mock and never calls fetch", async () => {
    const f = fakeFetch(() => { throw new Error("must not fetch"); });
    const api = createApiClient({ mode: "mock", fetch: f.fn });
    const a = await api.listSources();
    a[0].filename = "mutated";
    assert.notEqual(mocks.listSources[0].filename, "mutated");
    assert.deepEqual(await api.mastery("demo-learner"), mocks.mastery);
    assert.equal(f.calls.length, 0);
  });
  it("auto: follows the registry status (live → fetch); every endpoint is live as of Module 14", async () => {
    const f = fakeFetch(() => json(mocks.listSources));
    const api = createApiClient({ mode: "auto", fetch: f.fn });
    for (const name of Object.keys(endpoints) as EndpointName[]) assert.equal(api.isLive(name), endpoints[name].status === "live", name);
    await api.listSources();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, "/api/sources");
  });
  it("mockDelayMs delays mocked calls", async () => {
    const api = createApiClient({ mode: "mock", mockDelayMs: 40 });
    const t0 = Date.now();
    await api.listTopics();
    assert.ok(Date.now() - t0 >= 35);
  });
  it("baseUrl is prefixed", async () => {
    const f = fakeFetch(() => json(mocks.listLearners));
    await createApiClient({ mode: "live", baseUrl: "http://localhost:3000", fetch: f.fn }).listLearners();
    assert.equal(f.calls[0].url, "http://localhost:3000/api/learners");
  });
});

describe("error mapping (live)", () => {
  it("missing route (HTML 404) → http_error, not a JSON parse crash", async () => {
    const api = createApiClient({ mode: "live", fetch: fakeFetch(html404).fn });
    await rejectsWith(api.buildCourse(), "http_error", 404);
  });
  it("wrong method (empty 405) → http_error", async () => {
    const api = createApiClient({ mode: "live", fetch: fakeFetch(() => new Response(null, { status: 405 })).fn });
    await rejectsWith(api.listTopics(), "http_error", 405);
  });
  it("ApiErrorBody → its code, message and status", async () => {
    const api = createApiClient({ mode: "live", fetch: fakeFetch(() => json({ error: { code: "not_ready", message: "Sources are still processing." } }, 409)).fn });
    await assert.rejects(api.buildCourse(), (e: unknown) => e instanceof ApiError && e.code === "not_ready" && e.status === 409 && e.message === "Sources are still processing.");
  });
  it("2xx body that breaks the contract → invalid_response", async () => {
    const api = createApiClient({ mode: "live", fetch: fakeFetch(() => json([{ id: "x" }])).fn });
    await rejectsWith(api.listSources(), "invalid_response", 200);
  });
  it("fetch throws → network", async () => {
    const api = createApiClient({ mode: "live", fetch: fakeFetch(() => { throw new TypeError("fetch failed"); }).fn });
    await rejectsWith(api.listLearners(), "network", 0);
  });
  it("health: 503 still returns the HealthResponse body", async () => {
    const down = { ok: false, db: { ok: false, error: "Server has closed the connection." }, env: { DATABASE_URL: true } };
    const api = createApiClient({ mode: "live", fetch: fakeFetch(() => json(down, 503)).fn });
    assert.deepEqual(await api.health(), down);
  });
});

describe("requests", () => {
  it("JSON body is validated before sending (no fetch on invalid input)", async () => {
    const f = fakeFetch(() => json(mocks.createLearner));
    const api = createApiClient({ mode: "live", fetch: f.fn });
    await rejectsWith(api.createLearner({ name: "   " }), "bad_request", 0);
    assert.equal(f.calls.length, 0);
  });
  it("JSON body is sent trimmed with the right method and content type", async () => {
    const f = fakeFetch(() => json(mocks.createLearner));
    await createApiClient({ mode: "live", fetch: f.fn }).createLearner({ name: "  Asha  " });
    assert.equal(f.calls[0].init.method, "POST");
    assert.equal((f.calls[0].init.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { name: "Asha" });
  });
  it("dynamic and query URLs are built with paths", async () => {
    const f = fakeFetch(({ url }) => json(url.includes("/report") ? mocks.getReport : mocks.chatHistory));
    const api = createApiClient({ mode: "live", fetch: f.fn });
    await api.getReport("asmt 1");
    await api.chatHistory("demo-learner");
    assert.deepEqual(f.calls.map((c) => c.url), ["/api/quiz/asmt%201/report", "/api/chat?learnerId=demo-learner"]);
  });
  it("deleteSource uses DELETE", async () => {
    const f = fakeFetch(() => json({ id: "s1" }));
    assert.deepEqual(await createApiClient({ mode: "live", fetch: f.fn }).deleteSource("s1"), { id: "s1" });
    assert.equal(f.calls[0].init.method, "DELETE");
    assert.equal(f.calls[0].url, "/api/sources/s1");
  });
});

describe("uploadSource", () => {
  it("sends the raw bytes with the filename in the query", async () => {
    const f = fakeFetch(() => json({ id: "s1", status: "PENDING" }));
    const file = new File([new Uint8Array([37, 80, 68, 70])], "Galvin – Ch5.pdf");
    const res = await createApiClient({ mode: "live", fetch: f.fn }).uploadSource(file);
    assert.deepEqual(res, { id: "s1", status: "PENDING" });
    assert.equal(f.calls[0].init.method, "POST");
    assert.equal(new URL(f.calls[0].url, "http://x").searchParams.get("filename"), "Galvin – Ch5.pdf");
    assert.equal(f.calls[0].init.body, file);
  });
  it("rejects unsupported extensions and oversize files before any request", async () => {
    const f = fakeFetch(() => json({ id: "s1", status: "PENDING" }));
    const api = createApiClient({ mode: "live", fetch: f.fn });
    await rejectsWith(api.uploadSource(new File(["x"], "notes.docx")), "bad_request", 0);
    await rejectsWith(api.uploadSource({ size: MAX_UPLOAD_BYTES + 1 } as Blob, "big.mp4"), "bad_request", 0);
    assert.equal(f.calls.length, 0);
  });
});
