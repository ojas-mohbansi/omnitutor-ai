# Study Companion — Architecture (v2)

IIT Mandi Multimodal AI Hackathon 2026 · **Track D: Personalized Tutoring & Adaptive Learning**

This document is the shared reference for both teammates. The design is frozen: change it only by agreement, and record the change here.

---

## 1. What we are building

Students upload a **lecture video, a textbook PDF and a slide deck**. The app turns them into one searchable knowledge base organised by topic. On top of that knowledge base it provides:

1. **Grounded tutor chat.** Every claim cites the exact PDF page, slide or video timestamp. Clicking a citation opens the source at that spot. Questions about things not in the material are declined or flagged.
2. **Adaptive quizzes.** MCQ, short-answer and numerical questions on topics the student picks. Every question is verified before it is shown, no question is repeated, and every piece of feedback carries a citation. After each quiz there is a report on weak topics and misconceptions.
3. **A learner model.** Mastery is tracked per topic (BKT) and updated after every quiz and every chat. A diagnostic quiz handles cold start.
4. **Evaluation.** RAGAS-style metrics on our own test set (including off-material questions), plus a simulated-student study comparing adaptive and random question selection.

How it is judged: KB & Grounding 20 · Assessment 15 · Personalization 20 · UX & Demo 15 · System Eval 15 · Tech 15.

---

## 2. System overview

```
                    ┌──────────── apps/web — Next.js (one local process) ─────────────────────────┐
                    │                                                                             │
  Browser ──────────┤  Pages: /sources  /tutor  /quiz  /quiz/[id]/report  /dashboard              │
  (learner picker)  │  API routes (app/api/*) — thin: parse request, call @sc/core, return JSON   │
                    └──────────────┬──────────────────────────────────────────────────────────────┘
                                   │ imports
                    ┌──────────────▼──────────── packages/core (@sc/core) ────────────────────────┐
                    │   ingest/{pdf,pptx,video} ─┐                                                 │
                    │   build (topics+prereqs)   │                                                 │
                    │   retrieve ─► tutor        ├─► llm.ts ──► Gemini API (ONLY file calling it)  │
                    │   quiz ─► bkt              ┘                                                 │
                    └──────────────┬──────────────────────────────┬──────────────────────────────┘
                                   │ @sc/db (Prisma)              │ @sc/schemas (Zod contract,
                             ┌─────▼─────┐                        │  shared by web + core + tools)
                             │ Postgres  │ docker-compose :5434   │
                             └───────────┘                        │
   data/uploads/ ◄── originals, served by /api/files/[id] (HTTP Range)
   tools/eval/ragas.py ──HTTP──► /api/eval/answer       tools/sim (imports @sc/core bkt; no LLM)
```

**Key decisions**

| Decision | Why |
|---|---|
| One Next.js process run locally, no serverless | Ingestion runs for minutes; serverless timeouts would kill it. Live deployment isn't required. |
| No worker or queue | `POST /api/sources` starts ingestion without awaiting it; the UI polls `Source.status`. That's enough for a demo. |
| Postgres only, no pgvector | Embeddings are stored as `Float[]` and cosine is computed in JS. A few thousand chunks fit easily in memory. |
| `packages/core/src/llm.ts` is the only Gemini caller | One place for retries, Zod validation, typed errors and model selection. It passes `apiKey` explicitly from `APP_GEMINI_API_KEY`; the SDK would otherwise fall back to a machine-wide `GEMINI_API_KEY`. |
| Originals kept in `data/uploads/` | Citations open the real file. Gemini Files API uploads expire after 48 h, but our copies don't. |
| Model IDs come from env | AI Studio projects differ in which models are enabled. |
| Turborepo monorepo (npm workspaces) | Clear ownership boundaries. Domain logic (`@sc/core`) has no Next.js imports, so the simulator and eval can import it directly. |
| One `.env` at the repo root | `apps/web/scripts/next.mjs` loads it before Next starts, and `packages/db/prisma.config.ts` loads it for the Prisma CLI. |

---

## 3. Tech stack

| Layer | Choice (pinned) |
|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 |
| DB | Postgres 16 (docker-compose), Prisma 6.19 |
| LLM | Gemini via `@google/genai` 2.29. Models: `LLM_MODEL_FAST`, `LLM_MODEL_STRONG`, `EMBED_MODEL` (768-dim) |
| Validation | Zod 4 |
| Parsing | `pdf-lib` (split PDF into single pages), `jszip` (PPTX) |
| Charts | Recharts 3 |
| Scripts | `tsx` for TS tools (added in Module 1), Python 3 for RAGAS |

> Note: Next.js 16 differs from older versions. Read `node_modules/next/dist/docs/` before using an API you're unsure of. Cache Components is on, so dynamic route handlers call `await connection()`.

---

## 4. Repository layout (Turborepo + npm workspaces)

```
multimodal/
├─ apps/
│  └─ web/                         @sc/web — Next.js: UI pages + thin API routes
│     ├─ app/
│     │  ├─ api/
│     │  │  ├─ health/route.ts            # DB + env (+ Gemini later) health
│     │  │  ├─ sources/route.ts           # POST upload (starts ingestion), GET list + status
│     │  │  ├─ files/[id]/route.ts        # serve originals with HTTP Range (video seek, PDF)
│     │  │  ├─ build/route.ts             # topics + prerequisites + chunk tagging
│     │  │  ├─ chat/route.ts              # grounded tutor
│     │  │  ├─ quiz/route.ts              # create quiz (diagnostic | quiz | mock)
│     │  │  ├─ quiz/[id]/submit/route.ts  # grade + BKT + report
│     │  │  ├─ learners/route.ts          # list/create learners
│     │  │  ├─ mastery/route.ts           # dashboard data
│     │  │  └─ eval/answer/route.ts       # tutor answer + contexts for RAGAS
│     │  └─ sources/ tutor/ quiz/ quiz/[id]/report/ dashboard/   # pages
│     ├─ scripts/next.mjs                 # launches Next with the root .env loaded
│     └─ next.config.ts
├─ packages/
│  ├─ db/                          @sc/db — Prisma schema, migrations, client singleton
│  │  ├─ prisma/schema.prisma
│  │  ├─ prisma.config.ts                 # points the Prisma CLI at the root .env
│  │  └─ src/index.ts                     # export { prisma }
│  ├─ schemas/                     @sc/schemas — SHARED CONTRACT (Zod), agree before UI work
│  │  └─ src/index.ts
│  └─ core/                        @sc/core — all domain logic, no Next.js imports
│     └─ src/  llm.ts  embed.ts  retrieve.ts  tutor.ts  quiz.ts  bkt.ts
│              ingest/{pdf,pptx,video,index}.ts
├─ tools/                          (added in their modules)
│  ├─ smoke/                       Gemini API smoke tests (Module 1)
│  ├─ eval/                        ragas.py, score.ts, testset.json (Module 15)
│  └─ sim/                         simulated students (Module 15)
├─ data/uploads/                   uploaded originals (gitignored)
├─ docs/                           ARCHITECTURE.md, PROGRESS.md
├─ docker-compose.yml              Postgres only, host port 5434
├─ turbo.json   package.json   tsconfig.base.json
├─ .env.example                    copy to .env (ONE env file for the whole repo)
└─ CLAUDE.md                       instructions for Claude Code
```

Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`), and Next compiles them through `transpilePackages`, so there's no build step for packages. Import them as `@sc/db`, `@sc/core` and `@sc/schemas`.

---

## 5. Data model (Prisma)

```
Course ─┬─< Source (type PDF|PPTX|VIDEO, path, status PENDING|PROCESSING|READY|FAILED, error?)
        │       └─< Chunk (kind TEXT|FIGURE|SLIDE|TRANSCRIPT, content,
        │                  page? | slide? | tStart?,tEnd?, embedding Float[768], topicId?)
        └─< Topic (name, description, prereqIds String[])
                 └─< Question (type MCQ|SHORT|NUMERIC, difficulty 1-3, stem, options Json,
                               answer Json, distractorMisconceptions Json,
                               sourceChunkIds String[], verified Bool, stemHash)
Learner ─┬─< Mastery (topicId, p, n)                      @@unique([learnerId, topicId])
         ├─< MasteryEvent (topicId, before, after, source QUIZ|CHAT, createdAt)
         ├─< Assessment (kind DIAGNOSTIC|QUIZ|MOCK, scopeTopicIds, report Json)
         │        └─< Attempt (questionId, response, correct, feedback Json, misconception?)
         └─< ChatMessage (role, content, citations Json, coverage)
```

**Citation invariant:** every chunk has exactly one locator. PDF chunks have `page`, slide chunks have `slide`, video chunks have `tStart`/`tEnd`. A citation is a `chunkId`, and the UI resolves it to `{sourceId, locator, excerpt}`.

---

## 6. Pipelines

### 6.1 Ingestion (`POST /api/sources`)
1. Save the file to `data/uploads/<id>.<ext>` and create a `Source` with status `PROCESSING`.
2. Start `ingest(source)` **without awaiting it**, then return immediately. The UI polls `GET /api/sources`.
3. Per type:
   - **PDF:** `pdf-lib` splits the file into single-page PDFs. Each page gets one Gemini call (concurrency 4), which returns `{blocks:[{kind:text|figure|table, content}], conceptLabels}`. Text blocks become chunks. **Each figure becomes its own chunk** holding a description of the diagram (this is how "use info from figures" is met). Locator: `page`.
   - **PPTX:** JSZip reads slide order from `ppt/presentation.xml` plus its rels, text from `<a:t>` runs, and images through the slide rels into `ppt/media/*`. Slides go to Gemini in batches of 5 (text + images) and come back as one chunk per slide, with figure descriptions folded in. Locator: `slide`.
   - **Video (mp4, ≤ 20 min):** upload through the Gemini Files API, poll until `ACTIVE`, then make one call that returns `segments:[{tStart,tEnd,transcript,onScreen,conceptLabels}]`. Locator: `tStart/tEnd`.
4. Embed every chunk (`EMBED_MODEL`, 768-dim) and store it as `Float[]`.
5. Set status to `READY`, or to `FAILED` with an `error`.

### 6.2 Course build (`POST /api/build`)
One LLM call over the concept labels and chunk summaries returns **5–8 topics** with descriptions and **prerequisite links**. Each topic description is embedded, and each chunk is tagged with its nearest topic by cosine.

### 6.3 Tutor (`POST /api/chat`)
1. Embed the query and take the top 6 chunks by cosine.
2. Load the learner's mastery and any weak prerequisites of the matched topics.
3. Make one structured call:
   ```
   { coverage: "supported" | "partial" | "not_covered",
     blocks: [{ text, origin: "material" | "outside", citations: [chunkId] }],
     learnerEvidence: [{ topicId, signal: "correct" | "incorrect" | "confused" }] }
   ```
4. Server-side guards (these make grounding trustworthy):
   - Drop any citation that isn't in the retrieved set.
   - Relabel a `material` block with no citations as `outside`.
   - **Refuse** if the top cosine score is below `REFUSAL_TAU` or `coverage == not_covered`.
   - Apply a damped BKT update (30% weight) from `learnerEvidence`. This is where "update after conversation" comes from.
5. **Citation panel:** PDF in an iframe at `#page=N` with the excerpt beside it; a slide as a reconstructed card; video in a `<video>` element seeked to `tStart` (needs HTTP Range on `/api/files/[id]`). **All three must work in the demo.**

### 6.4 Quiz (`POST /api/quiz`, `POST /api/quiz/[id]/submit`)
- **Topic selection:** weighted by `1 − mastery`. **Difficulty by mastery band:** < 0.4 easy, 0.4–0.7 medium, > 0.7 hard.
  - Diagnostic: 1 question per topic. Quiz: student-chosen scope. Mock: all topics, 10 questions.
- **Generate:** one batched call. MCQ distractors each carry a *misconception label*. The prompt includes stems the student has already seen, and any question whose `stemHash` was seen before is rejected. This is how we guarantee no repeats.
- **Verify:** one batched *blind* call that answers the questions without seeing our answers. Questions where the two disagree are dropped. Numeric answers are compared in code with 1% tolerance.
- **Grade on submit:** MCQ and numeric are graded in code. Short answers are graded in one batched LLM call. Feedback cites source chunks. Each answer triggers a BKT update.
- **Report:** per-topic score, mastery delta, misconceptions detected (from the chosen distractors), and citations to revisit.

### 6.5 Learner model (`packages/core/src/bkt.ts`)
Standard BKT per topic: prior `p0 = 0.3`, learn `0.15`, slip `0.1`, guess `0.25` (MCQ) / `0.1` (short) / `0.05` (numeric).
Each update writes `Mastery` and a `MasteryEvent(before, after, source)`, which the dashboard history chart reads.

---

## 7. Shared contract — `packages/schemas` (`@sc/schemas`)

Agree on this **first**. The UI is built against mocked JSON in exactly these shapes.

```ts
Citation      = { chunkId, sourceId, sourceType: "PDF"|"PPTX"|"VIDEO",
                  page?, slide?, tStart?, tEnd?, excerpt }
TutorAnswer   = { coverage, refused: boolean, blocks: [{ text, origin, citations: Citation[] }] }
QuizQuestion  = { id, topicId, type, difficulty, stem, options?: string[] }   // no answer to client
Quiz          = { assessmentId, kind, questions: QuizQuestion[] }
QuizReport    = { perTopic: [{ topicId, name, correct, total, masteryBefore, masteryAfter }],
                  misconceptions: [{ label, topicId, count }],
                  revisit: Citation[],
                  attempts: [{ questionId, correct, feedback: { text, citations: Citation[] } }] }
MasteryView   = { topics: [{ id, name, p, n, prereqIds }], history: [{ topicId, at, p, source }] }
```

---

## 8. API surface

| Method & path | Body → Response |
|---|---|
| `GET /api/health` | → `{ok, db, env, gemini}` |
| `POST /api/sources` | multipart `file` → `{id, status}` |
| `GET /api/sources` | → `[{id, type, name, status, error, chunkCount}]` |
| `GET /api/files/[id]` | → original bytes, supports `Range` |
| `POST /api/build` | → `{topics:[...]}` |
| `POST /api/chat` | `{learnerId, message}` → `TutorAnswer` |
| `POST /api/quiz` | `{learnerId, kind, topicIds?}` → `Quiz` |
| `POST /api/quiz/[id]/submit` | `{responses:[{questionId, response}]}` → `QuizReport` |
| `GET /api/mastery?learnerId=` | → `MasteryView` |
| `GET/POST /api/learners` | list / create |
| `POST /api/eval/answer` | `{question}` → `{answer, contexts[], citations, refused}` |

---

## 9. Evaluation

- **Test set** (`tools/eval/testset.json`): 15 answerable questions (5 per modality, including 2 that need a diagram and 2 from the video) with known locations, plus 5 off-material questions.
- `tools/eval/ragas.py` calls `/api/eval/answer` and reports **faithfulness, answer relevancy, context precision, context recall**.
- `tools/eval/score.ts` reports **citation accuracy** (whether the right page/slide/timestamp was cited) and **refusal precision/recall**. This is also where `REFUSAL_TAU` gets calibrated.
- `tools/sim` uses no LLM. It runs a pool of about 30 questions against 4 student profiles with hidden true mastery, over 3 sessions, comparing **adaptive and random** selection. It reports mastery gain, estimation error (|estimated − true|) and repetition rate.
  *Caveat to state in the README: the simulator uses different BKT parameters from the model.*

---

## 10. Build order (module by module, each one verified before the next)

| # | Module | Done when |
|---|---|---|
| 0 | Skeleton: Next + Postgres + Prisma + `/api/health` | health returns `db.ok: true` |
| 1 | Gemini smoke: `packages/core/src/llm.ts` + `tools/smoke` (text JSON, 1-page PDF, PPTX slide images, video upload, embeddings) | all 5 checks pass with our model IDs |
| 2 | Prisma schema (all models) + migration + seed learner | migrate succeeds, rows visible |
| 3 | `@sc/schemas` contract | both teammates sign off |
| 4 | Upload + `/api/files/[id]` with Range | file uploads; video seeks in the browser |
| 5 | PDF ingestion | chunks with page + figure chunks in the DB |
| 6 | PPTX ingestion | one chunk per slide, in the correct order |
| 7 | Video ingestion | timestamped segments |
| 8 | Embeddings + retrieval | top-6 for a known question includes the right chunk |
| 9 | Course build (topics + prereqs) | 5–8 sensible topics, chunks tagged |
| 10 | Tutor + guards + citation panel | cited answer; off-material question refused |
| 11 | BKT module (unit tested) | known sequences give expected values |
| 12 | Quiz generate + verify + no-repeat | verified questions, no seen stems |
| 13 | Submit, grading, report | report with misconceptions + citations |
| 14 | Dashboard | mastery bars, history chart |
| 15 | Eval + simulator | metrics table in the README |
| 16 | README, demo video, Devpost | submitted |

---

## 11. Ownership

- **Parth:** `packages/core` (ingest, llm, retrieve, tutor, quiz, bkt), `packages/db` (Prisma schema), API routes in `apps/web/app/api`.
- **Teammate:** dataset, test set, `tools/eval`, `tools/sim`, UI pages in `apps/web/app` (against mocked JSON in the §7 shapes), README, demo script.
- **Shared:** `packages/schemas`.

## 12. Demo dataset (suggested)
OS **CPU scheduling**: one NPTEL/OCW lecture (15–20 min mp4), one textbook chapter (20–30 pages), one deck of about 20 slides (.pptx). It has numericals (waiting and turnaround time), Gantt-chart diagrams and clear prerequisites (process → scheduling criteria → FCFS/SJF/RR → priority/MLFQ).

## 13. Explicitly cut
Worker/queue, Docker image for the app, LibreOffice, YouTube input, pgvector, hybrid search/RRF, excerpt highlighting, mathjs, question-bank pre-warm, embedding dedup, mastery decay, prerequisite propagation, auth, streaming, deployment.
*P1, only after the full loop works:* React Flow course map, Hindi/Hinglish toggle.

## 14. Running locally

Prerequisites: Node ≥ 20.12 (we use 24), Docker Desktop running.

```bash
npm install                 # installs all workspaces; also generates the Prisma client
cp .env.example .env        # fill APP_GEMINI_API_KEY + model IDs
npm run db:up               # Postgres on localhost:5434
npm run dev                 # turbo → http://localhost:3000
curl localhost:3000/api/health
```

| Command (repo root) | What it does |
|---|---|
| `npm run dev` | Regenerates the Prisma client, then starts Next (turbo) |
| `npm run typecheck` | `tsc` across all 4 workspaces |
| `npm run lint` | ESLint on the web app |
| `npm run db:up` / `db:down` | Start or stop the Postgres container |
| `npm run db:generate` | Regenerate the Prisma client. **On Windows, stop the dev server first** (it locks the engine DLL). |
| `npm run db:status` | Prisma migration status, which also confirms the CLI can reach the DB |

**DB GUI (Beekeeper, DBeaver, etc.):** PostgreSQL · host `localhost` · port `5434` · user `study` · password `study` · database `study`.
