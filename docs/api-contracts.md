# API Contracts

## Conventions

- JSON APIs over HTTPS
- Zod validation at server boundaries
- Explicit DTOs; do not return Prisma records directly
- Authentication and course authorization on every request
- Long-running ingestion and assessment generation return job IDs
- Answer keys remain server-side until grading
- All tutoring requests use PostgreSQL RAG

## Endpoint outline

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/courses` | Create course |
| GET | `/api/courses` | List accessible courses |
| POST | `/api/courses/:courseId/assets` | Register upload and queue ingestion |
| GET | `/api/jobs/:jobId` | Read processing status |
| GET | `/api/courses/:courseId/sources` | Browse extracted source units |
| POST | `/api/courses/:courseId/chat` | RAG-grounded tutoring |
| GET | `/api/conversations/:id` | Conversation and citations |
| POST | `/api/courses/:courseId/assessments` | Queue verified assessment generation |
| GET | `/api/assessments/:id` | Fetch learner-safe assessment |
| POST | `/api/assessments/:id/attempts` | Submit and grade answers |
| GET | `/api/courses/:courseId/mastery` | Learner mastery summary |
| POST | `/api/audio/sessions` | Create audio tutor session |
| POST | `/api/audio/sessions/:id/turns` | Submit audio/transcript turn |
| GET | `/api/audio/sessions/:id` | Transcript and session state |

These are proposed endpoints to implement, not claims that a running server already exposes them.

## Shared Zod contracts

```ts
import { z } from "zod";

export const AnswerabilitySchema = z.enum([
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "INSUFFICIENT_EVIDENCE",
  "OUT_OF_SCOPE",
  "PROCESSING_ERROR",
]);

export const ChatRequestSchema = z.object({
  courseId: z.string().min(1),
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(8000),
});

export const CitationSchema = z.object({
  sourceUnitId: z.string(),
  label: z.string(),
  excerpt: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  slideNumber: z.number().int().positive().optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  viewerUrl: z.string().url().optional(),
});

export const ChatResponseSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  answer: z.string(),
  status: AnswerabilitySchema,
  citations: z.array(CitationSchema),
});
```

## Assessment request

```ts
export const GenerateAssessmentSchema = z.object({
  courseId: z.string().min(1),
  topicIds: z.array(z.string()).min(1),
  questionTypes: z.array(z.enum(["MCQ", "SHORT_ANSWER", "NUMERICAL"])).min(1),
  count: z.number().int().min(1).max(50),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "MIXED"]),
  excludeRecentQuestions: z.boolean().default(true),
});
```

Assessment generation should return a job ID. Only verified questions should be published. Learner-facing DTOs must omit `answerKey`, private verifier output, and internal prompt traces.

## Audio contract

```ts
export const AudioTurnSchema = z.object({
  sessionId: z.string().min(1),
  courseId: z.string().min(1),
  audioObjectKey: z.string().optional(),
  transcript: z.string().max(8000).optional(),
  languageHint: z.string().optional(),
}).refine((v) => Boolean(v.audioObjectKey || v.transcript), {
  message: "An audio object or transcript is required",
});
```

Audio is a core feature. Validate codec, duration, file size, ownership, and session/course access. The browser must not be allowed to submit arbitrary object keys.

## API error shape

```ts
export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};
```

## Implementation rules

- Server Actions are appropriate for app-local mutations; Route Handlers fit uploads, streaming, and external clients.
- Always validate on the server, even if the client also validates.
- Use parameterized SQL for PostgreSQL RAG queries.
- Never expose secrets or hidden assessment answers in client bundles.
- Keep shared DTOs in `packages/contracts`.
