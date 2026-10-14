import { buildCourse } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readBody } from "../_lib/http";

/** Groups the course material into topics (1 cached Gemini call + topic embeddings) and tags every chunk. */
export const POST = handle(async (req) => {
  const body = await readBody(req, endpoints.buildCourse.request);
  const { topics } = await buildCourse(body);
  return json(endpoints.buildCourse.response, { topics });
});
