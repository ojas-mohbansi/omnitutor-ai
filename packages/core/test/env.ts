// Import first in DB-backed tests: loads the repo-root .env (DATABASE_URL) before @sc/db is evaluated.
import path from "node:path";
import { fileURLToPath } from "node:url";

process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
