import { generateFlashcards } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../../_lib/http";

/** New verified flashcards for one topic (2 Gemini calls: generate, then a second model checks each card). */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.generateFlashcards.request);
  return json(endpoints.generateFlashcards.response, await generateFlashcards(sessionOf(req), body.topicId));
});
