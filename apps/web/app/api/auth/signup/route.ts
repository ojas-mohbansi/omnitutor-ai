import { sessionSecret, signSession, signup } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, withSession } from "../../_lib/http";

/** Creates a private account and signs it in. */
export const POST = handle(async (req) => {
  const learner = await signup(await readBody(req, endpoints.signup.request));
  return withSession(json(endpoints.signup.response, learner), req, signSession(learner.id, sessionSecret()));
});
