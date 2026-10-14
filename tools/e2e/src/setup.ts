// Shared e2e setup. Import FIRST in each test file: loads the repo-root .env before @sc/db is evaluated.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "@sc/client";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.loadEnvFile(path.join(REPO_ROOT, ".env"));

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
/** Prefix for everything the tests create, so cleanup can find it. */
export const TAG = `__e2e__${Date.now()}`;
export const api = createApiClient({ mode: "live", baseUrl: BASE_URL });

/** Raw fetch against the server (for status codes, headers and malformed requests). */
export const raw = (pathAndQuery: string, init?: RequestInit) => fetch(BASE_URL + pathAndQuery, init);

/** Fails fast with a clear message when the dev server isn't running. */
export async function requireServer(): Promise<void> {
  try {
    const h = await api.health();
    if (!h.db.ok) throw new Error(`database not ok: ${h.db.error}`);
  } catch (e) {
    throw new Error(`E2E needs the app at ${BASE_URL} (npm run db:up && npm run dev): ${e instanceof Error ? e.message : e}`);
  }
}

export const fileOf = (bytes: Uint8Array, name: string) => new File([bytes as Uint8Array<ArrayBuffer>], name);
