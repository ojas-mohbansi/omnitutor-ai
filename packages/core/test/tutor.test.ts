// Module 10: grounding guards + prompt input (pure; no Gemini, no DB).
// The real tutor is checked against the test sets by `npm run stage1:tutor`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TutorAnswer, type Citation } from "@sc/schemas";
import { SMALL_TALK, groundAnswer, refusalTau, tutorInput, type TutorModelOutput } from "../src/tutor";
import type { RetrievedChunk } from "../src/retrieve";

const cit = (n: number): Citation => ({ chunkId: `c${n}`, sourceId: "s", filename: "notes.pdf", kind: "TEXT", title: null, excerpt: `excerpt ${n}`, sourceType: "PDF", page: n });
const retrieved = [cit(1), cit(2), cit(3)];
const out = (o: Partial<TutorModelOutput>): TutorModelOutput => ({ coverage: "SUPPORTED", blocks: [], learnerEvidence: [], ...o });
const NOTE = "Not covered.";
const valid = (g: ReturnType<typeof groundAnswer>) => TutorAnswer.parse({ messageId: "m", ...g, masteryUpdates: [] });

describe("groundAnswer (server-side guards)", () => {
  it("keeps cited material, maps C-ids to the retrieved citations, de-duplicates", () => {
    const g = groundAnswer(out({ blocks: [{ origin: "material", text: "From the notes.", citations: ["C2", "c2", "C1"] }] }), retrieved, NOTE);
    assert.equal(g.refused, false);
    assert.deepEqual(g.blocks[0].citations.map((c) => c.chunkId), ["c2", "c1"]);
    valid(g);
  });
  it("drops citations that were not retrieved; a material block left uncited becomes outside", () => {
    const g = groundAnswer(
      out({ blocks: [{ origin: "material", text: "Real.", citations: ["C3", "C9"] }, { origin: "material", text: "Invented source.", citations: ["C7", "page 4"] }] }),
      retrieved, NOTE,
    );
    assert.deepEqual(g.blocks.map((b) => [b.origin, b.citations.length]), [["material", 1], ["outside", 0]]);
    assert.deepEqual([g.droppedCitations, g.relabelled], [3, 1]);
    valid(g);
  });
  it("outside blocks never carry citations; empty blocks are dropped", () => {
    const g = groundAnswer(out({ blocks: [{ origin: "material", text: "A", citations: ["C1"] }, { origin: "outside", text: "Background", citations: ["C2"] }, { origin: "outside", text: "  ", citations: [] }] }), retrieved, NOTE);
    assert.deepEqual(g.blocks.map((b) => [b.origin, b.citations.length]), [["material", 1], ["outside", 0]]);
  });
  it("NOT_COVERED → refused (not_covered): refusal note first, material removed, outside kept as flagged", () => {
    const g = groundAnswer(out({ coverage: "NOT_COVERED", blocks: [{ origin: "material", text: "Sneaky", citations: ["C1"] }, { origin: "outside", text: "General idea", citations: [] }] }), retrieved, NOTE);
    assert.deepEqual([g.refused, g.refusalReason, g.coverage], [true, "not_covered", "NOT_COVERED"]);
    assert.deepEqual(g.blocks.map((b) => [b.origin, b.text]), [["outside", NOTE], ["outside", "General idea"]]);
    valid(g);
  });
  it("SUPPORTED but nothing actually cited → refused (the model can't claim support without evidence)", () => {
    const g = groundAnswer(out({ coverage: "SUPPORTED", blocks: [{ origin: "material", text: "Trust me", citations: [] }] }), retrieved, NOTE);
    assert.equal(g.refused, true);
    valid(g);
  });
  it("PARTIAL with material stays an answer", () => {
    const g = groundAnswer(out({ coverage: "PARTIAL", blocks: [{ origin: "material", text: "Part", citations: ["C1"] }, { origin: "outside", text: "Rest", citations: [] }] }), retrieved, NOTE);
    assert.deepEqual([g.refused, g.coverage], [false, "PARTIAL"]);
    valid(g);
  });
});

describe("tutorInput / refusalTau", () => {
  const chunk = (o: Partial<RetrievedChunk>): RetrievedChunk => ({
    chunkId: "x", sourceId: "s", sourceType: "PDF", filename: "notes.pdf", kind: "TEXT", title: "Dispatcher", content: "Gives the CPU.", page: 6, slide: null, tStart: null, tEnd: null, topicId: "t2", score: 0.8, ...o,
  });
  it("numbers excerpts C1.., shows locators, topic keys, mastery and weak prerequisites", () => {
    const text = tutorInput({
      question: "What does it do?",
      chunks: [chunk({}), chunk({ sourceType: "VIDEO", filename: "lec.mp4", page: null, tStart: 46.5, tEnd: 74.8, title: null, topicId: null })],
      topics: [
        { id: "t1", key: "T1", name: "Basics", prereqIds: [], p: 0.2, n: 3 },
        { id: "t2", key: "T2", name: "Dispatcher", prereqIds: ["t1"], p: 0.5, n: 1 },
      ],
      history: [{ role: "USER", content: "earlier question" }],
    });
    assert.match(text, /T1: Basics \(mastery 0\.20, weak\)\nT2: Dispatcher \(mastery 0\.50, developing\); prerequisites T1/);
    assert.match(text, /Weak prerequisites for this question: T1 Basics/);
    assert.match(text, /\[C1\] notes\.pdf, page 6 · topic T2 · Dispatcher\nGives the CPU\./);
    assert.match(text, /\[C2\] lec\.mp4, 47–75 s\n/);
    assert.match(text, /Student: earlier question/);
    assert.match(text, /Student's question: What does it do\?$/);
  });
  it("REFUSAL_TAU from env, with a safe default", () => {
    assert.equal(refusalTau({ REFUSAL_TAU: "0.62" }), 0.62);
    assert.equal(refusalTau({ REFUSAL_TAU: "abc" }), 0.6);
    assert.equal(refusalTau({}), 0.6);
  });
});

describe("SMALL_TALK", () => {
  it("whole-message greetings/thanks only; anything with a question goes to the tutor", () => {
    for (const t of ["hello", "Hi!", "thanks", "thank you so much", "ok", "good morning"]) assert.ok(SMALL_TALK.test(t), t);
    for (const t of ["hello, what is a dispatcher?", "hi explain round robin", "okay so why does it go to ready?"]) assert.ok(!SMALL_TALK.test(t), t);
  });
});
