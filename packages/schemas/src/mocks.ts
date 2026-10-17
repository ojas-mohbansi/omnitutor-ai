// Realistic mock responses for every endpoint, for building UI before the backend
// module lands. Import from "@sc/schemas/mocks". A test validates all of them.
import type { ApiErrorBody } from "./common";
import type { Citation } from "./citation";
import type { EndpointName, EndpointResponse } from "./endpoints";
import type { TutorAnswer } from "./tutor";

const T0 = "2026-10-14T09:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

// ── Shared fixtures (OS CPU scheduling demo course) ──

const topicRows = [
  { id: "t-proc", seq: 0, name: "Processes & CPU–I/O bursts", description: "Process states and the alternating CPU/I-O burst cycle that scheduling exploits.", prereqIds: [], chunkCount: 14 },
  { id: "t-crit", seq: 1, name: "Scheduling criteria", description: "CPU utilisation, throughput, turnaround, waiting and response time.", prereqIds: ["t-proc"], chunkCount: 11 },
  { id: "t-fcfs", seq: 2, name: "FCFS scheduling", description: "First-come first-served; the convoy effect.", prereqIds: ["t-crit"], chunkCount: 9 },
  { id: "t-sjf", seq: 3, name: "SJF & SRTF", description: "Shortest-job-first, its preemptive form, and burst prediction.", prereqIds: ["t-fcfs"], chunkCount: 12 },
  { id: "t-rr", seq: 4, name: "Round Robin", description: "Time-sliced scheduling; choosing the time quantum.", prereqIds: ["t-fcfs"], chunkCount: 10 },
  { id: "t-prio", seq: 5, name: "Priority & multilevel queues", description: "Priority scheduling, starvation, aging, multilevel feedback queues.", prereqIds: ["t-sjf", "t-rr"], chunkCount: 13 },
];

const PDF = { sourceId: "src-pdf", filename: "Galvin_Ch5_CPU_Scheduling.pdf", sourceType: "PDF" } as const;
const PPTX = { sourceId: "src-pptx", filename: "CPU_Scheduling_Lecture.pptx", sourceType: "PPTX" } as const;
const VIDEO = { sourceId: "src-video", filename: "NPTEL_OS_Lec12_Scheduling.mp4", sourceType: "VIDEO" } as const;

export const citations = {
  fcfsText: { ...PDF, chunkId: "c-pdf-6-0", kind: "TEXT", title: null, page: 6, excerpt: "With FCFS, the process that requests the CPU first is allocated the CPU first. The implementation is easily managed with a FIFO queue." },
  fcfsGantt: { ...PDF, chunkId: "c-pdf-7-1", kind: "FIGURE", title: "Figure 5.4 Gantt chart for FCFS", page: 7, excerpt: "Gantt chart: P1 runs 0–24 ms, P2 runs 24–27 ms, P3 runs 27–30 ms. Waiting times 0, 24, 27 ms; average 17 ms." },
  sjfText: { ...PDF, chunkId: "c-pdf-9-0", kind: "TEXT", title: null, page: 9, excerpt: "SJF associates with each process the length of its next CPU burst and schedules the process with the smallest next burst." },
  rrSlide: { ...PPTX, chunkId: "c-pptx-9", kind: "SLIDE", title: "Round Robin: the time quantum", slide: 9, excerpt: "Each process gets a small unit of CPU time (time quantum q), usually 10–100 ms. After q expires, the process is preempted and added to the end of the ready queue." },
  rrVideo: { ...VIDEO, chunkId: "c-video-14", kind: "TRANSCRIPT", title: null, tStart: 754, tEnd: 812.5, excerpt: "If the quantum is very large, round robin degenerates into FCFS. If it is very small, context-switch overhead dominates." },
} satisfies Record<string, Citation>;

const conceptsOf: Record<string, { label: string; chunkCount: number; citations: Citation[] }[]> = {
  "t-fcfs": [{ label: "convoy effect", chunkCount: 3, citations: [citations.fcfsText] }, { label: "Gantt chart", chunkCount: 2, citations: [citations.fcfsGantt] }],
  "t-sjf": [{ label: "shortest next CPU burst", chunkCount: 4, citations: [citations.sjfText] }],
  "t-rr": [{ label: "time quantum", chunkCount: 5, citations: [citations.rrSlide] }],
};
const topics = topicRows.map((t) => ({ ...t, concepts: conceptsOf[t.id] ?? [] }));

const tutorAnswer = {
  messageId: "msg-2",
  coverage: "SUPPORTED",
  refused: false,
  refusalReason: null,
  blocks: [
    { origin: "material", text: "In Round Robin, each process runs for at most one time quantum q before it is preempted and moved to the back of the ready queue.", citations: [citations.rrSlide] },
    { origin: "material", text: "If q is very large, RR behaves like FCFS; if it is very small, context-switch overhead dominates.", citations: [citations.rrVideo] },
    { origin: "outside", text: "In practice, Linux's CFS scheduler doesn't use a fixed quantum at all; it derives time slices from a target latency.", citations: [] },
  ],
  masteryUpdates: [{ topicId: "t-rr", topicName: "Round Robin", before: 0.67, after: 0.74, source: "CHAT" }],
} satisfies TutorAnswer;

// Learner timeline. Values follow the planned BKT parameters (rounded to 2 dp):
// diagnostic at 09:06 (1 MCQ per topic) → tutor chat about RR at 09:10 → quiz asmt-1 at 09:30.
// One MasteryEvent per answered question / chat turn; n = number of events.
type Ev = { topicId: string; at: string; before: number; after: number; source: "QUIZ" | "CHAT" };
const ev = (topicId: string, min: number, before: number, after: number, source: Ev["source"]): Ev => ({ topicId, at: at(min), before, after, source });
const history: Ev[] = [
  ev("t-proc", 6, 0.3, 0.67, "QUIZ"), ev("t-crit", 6, 0.3, 0.67, "QUIZ"), ev("t-fcfs", 6, 0.3, 0.67, "QUIZ"),
  ev("t-sjf", 6, 0.3, 0.2, "QUIZ"), ev("t-rr", 6, 0.3, 0.67, "QUIZ"), ev("t-prio", 6, 0.3, 0.2, "QUIZ"),
  ev("t-rr", 10.2, 0.67, 0.74, "CHAT"),
  ev("t-fcfs", 30, 0.67, 0.9, "QUIZ"), ev("t-rr", 30, 0.74, 0.35, "QUIZ"), ev("t-rr", 30, 0.35, 0.85, "QUIZ"),
];

const report: EndpointResponse<"submitQuiz"> = {
  assessmentId: "asmt-1",
  kind: "QUIZ",
  submittedAt: at(30),
  score: { correct: 2, total: 3 },
  perTopic: [
    { topicId: "t-fcfs", topicName: "FCFS scheduling", correct: 1, total: 1, masteryBefore: 0.67, masteryAfter: 0.9 },
    { topicId: "t-rr", topicName: "Round Robin", correct: 1, total: 2, masteryBefore: 0.74, masteryAfter: 0.85 },
  ],
  misconceptions: [{ label: "Confuses waiting time with turnaround time", topicId: "t-rr", topicName: "Round Robin", count: 1 }],
  revisit: [citations.rrSlide, citations.rrVideo],
  attempts: [
    {
      questionId: "q-1", position: 0, topicId: "t-fcfs", type: "MCQ",
      stem: "P1, P2, P3 arrive at t=0 with bursts 24, 3, 3 ms. What is the average waiting time under FCFS?",
      options: ["10 ms", "17 ms", "24 ms", "27 ms"],
      response: { type: "MCQ", index: 1 }, correct: true, score: 1, correctAnswer: "17 ms",
      feedback: { text: "Correct. Waiting times are 0, 24 and 27 ms, so the average is 17 ms.", citations: [citations.fcfsGantt] },
      misconception: null,
    },
    {
      questionId: "q-2", position: 1, topicId: "t-rr", type: "NUMERIC",
      stem: "Same processes under Round Robin with q = 4 ms. What is P1's turnaround time (ms)?",
      options: null,
      response: { type: "NUMERIC", value: 6 }, correct: false, score: 0, correctAnswer: "30 ms",
      feedback: { text: "P1 finishes last, at t = 30 ms, so its turnaround time is 30 ms. 6 ms is its waiting time.", citations: [citations.rrSlide] },
      misconception: "Confuses waiting time with turnaround time",
    },
    {
      questionId: "q-3", position: 2, topicId: "t-rr", type: "SHORT",
      stem: "Why does a very large time quantum make Round Robin behave like FCFS?",
      options: null,
      response: { type: "SHORT", text: "Because every process finishes its burst before the quantum ends, so nobody is preempted." },
      correct: true, score: 0.75, correctAnswer: "With q larger than every burst, no process is ever preempted, so processes run to completion in arrival order, which is exactly FCFS.",
      feedback: { text: "Good. To be complete, also say that the order is then the arrival order.", citations: [citations.rrVideo] },
      misconception: null,
    },
  ],
};

const quiz: EndpointResponse<"createQuiz"> = {
  assessmentId: "asmt-1",
  kind: "QUIZ",
  createdAt: at(20),
  questions: [
    { id: "q-1", position: 0, topicId: "t-fcfs", topicName: "FCFS scheduling", difficulty: 1, type: "MCQ", stem: report.attempts[0].stem, options: report.attempts[0].options ?? [] },
    { id: "q-2", position: 1, topicId: "t-rr", topicName: "Round Robin", difficulty: 2, type: "NUMERIC", stem: report.attempts[1].stem, unit: "ms" },
    { id: "q-3", position: 2, topicId: "t-rr", topicName: "Round Robin", difficulty: 2, type: "SHORT", stem: report.attempts[2].stem },
  ],
};

/** Current mastery from the timeline: p = last "after" (prior 0.3 if none), n = event count. */
const masteryOf = (topicId: string): [number, number] => {
  const evs = history.filter((e) => e.topicId === topicId);
  return [evs.at(-1)?.after ?? 0.3, evs.length];
};
const band = (p: number) => (p < 0.4 ? "weak" : p > 0.7 ? "strong" : "developing") as "weak" | "developing" | "strong";

// ── Mocks per endpoint ──

export const mocks = {
  health: {
    ok: true,
    db: { ok: true, latencyMs: 2 },
    env: { DATABASE_URL: true, APP_GEMINI_API_KEY: true, LLM_MODEL_FAST: true, LLM_MODEL_STRONG: true, EMBED_MODEL: true, REFUSAL_TAU: true },
    usage: {
      day: "2026-10-14",
      generate: { requests: 12, inputTokens: 14_210, requestsPerDay: 450, requestsPerMinute: 12 },
      embed: { requests: 31, inputTokens: 2_480, requestsPerDay: 900, requestsPerMinute: 80 },
    },
  },
  listSources: [
    { id: "src-pdf", type: "PDF", filename: PDF.filename, status: "READY", error: null, progressDone: 28, progressTotal: 28, chunkCount: 61, createdAt: at(0) },
    { id: "src-pptx", type: "PPTX", filename: PPTX.filename, status: "READY", error: null, progressDone: 4, progressTotal: 4, chunkCount: 20, createdAt: at(1) },
    { id: "src-video", type: "VIDEO", filename: VIDEO.filename, status: "PROCESSING", error: null, progressDone: 0, progressTotal: 1, chunkCount: 0, createdAt: at(2) },
  ],
  uploadSource: { id: "src-video", status: "PROCESSING" },
  deleteSource: { id: "src-bad" },
  ingestSource: { id: "src-pdf", status: "PROCESSING" },
  search: { topScore: 0.81, candidates: 26, results: [{ score: 0.81, citation: citations.rrSlide }, { score: 0.74, citation: citations.rrVideo }] },
  listLearners: [
    { id: "demo-learner", name: "Demo Learner", createdAt: T0 },
    { id: "learner-asha", name: "Asha", createdAt: at(5) },
  ],
  createLearner: { id: "learner-asha", name: "Asha", createdAt: at(5) },
  signup: { id: "learner-asha", name: "Asha", createdAt: at(5) },
  login: { id: "learner-asha", name: "Asha", createdAt: at(5) },
  logout: { learner: null },
  session: { learner: { id: "learner-asha", name: "Asha", createdAt: at(5) } },
  listNotebooks: { notebooks: [{ id: "nb-os", name: "Operating Systems: CPU Scheduling", createdAt: at(5), sourceCount: 3, active: true }, { id: "nb-cn", name: "Computer Networks", createdAt: at(9), sourceCount: 0, active: false }] },
  createNotebook: { notebooks: [{ id: "nb-os", name: "Operating Systems: CPU Scheduling", createdAt: at(5), sourceCount: 3, active: true }, { id: "nb-cn", name: "Computer Networks", createdAt: at(9), sourceCount: 0, active: false }] },
  selectNotebook: { notebooks: [{ id: "nb-os", name: "Operating Systems: CPU Scheduling", createdAt: at(5), sourceCount: 3, active: true }, { id: "nb-cn", name: "Computer Networks", createdAt: at(9), sourceCount: 0, active: false }] },
  deleteNotebook: { notebooks: [{ id: "nb-os", name: "Operating Systems: CPU Scheduling", createdAt: at(5), sourceCount: 3, active: true }] },
  evalReport: {
    rag: {
      ranAt: T0,
      models: { tutor: "tutor-model", judge: "judge-model", embed: "embed-model" },
      testSets: [{ name: "stage1", questions: 2 }],
      counts: { questions: 2, answerable: 1, offMaterial: 1, answered: 1 },
      overall: { faithfulness: 1, faithfulnessAll: 1, answerRelevancy: 0.9, contextPrecision: 1, contextRecall: 1, citationAccuracy: 1, refusalRecall: 1, refusalPrecision: 1, falseRefusalRate: 0 },
      byModality: {
        pdf: { questions: 1, answered: 1, faithfulness: 1, faithfulnessAll: 1, answerRelevancy: 0.9, contextPrecision: 1, contextRecall: 1, citationAccuracy: 1 },
        pptx: { questions: 0, answered: 0, faithfulness: null, faithfulnessAll: null, answerRelevancy: null, contextPrecision: null, contextRecall: null, citationAccuracy: null },
        video: { questions: 0, answered: 0, faithfulness: null, faithfulnessAll: null, answerRelevancy: null, contextPrecision: null, contextRecall: null, citationAccuracy: null },
      },
      bySet: { stage1: { questions: 2, answered: 1, faithfulness: 1, faithfulnessAll: 1, answerRelevancy: 0.9, contextPrecision: 1, contextRecall: 1, citationAccuracy: 1 } },
      rows: [
        { id: "m1", set: "stage1", modality: "pdf", question: "What does the dispatcher do?", expected: ["notes.pdf p.6"], cited: ["notes.pdf p.6"], refused: false, coverage: "SUPPORTED", topScore: 0.8, citationCorrect: true, faithfulness: 1, answerRelevancy: 0.9, contextPrecision: 1, contextRecall: 1, claims: 4 },
        { id: "m2", set: "stage1", modality: "off_material", question: "What is photosynthesis?", expected: [], cited: [], refused: true, coverage: "NOT_COVERED", topScore: 0.4, citationCorrect: null, faithfulness: null, answerRelevancy: null, contextPrecision: null, contextRecall: null, claims: null },
      ],
      geminiRequests: { generate: 3, embed: 4 },
    },
    sim: {
      ranAt: T0,
      params: { sessions: 3, questionsPerSession: 10, studentsPerProfile: 500, itemsPerTopic: 6, simulatedStudent: { slip: 0.08 }, appModel: { prior: 0.3 } },
      topics: ["Topic A", "Topic B"],
      rows: [
        { profile: "novice", policy: "adaptive", gain: 0.7, gainSd: 0.2, maeFirst: 0.3, maeLast: 0.1, repetition: 0 },
        { profile: "novice", policy: "random", gain: 0.6, gainSd: 0.2, maeFirst: 0.3, maeLast: 0.15, repetition: 0.3 },
      ],
      overall: { adaptive: { gain: 0.7, repetition: 0 }, random: { gain: 0.6, repetition: 0.3 } },
    },
    problems: [],
  },
  listFlashcards: { cards: [{ id: "fc-1", topicId: "t-fcfs", topicName: "FCFS scheduling", front: "What is the convoy effect?", back: "Short processes wait behind one long CPU-bound process under FCFS.", citations: [citations.fcfsText], box: 1, dueAt: T0, reviews: 0 }], topics: [{ topicId: "t-fcfs", name: "FCFS scheduling", total: 1, due: 1 }], due: 1, total: 1 },
  generateFlashcards: { added: 1, rejected: 0, deck: { cards: [{ id: "fc-1", topicId: "t-fcfs", topicName: "FCFS scheduling", front: "What is the convoy effect?", back: "Short processes wait behind one long CPU-bound process under FCFS.", citations: [citations.fcfsText], box: 1, dueAt: T0, reviews: 0 }], topics: [{ topicId: "t-fcfs", name: "FCFS scheduling", total: 1, due: 1 }], due: 1, total: 1 } },
  reviewFlashcard: { card: { ...{ id: "fc-1", topicId: "t-fcfs", topicName: "FCFS scheduling", front: "What is the convoy effect?", back: "Short processes wait behind one long CPU-bound process under FCFS.", citations: [citations.fcfsText], box: 1, dueAt: T0, reviews: 0 }, box: 2, dueAt: at(60 * 24), reviews: 1 }, mastery: { topicId: "t-fcfs", topicName: "FCFS scheduling", before: 0.3, after: 0.34, source: "FLASHCARD" } },
  getProfile: { profile: { tone: "friendly", style: "step_by_step", level: "new", goal: "exam" } },
  saveProfile: { profile: { tone: "funny", style: "examples_first", level: "some", goal: "understand" } },
  buildCourse: { topics },
  listTopics: topics,
  chat: tutorAnswer,
  chatHistory: [
    { id: "msg-1", role: "USER", content: "How does the time quantum affect Round Robin?", blocks: null, coverage: null, refused: false, createdAt: at(10) },
    { id: "msg-2", role: "ASSISTANT", content: tutorAnswer.blocks.map((b) => b.text).join(" "), blocks: tutorAnswer.blocks, coverage: "SUPPORTED", refused: false, createdAt: at(10.2) },
  ],
  evalAnswer: {
    answer: tutorAnswer.blocks.map((b) => b.text).join(" "),
    blocks: tutorAnswer.blocks,
    contexts: [citations.rrSlide.excerpt, citations.rrVideo.excerpt],
    citations: [citations.rrSlide, citations.rrVideo],
    refused: false,
    coverage: "SUPPORTED",
    topScore: 0.78,
  },
  createQuiz: quiz,
  getQuiz: quiz,
  submitQuiz: report,
  getReport: report,
  mastery: {
    learnerId: "demo-learner",
    needsDiagnostic: false,
    topics: topics.map((t) => {
      const [p, n] = masteryOf(t.id);
      return { topicId: t.id, name: t.name, description: t.description, seq: t.seq, prereqIds: t.prereqIds, p, n, band: band(p) };
    }),
    // Rule: weak topics = band "weak", lowest p first, up to 3 citations each.
    weakTopics: [
      { topicId: "t-sjf", name: "SJF & SRTF", p: 0.2, citations: [citations.sjfText] },
      { topicId: "t-prio", name: "Priority & multilevel queues", p: 0.2, citations: [] },
    ],
    history,
  },
} satisfies { [K in EndpointName]: EndpointResponse<K> };

/** Extra UI states worth designing for. */
export const mockStates = {
  /** Off-material question: refusal banner, no material blocks. */
  refusedAnswer: {
    messageId: "msg-4",
    coverage: "NOT_COVERED",
    refused: true,
    refusalReason: "off_material",
    blocks: [{ origin: "outside", text: "Your course material doesn't cover photosynthesis, so I can't answer from it. Ask about CPU scheduling topics instead.", citations: [] }],
    masteryUpdates: [],
  } satisfies TutorAnswer,
  /** Cold start: a new learner with no diagnostic yet. Prompt them to take one. */
  newLearnerMastery: {
    learnerId: "learner-asha",
    needsDiagnostic: true,
    topics: topics.map((t) => ({ topicId: t.id, name: t.name, description: t.description, seq: t.seq, prereqIds: t.prereqIds, p: 0.3, n: 0, band: "weak" as const })),
    weakTopics: [],
    history: [],
  } satisfies EndpointResponse<"mastery">,
  failedSource: { id: "src-bad", type: "PPTX", filename: "broken.pptx", status: "FAILED", error: "Could not read ppt/presentation.xml", progressDone: 0, progressTotal: 0, chunkCount: 0, createdAt: at(3) } satisfies EndpointResponse<"listSources">[number],
  error: { error: { code: "not_ready", message: "Sources are still processing. Try again when all are READY." } } satisfies ApiErrorBody,
};
