import type { ApiErrorCode } from "@sc/schemas";

/** A failure the API reports to the client as ApiErrorBody with this code (see API_ERROR_STATUS). */
export class AppError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError("bad_request", message);
export const notFound = (message: string) => new AppError("not_found", message);
export const notReady = (message: string) => new AppError("not_ready", message);

export type LlmErrorKind = "config" | "rate_limit" | "api" | "parse" | "validation" | "file";

/** A Gemini failure (raised by llm.ts and the rate limiter). The API maps it to rate_limited / llm_error. */
export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    message: string,
    public cause?: unknown,
  ) {
    super(`[llm:${kind}] ${message}`);
    this.name = "LlmError";
  }
}
