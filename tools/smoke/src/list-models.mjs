// Lists Gemini models available to APP_GEMINI_API_KEY (from the repo-root .env only).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.loadEnvFile(path.join(root, ".env"));
const apiKey = process.env.APP_GEMINI_API_KEY;
if (!apiKey) throw new Error("APP_GEMINI_API_KEY missing in .env");

const ai = new GoogleGenAI({ apiKey });
const pager = await ai.models.list({ config: { pageSize: 100 } });
for await (const m of pager) {
  const actions = (m.supportedActions ?? []).join(",");
  console.log(`${m.name.replace("models/", "").padEnd(45)} in=${String(m.inputTokenLimit).padEnd(8)} ${actions}`);
}
