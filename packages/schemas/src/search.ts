import { z } from "zod";
import { Citation } from "./citation";
import { Count, Id } from "./common";

/** POST /api/search: retrieval over all READY sources (the tutor's first step, exposed for UI + checks). */
export const SearchRequest = z.object({
  query: z.string().trim().min(1).max(2000), // same cap as a tutor message; pasted exam questions run to 600+ chars
  k: z.number().int().min(1).max(20).optional(), // default 6
  courseId: Id.optional(),
});
export type SearchRequest = z.infer<typeof SearchRequest>;

export const SearchResponse = z.object({
  topScore: z.number().min(-1).max(1), // best cosine similarity (refusal threshold REFUSAL_TAU applies to this)
  candidates: Count, // chunks searched
  results: z.array(z.object({ score: z.number().min(-1).max(1), citation: Citation })),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
