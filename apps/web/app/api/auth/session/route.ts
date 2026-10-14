import { sessionLearner } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, sessionOf } from "../../_lib/http";

/** The signed-in account, or { learner: null }. */
export const GET = handle(async (req) => json(endpoints.session.response, { learner: await sessionLearner(sessionOf(req)) }));
