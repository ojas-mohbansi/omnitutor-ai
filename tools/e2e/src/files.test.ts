// GET/HEAD /api/files/[id]: full and partial responses as browsers use them
// (PDF iframe, <video> seeking). Run: npm run test:e2e
import { REPO_ROOT, TAG, api, fileOf, raw, requireServer } from "./setup";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { makeMp4, makePdf } from "@sc/core/testing";
import { prisma } from "@sc/db";
import { ApiErrorBody, citationHref, paths } from "@sc/schemas";

let pdf: Uint8Array;
let pdfId: string;
let mp4: Uint8Array;
let mp4Id: string;
const NAME = `${TAG} Galvin – Ch5 ✓.pdf`;

before(async () => {
  await requireServer();
  pdf = await makePdf(5);
  pdfId = (await api.uploadSource(fileOf(pdf, NAME))).id;
  mp4 = makeMp4({ durationSec: 754.5, timescale: 600 });
  mp4Id = (await api.uploadSource(fileOf(mp4, `${TAG}-lecture.mp4`))).id;
});
after(async () => {
  for (const id of [pdfId, mp4Id]) await api.deleteSource(id).catch(() => {});
  await prisma.$disconnect();
});

const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());
const get = (id: string, range?: string) => raw(paths.file(id), { headers: range ? { Range: range } : {} });

describe("full response", () => {
  it("GET returns the exact bytes with the stored MIME type and inline disposition", async () => {
    const res = await get(pdfId);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("content-length"), String(pdf.length));
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("cache-control") ?? "", /no-transform/);
    const disposition = res.headers.get("content-disposition") ?? "";
    assert.match(disposition, /^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    assert.equal(decodeURIComponent(disposition.split("UTF-8''")[1]), NAME);
    assert.deepEqual(await bytes(res), pdf);
  });
  it("HEAD returns the headers without a body", async () => {
    const res = await raw(paths.file(pdfId), { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), String(pdf.length));
    assert.equal((await bytes(res)).length, 0);
  });
  it("citationHref for a PDF citation points at this route (#page fragment is client-side)", () => {
    const href = citationHref({ sourceType: "PDF", sourceId: pdfId, filename: NAME, chunkId: "c", kind: "TEXT", title: null, page: 3, excerpt: "x" });
    assert.equal(href, `${paths.file(pdfId)}#page=3`);
  });
});

describe("Range requests (206)", () => {
  const cases: [string, (n: number) => [number, number]][] = [
    ["bytes=0-99", () => [0, 99]],
    ["bytes=-50", (n) => [n - 50, n - 1]],
    ["bytes=10-", (n) => [10, n - 1]],
    ["bytes=0-999999999", (n) => [0, n - 1]],
  ];
  for (const [range, expected] of cases) {
    it(range, async () => {
      const res = await get(pdfId, range);
      const [start, end] = expected(pdf.length);
      assert.equal(res.status, 206);
      assert.equal(res.headers.get("content-range"), `bytes ${start}-${end}/${pdf.length}`);
      assert.equal(res.headers.get("content-length"), String(end - start + 1));
      assert.deepEqual(await bytes(res), pdf.subarray(start, end + 1));
    });
  }
  it("range past the end → 416 with Content-Range */size", async () => {
    const res = await get(pdfId, `bytes=${pdf.length}-`);
    assert.equal(res.status, 416);
    assert.equal(res.headers.get("content-range"), `bytes */${pdf.length}`);
  });
  it("multi-range is ignored → 200 full body", async () => {
    const res = await get(pdfId, "bytes=0-1,5-9");
    assert.equal(res.status, 200);
    assert.equal((await bytes(res)).length, pdf.length);
  });
  it("video: browser probe (bytes=0-) and a mid-file seek", async () => {
    const probe = await get(mp4Id, "bytes=0-");
    assert.equal(probe.status, 206);
    assert.equal(probe.headers.get("content-type"), "video/mp4");
    assert.equal(probe.headers.get("content-range"), `bytes 0-${mp4.length - 1}/${mp4.length}`);
    await probe.arrayBuffer();
    const seek = await get(mp4Id, "bytes=1000-1999");
    assert.equal(seek.status, 206);
    assert.deepEqual(await bytes(seek), mp4.subarray(1000, 2000));
  });
});

describe("errors", () => {
  it("unknown source → 404 ApiErrorBody", async () => {
    const res = await get("no-such-source");
    assert.equal(res.status, 404);
    assert.equal(ApiErrorBody.parse(await res.json()).error.code, "not_found");
  });
  it("row exists but the stored file is missing → 404 ApiErrorBody", async () => {
    const { id } = await api.uploadSource(fileOf(await makePdf(1), `${TAG}-vanished.pdf`));
    const row = await prisma.source.findUniqueOrThrow({ where: { id } });
    await rm(path.join(REPO_ROOT, row.path));
    const res = await get(id);
    assert.equal(res.status, 404);
    assert.match(ApiErrorBody.parse(await res.json()).error.message, /missing/);
    await api.deleteSource(id);
  });
});
