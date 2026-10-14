import { authorizeAssessment, submitQuiz } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../../../_lib/http";

/** Grades the quiz (MCQ/numeric in code, short answers in 1 Gemini call), updates mastery, returns the report. */
export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await authorizeAssessment(id, sessionOf(req));
  const body = await readBody(req, endpoints.submitQuiz.request);
  return json(endpoints.submitQuiz.response, await submitQuiz(id, body));
});
