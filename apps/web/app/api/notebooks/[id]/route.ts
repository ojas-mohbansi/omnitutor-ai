import { deleteNotebook } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, sessionOf } from "../../_lib/http";

/** Deletes one of your notebooks and everything in it. */
export const DELETE = handle(async (req, ctx: RouteContext<"/api/notebooks/[id]">) => {
  const { id } = await ctx.params;
  return json(endpoints.deleteNotebook.response, await deleteNotebook(sessionOf(req), id));
});
