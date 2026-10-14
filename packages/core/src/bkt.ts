// Learner model (Module 11): Bayesian Knowledge Tracing per topic.
// One observation (a graded answer, or damped evidence from a tutor conversation) updates
// P(known): Bayes posterior given the observation, then the chance of learning on this step.
// `updateMastery` is pure and is the API promised to the simulator (tools/sim).
import { prisma } from "@sc/db";
import { masteryBand, type MasterySource, type MasteryUpdate, type QuestionType } from "@sc/schemas";

/** docs/ARCHITECTURE.md §6.5. Guess depends on how easy the item type is to guess. */
export const BKT = {
  prior: 0.3,
  learn: 0.15,
  slip: 0.1,
  guess: { MCQ: 0.25, SHORT: 0.1, NUMERIC: 0.05 } satisfies Record<QuestionType, number>,
} as const;

/** Chat evidence is weaker than a graded answer: it moves mastery 30% as far. */
export const CHAT_WEIGHT = 0.3;

const clamp = (p: number) => Math.min(0.999, Math.max(0.001, p));

/**
 * One BKT step. `weight` ∈ (0, 1] damps the update (1 = a graded quiz answer).
 * Returns the new P(known), kept inside (0, 1) so later evidence can still move it.
 */
export function updateMastery(p: number, correct: boolean, type: QuestionType, weight = 1): number {
  const { slip, learn } = BKT;
  const guess = BKT.guess[type];
  const prev = clamp(p);
  const posterior = correct
    ? (prev * (1 - slip)) / (prev * (1 - slip) + (1 - prev) * guess)
    : (prev * slip) / (prev * slip + (1 - prev) * (1 - guess));
  const next = posterior + (1 - posterior) * learn;
  return clamp(prev + Math.min(1, Math.max(0, weight)) * (next - prev));
}

/** Current P(known) for each of the learner's topics (prior for topics never assessed). */
export async function masteryMap(learnerId: string, topicIds: string[]): Promise<Map<string, { p: number; n: number }>> {
  const rows = await prisma.mastery.findMany({ where: { learnerId, topicId: { in: topicIds } } });
  const byTopic = new Map(rows.map((r) => [r.topicId, { p: r.p, n: r.n }]));
  return new Map(topicIds.map((id) => [id, byTopic.get(id) ?? { p: BKT.prior, n: 0 }]));
}

export type Observation = {
  learnerId: string;
  topicId: string;
  correct: boolean;
  type: QuestionType;
  source: MasterySource;
  weight?: number;
  attemptId?: string;
  chatMessageId?: string;
};

/**
 * Applies one observation: updates Mastery (creating it at the prior) and records a
 * MasteryEvent (the evidence trail shown on the dashboard), in one transaction.
 */
export async function applyObservation(o: Observation): Promise<MasteryUpdate> {
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findUniqueOrThrow({ where: { id: o.topicId }, select: { name: true } });
    const current = await tx.mastery.findUnique({ where: { learnerId_topicId: { learnerId: o.learnerId, topicId: o.topicId } } });
    const before = current?.p ?? BKT.prior;
    const after = updateMastery(before, o.correct, o.type, o.weight ?? 1);
    await tx.mastery.upsert({
      where: { learnerId_topicId: { learnerId: o.learnerId, topicId: o.topicId } },
      create: { learnerId: o.learnerId, topicId: o.topicId, p: after, n: 1 },
      update: { p: after, n: { increment: 1 } },
    });
    await tx.masteryEvent.create({
      data: { learnerId: o.learnerId, topicId: o.topicId, before, after, source: o.source, attemptId: o.attemptId, chatMessageId: o.chatMessageId },
    });
    return { topicId: o.topicId, topicName: topic.name, before, after, source: o.source };
  });
}

/** Difficulty for a topic from its mastery band: weak → easy (1), developing → medium (2), strong → hard (3). */
export function difficultyFor(p: number): 1 | 2 | 3 {
  const band = masteryBand(p);
  return band === "weak" ? 1 : band === "developing" ? 2 : 3;
}
