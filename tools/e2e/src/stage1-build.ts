// REAL-DATA check for Module 9 (course build): runs POST /api/build through the live API on real
// courses and scores the result against criteria written before the build existed
// (tools/e2e/build/expectations.json). The second build of each course must be free (cache).
// Usage: npm run stage1:build   (dev server running)
import { REPO_ROOT, api, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@sc/db";
import type { TopicView } from "@sc/schemas";

type Tag = { sourceType: "PDF" | "PPTX" | "VIDEO"; page?: number; slide?: number; tStart?: number; tEnd?: number; topic: string };
type Expect = {
  courseId: string;
  topicCount: [number, number];
  mustCover: string[];
  mustNotCover: string[];
  tagging: Tag[];
  order: { topic: string; after: string };
};

await requireServer();
const spec: { courses: Expect[] } = JSON.parse(await readFile(new URL("../build/expectations.json", import.meta.url), "utf8"));
const report: Record<string, unknown>[] = [];
let allOk = true;

const usage = async () => (await api.health()).usage!;
async function build(courseId: string) {
  const before = await usage();
  const t0 = Date.now();
  const { topics } = await api.buildCourse({ courseId });
  const after = await usage();
  return { topics, seconds: +((Date.now() - t0) / 1000).toFixed(1), generate: after.generate.requests - before.generate.requests, inputTokens: after.generate.inputTokens - before.generate.inputTokens, embed: after.embed.requests - before.embed.requests };
}

for (const e of spec.courses) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: e.courseId } });
  console.log(`\n=== ${e.courseId}: "${course.name}"`);
  const run1 = await build(e.courseId);
  const run2 = await build(e.courseId);
  console.log(`    build 1: ${run1.topics.length} topics · ${run1.seconds} s · Gemini generate ${run1.generate} (${run1.inputTokens} input tokens), embed ${run1.embed}`);
  console.log(`    build 2: ${run2.topics.length} topics · ${run2.seconds} s · Gemini generate ${run2.generate}, embed ${run2.embed} (must be 0: cache)`);

  const topics: TopicView[] = run2.topics;
  const text = (t: TopicView) => `${t.name} ${t.description}`;
  const nameOf = new Map(topics.map((t) => [t.id, t.name]));
  console.table(topics.map((t) => ({ seq: t.seq, name: t.name, chunks: t.chunkCount, prereqs: t.prereqIds.map((p) => nameOf.get(p)).join("; "), description: t.description.slice(0, 90) })));

  const checks: { check: string; ok: boolean }[] = [];
  const add = (check: string, ok: boolean) => checks.push({ check, ok });

  // 1. Structure
  const [lo, hi] = e.topicCount;
  add(`${lo}–${hi} topics (got ${topics.length})`, topics.length >= lo && topics.length <= hi);
  const seqOf = new Map(topics.map((t) => [t.id, t.seq]));
  add("prerequisites are known topics listed earlier (acyclic)", topics.every((t) => t.prereqIds.every((p) => (seqOf.get(p) ?? Infinity) < t.seq)));
  const chunks = await prisma.chunk.findMany({
    where: { source: { courseId: e.courseId, status: "READY" }, NOT: { embedding: { isEmpty: true } } },
    select: { topicId: true, page: true, slide: true, tStart: true, tEnd: true, title: true, source: { select: { type: true } } },
  });
  add(`every chunk tagged (${chunks.filter((c) => c.topicId).length}/${chunks.length})`, chunks.every((c) => c.topicId && seqOf.has(c.topicId)));
  add("chunkCount sums to the chunk total", topics.reduce((n, t) => n + t.chunkCount, 0) === chunks.length);
  add(`no empty topics (${topics.filter((t) => t.chunkCount === 0).map((t) => t.name).join(", ") || "none"})`, topics.every((t) => t.chunkCount > 0));
  add("second build cost nothing (cache)", run2.generate === 0 && run2.embed === 0);

  // 2. Coverage and 3. nothing invented
  for (const re of e.mustCover) add(`covers /${re}/`, topics.some((t) => new RegExp(re, "i").test(text(t))));
  for (const re of e.mustNotCover) {
    const bad = topics.filter((t) => new RegExp(re, "i").test(text(t)));
    add(`no topic about /${re}/${bad.length ? ` (found: ${bad.map((t) => t.name).join(", ")})` : ""}`, bad.length === 0);
  }

  // 4. Tagging accuracy on pre-registered locations
  const rows: { at: string; chunk: string; topic: string; ok: boolean }[] = [];
  for (const tag of e.tagging) {
    const at = tag.sourceType === "PDF" ? `p.${tag.page}` : tag.sourceType === "PPTX" ? `slide ${tag.slide}` : `${tag.tStart}–${tag.tEnd}s`;
    const hits = chunks.filter((c) =>
      c.source.type === tag.sourceType &&
      (tag.sourceType === "PDF" ? c.page === tag.page : tag.sourceType === "PPTX" ? c.slide === tag.slide
        // video: the chunk lies mostly inside the pre-registered interval
        : Math.min(c.tEnd!, tag.tEnd!) - Math.max(c.tStart!, tag.tStart!) > 0.5 * (c.tEnd! - c.tStart!)),
    );
    if (!hits.length) rows.push({ at, chunk: "(no chunk at this location)", topic: "-", ok: false });
    for (const c of hits) {
      const topic = topics.find((t) => t.id === c.topicId);
      rows.push({ at, chunk: (c.title ?? "").slice(0, 40), topic: topic?.name ?? "(none)", ok: !!topic && new RegExp(tag.topic, "i").test(text(topic)) });
    }
  }
  const tagOk = rows.filter((r) => r.ok).length;
  console.table(rows);
  add(`tagging accuracy ≥ 80% (${tagOk}/${rows.length} = ${((tagOk / rows.length) * 100).toFixed(0)}%)`, tagOk / rows.length >= 0.8);

  // 5. Basics before algorithms
  const A = topics.filter((t) => new RegExp(e.order.topic, "i").test(text(t)));
  const B = topics.filter((t) => new RegExp(e.order.after, "i").test(text(t)));
  const ordered = A.length > 0 && B.length > 0 && A.filter((t) => !B.includes(t)).every((t) => t.prereqIds.length > 0 && Math.min(...B.map((b) => b.seq)) < t.seq);
  add(`/${e.order.topic}/ has prerequisites and comes after /${e.order.after}/`, ordered);

  for (const c of checks) console.log(`    ${c.ok ? "PASS" : "FAIL"}  ${c.check}`);
  if (!checks.every((c) => c.ok)) allOk = false;
  report.push({ courseId: e.courseId, run1: { ...run1, topics: undefined }, run2: { ...run2, topics: undefined }, topics, tagging: rows, checks });
}

const out = path.join(REPO_ROOT, "data", "demo", "build-report.json");
await writeFile(out, JSON.stringify({ ranAt: new Date().toISOString(), report }, null, 2));
console.log(`\nfull report: ${path.relative(REPO_ROOT, out)}\n${allOk ? "PASS" : "FAIL"}  all pre-registered Module 9 criteria`);
await prisma.$disconnect();
process.exit(allOk ? 0 : 1);
