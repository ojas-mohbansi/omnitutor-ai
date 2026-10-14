import { z } from "zod";
import { ChunkKind, Id } from "./common";
import { paths } from "./paths";

const CitationBase = z.object({
  chunkId: Id,
  sourceId: Id,
  filename: z.string().min(1),
  kind: ChunkKind,
  title: z.string().nullable(), // slide title / figure caption
  excerpt: z.string().min(1), // shown beside the opened source
});

// Each source type carries exactly its own locator.
export const PdfCitation = CitationBase.extend({
  sourceType: z.literal("PDF"),
  page: z.number().int().positive(),
});

export const SlideCitation = CitationBase.extend({
  sourceType: z.literal("PPTX"),
  slide: z.number().int().positive(),
});

export const VideoCitation = CitationBase.extend({
  sourceType: z.literal("VIDEO"),
  tStart: z.number().min(0), // seconds
  tEnd: z.number().min(0),
}).refine((c) => c.tEnd >= c.tStart, { message: "tEnd must be >= tStart", path: ["tEnd"] });

export const Citation = z.discriminatedUnion("sourceType", [PdfCitation, SlideCitation, VideoCitation]);
export type Citation = z.infer<typeof Citation>;

/** 75.4 → "1:15", 3725 → "1:02:05" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Short label for a citation chip: "p. 12", "slide 4", "3:15–4:02". */
export function formatLocator(c: Citation): string {
  switch (c.sourceType) {
    case "PDF":
      return `p. ${c.page}`;
    case "PPTX":
      return `slide ${c.slide}`;
    case "VIDEO":
      return `${formatTime(c.tStart)}–${formatTime(c.tEnd)}`;
  }
}

/** URL of the original file. PDF opens at the page (#page=N); video seeks via media fragment (#t=S). */
export function citationHref(c: Citation): string {
  const base = paths.file(c.sourceId);
  switch (c.sourceType) {
    case "PDF":
      return `${base}#page=${c.page}`;
    case "PPTX":
      return base; // UI shows a reconstructed slide card instead of opening the file
    case "VIDEO":
      return `${base}#t=${Math.floor(c.tStart)}`;
  }
}
