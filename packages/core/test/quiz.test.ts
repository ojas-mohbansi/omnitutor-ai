// Module 12: pure quiz logic (no Gemini, no DB). The real pipeline is checked by `npm run stage1:quiz`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allocate, checkCandidate, ownRefs, preferredType, stemHash, verifierAgrees, type GeneratedQuestion } from "../src/quiz";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("allocate", () => {
  const topics = [{ id: "a", p: 0.9 }, { id: "b", p: 0.3 }, { id: "c", p: 0.1 }];
  it("DIAGNOSTIC: exactly one per topic", () => assert.deepEqual([...allocate("DIAGNOSTIC", 99, topics).values()], [1, 1, 1]));
  it("exact total; every topic gets one when the count allows; weaker topics get more", () => {
    const m = allocate("MOCK", 10, topics);
    assert.equal(sum(m), 10);
    assert.ok([...m.values()].every((v) => v >= 1));
    assert.ok(m.get("c")! >= m.get("b")! && m.get("b")! > m.get("a")!);
  });
  it("fewer questions than topics: the weakest topics get them", () => {
    const m = allocate("QUIZ", 2, topics);
    assert.equal(sum(m), 2);
    assert.equal(m.get("a"), 0);
  });
});

describe("stemHash", () => {
  it("ignores case, punctuation and spacing; differs for different questions", () => {
    assert.equal(stemHash("What is  Dispatch latency?"), stemHash("what is dispatch-latency"));
    assert.notEqual(stemHash("What is dispatch latency?"), stemHash("What is response time?"));
  });
});

const q = (o: Partial<GeneratedQuestion>): GeneratedQuestion => ({
  topic: "T1", type: "MCQ", difficulty: 1, stem: "Which state follows I/O completion?", options: ["ready", "running", "waiting", "new"],
  correctOption: 0, distractorMisconceptions: [], numericAnswer: 0, unit: "", referenceAnswer: "ready", keyPoints: [], explanation: "", sources: ["C1"], ...o,
});
const ctx = () => ({
  topicKeys: new Map([["T1", "t1"]]),
  excerpts: new Map([["C1", { ref: "C1", chunkId: "x", topicId: "t1", text: "..." }]]),
  seen: new Set([stemHash("An old question about the dispatcher")]),
  batch: new Set<string>(),
});

describe("checkCandidate", () => {
  it("accepts a well-formed MCQ", () => assert.equal(checkCandidate(q({}), ctx()), null));
  it("rejects repeats (seen before or within the quiz)", () => {
    assert.match(checkCandidate(q({ stem: "An old question about the dispatcher?" }), ctx())!, /repeat/);
    const c = ctx();
    c.batch.add(stemHash(q({}).stem));
    assert.match(checkCandidate(q({}), c)!, /duplicate/);
  });
  it("rejects invented citations, unknown topics and malformed answers", () => {
    assert.match(checkCandidate(q({ sources: ["C9", "page 3"] }), ctx())!, /no real excerpt/);
    const other = ctx();
    other.excerpts.set("C2", { ref: "C2", chunkId: "y", topicId: "t2", text: "..." });
    assert.match(checkCandidate(q({ sources: ["C2"] }), other)!, /no excerpt of its own topic/);
    assert.equal(checkCandidate(q({ sources: ["C2", "C1"] }), other), null, "a foreign citation is dropped, not fatal");
    assert.deepEqual(ownRefs(q({ sources: ["c2", "C1", "C1"] }), other), ["C1"]);
    assert.match(checkCandidate(q({ topic: "T7" }), ctx())!, /unknown topic/);
    assert.match(checkCandidate(q({ options: ["a", "a", "b", "c"] }), ctx())!, /4 distinct/);
    assert.match(checkCandidate(q({ correctOption: 4 }), ctx())!, /out of range/);
    assert.match(checkCandidate(q({ type: "NUMERIC", numericAnswer: Number.NaN }), ctx())!, /not a number/);
    assert.match(checkCandidate(q({ type: "SHORT", keyPoints: [] }), ctx())!, /key points/);
  });
});

describe("verifierAgrees (blind check)", () => {
  const v = (o: object) => ({ id: "Q1", answerable: true, option: -1, value: 0, referenceCorrect: false, ...o });
  it("MCQ: same option only", () => {
    assert.equal(verifierAgrees({ type: "MCQ", correctOption: 2, numericAnswer: 0 }, v({ option: 2 })), true);
    assert.equal(verifierAgrees({ type: "MCQ", correctOption: 2, numericAnswer: 0 }, v({ option: 1 })), false);
  });
  it("NUMERIC: within 1%", () => {
    assert.equal(verifierAgrees({ type: "NUMERIC", correctOption: -1, numericAnswer: 7.75 }, v({ value: 7.8 })), true);
    assert.equal(verifierAgrees({ type: "NUMERIC", correctOption: -1, numericAnswer: 7.75 }, v({ value: 7.9 })), false);
    assert.equal(verifierAgrees({ type: "NUMERIC", correctOption: -1, numericAnswer: 0 }, v({ value: 0 })), true);
  });
  it("SHORT: reference judged correct; anything not answerable is rejected", () => {
    assert.equal(verifierAgrees({ type: "SHORT", correctOption: -1, numericAnswer: 0 }, v({ referenceCorrect: true })), true);
    assert.equal(verifierAgrees({ type: "MCQ", correctOption: 1, numericAnswer: 0 }, v({ option: 1, answerable: false })), false);
  });
  it("type mix per slot covers all three types", () => assert.deepEqual(new Set([0, 1, 2, 3].map(preferredType)), new Set(["MCQ", "SHORT", "NUMERIC"])));
});
