import { z } from "zod";

// Enums mirror packages/db/prisma/schema.prisma (a test checks they stay in sync).
export const SourceType = z.enum(["PDF", "PPTX", "VIDEO"]);
export type SourceType = z.infer<typeof SourceType>;

export const SourceStatus = z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const ChunkKind = z.enum(["TEXT", "FIGURE", "SLIDE", "TRANSCRIPT"]);
export type ChunkKind = z.infer<typeof ChunkKind>;

export const QuestionType = z.enum(["MCQ", "SHORT", "NUMERIC"]);
export type QuestionType = z.infer<typeof QuestionType>;

export const AssessmentKind = z.enum(["DIAGNOSTIC", "QUIZ", "MOCK"]);
export type AssessmentKind = z.infer<typeof AssessmentKind>;

export const AssessmentStatus = z.enum(["IN_PROGRESS", "SUBMITTED"]);
export type AssessmentStatus = z.infer<typeof AssessmentStatus>;

export const MasterySource = z.enum(["QUIZ", "CHAT", "FLASHCARD"]);
export type MasterySource = z.infer<typeof MasterySource>;

export const ChatRole = z.enum(["USER", "ASSISTANT"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const Coverage = z.enum(["SUPPORTED", "PARTIAL", "NOT_COVERED"]);
export type Coverage = z.infer<typeof Coverage>;

// Primitives
export const Id = z.string().min(1);
export const IsoDate = z.iso.datetime(); // dates travel as ISO-8601 strings
export const Probability = z.number().min(0).max(1);
export const Count = z.number().int().min(0);

// Every API error uses this body, with a matching HTTP status.
export const ApiErrorCode = z.enum([
  "bad_request", // 400: request failed schema validation
  "not_found", // 404
  "not_ready", // 409: e.g. sources still processing, course not built
  "unauthorized", // 401: not signed in as the account that owns this data, or wrong name/password
  "rate_limited", // 429: Gemini quota hit
  "llm_error", // 502: Gemini failed after retry
  "internal", // 500
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** HTTP status sent with each error code. Every success is 200. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  not_ready: 409,
  unauthorized: 401,
  rate_limited: 429,
  llm_error: 502,
  internal: 500,
};

export const ApiErrorBody = z.object({
  error: z.object({ code: ApiErrorCode, message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
