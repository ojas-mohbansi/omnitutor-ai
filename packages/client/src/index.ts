// Typed HTTP client for the Study Companion API, built on the @sc/schemas contract.
// - Every response is validated against the contract (contract drift fails loudly).
// - Non-JSON failures (missing route → HTML 404, wrong method → empty 405) become ApiError, never a parse crash.
// - mode "auto" calls endpoints whose registry status is "live" and serves mocks for "planned" ones.
import { z } from "zod";
import {
  ApiErrorBody, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, endpoints, paths, sourceTypeFromFilename,
  type ApiErrorCode, type BuildRequest, type ChatRequest, type Credentials, type LearnerProfile, type CreateNotebookRequest, type GenerateFlashcardsRequest, type CreateLearnerRequest, type CreateQuizRequest,
  type EndpointName, type EndpointResponse, type EvalAnswerRequest, type SearchRequest, type SubmitRequest,
} from "@sc/schemas";
import { mocks } from "@sc/schemas/mocks";

/** "auto": live endpoints hit the API, planned ones return mocks · "mock": all mocks · "live": all network. */
export type ApiMode = "auto" | "mock" | "live";

export type ApiClientOptions = {
  /** "" (same origin) in the browser; e.g. "http://localhost:3000" from Node scripts. */
  baseUrl?: string;
  mode?: ApiMode;
  fetch?: typeof fetch;
  /** Artificial delay for mocked calls, to exercise loading states. */
  mockDelayMs?: number;
};

/** Server error codes plus client-side ones. */
export type ClientErrorCode = ApiErrorCode | "network" | "http_error" | "invalid_response";

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    /** HTTP status, or 0 when no response was received (network / client-side validation). */
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const mode: ApiMode = options.mode ?? "auto";
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const mockDelayMs = options.mockDelayMs ?? 0;

  const isLive = (name: EndpointName) => mode === "live" || (mode === "auto" && endpoints[name].status === "live");

  async function mock<K extends EndpointName>(name: K): Promise<EndpointResponse<K>> {
    if (mockDelayMs > 0) await sleep(mockDelayMs);
    return structuredClone(mocks[name]) as EndpointResponse<K>;
  }

  /** Sends a request and returns the contract-validated body. `extraOk`: non-2xx statuses whose body is still a valid response (health → 503). */
  async function send<K extends EndpointName>(name: K, url: string, init: RequestInit, extraOk: number[] = []): Promise<EndpointResponse<K>> {
    if (!isLive(name)) return mock(name);
    let res: Response;
    try {
      res = await doFetch(baseUrl + url, init);
    } catch (e) {
      throw new ApiError("network", `Network error calling ${endpoints[name].method} ${url}: ${e instanceof Error ? e.message : String(e)}`, 0);
    }
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    const payload: unknown = isJson ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok && !extraOk.includes(res.status)) {
      const err = ApiErrorBody.safeParse(payload);
      if (err.success) throw new ApiError(err.data.error.code, err.data.error.message, res.status);
      const hint = res.status === 404 && !isJson ? " (route not implemented?)" : "";
      throw new ApiError("http_error", `HTTP ${res.status} from ${endpoints[name].method} ${url}${hint}`, res.status);
    }
    const schema: z.ZodType = endpoints[name].response;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError("invalid_response", `${name} response broke the contract:\n${z.prettifyError(parsed.error)}`, res.status);
    }
    return parsed.data as EndpointResponse<K>;
  }

  /** Validates the body against the endpoint's request schema before sending. */
  function sendJson<K extends EndpointName>(name: K, url: string, body: unknown): Promise<EndpointResponse<K>> {
    const schema = endpoints[name].request;
    if (schema && typeof schema !== "string") {
      const r = schema.safeParse(body);
      if (!r.success) return Promise.reject(new ApiError("bad_request", `Invalid ${name} request:\n${z.prettifyError(r.error)}`, 0));
      body = r.data;
    }
    return send(name, url, {
      method: endpoints[name].method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const get = <K extends EndpointName>(name: K, url: string) => send(name, url, { method: "GET" });

  return {
    /** Whether `name` currently goes to the network (vs. mock). */
    isLive,

    /** 200 and 503 both return a HealthResponse (check `.ok`). */
    health: (opts: { gemini?: boolean } = {}) => send("health", paths.health(opts), { method: "GET" }, [503]),

    listLearners: () => get("listLearners", paths.learners()),
    createLearner: (body: CreateLearnerRequest) => sendJson("createLearner", paths.learners(), body),

    /** Accounts: the session is an HttpOnly cookie (sent automatically by same-origin browser fetches). */
    signup: (body: Credentials) => sendJson("signup", paths.signup(), body),
    login: (body: Credentials) => sendJson("login", paths.login(), body),
    logout: () => send("logout", paths.logout(), { method: "POST" }),
    session: () => get("session", paths.session()),
    getProfile: () => get("getProfile", paths.profile()),
    listNotebooks: () => get("listNotebooks", paths.notebooks()),
    listFlashcards: (topicId?: string) => get("listFlashcards", paths.flashcards(topicId)),
    /** New verified cards for one topic (2 Gemini calls). */
    generateFlashcards: (body: GenerateFlashcardsRequest) => sendJson("generateFlashcards", paths.generateFlashcards(), body),
    reviewFlashcard: (id: string, knew: boolean) => sendJson("reviewFlashcard", paths.reviewFlashcard(id), { knew }),
    createNotebook: (body: CreateNotebookRequest) => sendJson("createNotebook", paths.notebooks(), body),
    selectNotebook: (notebookId: string) => sendJson("selectNotebook", paths.activeNotebook(), { notebookId }),
    deleteNotebook: (id: string) => send("deleteNotebook", paths.notebook(id), { method: "DELETE" }),
    saveProfile: (body: LearnerProfile) => sendJson("saveProfile", paths.profile(), body),

    listSources: () => get("listSources", paths.sources()),
    /** Uploads raw file bytes. Type comes from the extension (.pdf / .pptx / .mp4); max MAX_UPLOAD_MB. */
    uploadSource: async (file: Blob, filename = (file as File).name ?? "") => {
      if (!sourceTypeFromFilename(filename)) {
        throw new ApiError("bad_request", `Unsupported file "${filename}". Upload a .pdf, .pptx or .mp4 file.`, 0);
      }
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError("bad_request", `File exceeds the ${MAX_UPLOAD_MB} MB limit.`, 0);
      return send("uploadSource", paths.uploadSource(filename), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
    },
    deleteSource: (id: string) => send("deleteSource", paths.source(id), { method: "DELETE" }),
    /** Starts ingestion (spends Gemini quota; cached pages are free). Poll listSources for progress. */
    ingestSource: (id: string) => send("ingestSource", paths.ingestSource(id), { method: "POST" }),

    /** Top-k chunks (as citations) for a question, with cosine scores. Costs 1 embedding request (cached per query). */
    search: (body: SearchRequest) => sendJson("search", paths.search(), body),
    /** Groups the course's material into 5–8 topics (1 Gemini request, cached) and tags every chunk. 409 if learner progress exists, unless `force`. */
    buildCourse: (body: BuildRequest = {}) => sendJson("buildCourse", paths.build(), body),
    listTopics: (courseId?: string) => get("listTopics", paths.topics(courseId)),

    chat: (body: ChatRequest) => sendJson("chat", paths.chat(), body),
    chatHistory: (learnerId: string) => get("chatHistory", paths.chatHistory(learnerId)),
    evalAnswer: (body: EvalAnswerRequest) => sendJson("evalAnswer", paths.evalAnswer(), body),
    /** Latest evaluation reports written by `npm run eval:rag` / `npm run eval:sim` (null = not run yet). */
    evalReport: () => get("evalReport", paths.evalReport()),

    createQuiz: (body: CreateQuizRequest) => sendJson("createQuiz", paths.quizzes(), body),
    getQuiz: (assessmentId: string) => get("getQuiz", paths.quiz(assessmentId)),
    submitQuiz: (assessmentId: string, body: SubmitRequest) => sendJson("submitQuiz", paths.submitQuiz(assessmentId), body),
    getReport: (assessmentId: string) => get("getReport", paths.report(assessmentId)),

    mastery: (learnerId: string) => get("mastery", paths.mastery(learnerId)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
