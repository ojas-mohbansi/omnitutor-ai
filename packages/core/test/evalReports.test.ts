// Module 19: the evaluation-report reader. Missing → null (not run yet); invalid → reported, never shown.
// Uses a temp REPO_ROOT; no DB, no Gemini. Run: npm run test
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { mocks } from "@sc/schemas/mocks";
import { EVAL_DIR, RAG_REPORT_FILE, SIM_REPORT_FILE, evalReports } from "../src/evalReports";

let root: string;
const put = async (file: string, text: string) => {
  await mkdir(path.join(root, EVAL_DIR), { recursive: true });
  await writeFile(path.join(root, EVAL_DIR, file), text);
};
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sc-eval-"));
  process.env.REPO_ROOT = root;
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("evalReports", () => {
  it("no files yet: both null, no problems", async () => {
    assert.deepEqual(await evalReports(), { rag: null, sim: null, problems: [] });
  });
  it("valid reports are returned as written", async () => {
    await put(RAG_REPORT_FILE, JSON.stringify(mocks.evalReport.rag));
    await put(SIM_REPORT_FILE, JSON.stringify(mocks.evalReport.sim));
    const r = await evalReports();
    assert.deepEqual(r.rag, mocks.evalReport.rag);
    assert.deepEqual(r.sim, mocks.evalReport.sim);
    assert.deepEqual(r.problems, []);
  });
  it("a report outside the format (e.g. a score above 1) or broken JSON is never shown", async () => {
    await put(RAG_REPORT_FILE, JSON.stringify({ ...mocks.evalReport.rag, overall: { ...mocks.evalReport.rag!.overall, faithfulness: 1.4 } }));
    await put(SIM_REPORT_FILE, "{ not json");
    const r = await evalReports();
    assert.equal(r.rag, null);
    assert.equal(r.sim, null);
    assert.equal(r.problems.length, 2);
    assert.match(r.problems.join(" "), /does not match the report format/);
    assert.match(r.problems.join(" "), /not valid JSON/);
  });
});
