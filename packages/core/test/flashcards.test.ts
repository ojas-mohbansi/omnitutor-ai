// Module 21: flashcards, against the real DB (Gemini is not called: generation is covered by the live check).
// Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { courseFor, signup } from "../src/auth";
import { AppError } from "../src/errors";
import { AGAIN_MINUTES, LEITNER_DAYS, frontHash, listFlashcards, nextReview, reviewFlashcard } from "../src/flashcards";

const NAME = `__test__flashcards ${Date.now()}`;
const code = (e: unknown) => (e instanceof AppError ? e.code : String(e));

after(async () => {
  await prisma.learner.deleteMany({ where: { name: { startsWith: "__test__flashcards" } } });
});

describe("Leitner scheduling (pure)", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  it("knew it → next box, due after that box's interval; capped at box 5", () => {
    assert.deepEqual(nextReview(1, true, now), { box: 2, dueAt: new Date(now.getTime() + LEITNER_DAYS[2] * 86_400_000) });
    assert.equal(nextReview(5, true, now).box, 5);
    assert.equal(nextReview(5, true, now).dueAt.getTime() - now.getTime(), LEITNER_DAYS[5] * 86_400_000);
  });
  it("again → back to box 1, due again in this session", () => {
    assert.deepEqual(nextReview(4, false, now), { box: 1, dueAt: new Date(now.getTime() + AGAIN_MINUTES * 60_000) });
  });
  it("frontHash ignores case, punctuation and spacing", () => {
    assert.equal(frontHash("What is the  Dispatcher?"), frontHash("what is the dispatcher"));
    assert.notEqual(frontHash("What is throughput?"), frontHash("What is turnaround time?"));
  });
});

describe("flashcards in a notebook (DB)", () => {
  it("deck: due first, per-topic counts; review moves the box and feeds mastery; other accounts are refused", async () => {
    const a = await signup({ name: `${NAME} a`, password: "password-1" });
    const b = await signup({ name: `${NAME} b`, password: "password-1" });
    const courseId = await courseFor(a.id);
    const topic = await prisma.topic.create({ data: { courseId, seq: 1, name: "Topic", description: "", prereqIds: [], embedding: [] } });
    const later = new Date(Date.now() + 86_400_000);
    const [due, notDue] = await Promise.all([
      prisma.flashcard.create({ data: { courseId, topicId: topic.id, front: "Q due", back: "A", frontHash: frontHash("Q due"), sourceChunkIds: [] } }),
      prisma.flashcard.create({ data: { courseId, topicId: topic.id, front: "Q later", back: "B", frontHash: frontHash("Q later"), sourceChunkIds: [], dueAt: later } }),
    ]);
    const deck = await listFlashcards(a.id);
    assert.deepEqual(deck.cards.map((c) => c.id), [due.id, notDue.id]);
    assert.deepEqual([deck.due, deck.total], [1, 2]);
    assert.deepEqual(deck.topics, [{ topicId: topic.id, name: "Topic", total: 2, due: 1 }]);

    const r = await reviewFlashcard(a.id, due.id, true);
    assert.equal(r.card.box, 2);
    assert.equal(r.mastery.source, "FLASHCARD");
    assert.ok(r.mastery.after > r.mastery.before, "knowing a card raises mastery");
    assert.equal(await prisma.masteryEvent.count({ where: { learnerId: a.id, source: "FLASHCARD" } }), 1);
    const again = await reviewFlashcard(a.id, due.id, false);
    assert.equal(again.card.box, 1);
    assert.ok(again.mastery.after < again.mastery.before);

    await assert.rejects(reviewFlashcard(b.id, due.id, true), (e) => code(e) === "unauthorized");
    assert.equal((await listFlashcards(b.id)).total, 0, "another account sees none of these cards");
    await assert.rejects(listFlashcards(null), (e) => code(e) === "unauthorized");
  });
});
