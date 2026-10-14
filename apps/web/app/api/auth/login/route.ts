import { login, sessionSecret, signSession } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, withSession } from "../../_lib/http";

/** Signs in with name + password (401 on mismatch). */
export const POST = handle(async (req) => {
  const learner = await login(await readBody(req, endpoints.login.request));
  return withSession(json(endpoints.login.response, learner), req, signSession(learner.id, sessionSecret()));
});
