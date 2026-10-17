// Contract v1.1: path builders ↔ registry, registry status ↔ route files,
// mock-data consistency, and the rules added in v1.1. Run: npm run test
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  API_ERROR_STATUS, ApiErrorCode, AttemptResult, LearnerQuery, MAX_UPLOAD_BYTES, NON_JSON_ROUTES, UploadQuery,
  endpoints, masteryBand, paths, sourceTypeFromFilename, type EndpointName,
} from "../src/index";
import { mocks } from "../src/mocks";
import { bad, ok } from "./helpers";

describe("paths agree with the registry", () => {
  // One example URL per endpoint, built only with `paths`.
  const examples: Record<EndpointName, string> = {
    health: paths.health({ gemini: true }),
    listLearners: paths.learners(),
    createLearner: paths.learners(),
    signup: paths.signup(),
    login: paths.login(),
    logout: paths.logout(),
    session: paths.session(),
    getProfile: paths.profile(),
    listNotebooks: paths.notebooks(),
    listFlashcards: paths.flashcards("t-1"),
    generateFlashcards: paths.generateFlashcards(),
    reviewFlashcard: paths.reviewFlashcard("fc-1"),
    createNotebook: paths.notebooks(),
    selectNotebook: paths.activeNotebook(),
    deleteNotebook: paths.notebook("nb-1"),
    saveProfile: paths.profile(),
    listSources: paths.sources(),
    uploadSource: paths.uploadSource("Galvin – Ch5 (CPU).pdf"),
    deleteSource: paths.source("src/1"),
    ingestSource: paths.ingestSource("src-1"),
    search: paths.search(),
    buildCourse: paths.build(),
    listTopics: paths.topics("pptx-vm"),
    chat: paths.chat(),
    chatHistory: paths.chatHistory("demo learner"),
    evalAnswer: paths.evalAnswer(),
    evalReport: paths.evalReport(),
    createQuiz: paths.quizzes(),
    getQuiz: paths.quiz("asmt-1"),
    submitQuiz: paths.submitQuiz("asmt-1"),
    getReport: paths.report("asmt-1"),
    mastery: paths.mastery("demo-learner"),
  };
  const toRegex = (pattern: string) => new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+")}$`);
  for (const name of Object.keys(endpoints) as EndpointName[]) {
    it(`${name}: URL matches ${endpoints[name].path} and its query schema`, () => {
      const url = new URL(examples[name], "http://x");
      assert.match(url.pathname, toRegex(endpoints[name].path));
      const query = Object.fromEntries(url.searchParams);
      const schema = endpoints[name].query;
      if (schema) ok(schema, query);
      else assert.deepEqual(query, {}, "endpoint takes no query string");
    });
  }
  it("ids and query values are encoded", () => {
    assert.equal(paths.source("src/1"), "/api/sources/src%2F1");
    assert.equal(new URL(paths.uploadSource("Galvin – Ch5 (CPU).pdf"), "http://x").searchParams.get("filename"), "Galvin – Ch5 (CPU).pdf");
    assert.equal(new URL(paths.chatHistory("demo learner"), "http://x").searchParams.get("learnerId"), "demo learner");
  });
});

describe("registry status matches the route files in apps/web/app/api", () => {
  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/app/api");
  const routeFiles: { pattern: string; methods: Set<string> }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!entry.startsWith("_")) walk(full); // _private folders are not routes
      } else if (entry === "route.ts") {
        const src = readFileSync(full, "utf8");
        const exported = src.matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g);
        const rel = path.relative(apiDir, dir).split(path.sep).filter(Boolean);
        routeFiles.push({ pattern: ["/api", ...rel].join("/"), methods: new Set([...exported].map((m) => m[1])) });
      }
    }
  };
  walk(apiDir);
  const fileFor = (pattern: string) => routeFiles.find((r) => r.pattern === pattern);

  it("found the route directory", () => assert.ok(existsSync(apiDir) && routeFiles.length > 0));
  for (const name of Object.keys(endpoints) as EndpointName[]) {
    const e = endpoints[name];
    it(`${name} (${e.method} ${e.path}) is ${e.status}`, () => {
      const exported = fileFor(e.path)?.methods.has(e.method) ?? false;
      assert.equal(
        exported,
        e.status === "live",
        e.status === "live" ? "live endpoint must be exported by its route file" : "route exists: mark the endpoint live",
      );
    });
  }
  it("non-JSON routes exist", () => {
    for (const r of Object.values(NON_JSON_ROUTES)) for (const m of r.methods) assert.ok(fileFor(r.path)?.methods.has(m), `${m} ${r.path}`);
  });
  it("every exported route method is registered (no undocumented routes)", () => {
    const registered = new Set([
      ...Object.values(endpoints).map((e) => `${e.method} ${e.path}`),
      ...Object.values(NON_JSON_ROUTES).flatMap((r) => r.methods.map((m) => `${m} ${r.path}`)),
    ]);
    for (const r of routeFiles) for (const m of r.methods) assert.ok(registered.has(`${m} ${r.pattern}`), `unregistered: ${m} ${r.pattern}`);
  });
});

describe("mock consistency (timeline, mastery, report, chat)", () => {
  const m = mocks.mastery;
  it("per topic: n = number of events, events chain from the 0.3 prior, p = last after", () => {
    for (const t of m.topics) {
      const evs = m.history.filter((h) => h.topicId === t.topicId);
      assert.equal(t.n, evs.length, t.topicId);
      let prev = 0.3;
      for (const e of evs) {
        assert.equal(e.before, prev, `${t.topicId} chain`);
        prev = e.after;
      }
      assert.equal(t.p, prev, t.topicId);
    }
  });
  it("history is oldest first", () => {
    const times = m.history.map((h) => Date.parse(h.at));
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });
  it("weakTopics = the topics in the weak band", () => {
    const weak = m.topics.filter((t) => masteryBand(t.p) === "weak").map((t) => t.topicId).sort();
    assert.deepEqual(m.weakTopics.map((w) => w.topicId).sort(), weak);
  });
  it("chat masteryUpdates appear in history as CHAT events", () => {
    for (const u of mocks.chat.masteryUpdates) {
      assert.ok(m.history.some((h) => h.source === "CHAT" && h.topicId === u.topicId && h.before === u.before && h.after === u.after));
    }
  });
  it("report: score and per-topic counts match attempts; mastery before/after match one event per answer", () => {
    const r = mocks.submitQuiz;
    assert.equal(r.score.total, r.attempts.length);
    assert.equal(r.score.correct, r.attempts.filter((a) => a.correct).length);
    for (const t of r.perTopic) {
      const atts = r.attempts.filter((a) => a.topicId === t.topicId);
      assert.equal(t.total, atts.length);
      assert.equal(t.correct, atts.filter((a) => a.correct).length);
      const evs = m.history.filter((h) => h.topicId === t.topicId && h.at === r.submittedAt);
      assert.equal(evs.length, atts.length, "one event per answer");
      assert.equal(t.masteryBefore, evs[0].before);
      assert.equal(t.masteryAfter, evs.at(-1)!.after);
    }
  });
  it("report attempts carry the quiz's MCQ options", () => {
    for (const a of mocks.submitQuiz.attempts) {
      const q = mocks.getQuiz.questions.find((x) => x.id === a.questionId)!;
      assert.equal(q.type, a.type);
      assert.deepEqual(a.options, q.type === "MCQ" ? q.options : null);
    }
  });
});

describe("v1.1 schema rules", () => {
  const [mcq, numeric] = mocks.submitQuiz.attempts;
  it("AttemptResult: MCQ needs options; other types must have null", () => {
    bad(AttemptResult, { ...mcq, options: null });
    bad(AttemptResult, { ...numeric, options: ["a", "b"] });
  });
  it("AttemptResult: response type must match the question type", () =>
    bad(AttemptResult, { ...mcq, response: { type: "NUMERIC", value: 1 } }));
  it("sourceTypeFromFilename", () => {
    assert.equal(sourceTypeFromFilename("Lecture 5.PDF"), "PDF");
    assert.equal(sourceTypeFromFilename("deck.pptx"), "PPTX");
    assert.equal(sourceTypeFromFilename("lec.mp4"), "VIDEO");
    assert.equal(sourceTypeFromFilename("deck.ppt"), null);
    assert.equal(sourceTypeFromFilename("notes.docx"), null);
    assert.equal(sourceTypeFromFilename("noext"), null);
    assert.equal(sourceTypeFromFilename("archive.pdf.zip"), null);
  });
  it("query schemas reject blanks", () => {
    bad(LearnerQuery, { learnerId: "" });
    bad(UploadQuery, { filename: "   " });
    ok(UploadQuery, { filename: "a.pdf" });
  });
  it("every error code has an HTTP status", () => {
    for (const code of ApiErrorCode.options) assert.ok(API_ERROR_STATUS[code] >= 400, code);
  });
  it("upload cap is 500 MiB", () => assert.equal(MAX_UPLOAD_BYTES, 500 * 1024 * 1024));
});
