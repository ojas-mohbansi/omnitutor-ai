import { after } from "next/server";
import { authorizeSource, requestIngestion } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, sessionOf } from "../../../_lib/http";

/** Starts ingestion (spends Gemini quota; cached pages are free) and returns at once. Poll GET /api/sources. */
export const POST = handle(async (req, ctx: RouteContext<"/api/sources/[id]/ingest">) => {
  const { id } = await ctx.params;
  await authorizeSource(id, sessionOf(req));
  const { response, job } = await requestIngestion(id);
  after(job); // keeps the job alive after the response (self-hosted Next supports this)
  return json(endpoints.ingestSource.response, response);
});
