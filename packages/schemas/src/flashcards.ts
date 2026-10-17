import { z } from "zod";
import { Citation } from "./citation";
import { Count, Id, IsoDate } from "./common";
import { MasteryUpdate } from "./tutor";

/**
 * Flashcards (Module 21): per topic of the active notebook, generated from that topic's own excerpts,
 * each verified by a second model and cited. Spaced repetition with Leitner boxes 1–5.
 */
export const FlashcardView = z.object({
  id: Id,
  topicId: Id,
  topicName: z.string(),
  front: z.string().min(1),
  back: z.string().min(1),
  citations: z.array(Citation), // where the answer is taught
  box: z.number().int().min(1).max(5),
  dueAt: IsoDate,
  reviews: Count,
});
export type FlashcardView = z.infer<typeof FlashcardView>;

export const FlashcardTopic = z.object({ topicId: Id, name: z.string(), total: Count, due: Count });
export type FlashcardTopic = z.infer<typeof FlashcardTopic>;

/** GET /api/flashcards?topicId=: due cards first (then by box), plus counts per topic. */
export const FlashcardDeck = z.object({
  cards: z.array(FlashcardView),
  topics: z.array(FlashcardTopic),
  due: Count,
  total: Count,
});
export type FlashcardDeck = z.infer<typeof FlashcardDeck>;

export const FlashcardQuery = z.object({ topicId: Id.optional() });
export type FlashcardQuery = z.infer<typeof FlashcardQuery>;

/** POST /api/flashcards/generate: new verified cards for one topic (2 Gemini calls). */
export const GenerateFlashcardsRequest = z.object({ topicId: Id });
export type GenerateFlashcardsRequest = z.infer<typeof GenerateFlashcardsRequest>;

export const GenerateFlashcardsResult = z.object({
  added: Count, // verified and stored
  rejected: Count, // dropped by the code checks or the verifier
  deck: FlashcardDeck,
});
export type GenerateFlashcardsResult = z.infer<typeof GenerateFlashcardsResult>;

/** POST /api/flashcards/[id]/review: the learner's self-check after flipping the card. */
export const ReviewFlashcardRequest = z.object({ knew: z.boolean() });
export type ReviewFlashcardRequest = z.infer<typeof ReviewFlashcardRequest>;

export const ReviewFlashcardResult = z.object({ card: FlashcardView, mastery: MasteryUpdate });
export type ReviewFlashcardResult = z.infer<typeof ReviewFlashcardResult>;
