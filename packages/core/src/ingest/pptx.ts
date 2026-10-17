// PPTX ingestion. Exact parts come from the XML with no model: slide order (ppt/presentation.xml),
// titles, text, tables, SmartArt text and speaker notes. Pictures placed on slides go to Gemini in
// batches of 5 slides for figure descriptions + concept labels (cached by file hash + slides + prompt).
// Output: one SLIDE chunk per slide that has content, cited by its 1-based position in the deck.
import path from "node:path";
import type { Part } from "@google/genai";
import JSZip from "jszip";
import { z } from "zod";
import { sha256 } from "../cache";
import { generateJson, type Usage } from "../llm";
import type { ChunkDraft, IngestStats } from "./types";

/** Bump when the schema or chunking contract changes. (Prompt text changes miss the cache automatically: its hash is in the key.) */
export const PPTX_PROMPT_VERSION = "pptx-batch-v1";
export const SLIDES_PER_BATCH = 5;
/** Image types Gemini accepts inline. EMF/WMF/SVG/GIF/TIFF are skipped (no converter, by design). */
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
/** Pictures whose short side is below this are icons or bullets, not content. */
export const MIN_IMAGE_SIDE_PX = 32;
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
/** Inline request limit is 20 MB; keep each batch's pictures well below it. */
export const MAX_BATCH_IMAGE_BYTES = 14 * 1024 * 1024;

export type DeckImage = { media: string; mimeType: string; bytes: Uint8Array; alt: string | null };
export type SkippedImage = { slide: number; media: string; reason: string };
/** `omitted`: content pictures/charts that couldn't be sent (decision Q18: noted in the slide's chunk). */
export type ParsedSlide = { slide: number; title: string | null; text: string; notes: string; images: DeckImage[]; omitted: string[] };
export type ParsedDeck = { slides: ParsedSlide[]; skipped: SkippedImage[] };

// ── XML helpers (regex over well-formed OOXML parts; elements matched here never nest) ──

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m;
    const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** One paragraph's text: runs and line breaks; slide-number fields dropped. */
function paragraphText(p: string): string {
  const body = p.replace(/<a:fld\b[^>]*\btype="slidenum"[^>]*>[\s\S]*?<\/a:fld>/g, "");
  let out = "";
  for (const m of body.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) out += m[0].startsWith("<a:br") ? "\n" : decodeXml(m[1]);
  return out.replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

/** A text body → non-empty lines, indented two spaces per bullet level. */
function bodyLines(xml: string): string[] {
  const lines: string[] = [];
  for (const m of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const text = paragraphText(m[1]);
    if (!text) continue;
    const level = Number(/<a:pPr\b[^>]*\blvl="(\d+)"/.exec(m[1])?.[1] ?? 0);
    lines.push("  ".repeat(Math.min(level, 8)) + text);
  }
  return lines;
}

function tableRows(tbl: string): string[] {
  return [...tbl.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)].map(
    (row) => `| ${[...row[1].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g)].map((c) => bodyLines(c[1]).join(" ").replace(/\|/g, "/")).join(" | ")} |`,
  );
}

type Rel = { type: string; target: string; external: boolean };
async function relsOf(zip: JSZip, part: string): Promise<Map<string, Rel>> {
  const dir = path.posix.dirname(part);
  const xml = (await zip.file(path.posix.join(dir, "_rels", `${path.posix.basename(part)}.rels`))?.async("string")) ?? "";
  const rels = new Map<string, Rel>();
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (!id || !target) continue;
    const external = attr(m[0], "TargetMode") === "External";
    rels.set(id, {
      type: (attr(m[0], "Type") ?? "").split("/").pop() ?? "",
      target: external ? target : target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join(dir, target)),
      external,
    });
  }
  return rels;
}

/** Pixel size from the PNG / JPEG / WebP header; null if unknown. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("latin1", 12, 16) === "IHDR") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 8 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.length >= 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    const kind = b.toString("latin1", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L") { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }; }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

const SKIP_PLACEHOLDERS = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);
const ELEMENTS = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>|<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>|<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g;

/**
 * Pure parse (no model): slides in presentation order with exact text, notes and the pictures
 * worth sending. Pictures that are skipped are listed with the reason.
 */
export async function parsePptx(bytes: Uint8Array): Promise<ParsedDeck> {
  const zip = await JSZip.loadAsync(bytes);
  const presentation = await zip.file("ppt/presentation.xml")?.async("string");
  if (!presentation) throw new Error("ppt/presentation.xml is missing.");
  const presRels = await relsOf(zip, "ppt/presentation.xml");
  const slideParts = [...presentation.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => presRels.get(attr(m[0], "r:id") ?? "")?.target ?? null);

  type Pic = { media: string; alt: string | null };
  const raw: { title: string[]; lines: string[]; notes: string[]; pics: Pic[]; omitted: string[] }[] = [];
  const skipped: SkippedImage[] = [];
  for (const [i, part] of slideParts.entries()) {
    const slide = { title: [] as string[], lines: [] as string[], notes: [] as string[], pics: [] as Pic[], omitted: [] as string[] };
    raw.push(slide);
    const xml = part ? await zip.file(part)?.async("string") : undefined;
    if (!part || !xml) continue;
    const rels = await relsOf(zip, part);
    // Alternate content repeats the same shapes as a fallback: keep only the preferred choice.
    for (const m of xml.replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, "").matchAll(ELEMENTS)) {
      const el = m[0];
      const ph = /<p:ph\b[^>]*>/.exec(el)?.[0];
      const phType = ph ? (attr(ph, "type") ?? "body") : null;
      if (phType && SKIP_PLACEHOLDERS.has(phType)) continue;
      if (el.startsWith("<p:graphicFrame")) {
        const tbl = /<a:tbl>[\s\S]*<\/a:tbl>/.exec(el)?.[0];
        if (tbl) slide.lines.push(...tableRows(tbl));
        const dm = /<dgm:relIds\b[^>]*>/.exec(el)?.[0];
        const data = dm ? rels.get(attr(dm, "r:dm") ?? "") : undefined;
        if (data && !data.external) slide.lines.push(...bodyLines((await zip.file(data.target)?.async("string")) ?? ""));
        const chart = /<c:chart\b[^>]*>/.exec(el)?.[0];
        if (chart) {
          skipped.push({ slide: i + 1, media: rels.get(attr(chart, "r:id") ?? "")?.target ?? "chart", reason: "chart (not extracted)" });
          slide.omitted.push("chart (not extracted)");
        }
        continue;
      }
      const text = /<p:txBody>[\s\S]*<\/p:txBody>/.exec(el)?.[0];
      if (text) {
        const lines = bodyLines(text);
        if (phType === "title" || phType === "ctrTitle") slide.title.push(lines.map((l) => l.trim()).join(" "));
        else slide.lines.push(...lines);
      }
      for (const e of el.matchAll(/<a:blip\b[^>]*>/g)) {
        const rel = rels.get(attr(e[0], "r:embed") ?? "");
        if (rel && !rel.external) slide.pics.push({ media: rel.target, alt: attr(/<p:cNvPr\b[^>]*>/.exec(el)?.[0] ?? "", "descr") });
      }
    }
    const notesRel = [...rels.values()].find((r) => r.type === "notesSlide" && !r.external);
    const notesXml = notesRel ? await zip.file(notesRel.target)?.async("string") : undefined;
    for (const m of (notesXml ?? "").matchAll(ELEMENTS)) {
      const ph = /<p:ph\b[^>]*>/.exec(m[0])?.[0];
      if (ph && attr(ph, "type") === "body") slide.notes.push(...bodyLines(m[0]).map((l) => l.trim()));
    }
  }

  // A picture on at least 3 slides and on more than half of them is a logo or background.
  const usage = new Map<string, number>();
  for (const s of raw) for (const media of new Set(s.pics.map((p) => p.media))) usage.set(media, (usage.get(media) ?? 0) + 1);
  const decorative = (media: string) => (usage.get(media) ?? 0) >= 3 && (usage.get(media) ?? 0) > raw.length / 2;

  const slides: ParsedSlide[] = [];
  for (const [i, s] of raw.entries()) {
    const n = i + 1;
    const images: DeckImage[] = [];
    const omitted = [...s.omitted];
    const seen = new Set<string>();
    for (const pic of s.pics) {
      if (seen.has(pic.media)) continue;
      seen.add(pic.media);
      // Decoration is dropped silently; a content picture we can't read is noted in the chunk (Q18).
      const skip = (reason: string, content = true) => {
        skipped.push({ slide: n, media: pic.media, reason });
        if (content) omitted.push(reason);
      };
      const mimeType = IMAGE_TYPES[path.posix.extname(pic.media).toLowerCase()];
      if (!mimeType) { skip(`unsupported format (${path.posix.extname(pic.media) || "none"})`); continue; }
      if (decorative(pic.media)) { skip(`repeated on ${usage.get(pic.media)} slides (decoration)`, false); continue; }
      const data = await zip.file(pic.media)?.async("uint8array");
      if (!data) { skip("missing from the package"); continue; }
      if (data.length > MAX_IMAGE_BYTES) { skip(`too large (${(data.length / 1024 / 1024).toFixed(1)} MB)`); continue; }
      const size = imageSize(data);
      if (size && Math.min(size.width, size.height) < MIN_IMAGE_SIDE_PX) { skip(`icon-sized (${size.width}×${size.height} px)`, false); continue; }
      images.push({ media: pic.media, mimeType, bytes: data, alt: pic.alt?.trim() || null });
    }
    let title = s.title.join(" ").trim() || null;
    let lines = s.lines;
    // No title placeholder: a short first line is the title (common in decks built from text boxes).
    if (!title && lines.length && lines[0].trim().length <= 120 && !lines[0].includes("\n")) {
      title = lines[0].trim();
      lines = lines.slice(1);
    }
    slides.push({ slide: n, title, text: lines.join("\n"), notes: s.notes.join("\n"), images, omitted });
  }
  return { slides, skipped };
}

// ── Gemini: figure descriptions + concept labels per batch of slides ──

export const PptxBatchExtraction = z.object({
  slides: z.array(
    z.object({
      slide: z.number().int(),
      figures: z.array(z.object({ title: z.string(), content: z.string() })),
      conceptLabels: z.array(z.string()),
    }),
  ),
});
export type PptxBatchExtraction = z.infer<typeof PptxBatchExtraction>;

/** Subject-agnostic: the course name (Course.name in the DB) is the only context given. */
export function pptxBatchPrompt(courseName: string): string {
  return `You index slides of a lecture deck for a study assistant's knowledge base. The course is: "${courseName}". For each slide you get its number, its title and text (already extracted exactly from the file), its speaker notes, and the pictures placed on it. Students will ask questions and every answer must cite a slide, so be complete and faithful.

Return JSON with one entry in "slides" for every slide number you were given:
- slide: the slide number.
- figures: one entry per picture that carries information (diagram, chart, graph, table, screenshot, worked example, photo of a board). title = its caption or a short descriptive name. content = a precise description that lets a student answer questions without seeing it: every label and value, every arrow or connection with its label, axes with units, rows and columns of tables, the order of steps, and what the picture illustrates. Decorative pictures (logos, icons, backgrounds, photos without information) get no entry. A slide without informative pictures has an empty list.
- conceptLabels: 1 to 5 short noun phrases naming the key concepts on the slide.

Rules:
- Use only what is in the slide text, notes and pictures. Do not add outside knowledge, explanations or corrections.
- Do not repeat the slide text in figure descriptions; describe what the pictures add.`;
}

/** The request parts for one batch: all slide texts first, then each picture labelled with its slide. */
export function batchParts(slides: ParsedSlide[]): Part[] {
  const text = slides
    .map((s) =>
      [
        `=== Slide ${s.slide} ===`,
        `Title: ${s.title ?? "(none)"}`,
        `Text:\n${s.text || "(none)"}`,
        ...(s.notes ? [`Speaker notes:\n${s.notes}`] : []),
        `Pictures: ${s.images.length}${s.images.length ? " (shown below)" : ""}`,
      ].join("\n"),
    )
    .join("\n\n");
  const parts: Part[] = [{ text }];
  for (const s of slides) {
    for (const [k, img] of s.images.entries()) {
      parts.push({ text: `Slide ${s.slide}, picture ${k + 1}${img.alt ? ` (alt text: "${img.alt}")` : ""}:` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: Buffer.from(img.bytes).toString("base64") } });
    }
  }
  parts.push({ text: `Return one entry for each of these slides: ${slides.map((s) => s.slide).join(", ")}.` });
  return parts;
}

export type BatchResult = { extraction: PptxBatchExtraction; cached: boolean; usage: Usage };
export type ExtractSlides = (slides: ParsedSlide[], ctx: { fileSha: string; courseName: string }) => Promise<BatchResult>;

/** Default batch extractor: one structured Gemini call, cached per (file hash, slides, prompt). */
export const extractSlideBatch: ExtractSlides = async (slides, { fileSha, courseName }) => {
  const system = pptxBatchPrompt(courseName);
  const r = await generateJson({
    role: "fast",
    schema: PptxBatchExtraction,
    system,
    parts: batchParts(slides),
    cacheKey: `pptx-batch|${PPTX_PROMPT_VERSION}|${sha256(system).slice(0, 16)}|${fileSha}|${slides.map((s) => s.slide).join(",")}`,
  });
  return { extraction: r.data, cached: r.cached, usage: r.usage };
};

type SlideExtraction = PptxBatchExtraction["slides"][number];

/** Pure: one slide (+ the model's figures/labels) → its chunk, or null for an empty slide. */
export function slideChunk(s: ParsedSlide, ex?: Pick<SlideExtraction, "figures" | "conceptLabels">): ChunkDraft | null {
  const parts: string[] = [];
  if (s.text) parts.push(s.text);
  if (s.notes) parts.push(`[Speaker notes] ${s.notes}`);
  for (const f of ex?.figures ?? []) {
    const content = f.content.trim();
    if (content) parts.push(`[Figure] ${f.title.trim() || "Figure"}: ${content}`);
  }
  if (!parts.length && !s.title) return null; // an unreadable picture alone is nothing to retrieve
  for (const reason of s.omitted) parts.push(`[Figure omitted: ${reason}]`);
  const content = parts.join("\n\n") || s.title!;
  const conceptLabels = [...new Set((ex?.conceptLabels ?? []).map((l) => l.trim()).filter(Boolean))].slice(0, 5);
  return { kind: "SLIDE", title: s.title, content, page: null, slide: s.slide, tStart: null, tEnd: null, conceptLabels };
}

export type DeckReport = { slides: number; batches: number; imagesSent: number; skippedImages: SkippedImage[]; emptySlides: number[] };

/**
 * Parses the deck, then extracts batches of SLIDES_PER_BATCH slides (up to `concurrency` at once;
 * the rate limiter paces the calls). Stops after the first failure; the error names the slides.
 */
export async function extractPptx(
  bytes: Uint8Array,
  fileSha: string,
  opts: { courseName: string; extractSlides?: ExtractSlides; onBatchDone?: () => Promise<void> | void; concurrency?: number },
): Promise<{ chunks: ChunkDraft[]; stats: IngestStats; report: DeckReport }> {
  const extract = opts.extractSlides ?? extractSlideBatch;
  const deck = await parsePptx(bytes);
  const skipped = [...deck.skipped];
  const batches: ParsedSlide[][] = [];
  for (let i = 0; i < deck.slides.length; i += SLIDES_PER_BATCH) {
    let budget = MAX_BATCH_IMAGE_BYTES;
    batches.push(
      deck.slides.slice(i, i + SLIDES_PER_BATCH).map((s) => ({
        ...s,
        images: s.images.filter((img) => {
          if (img.bytes.length <= budget) return (budget -= img.bytes.length), true;
          skipped.push({ slide: s.slide, media: img.media, reason: "batch picture limit (14 MB) reached" });
          s.omitted.push("too large to send with the other pictures of its batch");
          return false;
        }),
      })),
    );
  }

  const results: (BatchResult | null)[] = new Array(batches.length).fill(null);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < batches.length) {
      const i = next++;
      const b = batches[i];
      if (b.some((s) => s.text || s.notes || s.title || s.images.length)) {
        try {
          results[i] = await extract(b, { fileSha, courseName: opts.courseName });
        } catch (e) {
          failed = true;
          const msg = e instanceof Error ? e.message.replace(/^\[llm:\w+\] /, "") : String(e);
          throw new Error(`Slides ${b[0].slide}–${b.at(-1)!.slide}: ${msg}`, { cause: e });
        }
      }
      await opts.onBatchDone?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, batches.length) }, worker));

  const stats: IngestStats = { units: batches.length, geminiCalls: 0, cached: 0, inputTokens: 0, outputTokens: 0 };
  const bySlide = new Map<number, SlideExtraction>();
  for (const [i, r] of results.entries()) {
    if (!r) continue;
    if (r.cached) stats.cached++;
    else stats.geminiCalls++;
    stats.inputTokens += r.usage.inputTokens;
    stats.outputTokens += r.usage.outputTokens;
    const asked = new Set(batches[i].map((s) => s.slide));
    for (const e of r.extraction.slides) if (asked.has(e.slide) && !bySlide.has(e.slide)) bySlide.set(e.slide, e);
  }
  const chunks: ChunkDraft[] = [];
  const emptySlides: number[] = [];
  for (const s of batches.flat()) {
    const c = slideChunk(s, bySlide.get(s.slide));
    if (c) chunks.push(c);
    else emptySlides.push(s.slide);
  }
  return {
    chunks,
    stats,
    report: { slides: deck.slides.length, batches: batches.length, imagesSent: batches.flat().reduce((n, s) => n + s.images.length, 0), skippedImages: skipped, emptySlides },
  };
}
