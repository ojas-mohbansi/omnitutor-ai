import { z } from "zod";

/**
 * Onboarding answers that shape how the tutor talks and explains (Module 17). Study preferences,
 * not "learning styles": tone, how explanations are built, prior knowledge, and the goal.
 */
export const TutorTone = z.enum(["friendly", "funny", "serious", "concise"]);
export type TutorTone = z.infer<typeof TutorTone>;
export const ExplainStyle = z.enum(["step_by_step", "examples_first", "big_picture"]);
export type ExplainStyle = z.infer<typeof ExplainStyle>;
export const PriorLevel = z.enum(["new", "some", "confident"]);
export type PriorLevel = z.infer<typeof PriorLevel>;
export const StudyGoal = z.enum(["exam", "understand", "revise"]);
export type StudyGoal = z.infer<typeof StudyGoal>;

export const LearnerProfile = z.object({
  tone: TutorTone,
  style: ExplainStyle,
  level: PriorLevel,
  goal: StudyGoal,
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

/** GET /api/profile and the POST reply: the signed-in learner's profile, or null before onboarding. */
export const ProfileView = z.object({ profile: LearnerProfile.nullable() });
export type ProfileView = z.infer<typeof ProfileView>;
