import { authorizeLearner, courseFor, masteryView } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readQuery, sessionOf } from "../_lib/http";

/** Dashboard data: per-topic mastery, weak topics with revision citations, history, cold-start flag. */
export const GET = handle(async (req) => {
  const query = readQuery(req, endpoints.mastery.query);
  await authorizeLearner(query.learnerId, sessionOf(req));
  return json(endpoints.mastery.response, await masteryView(query.learnerId, await courseFor(sessionOf(req))));
});
