import { createNotebook, listNotebooks } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody, sessionOf } from "../_lib/http";

/** The signed-in account's notebooks, newest first, the active one marked. */
export const GET = handle(async (req) => json(endpoints.listNotebooks.response, await listNotebooks(sessionOf(req))));

/** Creates a notebook and makes it active. */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.createNotebook.request);
  return json(endpoints.createNotebook.response, await createNotebook(sessionOf(req), body));
});
