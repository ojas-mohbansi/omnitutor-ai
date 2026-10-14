import { z } from "zod";

/** GET /api/health?gemini=1 also checks the key + model ids (metadata only, no tokens). */
export const HealthQuery = z.object({ gemini: z.literal("1").optional() });
export type HealthQuery = z.infer<typeof HealthQuery>;

const Check = z.object({ ok: z.boolean(), error: z.string().optional() });

const KindUsage = z.object({
  requests: z.number().int().min(0), // counted by this app today (Pacific day); AI Studio is the source of truth
  inputTokens: z.number().int().min(0),
  requestsPerDay: z.number().int().min(1), // daily budget the limiter enforces
  requestsPerMinute: z.number().int().min(1),
});

/** Returned with HTTP 200 when ok, 503 when not (same body shape). */
export const HealthResponse = z.object({
  ok: z.boolean(),
  db: Check.extend({ latencyMs: z.number().min(0).optional() }),
  env: z.record(z.string(), z.boolean()), // presence of each required env var, never values
  gemini: z.record(z.string(), Check).optional(), // only with ?gemini=1
  usage: z.object({ day: z.string(), generate: KindUsage, embed: KindUsage }).optional(), // Gemini usage today
});
export type HealthResponse = z.infer<typeof HealthResponse>;
