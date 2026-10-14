// Upload / list / delete against the running server, including server-side validation
// (raw requests that bypass the client's own checks). Run: npm run test:e2e
import { BASE_URL, REPO_ROOT, TAG, api, fileOf, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { makeMp4, makePdf, makePptx } from "@sc/core/testing";
import { prisma } from "@sc/db";
import { ApiErrorBody, MAX_UPLOAD_BYTES } from "@sc/schemas";

const UPLOADS = path.join(REPO_ROOT, "data", "uploads");
const MiB = 1024 * 1024;

before(requireServer);
after(async () => {
  const left = await prisma.source.findMany({ where: { filename: { startsWith: TAG } }, select: { id: true } });
  for (const s of left) await api.deleteSource(s.id).catch(() => {});
  await prisma.source.deleteMany({ where: { filename: { startsWith: TAG } } });
  await prisma.$disconnect();
});

const uploadRaw = (filename: string | null, body: BodyInit | null) =>
  raw(filename === null ? "/api/sources" : `/api/sources?${new URLSearchParams({ filename })}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });
const expectError = async (res: Response, status: number, code: string, pattern?: RegExp) => {
  assert.equal(res.status, status);
  const { error } = ApiErrorBody.parse(await res.json());
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
};
const filesInUploads = async () => (await readdir(UPLOADS)).filter((f) => f !== ".gitkeep").sort();

describe("upload → list → delete", () => {
  it("PDF: PENDING, listed, stored under data/uploads with its page count", async () => {
    const pdf = await makePdf(3);
    const res = await api.uploadSource(fileOf(pdf, `${TAG} Galvin – Ch5 (CPU) ✓.pdf`));
    assert.equal(res.status, "PENDING");

    const view = (await api.listSources()).find((s) => s.id === res.id);
    assert.ok(view);
    assert.equal(view.filename, `${TAG} Galvin – Ch5 (CPU) ✓.pdf`, "unicode filename round-trips");
    assert.equal(view.type, "PDF");
    assert.equal(view.chunkCount, 0);

    const row = await prisma.source.findUniqueOrThrow({ where: { id: res.id } });
    assert.equal(row.pageCount, 3);
    assert.equal(row.sizeBytes, pdf.length);
    assert.equal((await stat(path.join(REPO_ROOT, row.path))).size, pdf.length, "file is at the repo-root path, not under apps/web");
  });

  it("PPTX and MP4 record slide count and duration", async () => {
    const deck = await api.uploadSource(fileOf(await makePptx(5), `${TAG}-deck.pptx`));
    const video = await api.uploadSource(fileOf(makeMp4({ durationSec: 1199, moovAtEnd: true }), `${TAG}-lecture.mp4`));
    const rows = await prisma.source.findMany({ where: { id: { in: [deck.id, video.id] } } });
    assert.equal(rows.find((r) => r.id === deck.id)?.pageCount, 5);
    assert.equal(rows.find((r) => r.id === video.id)?.durationSec, 1199);
  });

  it("DELETE removes row and file; a second DELETE is 404", async () => {
    const { id } = await api.uploadSource(fileOf(await makePdf(1), `${TAG}-gone.pdf`));
    const row = await prisma.source.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(await api.deleteSource(id), { id });
    assert.equal(existsSync(path.join(REPO_ROOT, row.path)), false);
    assert.equal(await prisma.source.count({ where: { id } }), 0);
    await expectError(await raw(`/api/sources/${id}`, { method: "DELETE" }), 404, "not_found");
  });

  it("upload never starts ingestion (stays PENDING, no Gemini usage)", async () => {
    const before = (await api.health()).usage;
    const { id } = await api.uploadSource(fileOf(await makePdf(2), `${TAG}-pending.pdf`));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal((await api.listSources()).find((s) => s.id === id)?.status, "PENDING");
    assert.deepEqual((await api.health()).usage?.generate.requests, before?.generate.requests);
    await api.deleteSource(id);
  });

  it("POST /ingest refuses a source that is already processing (409) and unknown ids (404) without calling Gemini", async () => {
    const before = (await api.health()).usage;
    const { id } = await api.uploadSource(fileOf(await makePptx(2), `${TAG}-ingest.pptx`));
    await prisma.source.update({ where: { id }, data: { status: "PROCESSING" } });
    await expectError(await raw(`/api/sources/${id}/ingest`, { method: "POST" }), 409, "not_ready", /already being processed/);
    await expectError(await raw("/api/sources/no-such-source/ingest", { method: "POST" }), 404, "not_found");
    assert.deepEqual((await api.health()).usage?.generate.requests, before?.generate.requests);
    await prisma.source.update({ where: { id }, data: { status: "FAILED" } });
    await api.deleteSource(id);
  });

  it("DELETE while PROCESSING is 409 not_ready", async () => {
    const { id } = await api.uploadSource(fileOf(await makePdf(1), `${TAG}-busy.pdf`));
    await prisma.source.update({ where: { id }, data: { status: "PROCESSING" } });
    await expectError(await raw(`/api/sources/${id}`, { method: "DELETE" }), 409, "not_ready");
    await prisma.source.update({ where: { id }, data: { status: "FAILED" } });
    await api.deleteSource(id);
  });
});

describe("server-side validation (raw requests)", () => {
  it("rejects bad uploads with 400 and leaves no file or row behind", async () => {
    const before = await filesInUploads();
    await expectError(await uploadRaw(`${TAG}-notes.docx`, "x"), 400, "bad_request", /Unsupported/);
    await expectError(await uploadRaw(`${TAG}-fake.pdf`, "this is not a pdf"), 400, "bad_request", /not a PDF/);
    await expectError(await uploadRaw(`${TAG}-zip.pptx`, new Blob([await makePptx(1, { omitPresentation: true }) as Uint8Array<ArrayBuffer>])), 400, "bad_request", /presentation\.xml/);
    await expectError(await uploadRaw(`${TAG}-long.mp4`, new Blob([makeMp4({ durationSec: 21 * 60 }) as Uint8Array<ArrayBuffer>])), 400, "bad_request", /limit is 20 minutes/);
    await expectError(await uploadRaw(`${TAG}-empty.pdf`, null), 400, "bad_request");
    await expectError(await uploadRaw(null, "x"), 400, "bad_request", /filename/);
    assert.deepEqual(await filesInUploads(), before);
    assert.equal(await prisma.source.count({ where: { filename: { startsWith: `${TAG}-` }, NOT: { filename: { in: [`${TAG}-deck.pptx`, `${TAG}-lecture.mp4`] } } } }), 0);
  });

  it("oversize Content-Length is rejected before the body is read", async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const u = new URL(`${BASE_URL}/api/sources?${new URLSearchParams({ filename: `${TAG}-huge.mp4` })}`);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST", headers: { "Content-Length": String(MAX_UPLOAD_BYTES + 1) } }, (r) => {
        let body = "";
        r.setEncoding("utf8").on("data", (c) => (body += c)).on("end", () => { req.destroy(); resolve({ status: r.statusCode ?? 0, body }); });
      });
      req.setTimeout(15_000, () => req.destroy(new Error("server waited for the body instead of rejecting early")));
      req.on("error", reject);
      req.write(Buffer.alloc(1024)); // declare 500 MiB + 1, send 1 KiB, never finish
    });
    assert.equal(res.status, 400);
    assert.match(ApiErrorBody.parse(JSON.parse(res.body)).error.message, /500 MB/);
  });

  it("chunked upload past the cap is cut off at ~500 MiB (streamed, never buffered whole)", { skip: process.env.E2E_SKIP_HEAVY === "1" }, async () => {
    const before = await filesInUploads();
    const LIMIT = 2048 * MiB; // what we'd send if nobody stopped us
    const result = await new Promise<{ status: number; body: string; sentAtResponse: number }>((resolve, reject) => {
      const u = new URL(`${BASE_URL}/api/sources?${new URLSearchParams({ filename: `${TAG}-stream.mp4` })}`);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST", headers: { "Transfer-Encoding": "chunked" } });
      let sent = 0;
      let answered = false;
      req.on("response", (r) => {
        answered = true;
        const sentAtResponse = sent;
        let body = "";
        r.setEncoding("utf8").on("data", (c) => (body += c)).on("end", () => { req.destroy(); resolve({ status: r.statusCode ?? 0, body, sentAtResponse }); });
      });
      req.on("error", (e) => { if (!answered) reject(e); });
      const chunk = Buffer.alloc(MiB);
      const pump = () => {
        while (!answered && sent < LIMIT) {
          sent += chunk.length;
          if (!req.write(chunk)) return void req.once("drain", pump);
        }
        if (!answered) req.end();
      };
      pump();
    });
    assert.equal(result.status, 400);
    assert.match(ApiErrorBody.parse(JSON.parse(result.body)).error.message, /upload limit/);
    const sentMiB = result.sentAtResponse / MiB;
    assert.ok(sentMiB >= 500 && sentMiB < 600, `server answered after ${sentMiB.toFixed(0)} MiB (expected ~500)`);
    assert.deepEqual(await filesInUploads(), before, "partial file removed");
    console.log(`  ↳ server rejected the stream after ${sentMiB.toFixed(0)} MiB of a ${LIMIT / MiB} MiB upload`);
  });
});
