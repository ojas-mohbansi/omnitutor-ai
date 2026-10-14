// Dataset export script: reads Postgres → writes chunks.jsonl, metadata.csv, sources.json.
// Run: npm run dataset:export [courseId]
// Requirements: 8.x, 9.x
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { prisma } from "@sc/db";
import { ChunkExport, SourcesManifest, SourceEntry, TopicEntry, DatasetStats } from "@sc/schemas";

// ── Repo root resolution ──
function repoRoot(): string {
  return process.env.REPO_ROOT ?? resolve(new URL("../../../..", import.meta.url).pathname);
}

// ── Pure helpers ──

type ChunkRow = {
  id: string; seq: number; kind: string; title: string | null; content: string;
  page: number | null; slide: number | null; tStart: number | null; tEnd: number | null;
  conceptLabels: string[]; topicId: string | null; section: string | null;
  language: string; qualityScore: number | null; embedding: number[]; createdAt: Date;
};
type SourceRow = { id: string; type: string; filename: string };
type TopicRow  = { id: string; name: string; seq: number; description: string; prereqIds: string[] };

/** Map one Prisma Chunk row to a validated ChunkExport (throws on schema violation). */
export function toChunkExport(
  row: ChunkRow,
  source: SourceRow,
  topic: TopicRow | null,
): ReturnType<typeof ChunkExport.parse> {
  return ChunkExport.parse({
    chunk_id:       row.id,
    source_id:      source.id,
    source_type:    source.type,
    filename:       source.filename,
    kind:           row.kind,
    seq:            row.seq,
    title:          row.title,
    section:        row.section,
    content:        row.content,
    page:           row.page,
    slide:          row.slide,
    t_start:        row.tStart,
    t_end:          row.tEnd,
    concept_labels: row.conceptLabels,
    topic_id:       row.topicId,
    topic_name:     topic?.name ?? null,
    language:       row.language,
    quality_score:  row.qualityScore,
    embedding:      row.embedding,
    created_at:     row.createdAt.toISOString(),
  });
}

/** Build and validate the sources.json manifest from collected data. */
export function buildManifest(
  courseId: string,
  courseName: string,
  sources: SourceRow[],
  topicRows: TopicRow[],
  topicChunkCounts: Map<string, number>,
  sourceChunkCounts: Map<string, number>,
  chunks: ReturnType<typeof ChunkExport.parse>[],
): ReturnType<typeof SourcesManifest.parse> {
  const byKind: Record<string, number> = {};
  const bySourceType: Record<string, number> = {};
  for (const c of chunks) {
    byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    bySourceType[c.source_type] = (bySourceType[c.source_type] ?? 0) + 1;
  }
  return SourcesManifest.parse({
    course_id:   courseId,
    course_name: courseName,
    exported_at: new Date().toISOString(),
    sources: sources.map((s) => SourceEntry.parse({
      source_id:   s.id,
      filename:    s.filename,
      source_type: s.type,
      chunk_count: sourceChunkCounts.get(s.id) ?? 0,
    })),
    topics: topicRows.map((t) => ({
      topic_id:    t.id,
      topic_name:  t.name,
      seq:         t.seq,
      description: t.description,
      prereq_ids:  t.prereqIds,
      chunk_count: topicChunkCounts.get(t.id) ?? 0,
    })),
    stats: DatasetStats.parse({
      total_chunks:   chunks.length,
      by_kind:        byKind,
      by_source_type: bySourceType,
    }),
  });
}

/** Serialise chunk exports to CSV (no embedding; content replaced by 200-char preview). */
export function chunksToCsv(chunks: ReturnType<typeof ChunkExport.parse>[]): string {
  const COLS = [
    "chunk_id","source_id","source_type","filename","kind","seq","title","section",
    "content_preview","page","slide","t_start","t_end","concept_labels",
    "topic_id","topic_name","language","quality_score","created_at",
  ] as const;

  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows: string[] = [COLS.join(",")];
  for (const c of chunks) {
    rows.push(COLS.map((col) => {
      if (col === "content_preview") return esc(c.content.slice(0, 200));
      if (col === "concept_labels")  return esc(c.concept_labels);
      return esc((c as Record<string, unknown>)[col]);
    }).join(","));
  }
  return rows.join("\n");
}

// ── Atomic write helper ──
function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, filePath);
}

// ── main() ──
async function main(): Promise<void> {
  const start = Date.now();

  // Load env (DATABASE_URL must be present)
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Error: DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  // Parse courseId from argv
  const argCourseId = process.argv[2];

  // Resolve courseId
  let courseId: string;
  let courseName: string;

  if (argCourseId) {
    const course = await prisma.course.findUnique({ where: { id: argCourseId } });
    if (!course) {
      const all = await prisma.course.findMany({ select: { id: true } });
      console.error(`Error: Course "${argCourseId}" not found. Available: ${all.map((c) => c.id).join(", ")}`);
      await prisma.$disconnect();
      process.exit(1);
    }
    courseId = course.id;
    courseName = course.name;
  } else {
    // Auto-detect: find courses with ≥1 READY source
    const courses = await prisma.course.findMany({
      where: { sources: { some: { status: "READY" } } },
      select: { id: true, name: true },
    });
    if (courses.length === 0) {
      console.warn("Warning: No courses have READY sources. Nothing to export.");
      await prisma.$disconnect();
      process.exit(0);
    }
    if (courses.length > 1) {
      console.error(`Error: Multiple courses have READY sources. Specify one: ${courses.map((c) => c.id).join(", ")}`);
      await prisma.$disconnect();
      process.exit(1);
    }
    courseId = courses[0].id;
    courseName = courses[0].name;
  }

  // Fetch data
  const [sources, topicRows, rawChunks] = await Promise.all([
    prisma.source.findMany({
      where: { courseId, status: "READY" },
      select: { id: true, type: true, filename: true },
    }),
    prisma.topic.findMany({
      where: { courseId },
      select: { id: true, name: true, seq: true, description: true, prereqIds: true },
      orderBy: { seq: "asc" },
    }),
    prisma.chunk.findMany({
      where: { source: { courseId, status: "READY" } },
      include: { source: { select: { id: true, type: true, filename: true } }, topic: { select: { id: true, name: true, seq: true, description: true, prereqIds: true } } },
      orderBy: [{ sourceId: "asc" }, { seq: "asc" }],
    }),
  ]);

  if (sources.length === 0) {
    console.warn(`Warning: Course "${courseId}" has no READY sources. Nothing to export.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Map chunks
  const chunks: ReturnType<typeof ChunkExport.parse>[] = [];
  let skipped = 0;
  for (const row of rawChunks) {
    if (row.embedding.length === 0) {
      process.stderr.write(`Warning: chunk ${row.id} has empty embedding — skipped.\n`);
      skipped++;
      continue;
    }
    try {
      chunks.push(toChunkExport(row, row.source, row.topic ?? null));
    } catch (e) {
      process.stderr.write(`Error: ChunkExport.parse() failed for chunk ${row.id}: ${e}\n`);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // Build manifest
  const topicChunkCounts = new Map<string, number>();
  const sourceChunkCounts = new Map<string, number>();
  for (const c of chunks) {
    if (c.topic_id) topicChunkCounts.set(c.topic_id, (topicChunkCounts.get(c.topic_id) ?? 0) + 1);
    sourceChunkCounts.set(c.source_id, (sourceChunkCounts.get(c.source_id) ?? 0) + 1);
  }

  let manifest: ReturnType<typeof SourcesManifest.parse>;
  try {
    manifest = buildManifest(courseId, courseName, sources, topicRows, topicChunkCounts, sourceChunkCounts, chunks);
  } catch (e) {
    process.stderr.write(`Error: SourcesManifest.parse() failed: ${e}\n`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Write outputs
  const outDir = join(repoRoot(), "data", "dataset", courseId);
  mkdirSync(outDir, { recursive: true });

  atomicWrite(join(outDir, "chunks.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
  atomicWrite(join(outDir, "metadata.csv"), chunksToCsv(chunks));
  atomicWrite(join(outDir, "sources.json"), JSON.stringify(manifest, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`Exported ${chunks.length} chunks (${skipped} skipped) from ${sources.length} sources in ${elapsed}s → data/dataset/${courseId}/`);

  await prisma.$disconnect();
}

// Only run main() when this file is the entry point (not when imported by tests).
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/export.ts") ||
               process.argv[1]?.replace(/\\/g, "/").endsWith("export.ts");
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
