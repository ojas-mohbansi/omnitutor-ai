import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Single .env at the repo root, shared with the web app.
config({ path: path.join(__dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: path.join(__dirname, "prisma/schema.prisma"),
});
