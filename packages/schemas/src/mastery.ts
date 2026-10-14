import { z } from "zod";
import { Citation } from "./citation";
import { Count, Id, IsoDate, MasterySource, Probability } from "./common";

/** Mastery bands: also drive quiz difficulty (weak → easy, developing → medium, strong → hard). */
export const MASTERY_BANDS = { weakBelow: 0.4, strongAbove: 0.7 } as const;

export const MasteryBand = z.enum(["weak", "developing", "strong"]);
export type MasteryBand = z.infer<typeof MasteryBand>;

export function masteryBand(p: number): MasteryBand {
  if (p < MASTERY_BANDS.weakBelow) return "weak";
  if (p > MASTERY_BANDS.strongAbove) return "strong";
  return "developing";
}

export const TopicMastery = z
  .object({
    topicId: Id,
    name: z.string(),
    description: z.string(),
    seq: Count,
    prereqIds: z.array(Id),
    p: Probability,
    n: Count, // number of updates so far (0 = never assessed)
    band: MasteryBand,
  })
  .refine((t) => t.band === masteryBand(t.p), { message: "band must match p", path: ["band"] });
export type TopicMastery = z.infer<typeof TopicMastery>;

export const WeakTopic = z.object({
  topicId: Id,
  name: z.string(),
  p: Probability,
  citations: z.array(Citation).max(3), // where to revise
});
export type WeakTopic = z.infer<typeof WeakTopic>;

export const MasteryPoint = z.object({
  topicId: Id,
  at: IsoDate,
  before: Probability,
  after: Probability,
  source: MasterySource,
});
export type MasteryPoint = z.infer<typeof MasteryPoint>;

/** GET /api/mastery?learnerId= */
export const MasteryView = z.object({
  learnerId: Id,
  needsDiagnostic: z.boolean(), // true until the learner completes a DIAGNOSTIC (cold start)
  topics: z.array(TopicMastery), // ordered by seq
  weakTopics: z.array(WeakTopic),
  history: z.array(MasteryPoint), // oldest first
});
export type MasteryView = z.infer<typeof MasteryView>;
