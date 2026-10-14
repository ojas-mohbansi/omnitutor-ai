import { z } from "zod";
import { Citation } from "./citation";
import { ChatRole, Coverage, Id, IsoDate, MasterySource, Probability } from "./common";

export const ChatRequest = z.object({
  learnerId: Id,
  courseId: Id.optional(), // defaults to the only course
  message: z.string().trim().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

// Grounding rules are part of the contract:
//   material blocks always cite ≥ 1 source excerpt; outside-knowledge blocks never cite.
const MaterialBlock = z.object({
  origin: z.literal("material"),
  text: z.string().min(1),
  citations: z.array(Citation).min(1),
});
const OutsideBlock = z.object({
  origin: z.literal("outside"), // general knowledge, flagged as not from the course material
  text: z.string().min(1),
  citations: z.array(Citation).max(0),
});
export const TutorBlock = z.discriminatedUnion("origin", [MaterialBlock, OutsideBlock]);
export type TutorBlock = z.infer<typeof TutorBlock>;

export const MasteryUpdate = z.object({
  topicId: Id,
  topicName: z.string(),
  before: Probability,
  after: Probability,
  source: MasterySource,
});
export type MasteryUpdate = z.infer<typeof MasteryUpdate>;

export const RefusalReason = z.enum([
  "off_material", // retrieval score below REFUSAL_TAU
  "not_covered", // model judged the material doesn't answer it
]);
export type RefusalReason = z.infer<typeof RefusalReason>;

/** POST /api/chat */
export const TutorAnswer = z
  .object({
    messageId: Id,
    coverage: Coverage,
    refused: z.boolean(),
    refusalReason: RefusalReason.nullable(),
    blocks: z.array(TutorBlock), // render in order
    masteryUpdates: z.array(MasteryUpdate), // learner-model changes caused by this turn
  })
  .superRefine((a, ctx) => {
    if (a.refused !== (a.refusalReason !== null)) {
      ctx.addIssue({ code: "custom", message: "refusalReason must be set iff refused", path: ["refusalReason"] });
    }
    if (a.refused && a.blocks.some((b) => b.origin === "material")) {
      ctx.addIssue({ code: "custom", message: "a refused answer cannot contain material blocks", path: ["blocks"] });
    }
    if (a.coverage === "NOT_COVERED" && !a.refused) {
      ctx.addIssue({ code: "custom", message: "NOT_COVERED answers must be refused", path: ["refused"] });
    }
    if (!a.refused && a.blocks.length === 0) {
      ctx.addIssue({ code: "custom", message: "an answer needs at least one block", path: ["blocks"] });
    }
  });
export type TutorAnswer = z.infer<typeof TutorAnswer>;

/** GET /api/chat?learnerId= (oldest first) */
export const ChatMessageView = z.object({
  id: Id,
  role: ChatRole,
  content: z.string(),
  blocks: z.array(TutorBlock).nullable(), // ASSISTANT only
  coverage: Coverage.nullable(),
  refused: z.boolean(),
  createdAt: IsoDate,
});
export type ChatMessageView = z.infer<typeof ChatMessageView>;
