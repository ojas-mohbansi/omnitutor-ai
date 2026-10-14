import { z } from "zod";
import {
  BuildRequest, BuildResponse, CourseQuery, CreateLearnerRequest, DeleteSourceResponse, Learner, LearnerQuery,
  SourceView, TopicView, UploadQuery, UploadResponse,
} from "./course";
import { Credentials, SessionView } from "./auth";
import { EvalAnswerRequest, EvalAnswerResponse } from "./eval";
import { MasteryView } from "./mastery";
import { CreateQuizRequest, Quiz, QuizReport, SubmitRequest } from "./quiz";
import { SearchRequest, SearchResponse } from "./search";
import { HealthQuery, HealthResponse } from "./system";
import { ChatMessageView, ChatRequest, TutorAnswer } from "./tutor";

export type HttpMethod = "GET" | "POST" | "DELETE";

type Endpoint = {
  method: HttpMethod;
  /** Next.js route pattern; the handler lives in apps/web/app<path>/route.ts. Build URLs with `paths`. */
  path: string;
  /** Query-string schema, or null. */
  query: z.ZodObject | null;
  /** JSON body schema, "binary" (raw file bytes as the body), or null (no body). */
  request: z.ZodType | "binary" | null;
  /** Success body (always HTTP 200). Errors use ApiErrorBody. */
  response: z.ZodType;
  /** "live" = implemented (a test checks the route file exports this method); "planned" = use the mock. */
  status: "live" | "planned";
  /** Backend module that implements it (docs/PROGRESS.md). */
  module: number;
};

/** Every JSON API route. */
export const endpoints = {
  health: { method: "GET", path: "/api/health", query: HealthQuery, request: null, response: HealthResponse, status: "live", module: 0 },
  listLearners: { method: "GET", path: "/api/learners", query: null, request: null, response: z.array(Learner), status: "live", module: 4 },
  createLearner: { method: "POST", path: "/api/learners", query: null, request: CreateLearnerRequest, response: Learner, status: "live", module: 4 },
  signup: { method: "POST", path: "/api/auth/signup", query: null, request: Credentials, response: Learner, status: "live", module: 16 },
  login: { method: "POST", path: "/api/auth/login", query: null, request: Credentials, response: Learner, status: "live", module: 16 },
  logout: { method: "POST", path: "/api/auth/logout", query: null, request: null, response: SessionView, status: "live", module: 16 },
  session: { method: "GET", path: "/api/auth/session", query: null, request: null, response: SessionView, status: "live", module: 16 },
  listSources: { method: "GET", path: "/api/sources", query: null, request: null, response: z.array(SourceView), status: "live", module: 4 },
  uploadSource: { method: "POST", path: "/api/sources", query: UploadQuery, request: "binary", response: UploadResponse, status: "live", module: 4 },
  deleteSource: { method: "DELETE", path: "/api/sources/[id]", query: null, request: null, response: DeleteSourceResponse, status: "live", module: 4 },
  ingestSource: { method: "POST", path: "/api/sources/[id]/ingest", query: null, request: null, response: UploadResponse, status: "live", module: 5 },
  search: { method: "POST", path: "/api/search", query: null, request: SearchRequest, response: SearchResponse, status: "live", module: 8 },
  buildCourse: { method: "POST", path: "/api/build", query: null, request: BuildRequest, response: BuildResponse, status: "live", module: 9 },
  listTopics: { method: "GET", path: "/api/topics", query: CourseQuery, request: null, response: z.array(TopicView), status: "live", module: 9 },
  chat: { method: "POST", path: "/api/chat", query: null, request: ChatRequest, response: TutorAnswer, status: "live", module: 10 },
  chatHistory: { method: "GET", path: "/api/chat", query: LearnerQuery, request: null, response: z.array(ChatMessageView), status: "live", module: 10 },
  evalAnswer: { method: "POST", path: "/api/eval/answer", query: null, request: EvalAnswerRequest, response: EvalAnswerResponse, status: "live", module: 10 },
  createQuiz: { method: "POST", path: "/api/quiz", query: null, request: CreateQuizRequest, response: Quiz, status: "live", module: 12 },
  getQuiz: { method: "GET", path: "/api/quiz/[id]", query: null, request: null, response: Quiz, status: "live", module: 12 },
  submitQuiz: { method: "POST", path: "/api/quiz/[id]/submit", query: null, request: SubmitRequest, response: QuizReport, status: "live", module: 13 },
  getReport: { method: "GET", path: "/api/quiz/[id]/report", query: null, request: null, response: QuizReport, status: "live", module: 13 },
  mastery: { method: "GET", path: "/api/mastery", query: LearnerQuery, request: null, response: MasteryView, status: "live", module: 14 },
} as const satisfies Record<string, Endpoint>;

/**
 * Non-JSON routes. GET /api/files/[id] serves the original upload (PDF/PPTX/MP4) with
 * HTTP Range support (206 Partial Content) so <video> can seek and PDFs open at #page=N.
 */
export const NON_JSON_ROUTES = {
  file: { methods: ["GET", "HEAD"], path: "/api/files/[id]", status: "live", module: 4 },
} as const;

export type EndpointName = keyof typeof endpoints;
export type EndpointResponse<K extends EndpointName> = z.infer<(typeof endpoints)[K]["response"]>;
