import { deleteSource } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json } from "../../_lib/http";

export const DELETE = handle(async (_req, ctx: RouteContext<"/api/sources/[id]">) => {
  const { id } = await ctx.params;
  return json(endpoints.deleteSource.response, await deleteSource(id));
});
