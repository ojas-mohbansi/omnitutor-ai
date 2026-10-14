// Runs the Next.js CLI with the repo-root .env loaded into process.env.
// Next only reads .env from apps/web; loading here (before Next starts) means
// every process Next spawns inherits the values.
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  console.warn("[next.mjs] no .env at repo root — copy .env.example to .env");
}

await import("next/dist/bin/next");
