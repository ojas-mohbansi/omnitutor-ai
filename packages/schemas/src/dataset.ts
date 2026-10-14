// Dataset export schemas — defines the exact shape of chunks.jsonl, metadata.csv, and sources.json.
// Consumers: tools/dataset/src/export.ts, tools/dataset/src/generate-eval.ts, tools/eval/ragas.py.
import { z } from "zod";
import { ChunkKind, SourceType } from "./common";

// ── ChunkExport: one line of chunks.jsonl ──

export const ChunkExport = z.object({
  chunk_id:       z.string(),
  source_id:      z.string(),
  source_type:    SourceType,
  filename:       z.string(),
  kind:           ChunkKind,
  seq:            z.number().int().min(0),
  title:          z.string().nullable(),
  section:        z.string().nullable(),
  content:        z.string(),
  page:           z.number().int().min(1).nullable(),
  slide:          z.number().int().min(1).nullable(),
  t_start:        z.number().min(0).nullable(),
  t_end:          z.number().min(0).nullable(),
  concept_labels: z.array(z.string()),
  topic_id:       z.string().nullable(),
  topic_name:     z.string().nullable(),
  language:       z.string().default("en"),
  quality_score:  z.number().min(0).max(1).nullable(),
  embedding:      z.array(z.number()).length(768),
  created_at:     z.iso.datetime(),
});
export type ChunkExport = z.infer<typeof ChunkExport>;

// ── SourcesManifest: sources.json ──

export const SourceEntry = z.object({
  source_id:   z.string(),
  filename:    z.string(),
  source_type: SourceType,
  chunk_count: z.number().int().min(0),
});
export type SourceEntry = z.infer<typeof SourceEntry>;

export const TopicEntry = z.object({
  topic_id:    z.string(),
  topic_name:  z.string(),
  seq:         z.number().int(),
  description: z.string(),
  prereq_ids:  z.array(z.string()),
  chunk_count: z.number().int().min(0),
});
export type TopicEntry = z.infer<typeof TopicEntry>;

export const DatasetStats = z.object({
  total_chunks:    z.number().int().min(0),
  by_kind:         z.record(z.string(), z.number().int().min(0).max(2_147_483_647)),
  by_source_type:  z.record(z.string(), z.number().int().min(0).max(2_147_483_647)),
});
export type DatasetStats = z.infer<typeof DatasetStats>;

export const SourcesManifest = z.object({
  course_id:   z.string(),
  course_name: z.string(),
  exported_at: z.iso.datetime(),
  sources:     z.array(SourceEntry),
  topics:      z.array(TopicEntry),
  stats:       DatasetStats,
});
export type SourcesManifest = z.infer<typeof SourcesManifest>;
