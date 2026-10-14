import { authorizeAssessment, getQuiz } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, sessionOf } from "../../_lib/http";

/** The quiz without answers (client-safe). */
export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await authorizeAssessment(id, sessionOf(req));
  return json(endpoints.getQuiz.response, await getQuiz(id));
});
