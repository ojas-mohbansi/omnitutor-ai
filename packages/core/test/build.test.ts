// Module 9: course build with a FAKE planner + embedder against the real DB (no Gemini calls).
// These cover our deterministic code only; the real check is `npm run stage1:build`. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { AppError } from "../src/errors";
import {
  buildCourse, listTopics, materialOutline, nearestTopic, orderTopics, topicConcepts, conceptKey,
  type BuildDeps, type OutlineChunk, type TopicPlan,
} from "../src/build";

const COURSE = `__test__build${Date.now()}`;
const DIM = 768;
/** Unit vector along axis `i` (a chunk "about" topic i). */
const axis = (i: number, noise = 0) => Array.from({ length: DIM }, (_, k) => (k === i ? 1 : k === DIM - 1 ? noise : 0));

before(async () => {
  await prisma.course.create({ data: { id: COURSE, name: "Test course" } });
  const source = await prisma.source.create({
    data: { courseId: COURSE, type: "PDF", filename: "notes.pdf", mimeType: "application/pdf", sizeBytes: 1, path: "data/uploads/none.pdf", status: "READY" },
  });
  // 6 chunks: pages 1–2 about axis 0, 3–4 about axis 1, 5–6 about axis 2.
  await prisma.chunk.createMany({
    data: [0, 0, 1, 1, 2, 2].map((a, i) => ({
      sourceId: source.id, seq: i, kind: "TEXT" as const, title: i % 2 ? null : `Heading ${i + 1}`, content: `Body of page ${i + 1}`,
      page: i + 1, conceptLabels: [`concept ${a}`], embedding: axis(a, 0.01 * i),
    })),
  });
  // A non-READY source must be ignored.
  const pending = await prisma.source.create({
    data: { courseId: COURSE, type: "PDF", filename: "draft.pdf", mimeType: "application/pdf", sizeBytes: 1, path: "data/uploads/none2.pdf", status: "PROCESSING" },
  });
  await prisma.chunk.create({ data: { sourceId: pending.id, seq: 0, kind: "TEXT", content: "not ready", page: 1, embedding: axis(0) } });
});
after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: "__test__build" } } });
  await prisma.course.deleteMany({ where: { id: COURSE } });
  await prisma.$disconnect();
});

const plan = (topics: TopicPlan["topics"]): BuildDeps["plan"] => async () => ({ data: { topics }, cached: false, usage: { inputTokens: 500, outputTokens: 80 } });
const t = (key: string, name: string, prerequisites: string[] = []) => ({ key, name, description: `About ${name}`, prerequisites });
// Fake embedder: topic k (in list order) points along axis k.
const embed: BuildDeps["embed"] = async (texts) => texts.map((_, k) => axis(k));
const isCode = (code: string, pattern?: RegExp) => (e: unknown) => e instanceof AppError && e.code === code && (!pattern || pattern.test(e.message));

describe("pure helpers", () => {
  it("orderTopics keeps the model's order and drops unknown, forward, self and duplicate prerequisites", () => {
    const { topics, droppedPrereqs } = orderTopics({
      topics: [t("t1", "Basics", ["t3"]), t("t2", "Middle", ["t1", "t1", "t2", "zz"]), t("t2", "Duplicate key"), t("t3", " Advanced ", ["t2", "t1"]), t("t4", "   ")],
    });
    assert.deepEqual(topics.map((x) => [x.key, x.name, x.prereqKeys]), [["t1", "Basics", []], ["t2", "Middle", ["t1"]], ["t3", "Advanced", ["t2", "t1"]]]);
    assert.equal(droppedPrereqs, 3, "t1→t3 (forward), t2→t2 (self), t2→zz (unknown)");
  });

  it("nearestTopic picks the highest cosine; ties go to the earlier topic", () => {
    assert.deepEqual(nearestTopic([axis(1), axis(0), [1, 1, ...Array(DIM - 2).fill(0)]], [axis(0), axis(1)]), [1, 0, 0]);
  });

  it("topicConcepts merges labels case/punctuation-insensitively, ranks by chunk count, keeps chunk order", () => {
    const a = { id: "a", conceptLabels: ["Slow start", "cwnd"] };
    const b = { id: "b", conceptLabels: ["slow-start", " ", "Slow start"] };
    const c = { id: "c", conceptLabels: ["AIMD", "cwnd"] };
    const out = topicConcepts([a, b, c]).map((g) => [g.label, g.chunks.map((x) => x.id)]);
    assert.deepEqual(out, [["Slow start", ["a", "b"]], ["cwnd", ["a", "c"]], ["AIMD", ["c"]]]);
    assert.equal(topicConcepts([a, b, c], 1).length, 1);
    assert.deepEqual(topicConcepts([{ conceptLabels: [] }]), []);
    assert.equal(conceptKey("Turn Around time"), conceptKey("Turnaround times"));
    assert.equal(conceptKey("I/O bound processes"), conceptKey("I/O-bound process"));
    assert.equal(conceptKey("CPU bursts"), conceptKey("cpu burst"));
    assert.notEqual(conceptKey("Throughput"), conceptKey("Turnaround time"));
    assert.equal(conceptKey("Access"), "access");
  });

  it("materialOutline: one line per chunk, grouped by source, locators per type, title or excerpt, concepts", () => {
    const c = (o: Partial<OutlineChunk>): OutlineChunk => ({ id: "x", sourceType: "PDF", filename: "a.pdf", kind: "TEXT", title: null, content: "", page: null, slide: null, tStart: null, tEnd: null, conceptLabels: [], ...o });
    const outline = materialOutline([
      c({ page: 5, kind: "FIGURE", title: "State diagram", conceptLabels: ["process states"] }),
      c({ sourceType: "PPTX", filename: "deck.pptx", kind: "SLIDE", slide: 3, content: "No title here,\n just text" }),
      c({ sourceType: "VIDEO", filename: "lec.mp4", kind: "TRANSCRIPT", tStart: 46.5, tEnd: 125, title: "How it works" }),
    ]);
    assert.equal(
      outline,
      "Source: a.pdf (PDF)\n- p.5 [figure] State diagram | concepts: process states\n\nSource: deck.pptx (PPTX)\n- slide 3 [slide] No title here, just text\n\nSource: lec.mp4 (VIDEO)\n- 0:46–2:05 [transcript] How it works",
    );
  });
});

describe("buildCourse (fake planner + embedder, real DB)", () => {
  it("creates topics in order with prerequisite ids, tags every READY chunk to its nearest topic", async () => {
    let seenOutline = "";
    const deps: BuildDeps = { embed, plan: async (input) => ((seenOutline = input.outline), plan([t("t1", "Basics"), t("t2", "Middle", ["t1"]), t("t3", "Advanced", ["t1", "t2", "t9"])])!(input)) };
    const { topics, report } = await buildCourse({ courseId: COURSE }, deps);
    assert.deepEqual(topics.map((x) => [x.seq, x.name, x.chunkCount]), [[1, "Basics", 2], [2, "Middle", 2], [3, "Advanced", 2]]);
    assert.deepEqual(topics[2].prereqIds, [topics[0].id, topics[1].id]);
    assert.deepEqual([report.chunks, report.droppedPrereqs, report.emptyTopics], [6, 1, []]);
    assert.ok(seenOutline.includes("p.1 [text] Heading 1 | concepts: concept 0") && !seenOutline.includes("not ready"), "outline has READY chunks only");
    const tagged = await prisma.chunk.findMany({ where: { source: { courseId: COURSE, status: "READY" } }, orderBy: { seq: "asc" }, select: { topicId: true } });
    assert.deepEqual(tagged.map((c) => topics.findIndex((x) => x.id === c.topicId)), [0, 0, 1, 1, 2, 2]);
    assert.deepEqual(await listTopics(COURSE), topics);
  });

  it("a rebuild replaces the topics (old ids gone) and reports topics no chunk is nearest to", async () => {
    const before = (await listTopics(COURSE)).map((x) => x.id);
    const { topics, report } = await buildCourse({ courseId: COURSE }, { embed, plan: plan([t("t1", "A"), t("t2", "B"), t("t3", "C"), t("t4", "Unused")]) });
    assert.equal(await prisma.topic.count({ where: { id: { in: before } } }), 0);
    assert.deepEqual(topics.map((x) => x.chunkCount), [2, 2, 2, 0]);
    assert.deepEqual(report.emptyTopics, ["Unused"]);
  });

  it("refuses to erase learner progress (409) unless force; force cascades the progress away", async () => {
    const [first] = await listTopics(COURSE);
    const learner = await prisma.learner.create({ data: { name: "__test__build learner" } });
    await prisma.mastery.create({ data: { learnerId: learner.id, topicId: first.id, p: 0.8, n: 3 } });
    await assert.rejects(buildCourse({ courseId: COURSE }, { embed, plan: plan([t("t1", "X")]) }), isCode("not_ready", /progress on 1 topic/));
    assert.equal(await prisma.topic.count({ where: { id: first.id } }), 1, "nothing changed");
    await buildCourse({ courseId: COURSE, force: true }, { embed, plan: plan([t("t1", "X"), t("t2", "Y")]) });
    assert.equal(await prisma.mastery.count({ where: { learnerId: learner.id } }), 0);
  });

  it("refuses an unknown course and a course with nothing ingested (409)", async () => {
    await assert.rejects(buildCourse({ courseId: "__test__no_such_course" }, { embed, plan: plan([t("t1", "X")]) }), isCode("not_ready", /not found/));
    const empty = `${COURSE}-empty`;
    await prisma.course.create({ data: { id: empty, name: "Empty" } });
    try {
      await assert.rejects(buildCourse({ courseId: empty }, { embed, plan: plan([t("t1", "X")]) }), isCode("not_ready", /Nothing to build from/));
    } finally {
      await prisma.course.delete({ where: { id: empty } });
    }
  });
});
