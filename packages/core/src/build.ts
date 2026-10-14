// Course build (Module 9): one structured LLM call turns an outline of the course's knowledge base
// (every chunk's location, title and concept labels, in source order) into 5–8 topics with
// prerequisites. Each chunk is then tagged to its nearest topic by embedding (cosine in JS).
// POST /api/build rebuilds; GET /api/topics lists. Rebuilding erases learner progress (decision Q9).
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@sc/db";
import type { TopicView } from "@sc/schemas";
import { sha256 } from "./cache";
import { requireCourse } from "./course";
import { AppError, notReady } from "./errors";
import { embed as geminiEmbed, generateJson, type EmbedTask, type Usage } from "./llm";
import { cosine, toCitation } from "./retrieve";

/** Bump when the schema or the outline format changes. (Prompt text changes miss the cache automatically: its hash is in the key.) */
export const BUILD_PROMPT_VERSION = "build-v1";
export const MAX_TOPICS = 8;

export const TopicPlan = z.object({
  topics: z
    .array(
      z.object({
        key: z.string(), // "t1", "t2"… only used to express prerequisites
        name: z.string(),
        description: z.string(),
        prerequisites: z.array(z.string()),
      }),
    )
    .min(1)
    .max(MAX_TOPICS),
});
export type TopicPlan = z.infer<typeof TopicPlan>;

/** Subject-agnostic: the course name (Course.name in the DB) is the only context given. */
export function buildPrompt(courseName: string): string {
  return `You design the topic structure of a course for a study assistant that tracks each student's mastery per topic and generates quizzes per topic. The course is: "${courseName}". You get an outline of everything in the course material: each line is one unit of the knowledge base (a section of a PDF page, a slide, or a video segment) with its location, title and key concepts, in the order the material presents them.

Return JSON:
- topics: 5 to 8 topics (fewer only if the material is very small), listed so that every topic comes after its prerequisites. Each topic:
  - key: "t1", "t2", … in list order.
  - name: 2 to 6 words.
  - description: 1 to 2 sentences on what the topic covers in this material.
  - prerequisites: keys of the topics a student must understand first (direct prerequisites only, [] if none). A prerequisite is always listed earlier.

Rules:
- Together the topics cover all of the material, and each unit fits one topic best.
- Every topic must be taught by the material. Use only concepts that appear in the outline; do not add topics the material does not cover.
- Make each topic big enough to quiz on its own; do not make one topic per unit.`;
}

export type OutlineChunk = {
  id: string;
  sourceType: "PDF" | "PPTX" | "VIDEO";
  filename: string;
  kind: string;
  title: string | null;
  content: string;
  page: number | null;
  slide: number | null;
  tStart: number | null;
  tEnd: number | null;
  conceptLabels: string[];
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const locator = (c: OutlineChunk) => (c.page !== null ? `p.${c.page}` : c.slide !== null ? `slide ${c.slide}` : `${clock(c.tStart ?? 0)}–${clock(c.tEnd ?? 0)}`);

/** Pure: the course material as one line per chunk, grouped by source, in material order. */
export function materialOutline(chunks: OutlineChunk[]): string {
  const bySource = new Map<string, OutlineChunk[]>();
  for (const c of chunks) {
    const key = `${c.filename} (${c.sourceType})`;
    const list = bySource.get(key) ?? [];
    list.push(c);
    bySource.set(key, list);
  }
  const blocks: string[] = [];
  for (const [source, list] of bySource) {
    const lines = list.map((c) => {
      const label = c.title?.trim() || c.content.replace(/\s+/g, " ").trim().slice(0, 90);
      const concepts = c.conceptLabels.length ? ` | concepts: ${c.conceptLabels.join(", ")}` : "";
      return `- ${locator(c)} [${c.kind.toLowerCase()}] ${label}${concepts}`;
    });
    blocks.push(`Source: ${source}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

export type OrderedTopic = { key: string; name: string; description: string; prereqKeys: string[] };

/**
 * Pure: cleans the model's plan. Keeps the model's order (it lists prerequisites first); drops
 * duplicate keys, unknown or forward prerequisites (that is what makes the graph acyclic).
 */
export function orderTopics(plan: TopicPlan): { topics: OrderedTopic[]; droppedPrereqs: number } {
  const topics: OrderedTopic[] = [];
  let dropped = 0;
  for (const t of plan.topics) {
    const key = t.key.trim();
    const name = t.name.trim();
    if (!name || topics.some((x) => x.key === key)) continue;
    const earlier = new Set(topics.map((x) => x.key));
    const prereqKeys = [...new Set(t.prerequisites.map((p) => p.trim()))].filter((p) => {
      const ok = earlier.has(p);
      if (!ok) dropped++;
      return ok;
    });
    topics.push({ key, name, description: t.description.trim(), prereqKeys });
  }
  return { topics, droppedPrereqs: dropped };
}

/** Pure: index of the nearest topic vector for each chunk vector (ties → earlier topic). */
export function nearestTopic(chunkVectors: number[][], topicVectors: number[][]): number[] {
  return chunkVectors.map((v) => {
    let best = 0;
    let bestScore = -Infinity;
    topicVectors.forEach((t, i) => {
      const s = cosine(v, t);
      if (s > bestScore) [best, bestScore] = [i, s];
    });
    return best;
  });
}

export type BuildDeps = {
  /** Defaults to one cached Gemini call. */
  plan?: (input: { system: string; outline: string; cacheKey: string }) => Promise<{ data: TopicPlan; cached: boolean; usage: Usage }>;
  embed?: (texts: string[], task: EmbedTask) => Promise<number[][]>;
};

export type BuildReport = { chunks: number; droppedPrereqs: number; emptyTopics: string[]; cached: boolean; usage: Usage };

/** Topics of a course in display order, with how many chunks are tagged to each. */
export async function listTopics(courseId?: string): Promise<TopicView[]> {
  const id = await requireCourse(courseId);
  const topics = await prisma.topic.findMany({ where: { courseId: id }, orderBy: { seq: "asc" }, include: { _count: { select: { chunks: true } } } });
  const chunks = await prisma.chunk.findMany({
    where: { topicId: { in: topics.map((t) => t.id) }, source: { status: "READY" } },
    orderBy: [{ sourceId: "asc" }, { seq: "asc" }],
    include: { source: { select: { type: true, filename: true } } },
  });
  return topics.map((t) => ({
    id: t.id, seq: t.seq, name: t.name, description: t.description, prereqIds: t.prereqIds, chunkCount: t._count.chunks,
    concepts: topicConcepts(chunks.filter((c) => c.topicId === t.id)).map((c) => ({
      label: c.label,
      chunkCount: c.chunks.length,
      citations: c.chunks.slice(0, MAX_CONCEPT_CITATIONS).map((x) => toCitation({ ...x, chunkId: x.id, sourceType: x.source.type, filename: x.source.filename })),
    })),
  }));
}

export const MAX_CONCEPTS = 8;
export const MAX_CONCEPT_CITATIONS = 2;

/**
 * Pure: a topic's concepts (subtopics) from its chunks' ingestion concept labels. Labels are merged
 * by `conceptKey`; a concept taught by more chunks ranks first (ties → first seen).
 * Each keeps its chunks in input order, so its first citations are where it is introduced.
 */
export function topicConcepts<C extends { conceptLabels: string[] }>(chunks: C[], max = MAX_CONCEPTS): { label: string; chunks: C[] }[] {
  const groups = new Map<string, { label: string; chunks: C[]; first: number }>();
  chunks.forEach((c, i) => {
    for (const raw of new Set(c.conceptLabels.map((l) => l.trim()).filter(Boolean))) {
      const key = conceptKey(raw);
      if (!key) continue;
      const g = groups.get(key) ?? { label: raw, chunks: [], first: i };
      if (!g.chunks.includes(c)) g.chunks.push(c);
      groups.set(key, g);
    }
  });
  return [...groups.values()].sort((a, b) => b.chunks.length - a.chunks.length || a.first - b.first).slice(0, max).map(({ label, chunks }) => ({ label, chunks }));
}

export async function buildCourse(input: { courseId?: string; force?: boolean } = {}, deps: BuildDeps = {}): Promise<{ topics: TopicView[]; report: BuildReport }> {
  const courseId = await requireCourse(input.courseId);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { name: true } });

  const withProgress = await prisma.topic.count({
    where: { courseId, OR: [{ mastery: { some: {} } }, { masteryEvents: { some: {} } }, { questions: { some: {} } }] },
  });
  if (withProgress > 0 && !input.force) {
    throw notReady(`Learners already have progress on ${withProgress} topic(s) of this course. Rebuilding replaces the topics and erases that progress (mastery and quiz questions). Send { "force": true } to rebuild anyway.`);
  }

  const rows = await prisma.chunk.findMany({
    where: { source: { courseId, status: "READY" }, NOT: { embedding: { isEmpty: true } } },
    orderBy: [{ source: { createdAt: "asc" } }, { seq: "asc" }],
    select: {
      id: true, kind: true, title: true, content: true, page: true, slide: true, tStart: true, tEnd: true, conceptLabels: true, embedding: true,
      source: { select: { type: true, filename: true } },
    },
  });
  if (rows.length === 0) throw notReady("Nothing to build from yet: ingest at least one source first.");
  const chunks = rows.map((r) => ({ ...r, sourceType: r.source.type, filename: r.source.filename }));

  const system = buildPrompt(course.name);
  const outline = materialOutline(chunks);
  const cacheKey = `build|${BUILD_PROMPT_VERSION}|${sha256(system).slice(0, 16)}|${sha256(outline)}`;
  const plan = deps.plan
    ? await deps.plan({ system, outline, cacheKey })
    : await generateJson({ role: "strong", schema: TopicPlan, system, parts: [{ text: outline }], cacheKey });
  const { topics, droppedPrereqs } = orderTopics(plan.data);
  if (topics.length === 0) throw new AppError("llm_error", "The model returned no usable topics; try the build again.");

  // Topic text acts as the query, chunks as documents (the same asymmetry as retrieval).
  const topicVectors = await (deps.embed ?? geminiEmbed)(topics.map((t) => `${t.name}\n${t.description}`), "RETRIEVAL_QUERY");
  const assignment = nearestTopic(chunks.map((c) => c.embedding), topicVectors);

  const ids = topics.map(() => randomUUID());
  const idOf = new Map(topics.map((t, i) => [t.key, ids[i]]));
  await prisma.$transaction([
    prisma.topic.deleteMany({ where: { courseId } }), // cascades to mastery, events, questions; chunk.topicId → null
    prisma.topic.createMany({
      data: topics.map((t, i) => ({
        id: ids[i], courseId, seq: i + 1, name: t.name, description: t.description,
        prereqIds: t.prereqKeys.map((k) => idOf.get(k)!), embedding: topicVectors[i],
      })),
    }),
    ...topics.map((_, i) =>
      prisma.chunk.updateMany({ where: { id: { in: chunks.filter((_, j) => assignment[j] === i).map((c) => c.id) } }, data: { topicId: ids[i] } }),
    ),
  ]);

  const result = await listTopics(courseId);
  const report: BuildReport = {
    chunks: chunks.length,
    droppedPrereqs,
    emptyTopics: result.filter((t) => t.chunkCount === 0).map((t) => t.name),
    cached: plan.cached,
    usage: plan.usage,
  };
  console.info(`[build] ${courseId}: ${result.length} topics from ${chunks.length} chunks · ${droppedPrereqs} prerequisite links dropped · ${plan.cached ? "cached" : `${plan.usage.inputTokens} input tokens`}`);
  return { topics: result, report };
}

/** Pure: merge key for a concept label: case, punctuation, spacing and simple English plurals ignored. */
export function conceptKey(label: string): string {
  return label
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => (w.length > 4 && w.endsWith("sses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join("");
}
