// Module 13: objective grading (pure). Short answers + the full loop: `npm run stage1:grading`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { echoMatches, gradeObjective } from "../src/grading";

describe("echoMatches (proof the grader graded THIS answer)", () => {
  it("matches the answer's first words regardless of case/punctuation; rejects another answer", () => {
    const answer = "The ready queue maintains the order of processes. When a time slice expires…";
    assert.equal(echoMatches("The ready queue maintains the order of", answer), true);
    assert.equal(echoMatches("the READY queue, maintains", answer), true);
    assert.equal(echoMatches("Turnaround time is the total time", answer), false);
    assert.equal(echoMatches("", answer), false);
    assert.equal(echoMatches("Short answer here and more words", "Short answer"), true);
  });
});

describe("gradeObjective", () => {
  it("MCQ: only the keyed index; wrong type or unanswered is wrong", () => {
    assert.equal(gradeObjective("MCQ", { index: 2 }, { type: "MCQ", index: 2 }), true);
    assert.equal(gradeObjective("MCQ", { index: 2 }, { type: "MCQ", index: 1 }), false);
    assert.equal(gradeObjective("MCQ", { index: 2 }, null), false);
    assert.equal(gradeObjective("MCQ", { index: 2 }, { type: "NUMERIC", value: 2 }), false);
  });
  it("NUMERIC: within 1% of the key (relative), exact for 0", () => {
    assert.equal(gradeObjective("NUMERIC", { value: 7.75 }, { type: "NUMERIC", value: 7.8 }), true);
    assert.equal(gradeObjective("NUMERIC", { value: 7.75 }, { type: "NUMERIC", value: 7.9 }), false);
    assert.equal(gradeObjective("NUMERIC", { value: 0 }, { type: "NUMERIC", value: 0 }), true);
    assert.equal(gradeObjective("NUMERIC", { value: 0 }, { type: "NUMERIC", value: 0.5 }), false);
  });
});
