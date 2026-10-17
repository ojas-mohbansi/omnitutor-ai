# OmniTutor Architecture Verification

Every component, connection, and technical claim in this video is verified against the repository source code at `C:\Users\styli\OneDrive\Documents\GitHub\Omnitutor`.

## Tech Stack (Verified)

| Component | Verified Value | Source File |
|-----------|---------------|-------------|
| Frontend | Next.js 16.4, App Router, Turbopack | apps/web/package.json |
| UI Library | React 19, TypeScript 5, Tailwind CSS 4 | apps/web/package.json |
| Backend | Next.js API routes (thin delegation to @sc/core) | apps/web/app/api/ |
| Domain logic | packages/core (@sc/core) | packages/core/src/ |
| Database | PostgreSQL 16 via Docker, Prisma 6.19 ORM | packages/core/prisma/schema.prisma |
| Embeddings | Float[768] stored in Postgres (NO pgvector) | packages/core/prisma/schema.prisma |
| AI Provider | @google/genai 2.29 | packages/core/package.json |
| Monorepo | Turborepo + npm workspaces | turbo.json, package.json |
| Schemas | Zod 4 in packages/schemas | packages/schemas/src/ |

## Key Architecture Decisions (Verified)

### Single Gemini Gateway
- File: `packages/core/src/llm.ts`
- Claim: Only file that calls Gemini API
- Evidence: All other core files import from llm.ts; no direct @google/genai imports elsewhere in packages/core/src/

### Postgres-only Embeddings
- File: `packages/core/prisma/schema.prisma`
- Claim: Float[768] embeddings, cosine in TypeScript, no pgvector
- Evidence: Chunk model has `embedding Float[]`, no pgvector extension in schema

### No Worker Queue
- File: `apps/web/app/api/sources/[id]/ingest/route.ts`
- Claim: Ingestion runs via Next.js after(), UI polls Source.status
- Evidence: after() call in ingest route handler

### BKT Learner Model
- File: `packages/core/src/bkt.ts`
- Parameters: p0=0.3, learn=0.15, slip=0.1, guess=0.25(MCQ)/0.1(short)/0.05(numeric)
- Updated: after every quiz answer and tutor conversation (30% weight for chat)

### REFUSAL_TAU Threshold
- File: `packages/core/src/tutor.ts`
- Value: 0.60
- Behavior: Refuse entire answer if top cosine < 0.60 or coverage=NOT_COVERED

## Data Model (Prisma, Verified)

```
Course → Source → Chunk (kind: TEXT|FIGURE|SLIDE|TRANSCRIPT, embedding Float[768], topicId)
       → Topic (embedding Float[768]) → Question
       → Assessment → Attempt
       → ChatMessage (blocks with citations)
Learner → Mastery (BKT p per topic) → MasteryEvent
```

## Verified API Routes

| Route | Method | Handler | Purpose |
|-------|--------|---------|--------|
| /api/chat | POST | apps/web/app/api/chat/route.ts | AI tutor |
| /api/sources | POST | apps/web/app/api/sources/route.ts | Upload source |
| /api/sources/[id]/ingest | POST | apps/web/app/api/sources/[id]/ingest/route.ts | Start ingestion |
| /api/build | POST | apps/web/app/api/build/ | Build topics + prerequisites |
| /api/quiz | POST | apps/web/app/api/quiz/route.ts | Create quiz |
| /api/quiz/[id]/submit | POST | apps/web/app/api/quiz/[id]/submit/route.ts | Submit + grade + BKT |
| /api/mastery | GET | apps/web/app/api/mastery/route.ts | Dashboard data |
| /api/files/[id] | GET | apps/web/app/api/files/[id]/route.ts | Serve originals (HTTP Range) |

## Ingestion Pipelines (Verified)

- **PDF:** pdf-lib splits pages → one Gemini call per page → TEXT + FIGURE chunks with `page` locator
- **PPTX:** JSZip reads XML → batch of 5 slides → one SLIDE chunk per slide with `slide` locator  
- **Video:** Gemini Files API upload → poll ACTIVE → calls per ≤60s window → TRANSCRIPT chunks with `tStart/tEnd` locator

## What is NOT in the video (explicitly excluded)
- No pgvector (confirmed absent)
- No worker queue / Redis (confirmed absent)
- No authentication provider (custom session cookies)
- No cloud storage (data/uploads/ is local)
