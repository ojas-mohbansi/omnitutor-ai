import { authorizeAssessment, getReport } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, sessionOf } from "../../../_lib/http";

/** The post-quiz report (409 until submitted). */
export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await authorizeAssessment(id, sessionOf(req));
  return json(endpoints.getReport.response, await getReport(id));
});
