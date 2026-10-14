import { authorizeLearner, chat, chatHistory } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, readQuery, sessionOf } from "../_lib/http";

/** One tutor turn: retrieval-grounded, cited answer (or refusal) + mastery updates from chat evidence. */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.chat.request);
  await authorizeLearner(body.learnerId, sessionOf(req));
  return json(endpoints.chat.response, await chat(body));
});

/** The learner's conversation, oldest first. */
export const GET = handle(async (req) => {
  const query = readQuery(req, endpoints.chatHistory.query);
  await authorizeLearner(query.learnerId, sessionOf(req));
  return json(endpoints.chatHistory.response, await chatHistory(query.learnerId));
});
