// Upload content checks: the bytes must match the type implied by the extension.
// Also extracts page/slide count (ingestion progress) and video duration (20-min limit).
import { open, readFile, type FileHandle } from "node:fs/promises";
import JSZip from "jszip";
import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { MAX_VIDEO_MINUTES, formatTime, type SourceType } from "@sc/schemas";
import { badRequest } from "./errors";

export type MediaInfo = {
  /** PDF pages or PPTX slides; null for video. */
  pageCount: number | null;
  /** Video duration in seconds; null otherwise. */
  durationSec: number | null;
};

async function readHead(filePath: string, length: number): Promise<Buffer> {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function inspectMedia(filePath: string, type: SourceType): Promise<MediaInfo> {
  switch (type) {
    case "PDF":
      return { pageCount: await inspectPdf(filePath), durationSec: null };
    case "PPTX":
      return { pageCount: await inspectPptx(filePath), durationSec: null };
    case "VIDEO":
      return { pageCount: null, durationSec: await inspectMp4(filePath) };
  }
}

async function inspectPdf(filePath: string): Promise<number> {
  // The header may follow up to 1 KB of junk (PDF spec tolerance).
  if (!(await readHead(filePath, 1024)).toString("latin1").includes("%PDF-")) {
    throw badRequest("This file has a .pdf extension but its content is not a PDF.");
  }
  let pages: number;
  try {
    // pdf-lib parses leniently, so damage can surface only when the page tree is read.
    pages = (await PDFDocument.load(await readFile(filePath), { updateMetadata: false })).getPageCount();
  } catch (e) {
    if (e instanceof EncryptedPDFError) throw badRequest("This PDF is encrypted or password-protected. Upload an unprotected copy.");
    throw badRequest("Could not read this PDF (it may be damaged).");
  }
  if (pages === 0) throw badRequest("This PDF has no pages.");
  return pages;
}

async function inspectPptx(filePath: string): Promise<number> {
  const head = await readHead(filePath, 4);
  if (!head.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw badRequest("This file has a .pptx extension but is not a PowerPoint (.pptx) file. Old .ppt files are not supported.");
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await readFile(filePath));
  } catch {
    throw badRequest("Could not read this .pptx file (damaged archive).");
  }
  const presentation = zip.file("ppt/presentation.xml");
  if (!presentation) throw badRequest("This archive is not a PowerPoint deck (ppt/presentation.xml is missing).");
  const slides = ((await presentation.async("string")).match(/<p:sldId\b/g) ?? []).length;
  if (slides === 0) throw badRequest("This deck has no slides.");
  return slides;
}

async function inspectMp4(filePath: string): Promise<number> {
  if ((await readHead(filePath, 8)).toString("latin1", 4, 8) !== "ftyp") {
    throw badRequest("This file has a .mp4 extension but its content is not an MP4 video.");
  }
  const duration = await readMp4DurationSec(filePath);
  if (duration === null) throw badRequest("Could not read the video's duration (MP4 metadata is missing or damaged).");
  if (duration > MAX_VIDEO_MINUTES * 60) {
    throw badRequest(`This video is ${formatTime(duration)} long; the limit is ${MAX_VIDEO_MINUTES} minutes.`);
  }
  return duration;
}

type Box = { bodyStart: number; end: number };

/** Finds the first box of `type` between `start` and `end` (ISO BMFF: 32-bit size, or 1 = 64-bit size, 0 = to end). */
async function findBox(fh: FileHandle, start: number, end: number, type: string): Promise<Box | null> {
  const header = Buffer.alloc(16);
  let offset = start;
  while (offset + 8 <= end) {
    const { bytesRead } = await fh.read(header, 0, 16, offset);
    if (bytesRead < 8) return null;
    let size = header.readUInt32BE(0);
    let headerLen = 8;
    if (size === 1) {
      if (bytesRead < 16) return null;
      size = Number(header.readBigUInt64BE(8));
      headerLen = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerLen || offset + size > end) return null; // damaged or truncated
    if (header.toString("latin1", 4, 8) === type) return { bodyStart: offset + headerLen, end: offset + size };
    offset += size;
  }
  return null;
}

/** Duration from moov/mvhd (works whether moov is before or after mdat). null if absent or unknown. */
export async function readMp4DurationSec(filePath: string): Promise<number | null> {
  const fh = await open(filePath, "r");
  try {
    const { size } = await fh.stat();
    const moov = await findBox(fh, 0, size, "moov");
    const mvhd = moov && (await findBox(fh, moov.bodyStart, moov.end, "mvhd"));
    if (!mvhd) return null;
    const b = Buffer.alloc(32);
    const { bytesRead } = await fh.read(b, 0, 32, mvhd.bodyStart);
    const version = b[0];
    if (version === 1) {
      if (bytesRead < 32) return null;
      const timescale = b.readUInt32BE(20);
      return timescale ? Number(b.readBigUInt64BE(24)) / timescale : null;
    }
    if (bytesRead < 20) return null;
    const timescale = b.readUInt32BE(12);
    const duration = b.readUInt32BE(16);
    return timescale && duration !== 0xffffffff ? duration / timescale : null;
  } finally {
    await fh.close();
  }
}
