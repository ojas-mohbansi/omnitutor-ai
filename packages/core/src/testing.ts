// Test fixtures shared by core tests and tools/e2e (import from "@sc/core/testing"). Not used by the app.
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** A real PDF with `pages` pages ("Page N" on each). */
export async function makePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`Page ${i}`, { x: 50, y: 780, size: 14, font });
  return doc.save();
}

/** A minimal .pptx package with `slides` slides. `omitPresentation`: a ZIP that is not a deck. */
export async function makePptx(slides: number, opts: { omitPresentation?: boolean } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  if (!opts.omitPresentation) {
    const ids = Array.from({ length: slides }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("");
    zip.file(
      "ppt/presentation.xml",
      '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>`,
    );
    for (let i = 1; i <= slides; i++) zip.file(`ppt/slides/slide${i}.xml`, `<p:sld><a:t>Slide ${i}</a:t></p:sld>`);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A real, decodable PNG of width × height pixels in one colour. */
export function makePng(width: number, height: number, rgb: [number, number, number] = [200, 60, 60]): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
  };
  const ihdr = Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])]);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width * 3 }, (_, i) => rgb[i % 3]))]);
  const idat = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
}

export type DeckSlideSpec = {
  title?: string; // in a title placeholder
  paragraphs?: (string | { text: string; level: number })[]; // body placeholder
  table?: string[][];
  notes?: string;
  /** Pictures placed on the slide; the same `name` on several slides is one shared media file. */
  images?: { name: string; bytes: Uint8Array; alt?: string }[];
  slideNumber?: boolean; // sldNum placeholder with a slide-number field
  footer?: string; // ftr placeholder
};

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const shape = (id: number, ph: string, paragraphs: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
const para = (text: string, level = 0) => `<a:p>${level ? `<a:pPr lvl="${level}"/>` : ""}<a:r><a:rPr lang="en-US"/><a:t>${xmlEsc(text)}</a:t></a:r></a:p>`;

/**
 * A structurally realistic .pptx: presentation.xml + rels, slides with placeholders, tables,
 * pictures (with alt text), speaker notes, slide-number fields and footers. Slide FILES are
 * numbered in reverse of the presentation order, so order must come from <p:sldIdLst>.
 */
export async function makeDeck(slides: DeckSlideSpec[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const n = slides.length;
  const fileNo = (i: number) => n - i; // presentation slide i (0-based) lives in slide{n-i}.xml
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${100 + i}"/>`).join("")}</p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${100 + i}" Type="${REL}/slide" Target="slides/slide${fileNo(i)}.xml"/>`).join("")}</Relationships>`,
  );
  for (const [i, s] of slides.entries()) {
    const no = fileNo(i);
    const rels = [`<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`];
    const parts: string[] = [];
    if (s.title !== undefined) parts.push(shape(2, '<p:ph type="title"/>', para(s.title)));
    if (s.paragraphs) parts.push(shape(3, '<p:ph idx="1"/>', s.paragraphs.map((p) => (typeof p === "string" ? para(p) : para(p.text, p.level))).join("")));
    if (s.table) {
      const rows = s.table.map((r) => `<a:tr h="370840">${r.map((c) => `<a:tc><a:txBody><a:bodyPr/>${para(c)}</a:txBody><a:tcPr/></a:tc>`).join("")}</a:tr>`).join("");
      parts.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Table 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    }
    for (const [k, img] of (s.images ?? []).entries()) {
      rels.push(`<Relationship Id="rIdImg${k}" Type="${REL}/image" Target="../media/${img.name}"/>`);
      zip.file(`ppt/media/${img.name}`, img.bytes);
      parts.push(`<p:pic><p:nvPicPr><p:cNvPr id="${10 + k}" name="Picture ${k}"${img.alt ? ` descr="${xmlEsc(img.alt)}"` : ""}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg${k}"/></p:blipFill><p:spPr/></p:pic>`);
    }
    if (s.slideNumber) parts.push(shape(20, '<p:ph type="sldNum" sz="quarter" idx="12"/>', `<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>${i + 1}</a:t></a:fld></a:p>`));
    if (s.footer) parts.push(shape(21, '<p:ph type="ftr" sz="quarter" idx="11"/>', para(s.footer)));
    if (s.notes) {
      rels.push(`<Relationship Id="rIdNotes" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${no}.xml"/>`);
      zip.file(
        `ppt/notesSlides/notesSlide${no}.xml`,
        `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>${shape(2, '<p:ph type="sldImg"/>', "")}${shape(3, '<p:ph type="body" idx="1"/>', para(s.notes))}${shape(4, '<p:ph type="sldNum" idx="5"/>', `<a:p><a:fld id="{X}" type="slidenum"><a:t>${i + 1}</a:t></a:fld></a:p>`)}</p:spTree></p:cSld></p:notes>`,
      );
    }
    zip.file(`ppt/slides/slide${no}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${parts.join("")}</p:spTree></p:cSld></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${no}.xml.rels`, `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  }
  return zip.generateAsync({ type: "uint8array" });
}

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const box = (type: string, ...payload: Buffer[]) => {
  const body = Buffer.concat(payload);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, "latin1"), body]);
};

/**
 * A synthetic MP4 (ISO BMFF) with a real box structure: ftyp, moov/mvhd, mdat. Not playable,
 * but exercises the same parsing paths as real files (moov before/after mdat, mvhd v0/v1, 64-bit box size).
 */
export function makeMp4(opts: {
  durationSec: number;
  timescale?: number;
  version?: 0 | 1;
  moovAtEnd?: boolean;
  largeMdat?: boolean;
  /** Write the raw "unknown duration" marker (v0: 0xFFFFFFFF). */
  unknownDuration?: boolean;
  omitMoov?: boolean;
}): Uint8Array {
  const timescale = opts.timescale ?? 1000;
  const duration = Math.round(opts.durationSec * timescale);
  const rest = Buffer.alloc(80); // rate, volume, matrix, next_track_ID…
  const mvhd =
    opts.version === 1
      ? box("mvhd", Buffer.from([1, 0, 0, 0]), u64(0), u64(0), u32(timescale), u64(duration), rest)
      : box("mvhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(timescale), u32(opts.unknownDuration ? 0xffffffff : duration), rest);
  const moov = box("moov", box("free", Buffer.alloc(16)), mvhd); // a box before mvhd exercises iteration
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2avc1mp41"));
  const media = Buffer.alloc(2048, 7);
  const mdat = opts.largeMdat
    ? Buffer.concat([u32(1), Buffer.from("mdat"), u64(16 + media.length), media])
    : box("mdat", media);
  const parts = opts.omitMoov ? [ftyp, mdat] : opts.moovAtEnd ? [ftyp, mdat, moov] : [ftyp, moov, mdat];
  return new Uint8Array(Buffer.concat(parts));
}

/** Yields `bytes` in chunks, like a network body. */
export async function* chunked(bytes: Uint8Array, chunkSize = 64 * 1024): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += chunkSize) yield bytes.subarray(i, i + chunkSize);
}

/** Yields `total` zero bytes without allocating them all at once (oversize-upload tests). */
export async function* zeros(total: number, chunkSize = 1024 * 1024): AsyncGenerator<Uint8Array> {
  const chunk = new Uint8Array(chunkSize);
  for (let sent = 0; sent < total; sent += chunkSize) yield chunk.subarray(0, Math.min(chunkSize, total - sent));
}
