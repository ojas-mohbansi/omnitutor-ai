import { selectNotebook } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../../_lib/http";

/** Switches the active notebook (one of yours). */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.selectNotebook.request);
  return json(endpoints.selectNotebook.response, await selectNotebook(sessionOf(req), body.notebookId));
});
