import { after } from "next/server";
import { requestIngestion } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json } from "../../../_lib/http";

/** Starts ingestion (spends Gemini quota; cached pages are free) and returns at once. Poll GET /api/sources. */
export const POST = handle(async (_req, ctx: RouteContext<"/api/sources/[id]/ingest">) => {
  const { id } = await ctx.params;
  const { response, job } = await requestIngestion(id);
  after(job); // keeps the job alive after the response (self-hosted Next supports this)
  return json(endpoints.ingestSource.response, response);
});
