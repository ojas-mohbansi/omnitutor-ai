import { reviewFlashcard } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../../../_lib/http";

/** Self-check after flipping a card: Leitner step + damped mastery update. */
export const POST = handle(async (req, ctx: RouteContext<"/api/flashcards/[id]/review">) => {
  const { id } = await ctx.params;
  const body = await readBody(req, endpoints.reviewFlashcard.request);
  return json(endpoints.reviewFlashcard.response, await reviewFlashcard(sessionOf(req), id, body.knew));
});
