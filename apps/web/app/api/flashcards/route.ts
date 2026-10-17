import { listFlashcards } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readQuery, sessionOf } from "../_lib/http";

/** The active notebook's flashcards (optionally one topic), due cards first. */
export const GET = handle(async (req) => {
  const query = readQuery(req, endpoints.listFlashcards.query);
  return json(endpoints.listFlashcards.response, await listFlashcards(sessionOf(req), query.topicId));
});
