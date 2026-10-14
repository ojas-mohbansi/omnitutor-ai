import { listTopics } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readQuery } from "../_lib/http";

/** The course's topics in display order (prerequisites first), with tagged chunk counts. */
export const GET = handle(async (req) => {
  const query = readQuery(req, endpoints.listTopics.query);
  return json(endpoints.listTopics.response, await listTopics(query.courseId));
});
