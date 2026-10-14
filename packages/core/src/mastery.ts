// Mastery view (Module 14): GET /api/mastery?learnerId= for the dashboard.
// Per-topic P(known) + band, weak topics with where-to-revise citations, the evidence history
// (every quiz answer and chat turn that moved mastery), and the cold-start flag.
import { prisma } from "@sc/db";
import type { Citation, MasteryView, TopicMastery, WeakTopic } from "@sc/schemas";
import { masteryBand } from "@sc/schemas";
import { BKT } from "./bkt";
import { requireCourse } from "./course";
import { requireLearner } from "./learners";
import { toCitation } from "./retrieve";

export const MAX_WEAK_CITATIONS = 3;

export async function masteryView(learnerId: string, courseId?: string): Promise<MasteryView> {
  await requireLearner(learnerId);
  const id = await requireCourse(courseId);
  const topics = await prisma.topic.findMany({ where: { courseId: id }, orderBy: { seq: "asc" } });
  const rows = await prisma.mastery.findMany({ where: { learnerId, topicId: { in: topics.map((t) => t.id) } } });
  const byTopic = new Map(rows.map((r) => [r.topicId, r]));

  const view: TopicMastery[] = topics.map((t) => {
    const m = byTopic.get(t.id);
    const p = m?.p ?? BKT.prior;
    return { topicId: t.id, name: t.name, description: t.description, seq: t.seq, prereqIds: t.prereqIds, p, n: m?.n ?? 0, band: masteryBand(p) };
  });

  // Weak = assessed at least once and in the weak band; lowest p first (decision Q7).
  const weak = view.filter((t) => t.n > 0 && t.band === "weak").sort((a, b) => a.p - b.p);
  const weakTopics: WeakTopic[] = [];
  for (const t of weak) {
    // Where to revise: sources of the questions they got wrong on this topic (most recent first), then the topic's own material.
    const missed = await prisma.attempt.findMany({
      where: { correct: false, assessment: { learnerId }, question: { topicId: t.topicId } },
      orderBy: { createdAt: "desc" },
      select: { question: { select: { sourceChunkIds: true } } },
      take: 10,
    });
    const ids = [...new Set(missed.flatMap((a) => a.question.sourceChunkIds))];
    const chunks = [
      ...(await prisma.chunk.findMany({ where: { id: { in: ids }, source: { status: "READY" } }, include: { source: { select: { type: true, filename: true } } } })),
      ...(await prisma.chunk.findMany({ where: { topicId: t.topicId, source: { status: "READY" } }, orderBy: { seq: "asc" }, take: MAX_WEAK_CITATIONS, include: { source: { select: { type: true, filename: true } } } })),
    ];
    const citations: Citation[] = [];
    for (const c of chunks) {
      if (citations.length >= MAX_WEAK_CITATIONS || citations.some((x) => x.chunkId === c.id)) continue;
      citations.push(toCitation({ ...c, chunkId: c.id, sourceType: c.source.type, filename: c.source.filename }));
    }
    weakTopics.push({ topicId: t.topicId, name: t.name, p: t.p, citations });
  }

  const events = await prisma.masteryEvent.findMany({ where: { learnerId, topicId: { in: topics.map((t) => t.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const diagnostics = await prisma.assessment.count({ where: { learnerId, courseId: id, kind: "DIAGNOSTIC", status: "SUBMITTED" } });
  return {
    learnerId,
    needsDiagnostic: diagnostics === 0,
    topics: view,
    weakTopics,
    history: events.map((e) => ({ topicId: e.topicId, at: e.createdAt.toISOString(), before: e.before, after: e.after, source: e.source })),
  };
}
