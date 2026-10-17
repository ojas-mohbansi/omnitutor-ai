// Module 19: GET /api/eval/report against the running server: public (no session needed), always valid
// against the contract (the client validates the response), and never shows a report that is invalid.
import "./setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EvalReportView } from "@sc/schemas";
import { api, raw } from "./setup";

describe("GET /api/eval/report", () => {
  it("is public and matches the contract", async () => {
    const res = await raw("/api/eval/report");
    assert.equal(res.status, 200);
    const body = EvalReportView.parse(await res.json());
    assert.ok(Array.isArray(body.problems));
    const view = await api.evalReport(); // validated by the typed client too
    if (view.rag) {
      assert.equal(view.rag.rows.length, view.rag.counts.questions, "one row per test question");
      assert.ok(view.rag.models.judge.length > 0);
    }
  });
});
