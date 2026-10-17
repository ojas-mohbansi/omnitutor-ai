// Serves an uploaded original for citations: PDF (#page=N), video (seek via Range), PPTX.
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { authorizeSource, getSourceFile, parseByteRange } from "@sc/core";
import { handle, sessionOf } from "../../_lib/http";

type Ctx = RouteContext<"/api/files/[id]">;

/** RFC 6266: ASCII fallback plus the exact UTF-8 name. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function serve(req: NextRequest, ctx: Ctx, withBody: boolean): Promise<Response> {
  const { id } = await ctx.params;
  await authorizeSource(id, sessionOf(req));
  const file = await getSourceFile(id);
  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(file.filename),
    "Cache-Control": "private, max-age=3600, no-transform", // never re-encode: byte offsets must stay valid
    "X-Content-Type-Options": "nosniff",
  });
  const range = parseByteRange(req.headers.get("range"), file.size);
  if (range.kind === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${file.size}`);
    return new Response(null, { status: 416, headers });
  }
  const [start, end] = range.kind === "partial" ? [range.start, range.end] : [0, file.size - 1];
  headers.set("Content-Length", String(end - start + 1));
  if (range.kind === "partial") headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
  const body = withBody ? (Readable.toWeb(createReadStream(file.absPath, { start, end })) as ReadableStream<Uint8Array>) : null;
  return new Response(body, { status: range.kind === "partial" ? 206 : 200, headers });
}

export const GET = handle((req, ctx: Ctx) => serve(req, ctx, true));
export const HEAD = handle((req, ctx: Ctx) => serve(req, ctx, false));
