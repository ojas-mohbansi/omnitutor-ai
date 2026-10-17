import { courseFor, listSources, uploadSource } from "@sc/core";
import { endpoints } from "@sc/schemas";
import { handle, json, readQuery, sessionOf } from "../_lib/http";

export const GET = handle(async (req) => json(endpoints.listSources.response, await listSources(await courseFor(sessionOf(req)))));

/** Raw file bytes as the body, ?filename=… for the name (streamed to disk, never buffered). */
export const POST = handle(async (req) => {
  const { filename } = readQuery(req, endpoints.uploadSource.query);
  const length = req.headers.get("content-length");
  const result = await uploadSource({
    courseId: await courseFor(sessionOf(req)),
    body: req.body as unknown as AsyncIterable<Uint8Array> | null,
    filename,
    contentLength: length === null ? null : Number(length),
  });
  return json(endpoints.uploadSource.response, result);
});
