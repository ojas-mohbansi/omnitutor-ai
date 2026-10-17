import type { ChunkKind } from "@sc/schemas";

/** A chunk before it is stored: exactly one locator is set (page | slide | tStart+tEnd). */
export type ChunkDraft = {
  kind: ChunkKind;
  title: string | null;
  content: string;
  page: number | null;
  slide: number | null;
  tStart: number | null;
  tEnd: number | null;
  conceptLabels: string[];
};

/** units = pages (PDF) or steps (video: upload, extract). */
export type IngestStats = { units: number; geminiCalls: number; cached: number; inputTokens: number; outputTokens: number };
