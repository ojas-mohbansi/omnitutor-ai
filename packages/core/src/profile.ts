// Learner profile (Module 17): onboarding answers that personalise HOW the tutor talks and explains.
// What it teaches stays grounded in the material and adapted to measured mastery (bkt.ts); the
// profile only sets tone (and the sampling temperature), explanation style, starting level and goal.
import { prisma } from "@sc/db";
import { LearnerProfile, type ProfileView } from "@sc/schemas";
import { unauthorized } from "./auth";

/** Sampling temperature per tone: playful answers need variety; precise ones need consistency. */
export const TONE_TEMPERATURE: Record<LearnerProfile["tone"], number> = { funny: 0.8, friendly: 0.45, concise: 0.2, serious: 0.15 };
/** Used for learners who haven't onboarded (and for evaluation): the tutor's original setting. */
export const DEFAULT_TEMPERATURE = 0.2;

export function temperatureFor(profile: LearnerProfile | null): number {
  return profile ? TONE_TEMPERATURE[profile.tone] : DEFAULT_TEMPERATURE;
}

const TONE: Record<LearnerProfile["tone"], string> = {
  friendly: "Warm and encouraging, like a patient senior student. Plain words; acknowledge what they got right.",
  funny: "Playful and light-hearted: a joke, pun or funny analogy where it fits (never at the student's expense), while every fact stays exact.",
  serious: "Formal and precise, like a textbook author. No jokes, no filler.",
  concise: "Brief and to the point: the shortest explanation that is still complete. Bullet-like sentences.",
};
const STYLE: Record<LearnerProfile["style"], string> = {
  step_by_step: "Build the explanation in small numbered steps, each one following from the last.",
  examples_first: "Start from a concrete example (from the material if it has one, else an outside example), then generalise to the rule.",
  big_picture: "Start with the big idea and why it matters, then fill in the details.",
};
const LEVEL: Record<LearnerProfile["level"], string> = {
  new: "The student is new to this subject: define every term the first time it appears.",
  some: "The student has seen this subject before: briefly recall key terms, don't over-explain basics.",
  confident: "The student is confident in this subject: skip basics, go for depth and edge cases.",
};
const GOAL: Record<LearnerProfile["goal"], string> = {
  exam: "They are preparing for an exam: end with what an exam would ask about this (a formula, a typical question or a common trap).",
  understand: "They want real understanding: explain why it works, not only what it is.",
  revise: "They are revising: end with a two-line recap they could memorise.",
};

/** Pure: the personalisation block of the tutor prompt (empty without a profile). */
export function profileInstructions(profile: LearnerProfile | null): string {
  if (!profile) return "";
  return [
    "How this student wants to be taught (from their onboarding; it changes the voice and structure, never the facts or the citation rules):",
    `- Tone: ${TONE[profile.tone]}`,
    `- Structure: ${STYLE[profile.style]}`,
    `- Level: ${LEVEL[profile.level]} Their measured per-topic mastery (below) overrides this when they differ.`,
    `- Goal: ${GOAL[profile.goal]}`,
  ].join("\n");
}

/** The learner's profile, or null (never onboarded, or stored data no longer matches the schema). */
export async function getProfile(learnerId: string): Promise<LearnerProfile | null> {
  const row = await prisma.learner.findUnique({ where: { id: learnerId }, select: { profile: true } });
  const parsed = LearnerProfile.safeParse(row?.profile);
  return parsed.success ? parsed.data : null;
}

/** GET /api/profile: the signed-in learner's profile (401 without a session). */
export async function profileView(sessionLearnerId: string | null): Promise<ProfileView> {
  if (!sessionLearnerId) throw unauthorized("Sign in to see your profile.");
  return { profile: await getProfile(sessionLearnerId) };
}

/** POST /api/profile: saves the onboarding answers for the signed-in learner (401 without a session). */
export async function saveProfile(sessionLearnerId: string | null, profile: LearnerProfile): Promise<ProfileView> {
  if (!sessionLearnerId) throw unauthorized("Sign in to save your profile.");
  const found = await prisma.learner.findUnique({ where: { id: sessionLearnerId }, select: { id: true } });
  if (!found) throw unauthorized("Your session has expired. Sign in again.");
  await prisma.learner.update({ where: { id: sessionLearnerId }, data: { profile } });
  return { profile };
}
