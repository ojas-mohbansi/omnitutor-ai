import { endpoints } from "@sc/schemas";
import { handle, json, withSession } from "../../_lib/http";

/** Clears the session cookie. */
export const POST = handle(async (req) => withSession(json(endpoints.logout.response, { learner: null }), req, null));
