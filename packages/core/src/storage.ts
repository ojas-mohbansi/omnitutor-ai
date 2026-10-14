// Local file storage for uploaded originals (data/uploads/), resolved from the repo root
// so it works whatever the working directory is (next dev runs in apps/web).
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { rm } from "node:fs/promises";
import { AppError, badRequest } from "./errors";

/** Source.path values are relative to the repo root, with forward slashes. */
export const UPLOADS_REL = "data/uploads";

let cachedRoot: string | undefined;

/** REPO_ROOT env, else the nearest directory above the cwd that contains turbo.json. */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  if (process.env.REPO_ROOT) return (cachedRoot = path.resolve(process.env.REPO_ROOT));
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, "turbo.json"))) return (cachedRoot = dir);
    const parent = path.dirname(dir);
    if (parent === dir) throw new AppError("internal", "Could not find the repo root (no turbo.json above the working directory). Set REPO_ROOT.");
    dir = parent;
  }
}

// Uploads are runtime user data, not build inputs: the turbopackIgnore comments stop Next's
// output tracing from treating these dynamic paths as "trace the whole project".
export function uploadsDir(): string {
  return path.join(/*turbopackIgnore: true*/ repoRoot(), ...UPLOADS_REL.split("/"));
}

/** Absolute path of a stored Source.path. Refuses anything outside data/uploads. */
export function resolveSourcePath(rel: string): string {
  const abs = path.resolve(/*turbopackIgnore: true*/ repoRoot(), ...rel.split("/"));
  if (!abs.startsWith(uploadsDir() + path.sep)) throw new AppError("internal", `Source path is outside ${UPLOADS_REL}: ${rel}`);
  return abs;
}

const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))} MB` : `${n} bytes`);

/**
 * Streams `body` to a new file at `dest` without buffering it in memory.
 * Aborts and deletes the partial file if it exceeds `maxBytes`. Returns the byte count.
 */
export async function saveStream(body: AsyncIterable<Uint8Array>, dest: string, maxBytes: number): Promise<number> {
  let total = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      total += chunk.length;
      if (total > maxBytes) done(badRequest(`File exceeds the upload limit (${formatBytes(maxBytes)}).`));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.from(body), limit, createWriteStream(dest, { flags: "wx" }));
  } catch (e) {
    await rm(dest, { force: true });
    throw e;
  }
  return total;
}
