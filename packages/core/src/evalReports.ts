// Evaluation reports (Module 19): the files `npm run eval:rag` / `npm run eval:sim` write to data/eval/.
// Read-only and validated: a missing file is "not run yet" (null); a file that fails the schema is
// reported in `problems` and never shown, so the page can only display numbers a script measured.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RagReport, SimReport, type EvalReportView } from "@sc/schemas";
import type { z } from "zod";
import { repoRoot } from "./storage";

export const EVAL_DIR = "data/eval";
export const RAG_REPORT_FILE = "rag-report.json";
export const SIM_REPORT_FILE = "sim-report.json";

export function evalReportPath(file: string): string {
  return path.join(/*turbopackIgnore: true*/ repoRoot(), ...EVAL_DIR.split("/"), file);
}

async function load<S extends z.ZodType>(file: string, schema: S, problems: string[]): Promise<z.infer<S> | null> {
  let text: string;
  try {
    text = await readFile(evalReportPath(file), "utf8");
  } catch {
    return null; // not run yet
  }
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    problems.push(`${EVAL_DIR}/${file} does not match the report format; re-run its script.`);
  } catch {
    problems.push(`${EVAL_DIR}/${file} is not valid JSON; re-run its script.`);
  }
  return null;
}

/** GET /api/eval/report */
export async function evalReports(): Promise<EvalReportView> {
  const problems: string[] = [];
  const [rag, sim] = await Promise.all([load(RAG_REPORT_FILE, RagReport, problems), load(SIM_REPORT_FILE, SimReport, problems)]);
  return { rag, sim, problems };
}
