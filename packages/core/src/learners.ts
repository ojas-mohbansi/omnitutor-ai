import { prisma, type Learner as LearnerRow } from "@sc/db";
import type { CreateLearnerRequest, Learner } from "@sc/schemas";
import { notFound } from "./errors";

const toLearner = (l: LearnerRow): Learner => ({ id: l.id, name: l.name, createdAt: l.createdAt.toISOString() });

/** Open profiles only (no password); private accounts are never listed. */
export async function listLearners(): Promise<Learner[]> {
  return (await prisma.learner.findMany({ where: { passwordHash: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(toLearner);
}

export async function createLearner(input: CreateLearnerRequest): Promise<Learner> {
  return toLearner(await prisma.learner.create({ data: { name: input.name } }));
}

/** 404 not_found for an unknown learner (used by every learner-scoped endpoint). */
export async function requireLearner(learnerId: string): Promise<void> {
  const found = await prisma.learner.findUnique({ where: { id: learnerId }, select: { id: true } });
  if (!found) throw notFound(`Learner "${learnerId}" not found.`);
}
