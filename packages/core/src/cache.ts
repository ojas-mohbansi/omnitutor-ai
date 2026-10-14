// On-disk cache for Gemini results (data/cache/, gitignored). Ingestion of an unchanged file
// is then free: no requests, no tokens. Set LLM_CACHE=off to force fresh calls.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./storage";

export const cacheEnabled = () => (process.env.LLM_CACHE ?? "on").toLowerCase() !== "off";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Content hash of a file's bytes (cache identity for ingestion). */
export const sha256Bytes = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Streaming SHA-256 of a file (never loads a large video into memory). */
export async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

function cacheFile(ns: string, key: string): string {
  const h = sha256(key);
  return path.join(/*turbopackIgnore: true*/ repoRoot(), "data", "cache", ns, h.slice(0, 2), `${h}.json`);
}

export async function readCache<T>(ns: string, key: string): Promise<T | undefined> {
  if (!cacheEnabled()) return undefined;
  try {
    return JSON.parse(await readFile(cacheFile(ns, key), "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Atomic write (temp file + rename), so a crash never leaves a half-written entry. */
export async function writeCache(ns: string, key: string, value: unknown): Promise<void> {
  if (!cacheEnabled()) return;
  const file = cacheFile(ns, key);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export { sha256 }; // also used to put prompt hashes into cache keys
