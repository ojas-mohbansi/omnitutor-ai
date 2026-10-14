// Schema verification against the plan's needs. Creates a throwaway course,
// checks behaviour, and deletes it again. Usage: npm run db:verify
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

process.loadEnvFile(path.join(__dirname, "../../../.env"));
const prisma = new PrismaClient();

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectUniqueViolation(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
  }
}

async function main() {
  const course = await prisma.course.create({ data: { name: "__verify__" } });
  try {
    // Defaults + Source fields
    const source = await prisma.source.create({
      data: { courseId: course.id, type: "PDF", filename: "ch5.pdf", mimeType: "application/pdf", sizeBytes: 1234, path: "data/uploads/x.pdf" },
    });
    check("source defaults", source.status === "PENDING" && source.progressDone === 0 && source.progressTotal === 0, `status=${source.status}`);

    // Embedding round-trip: 768 doubles, exact
    const emb = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.123456789);
    const chunk = await prisma.chunk.create({
      data: { sourceId: source.id, kind: "FIGURE", seq: 0, title: "Figure 5.1", content: "Gantt chart P1 0-24", page: 3, conceptLabels: ["FCFS", "Gantt chart"], embedding: emb },
    });
    const back = await prisma.chunk.findUniqueOrThrow({ where: { id: chunk.id } });
    // Prisma serializes doubles with ~16 significant digits, so the last bit can differ
    // (~1e-16). Gemini embeddings are float32-precise (~1e-7), so this is irrelevant to cosine.
    const maxErr = Math.max(...back.embedding.map((v, i) => Math.abs(v - emb[i])));
    check("embedding 768 round-trip (|err| < 1e-12)", back.embedding.length === 768 && maxErr < 1e-12, `max err ${maxErr.toExponential(1)}`);
    check("locator + labels", back.page === 3 && back.slide === null && back.tStart === null && back.conceptLabels.length === 2);

    // Video locator floats
    const vsrc = await prisma.source.create({
      data: { courseId: course.id, type: "VIDEO", filename: "lec.mp4", mimeType: "video/mp4", sizeBytes: 1, path: "data/uploads/y.mp4", durationSec: 1100.5 },
    });
    const seg = await prisma.chunk.create({ data: { sourceId: vsrc.id, kind: "TRANSCRIPT", seq: 0, content: "…", tStart: 61.25, tEnd: 95.5 } });
    check("video tStart/tEnd floats", seg.tStart === 61.25 && seg.tEnd === 95.5 && seg.embedding.length === 0);

    // Topics + tagging
    const t1 = await prisma.topic.create({ data: { courseId: course.id, seq: 0, name: "Scheduling criteria", description: "…" } });
    const t2 = await prisma.topic.create({ data: { courseId: course.id, seq: 1, name: "FCFS", description: "…", prereqIds: [t1.id] } });
    await prisma.chunk.update({ where: { id: chunk.id }, data: { topicId: t2.id } });

    // Learner + mastery defaults + uniqueness
    const learner = await prisma.learner.create({ data: { name: "__verify__" } });
    try {
      const m = await prisma.mastery.create({ data: { learnerId: learner.id, topicId: t2.id } });
      check("mastery defaults p=0.3 n=0", m.p === 0.3 && m.n === 0);
      check("mastery unique (learner, topic)", await expectUniqueViolation(() => prisma.mastery.create({ data: { learnerId: learner.id, topicId: t2.id } })));

      // Assessment → question → attempt, JSON shapes
      const a = await prisma.assessment.create({ data: { learnerId: learner.id, courseId: course.id, kind: "DIAGNOSTIC", scopeTopicIds: [t1.id, t2.id] } });
      const q = await prisma.question.create({
        data: {
          topicId: t2.id, assessmentId: a.id, position: 0, type: "MCQ", difficulty: 1,
          stem: "Average waiting time?", stemHash: "h1",
          options: ["10", "17", "24", "27"], answer: { index: 1 },
          distractorMisconceptions: { "0": "ignores P3", "2": "uses burst not wait", "3": "uses P3 wait only" },
          explanation: "(0+24+27)/3 = 17", sourceChunkIds: [chunk.id], verified: true, verifierAnswer: { index: 1 },
        },
      });
      const qb = await prisma.question.findUniqueOrThrow({ where: { id: q.id } });
      check("question JSON round-trip", JSON.stringify(qb.answer) === '{"index":1}' && Array.isArray(qb.options) && (qb.options as string[])[1] === "17");

      const att = await prisma.attempt.create({
        data: { assessmentId: a.id, questionId: q.id, response: { index: 2 }, correct: false, score: 0, feedback: { text: "…", citations: [] }, misconception: "uses burst not wait" },
      });
      check("attempt unique (assessment, question)", await expectUniqueViolation(() =>
        prisma.attempt.create({ data: { assessmentId: a.id, questionId: q.id, response: {}, correct: true, score: 1, feedback: {} } })));

      // Mastery events from quiz + chat, with evidence links
      const msg = await prisma.chatMessage.create({
        data: { learnerId: learner.id, courseId: course.id, role: "ASSISTANT", content: "…", blocks: [{ text: "…", origin: "material", citations: [] }], coverage: "SUPPORTED", topScore: 0.71 },
      });
      await prisma.masteryEvent.createMany({
        data: [
          { learnerId: learner.id, topicId: t2.id, before: 0.3, after: 0.12, source: "QUIZ", attemptId: att.id },
          { learnerId: learner.id, topicId: t2.id, before: 0.12, after: 0.16, source: "CHAT", chatMessageId: msg.id },
        ],
      });
      const history = await prisma.masteryEvent.findMany({ where: { learnerId: learner.id }, orderBy: { createdAt: "asc" }, include: { attempt: true, chatMessage: true } });
      check("mastery history with evidence", history.length === 2 && !!history[0].attempt && !!history[1].chatMessage);

      // No-repeat lookup: stems this learner has already been served
      const seen = await prisma.question.findMany({ where: { assessment: { learnerId: learner.id } }, select: { stemHash: true } });
      check("seen-stems query per learner", seen.length === 1 && seen[0].stemHash === "h1");

      // Topic rebuild: deleting a topic untags chunks, removes its mastery/questions
      await prisma.topic.delete({ where: { id: t2.id } });
      const untagged = await prisma.chunk.findUniqueOrThrow({ where: { id: chunk.id } });
      const mLeft = await prisma.mastery.count({ where: { learnerId: learner.id } });
      const qLeft = await prisma.question.count({ where: { id: q.id } });
      check("topic delete → chunk untagged, mastery+questions removed", untagged.topicId === null && mLeft === 0 && qLeft === 0);
    } finally {
      await prisma.learner.delete({ where: { id: learner.id } });
    }
  } finally {
    await prisma.course.delete({ where: { id: course.id } });
  }

  const leftovers = await prisma.chunk.count({ where: { source: { course: { name: "__verify__" } } } });
  check("course delete cascades (no leftovers)", leftovers === 0 && (await prisma.course.count({ where: { name: "__verify__" } })) === 0);

  console.log(`\n${failed ? `${failed} FAILED` : "all checks passed"}`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
