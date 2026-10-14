// The UI's only door to the backend: the typed client on the shared contract.
// NEXT_PUBLIC_API_MODE (root .env): "auto" = live endpoints call the API (all are live as of Module 14),
// "mock" = everything from @sc/schemas/mocks, "live" = everything from the API.
import { ApiError, createApiClient, type ApiMode } from "@sc/client";

const MODES: readonly string[] = ["auto", "mock", "live"];
const envMode = process.env.NEXT_PUBLIC_API_MODE ?? "";

export const api = createApiClient({
  mode: MODES.includes(envMode) ? (envMode as ApiMode) : "auto",
  mockDelayMs: Number(process.env.NEXT_PUBLIC_MOCK_DELAY_MS) || 0,
});

/** A message a person can act on, from any thrown value. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export { ApiError };
