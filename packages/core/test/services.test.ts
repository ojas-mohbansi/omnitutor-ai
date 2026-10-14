// Learner + source services against the real DB. Files go to a temp REPO_ROOT, never data/uploads.
// Needs Postgres (npm run db:up). Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { MAX_UPLOAD_BYTES } from "@sc/schemas";
import { AppError } from "../src/errors";
import { createLearner, listLearners, requireLearner } from "../src/learners";
import { deleteSource, getSourceFile, listSources, uploadSource } from "../src/sources";
import { uploadsDir } from "../src/storage";
import { chunked, makeMp4, makePdf, makePptx } from "../src/testing";

const TAG = `__test__${Date.now()}`;
let tempRoot: string;

before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "sc-services-"));
  process.env.REPO_ROOT = tempRoot; // read lazily on first storage call
});
after(async () => {
  await prisma.source.deleteMany({ where: { filename: { startsWith: TAG } } });
  await prisma.learner.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.$disconnect();
  await rm(tempRoot, { recursive: true, force: true });
});

const isCode = (code: string, pattern?: RegExp) => (e: unknown) =>
  e instanceof AppError && e.code === code && (!pattern || pattern.test(e.message));
const upload = (bytes: Uint8Array, name: string, extra: { contentLength?: number; courseId?: string } = {}) =>
  uploadSource({ body: chunked(bytes), filename: `${TAG}-${name}`, ...extra });

describe("learners", () => {
  it("create → list (oldest first) → require", async () => {
    const l = await createLearner({ name: `${TAG} Asha` });
    assert.ok(l.id && !Number.isNaN(Date.parse(l.createdAt)));
    const all = await listLearners();
    assert.ok(all.some((x) => x.id === l.id));
    const times = all.map((x) => Date.parse(x.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    await requireLearner(l.id);
    await assert.rejects(requireLearner("no-such-learner"), isCode("not_found"));
  });
});

describe("sources", () => {
  it("PDF upload: stored, recorded as PENDING with page count, listed, servable, deletable", async () => {
    const pdf = await makePdf(3);
    const res = await upload(pdf, "chapter.pdf");
    assert.equal(res.status, "PENDING");

    const row = await prisma.source.findUniqueOrThrow({ where: { id: res.id } });
    assert.equal(row.type, "PDF");
    assert.equal(row.mimeType, "application/pdf");
    assert.equal(row.sizeBytes, pdf.length);
    assert.equal(row.pageCount, 3);
    assert.equal(row.path, `data/uploads/${res.id}.pdf`);
    assert.equal(row.courseId, "demo-course");

    const view = (await listSources()).find((s) => s.id === res.id);
    assert.deepEqual(view && { ...view, createdAt: "x" }, {
      id: res.id, type: "PDF", filename: `${TAG}-chapter.pdf`, status: "PENDING", error: null,
      progressDone: 0, progressTotal: 0, chunkCount: 0, createdAt: "x",
    });

    const f = await getSourceFile(res.id);
    assert.equal(f.size, pdf.length);
    assert.ok(f.absPath.startsWith(uploadsDir()));

    assert.deepEqual(await deleteSource(res.id), { id: res.id });
    assert.equal(existsSync(f.absPath), false);
    assert.equal(await prisma.source.count({ where: { id: res.id } }), 0);
    await assert.rejects(deleteSource(res.id), isCode("not_found"));
    await assert.rejects(getSourceFile(res.id), isCode("not_found"));
  });

  it("PPTX and MP4 record slide count and duration", async () => {
    const deck = await upload(await makePptx(5), "deck.pptx");
    const video = await upload(makeMp4({ durationSec: 754.5, timescale: 600 }), "lecture.mp4");
    const [d, v] = await Promise.all([deck, video].map((r) => prisma.source.findUniqueOrThrow({ where: { id: r.id } })));
    assert.equal(d.pageCount, 5);
    assert.equal(d.mimeType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(v.durationSec, 754.5);
    assert.equal(v.mimeType, "video/mp4");
  });

  it("rejected uploads leave no row and no file (including .part)", async () => {
    const filesBefore = await readdir(uploadsDir()).catch(() => []);
    await assert.rejects(upload(new TextEncoder().encode("not a pdf"), "fake.pdf"), isCode("bad_request", /not a PDF/));
    await assert.rejects(upload(makeMp4({ durationSec: 1500 }), "long.mp4"), isCode("bad_request", /limit is 20 minutes/));
    await assert.rejects(upload(new Uint8Array(0), "empty.pdf"), isCode("bad_request", /empty/));
    await assert.rejects(upload(await makePdf(1), "notes.docx"), isCode("bad_request", /Unsupported/));
    assert.deepEqual(await readdir(uploadsDir()).catch(() => []), filesBefore);
    assert.equal(await prisma.source.count({ where: { filename: { in: ["fake.pdf", "long.mp4", "empty.pdf", "notes.docx"].map((n) => `${TAG}-${n}`) } } }), 0);
  });

  it("oversize Content-Length is rejected before reading the body", async () => {
    let started = false;
    const body = (async function* () { started = true; yield new Uint8Array(1); })();
    await assert.rejects(uploadSource({ body, filename: `${TAG}-big.mp4`, contentLength: MAX_UPLOAD_BYTES + 1 }), isCode("bad_request", /500 MB/));
    assert.equal(started, false);
  });

  it("filename is reduced to its base name", async () => {
    const res = await uploadSource({ body: chunked(await makePdf(1)), filename: `C:\\fakepath\\${TAG}-path.pdf` });
    assert.equal((await prisma.source.findUniqueOrThrow({ where: { id: res.id } })).filename, `${TAG}-path.pdf`);
  });

  it("a PROCESSING source cannot be deleted (409)", async () => {
    const res = await upload(await makePdf(1), "busy.pdf");
    await prisma.source.update({ where: { id: res.id }, data: { status: "PROCESSING" } });
    await assert.rejects(deleteSource(res.id), isCode("not_ready"));
    await prisma.source.update({ where: { id: res.id }, data: { status: "FAILED" } });
    await deleteSource(res.id);
  });

  it("unknown course → not_ready", async () => {
    await assert.rejects(upload(await makePdf(1), "x.pdf", { courseId: "no-such-course" }), isCode("not_ready", /db:seed/));
    await assert.rejects(listSources("no-such-course"), isCode("not_ready"));
  });
});
