// Upload content checks (no DB). Run: npm run test
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { AppError } from "../src/errors";
import { inspectMedia, readMp4DurationSec } from "../src/media";
import { makeMp4, makePdf, makePptx } from "../src/testing";

let dir: string;
before(async () => { dir = await mkdtemp(path.join(tmpdir(), "sc-media-")); });
after(async () => { await rm(dir, { recursive: true, force: true }); });

let n = 0;
const file = async (bytes: Uint8Array | string) => {
  const p = path.join(dir, `f${n++}`);
  await writeFile(p, bytes);
  return p;
};
const rejectsBadRequest = (p: Promise<unknown>, pattern: RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === "bad_request" && pattern.test(e.message));

describe("PDF", () => {
  it("counts pages", async () => assert.deepEqual(await inspectMedia(await file(await makePdf(3)), "PDF"), { pageCount: 3, durationSec: null }));
  it("rejects non-PDF content", async () => rejectsBadRequest(inspectMedia(await file("hello, not a pdf"), "PDF"), /not a PDF/));
  it("rejects a damaged PDF", async () => rejectsBadRequest(inspectMedia(await file("%PDF-1.7\n garbage garbage"), "PDF"), /Could not read/));
});

describe("PPTX", () => {
  it("counts slides", async () => assert.deepEqual(await inspectMedia(await file(await makePptx(4)), "PPTX"), { pageCount: 4, durationSec: null }));
  it("rejects a ZIP that is not a deck", async () =>
    rejectsBadRequest(inspectMedia(await file(await makePptx(2, { omitPresentation: true })), "PPTX"), /presentation\.xml/));
  it("rejects a deck with no slides", async () => rejectsBadRequest(inspectMedia(await file(await makePptx(0)), "PPTX"), /no slides/));
  it("rejects non-ZIP content (e.g. old .ppt)", async () => rejectsBadRequest(inspectMedia(await file(await makePdf(1)), "PPTX"), /not a PowerPoint/));
});

describe("MP4 duration", () => {
  const cases: [string, Parameters<typeof makeMp4>[0], number][] = [
    ["mvhd v0, moov before mdat", { durationSec: 90 }, 90],
    ["mvhd v1 (64-bit)", { durationSec: 754.5, timescale: 600, version: 1 }, 754.5],
    ["moov after mdat", { durationSec: 1199, moovAtEnd: true }, 1199],
    ["64-bit mdat box size", { durationSec: 61.25, largeMdat: true, moovAtEnd: true }, 61.25],
  ];
  for (const [name, opts, expected] of cases) {
    it(name, async () => assert.equal(await readMp4DurationSec(await file(makeMp4(opts))), expected));
  }
  it("unknown duration marker → null", async () => assert.equal(await readMp4DurationSec(await file(makeMp4({ durationSec: 1, unknownDuration: true }))), null));
  it("no moov → null", async () => assert.equal(await readMp4DurationSec(await file(makeMp4({ durationSec: 1, omitMoov: true }))), null));
  it("truncated file → null", async () => assert.equal(await readMp4DurationSec(await file(makeMp4({ durationSec: 5 }).subarray(0, 60))), null));
});

describe("MP4 checks", () => {
  it("exactly 20:00 is accepted", async () => assert.deepEqual(await inspectMedia(await file(makeMp4({ durationSec: 1200 })), "VIDEO"), { pageCount: null, durationSec: 1200 }));
  it("20:01 is rejected", async () => rejectsBadRequest(inspectMedia(await file(makeMp4({ durationSec: 1201 })), "VIDEO"), /20:01 long; the limit is 20 minutes/));
  it("missing metadata is rejected", async () => rejectsBadRequest(inspectMedia(await file(makeMp4({ durationSec: 1, omitMoov: true })), "VIDEO"), /duration/));
  it("non-MP4 content is rejected", async () => rejectsBadRequest(inspectMedia(await file(await makePdf(1)), "VIDEO"), /not an MP4/));
});
