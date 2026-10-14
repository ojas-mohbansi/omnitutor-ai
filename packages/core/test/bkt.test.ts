// Module 11: BKT math (pure, hand-computed expectations) + persistence against the real DB.
import "./env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@sc/db";
import { BKT, CHAT_WEIGHT, applyObservation, difficultyFor, masteryMap, updateMastery } from "../src/bkt";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe("updateMastery (pure BKT)", () => {
  it("matches hand-computed values from the prior", () => {
    // correct MCQ: post = .3*.9/(.3*.9+.7*.25) = .27/.445 = .606742; next = post + (1-post)*.15
    close(updateMastery(0.3, true, "MCQ"), 0.606742 + (1 - 0.606742) * 0.15, 1e-5);
    // wrong MCQ: post = .3*.1/(.03+.7*.75) = .03/.555 = .054054; next = .054054 + .945946*.15
    close(updateMastery(0.3, false, "MCQ"), 0.054054 + 0.945946 * 0.15, 1e-5);
  });
  it("a correct NUMERIC answer is stronger evidence than a correct MCQ (lower guess rate)", () => {
    assert.ok(updateMastery(0.3, true, "NUMERIC") > updateMastery(0.3, true, "SHORT"));
    assert.ok(updateMastery(0.3, true, "SHORT") > updateMastery(0.3, true, "MCQ"));
  });
  it("damping: chat evidence moves 30% as far as a quiz answer", () => {
    const full = updateMastery(0.5, true, "SHORT") - 0.5;
    close(updateMastery(0.5, true, "SHORT", CHAT_WEIGHT) - 0.5, full * CHAT_WEIGHT);
  });
  it("monotone and bounded: repeated correct answers rise toward 1, wrong ones fall, never leaving (0,1)", () => {
    let up: number = BKT.prior;
    let down = 0.9;
    for (let i = 0; i < 30; i++) {
      const u = updateMastery(up, true, "MCQ");
      const d = updateMastery(down, false, "MCQ");
      assert.ok(u >= up && d <= down + BKT.learn);
      [up, down] = [u, d];
    }
    assert.ok(up > 0.95 && up < 1 && down < 0.3 && down > 0);
  });
  it("difficulty follows the mastery band", () => {
    assert.deepEqual([difficultyFor(0.2), difficultyFor(0.5), difficultyFor(0.8)], [1, 2, 3]);
  });
});

describe("applyObservation (real DB)", () => {
  const COURSE = `__test__bkt${Date.now()}`;
  let learnerId = "";
  let topicId = "";
  before(async () => {
    await prisma.course.create({ data: { id: COURSE, name: "BKT test" } });
    topicId = (await prisma.topic.create({ data: { courseId: COURSE, seq: 1, name: "Topic A", description: "" } })).id;
    learnerId = (await prisma.learner.create({ data: { name: "__test__bkt learner" } })).id;
  });
  after(async () => {
    await prisma.learner.deleteMany({ where: { id: learnerId } });
    await prisma.course.deleteMany({ where: { id: COURSE } });
    await prisma.$disconnect();
  });

  it("creates mastery at the prior, updates it, and logs every event with before/after", async () => {
    assert.deepEqual((await masteryMap(learnerId, [topicId])).get(topicId), { p: BKT.prior, n: 0 });
    const u1 = await applyObservation({ learnerId, topicId, correct: true, type: "MCQ", source: "QUIZ" });
    close(u1.before, BKT.prior);
    close(u1.after, updateMastery(BKT.prior, true, "MCQ"));
    assert.equal(u1.topicName, "Topic A");
    const u2 = await applyObservation({ learnerId, topicId, correct: false, type: "SHORT", source: "CHAT", weight: CHAT_WEIGHT });
    close(u2.before, u1.after);
    close(u2.after, updateMastery(u1.after, false, "SHORT", CHAT_WEIGHT));
    const m = (await masteryMap(learnerId, [topicId])).get(topicId)!;
    assert.equal(m.n, 2);
    close(m.p, u2.after);
    const events = await prisma.masteryEvent.findMany({ where: { learnerId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(events.map((e) => e.source), ["QUIZ", "CHAT"]);
  });
});
