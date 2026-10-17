// Contract tests: mocks match schemas, grounding/safety rules are enforced,
// helpers behave, and enums stay in sync with Prisma. Run: npm run test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import prismaClient from "@prisma/client";
import { z } from "zod";
import {
  AssessmentKind, AssessmentStatus, ChatRole, ChunkKind, Citation, Coverage, CreateQuizRequest,
  MasterySource, QuestionType, QuizQuestion, SourceStatus, SourceType, SubmitRequest, TestSet, TopicMastery,
  TutorAnswer, TutorBlock, citationHref, endpoints, formatLocator, formatTime, masteryBand, testSetGaps,
  type EndpointName,
} from "../src/index";
import { citations, mocks, mockStates } from "../src/mocks";

const ok = (schema: z.ZodType, v: unknown) => {
  const r = schema.safeParse(v);
  assert.ok(r.success, r.success ? "" : z.prettifyError(r.error));
};
const bad = (schema: z.ZodType, v: unknown) => assert.equal(schema.safeParse(v).success, false);

describe("mocks", () => {
  for (const name of Object.keys(endpoints) as EndpointName[]) {
    it(`${name} mock matches its response schema`, () => ok(endpoints[name].response, mocks[name]));
  }
  it("extra UI-state mocks are valid", () => {
    ok(endpoints.chat.response, mockStates.refusedAnswer);
    ok(endpoints.mastery.response, mockStates.newLearnerMastery);
    ok(endpoints.listSources.response, [mockStates.failedSource]);
  });
  it("every endpoint has a mock and nothing extra", () => {
    assert.deepEqual(Object.keys(mocks).sort(), Object.keys(endpoints).sort());
  });
});

describe("requests", () => {
  it("valid requests parse", () => {
    ok(endpoints.chat.request, { learnerId: "demo-learner", message: "What is a time quantum?" });
    ok(endpoints.createQuiz.request, { learnerId: "demo-learner", kind: "DIAGNOSTIC" });
    ok(endpoints.createQuiz.request, { learnerId: "demo-learner", kind: "QUIZ", topicIds: ["t-rr"], count: 5 });
    ok(endpoints.submitQuiz.request, { responses: [{ questionId: "q-1", response: { type: "MCQ", index: 1 } }, { questionId: "q-2", response: { type: "NUMERIC", value: 30 } }] });
    ok(endpoints.createLearner.request, { name: "Asha" });
    ok(endpoints.evalAnswer.request, { question: "What is FCFS?" });
  });
  it("QUIZ without topicIds is rejected", () => bad(CreateQuizRequest, { learnerId: "l", kind: "QUIZ" }));
  it("empty / whitespace chat message is rejected", () => bad(endpoints.chat.request, { learnerId: "l", message: "   " }));
  it("duplicate questionIds in a submission are rejected", () =>
    bad(SubmitRequest, { responses: [{ questionId: "q", response: { type: "MCQ", index: 0 } }, { questionId: "q", response: { type: "MCQ", index: 1 } }] }));
  it("response without its type-specific field is rejected", () =>
    bad(SubmitRequest, { responses: [{ questionId: "q", response: { type: "NUMERIC" } }] }));
});

describe("citations: exactly one locator per source type", () => {
  const base = { chunkId: "c", sourceId: "s", filename: "f", kind: "TEXT", title: null, excerpt: "x" };
  it("PDF needs page", () => bad(Citation, { ...base, sourceType: "PDF" }));
  it("PPTX needs slide (page is not enough)", () => bad(Citation, { ...base, sourceType: "PPTX", page: 3 }));
  it("VIDEO tEnd before tStart is rejected", () => bad(Citation, { ...base, sourceType: "VIDEO", tStart: 50, tEnd: 10 }));
  it("page must be a positive integer", () => bad(Citation, { ...base, sourceType: "PDF", page: 0 }));
  it("empty excerpt is rejected", () => bad(Citation, { ...base, sourceType: "PDF", page: 1, excerpt: "" }));
});

describe("grounding rules", () => {
  it("material block without citations is rejected", () => bad(TutorBlock, { origin: "material", text: "x", citations: [] }));
  it("outside block with citations is rejected", () => bad(TutorBlock, { origin: "outside", text: "x", citations: [citations.rrSlide] }));
  const answer = mocks.chat;
  it("refused answer cannot contain material blocks", () =>
    bad(TutorAnswer, { ...answer, refused: true, refusalReason: "off_material" }));
  it("NOT_COVERED must be refused", () => bad(TutorAnswer, { ...answer, coverage: "NOT_COVERED" }));
  it("refusalReason must match refused", () => bad(TutorAnswer, { ...answer, refusalReason: "not_covered" }));
  it("non-refused answer needs blocks", () => bad(TutorAnswer, { ...answer, blocks: [] }));
});

describe("quiz safety", () => {
  it("client question never leaks answer / explanation / misconceptions", () => {
    const dbRow = {
      id: "q", position: 0, topicId: "t", topicName: "T", difficulty: 2, type: "MCQ", stem: "?",
      options: ["a", "b"], answer: { index: 1 }, explanation: "because", distractorMisconceptions: { "0": "m" },
      verified: true, verifierAnswer: { index: 1 }, sourceChunkIds: ["c"], stemHash: "h",
    };
    const parsed = QuizQuestion.parse(dbRow) as Record<string, unknown>;
    for (const k of ["answer", "explanation", "distractorMisconceptions", "verifierAnswer", "sourceChunkIds", "stemHash", "verified"]) {
      assert.equal(k in parsed, false, `${k} leaked`);
    }
  });
  it("MCQ needs ≥ 2 options", () => bad(QuizQuestion, { id: "q", position: 0, topicId: "t", topicName: "T", difficulty: 1, type: "MCQ", stem: "?", options: ["only"] }));
  it("difficulty outside 1–3 is rejected", () => bad(QuizQuestion, { id: "q", position: 0, topicId: "t", topicName: "T", difficulty: 4, type: "SHORT", stem: "?" }));
});

describe("mastery bands", () => {
  it("thresholds: <0.4 weak, 0.4–0.7 developing, >0.7 strong", () => {
    assert.equal(masteryBand(0.39), "weak");
    assert.equal(masteryBand(0.4), "developing");
    assert.equal(masteryBand(0.7), "developing");
    assert.equal(masteryBand(0.71), "strong");
  });
  it("band inconsistent with p is rejected", () =>
    bad(TopicMastery, { ...mocks.mastery.topics[0], p: 0.2, band: "strong" }));
});

describe("helpers", () => {
  it("formatTime", () => {
    assert.equal(formatTime(0), "0:00");
    assert.equal(formatTime(75.4), "1:15");
    assert.equal(formatTime(3725), "1:02:05");
  });
  it("formatLocator", () => {
    assert.equal(formatLocator(citations.fcfsGantt), "p. 7");
    assert.equal(formatLocator(citations.rrSlide), "slide 9");
    assert.equal(formatLocator(citations.rrVideo), "12:34–13:32");
  });
  it("citationHref opens PDF at page and seeks video", () => {
    assert.equal(citationHref(citations.fcfsGantt), "/api/files/src-pdf#page=7");
    assert.equal(citationHref(citations.rrVideo), "/api/files/src-video#t=754");
    assert.equal(citationHref(citations.rrSlide), "/api/files/src-pptx");
  });
});

describe("eval test set", () => {
  const item = (id: string, modality: string, extra: object = {}) => ({ id, question: "q", modality, needsFigure: false, groundTruth: "a", expected: [], ...extra });
  const pdfLoc = [{ sourceType: "PDF", filename: "ch5.pdf", page: 7 }];
  it("answerable item needs an expected location", () => bad(TestSet, [item("a", "pdf")]));
  it("off_material item must not have locations", () => bad(TestSet, [item("a", "off_material", { expected: pdfLoc })]));
  it("duplicate ids rejected", () => bad(TestSet, [item("a", "off_material"), item("a", "off_material")]));
  it("composition gaps are reported", () => {
    const set = TestSet.parse([item("a", "pdf", { expected: pdfLoc, needsFigure: true }), item("b", "off_material")]);
    assert.deepEqual(testSetGaps(set), ["pdf: 1/5", "pptx: 0/5", "video: 0/5", "off_material: 1/5", "needsFigure: 1/2"]);
  });
});

describe("enums match the Prisma schema", () => {
  const { $Enums } = prismaClient;
  const pairs: [string, z.ZodEnum, Record<string, string>][] = [
    ["SourceType", SourceType, $Enums.SourceType], ["SourceStatus", SourceStatus, $Enums.SourceStatus],
    ["ChunkKind", ChunkKind, $Enums.ChunkKind], ["QuestionType", QuestionType, $Enums.QuestionType],
    ["AssessmentKind", AssessmentKind, $Enums.AssessmentKind], ["AssessmentStatus", AssessmentStatus, $Enums.AssessmentStatus],
    ["MasterySource", MasterySource, $Enums.MasterySource], ["ChatRole", ChatRole, $Enums.ChatRole], ["Coverage", Coverage, $Enums.Coverage],
  ];
  for (const [name, zEnum, prismaEnum] of pairs) {
    it(name, () => assert.deepEqual([...zEnum.options].sort(), Object.values(prismaEnum).sort()));
  }
});
