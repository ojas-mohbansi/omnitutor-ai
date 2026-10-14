import { createLearner, listLearners } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody } from "../_lib/http";

export const GET = handle(async () => json(endpoints.listLearners.response, await listLearners()));

export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.createLearner.request);
  return json(endpoints.createLearner.response, await createLearner(body));
});
