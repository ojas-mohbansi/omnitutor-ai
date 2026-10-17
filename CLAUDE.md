# Track D Study Companion — Project Context

IIT Mandi Multimodal AI Hackathon 2026, **Track D: Personalized Tutoring & Adaptive Learning**.
Team of 2. ~10 hours to deadline (deadline NOT yet confirmed — check Devpost).
Architecture is decided (v2 below). Do not redesign it; implement it in small, verified steps.

## Rules for working in this repo
- Build the smallest complete version of each required path. Do not add features from the cut list.
- Verify each stage (typecheck, run, hit the endpoint) before building on it. Never claim something works untested.
- No secrets in code; use `.env` (provide `.env.example`).
- Ask before large refactors or new dependencies not listed here.

## Track D requirements (summary of official PDF)
1. Multimodal KB: ingest lecture video, textbook, slide deck with no manual preprocessing; organize into topics/concepts/prerequisites; every unit linked to page / slide / timestamp; use info from figures/diagrams.
2. Grounding: answers cite excerpts that open exact page/slide/timestamp; decline or flag off-material queries; separate outside knowledge from source-backed content.
3. Assessment: MCQ, short answer, numerical on student-chosen scope; each tagged with topic, source, difficulty; verify correctness (answer verification or cross-model); no repeats; cited feedback; post-quiz report with weak topics + misconceptions.
4. Learner model: per-topic mastery updated after every quiz AND conversation (BKT ok); cold start via diagnostic quiz.
5. Evaluation: RAGAS/DeepEval-style faithfulness, answer relevancy, context precision/recall on team-built test set incl. off-material queries; simulated students across sessions reporting mastery gains + repetition rate.
6. Optional: course map, revision material, study schedule, Hindi/Hinglish, audio.

Judging: KB & Grounding 20, Assessment 15, Personalization 20, UX & Demo 15, System Eval 15, Tech 15.

## Submission (Devpost)
Project description; public GitHub repo with README (setup, prerequisites, run instructions); 3–10 min YouTube demo (unlisted ok, English); both teammates added with real full names. Live deployment NOT required.

## Stack
Next.js (App Router) + TypeScript + Tailwind · Postgres via Prisma (docker-compose runs DB only) · Gemini API (`@google/genai`) · Zod · JSZip (PPTX) · pdf-lib (page split) · Recharts.
Model IDs come from env (`LLM_MODEL_FAST`, `LLM_MODEL_STRONG`, `EMBED_MODEL`) — use the IDs listed in our AI Studio project; 2.5 models may be restricted for new projects.

## Repo layout (Turborepo + npm workspaces)
- `apps/web` (`@sc/web`): Next.js 16 pages + thin API routes. Started via `scripts/next.mjs`, which loads the root `.env`.
- `packages/core` (`@sc/core`): all domain logic (llm, ingest/, retrieve, tutor, quiz, bkt). No Next.js imports.
- `packages/db` (`@sc/db`): Prisma schema/client; `prisma.config.ts` loads the root `.env`.
- `packages/schemas` (`@sc/schemas`): shared Zod contract, `paths` URL builders, endpoint registry (`endpoints.ts`, with `status: live|planned`), mocks.
- `packages/client` (`@sc/client`): typed HTTP client on the contract. The UI and tools call the API only through it.
- `tools/smoke` (Gemini smoke), `tools/e2e` (end-to-end vs running server); `tools/eval`, `tools/sim` come from the teammate.
- `docs/`: ARCHITECTURE, PROGRESS (update after every module), API_SPEC, INGESTION_SPEC, INTEGRATION_AUDIT (§11 resolution log), TEAMMATE_BRIEF, `postman/` collection.
- One `.env` at the repo root. Gemini key var is `APP_GEMINI_API_KEY`, passed explicitly to the SDK; never use a machine-wide `GEMINI_API_KEY`.
- Postgres: docker-compose, host port 5434, user/pass/db `study`.
- Windows: `npm install` / `npm run db:generate` fail with EPERM while the dev server runs (DLL lock). Stop dev first.
- `@sc/core`, `@sc/schemas`, `@sc/client`, `@sc/smoke`, `@sc/e2e` are ESM (`"type": "module"`); `@sc/db` is CJS and re-exports `Prisma` explicitly plus `export type *` (a runtime `export *` from `@prisma/client` triggers a Turbopack warning on every request).

## Rules for Gemini usage (quota is the user's top concern)
- Every Gemini call goes through `packages/core/src/llm.ts` (`generateJson`, `embed`, `uploadFile`), never the SDK directly. These pass the limiter (`limiter.ts`) and record usage in `data/cache/usage.json`.
- Deterministic calls (ingestion) pass a `cacheKey` built from the file hash, location, a version constant and the SHA-256 of the prompt text (prompt edits miss the cache automatically). **Bump the version constant (e.g. `PDF_PROMPT_VERSION`) when the schema or chunking changes.**
- **Prompts stay subject-agnostic:** never copy examples, names or wording from the test data into a prompt. The only context is the course name from the DB. (Overfitting audit, docs/PROGRESS.md §4.)
- Uploads never call Gemini; only `POST /api/sources/[id]/ingest` does. Tests use injected fakes (`IngestDeps`); real-data runs are opt-in scripts (`npm run stage1:pdf`). Report Gemini requests/tokens spent after any real run.

## Rules for API routes (enforced by tests)
- A route is thin: wrap it in `handle()`, parse with `readBody` / `readQuery` (from `apps/web/app/api/_lib/http.ts`), call an `@sc/core` service, and return `json(endpoints.<name>.response, data)`. Responses are validated; errors become `ApiErrorBody` with `API_ERROR_STATUS`. Every success is 200.
- Core services throw `AppError(code, userMessage)` (`badRequest` / `notFound` / `notReady`) and return contract-shaped objects (dates as ISO strings).
- **When a route lands, set its registry `status: "live"` in the same change.** The schemas test fails if status and route files disagree in either direction, and the client's `auto` mode switches from mock to real based on it.
- Add the URL builder to `paths.ts` and a mock to `mocks.ts` for every new endpoint (tests require both).
- File paths: `repoRoot()` / `uploadsDir()` / `resolveSourcePath()` in `@sc/core` (never `process.cwd()`). Runtime-data paths carry `/*turbopackIgnore: true*/`.
- Testing per module: core unit + DB tests (`npm run test`), e2e against the running server (`npm run test:e2e`), and `npm run build` with 0 warnings. Tests create data tagged `__test__` / `__e2e__` and clean it up.
- Next 16 has breaking changes. Read `node_modules/next/dist/docs/` before using unfamiliar APIs. Cache Components is on: dynamic route handlers call `await connection()`.

## Architecture v2
Single Next.js process run locally (NOT serverless). One Postgres. Originals stored in `data/uploads/`, served by `/api/files/[id]` with HTTP Range support.
No worker: `POST /api/sources` saves file, sets `Source.status=PROCESSING`, starts ingestion without awaiting, UI polls status.
`packages/core/src/llm.ts` is the only file that calls Gemini (Zod-validated JSON, 1 retry, typed errors).

### Ingestion
- PDF: pdf-lib splits into single pages → one Gemini call per page (concurrency 4) → `{blocks:[text|figure|table], conceptLabels}` → chunks; figures are their own chunks (description). Citation = `page`.
- PPTX: JSZip; slide order from `ppt/presentation.xml`; text from `<a:t>`; images via slide rels → `ppt/media`. Gemini batches of 5 slides (text + images). Citation = `slide`.
- Video (≤20 min mp4): Gemini Files API upload, wait ACTIVE, one call → segments `{tStart,tEnd,transcript,onScreen,conceptLabels}`. Citation = `tStart/tEnd`. (Gemini files expire in 48h; we keep originals.)
- Embeddings: 768-dim, stored as `Float[]` in Postgres; cosine similarity computed in JS (no pgvector).
- Build step `POST /api/build`: one LLM call → 5–8 topics with descriptions + prerequisite links; chunks tagged to nearest topic by embedding.

### Prisma models
Source of truth: `packages/db/prisma/schema.prisma` (has additions beyond this list, each needed by a later module; see docs/ARCHITECTURE.md §5).
Course, Source(type PDF|PPTX|VIDEO, path, status, error), Chunk(kind TEXT|FIGURE|SLIDE|TRANSCRIPT, content, page?, slide?, tStart?, tEnd?, embedding Float[], topicId?), Topic(name, description, prereqIds String[]), Question(topicId, type MCQ|SHORT|NUMERIC, difficulty 1-3, stem, options Json, answer Json, distractorMisconceptions Json, sourceChunkIds String[], verified, stemHash), Learner, Mastery(learnerId, topicId, p, n; unique), MasteryEvent(topicId, before, after, source QUIZ|CHAT), Assessment(kind DIAGNOSTIC|QUIZ|MOCK, scopeTopicIds, report Json), Attempt(questionId, response, correct, feedback Json, misconception?), ChatMessage(role, content, citations Json, coverage).

### Tutor (`POST /api/chat`)
Embed query → top 6 chunks by cosine → load learner mastery + weak prereqs → one structured call:
`{coverage: supported|partial|not_covered, blocks:[{text, origin: material|outside, citations[]}], learnerEvidence:[{topicId, signal}]}`.
Server: drop citations not in retrieved set; uncited material blocks → outside; refuse if top score < τ (`REFUSAL_TAU`, calibrated on off-material tests) OR not_covered; damped BKT update (30%) from learnerEvidence.
Citation panel: PDF iframe `#page=N` + excerpt text beside it; slide = reconstructed slide card; video `<video>` seek to tStart. All three must work in the demo.

### Quiz
Select topics weighted by (1−mastery), difficulty by mastery band (<0.4 easy, 0.4–0.7 med, >0.7 hard). Diagnostic = 1 question/topic; Mock = all topics, 10 questions.
1 batched generate call (MCQ distractors carry misconception labels; prompt includes seen stems; reject seen stemHash) → 1 batched blind-verify call (drop mismatches; numeric compared in code, 1% tolerance) → on submit: MCQ/numeric graded in code, short answers in 1 batched LLM call; cited feedback; BKT update per answer; report (per-topic score, mastery delta, misconceptions, revisit citations).

### Learner model
BKT per topic: prior 0.3, learn 0.15, slip 0.1, guess MCQ 0.25 / short 0.1 / numeric 0.05.

### Evaluation
Test set: 15 answerable (5 per modality incl. 2 diagram, 2 video) with known locations + 5 off-material.
`tools/eval/ragas.py` → `/api/eval/answer`; `tools/eval/score.ts` → citation accuracy + refusal precision/recall.
`tools/sim`: no LLM; ~30-question pool, 4 profiles with hidden mastery, 3 sessions, adaptive vs random → mastery gain, estimation error, repetition rate. Simulator uses different params than the model (state this caveat).

### Pages
/sources, /tutor, /quiz, /quiz/[id]/report, /dashboard (mastery bars + prereqs, weak topics with citations, history chart). Learner picker in header; no auth.

## CUT (do not build)
Worker/queue, Docker app image, LibreOffice, YouTube input, pgvector, hybrid search/RRF, excerpt highlighting, mathjs, question-bank pre-warm, embedding dedup, mastery decay, prerequisite propagation, auth, streaming, deployment.
P1 only after full loop works: React Flow course map, Hindi/Hinglish toggle.

## Demo dataset (suggested)
OS CPU scheduling: 1 NPTEL/OCW lecture (15–20 min), 1 textbook chapter (20–30 pages), 1 deck (~20 slides, .pptx). Numericals (waiting/turnaround time), Gantt-chart diagrams, clear prerequisites.

## Ownership
- Parth: packages/core (ingest, llm, retrieve, tutor, quiz, bkt), packages/db (Prisma schema), apps/web/app/api routes.
- Teammate: dataset, test set, tools/eval, tools/sim, UI pages (apps/web/app) against mocked JSON, README, demo script.
- Shared contract: `packages/schemas` (Zod), the source of truth for every API request and response. API routes must validate with it. Errors use `ApiErrorBody`.
- Promised API for the teammate's simulator: `@sc/core` exports `updateMastery(p: number, correct: boolean, type: QuestionType, weight?: number): number` (Module 11).

## Status
- [x] Deadline: 12 AM, 15 Oct 2026 (user-confirmed)
- [x] Module 0: skeleton (Turborepo, Postgres, Prisma, /api/health) — see docs/PROGRESS.md
- [x] Module 1: Gemini wrapper (`packages/core/src/llm.ts`) + `npm run smoke` — 4/4 pass, video check needs a sample mp4
- [x] Module 2: Prisma schema (11 tables) + migration `init` + seed + `npm run db:verify` 12/12
- [x] Module 3: `@sc/schemas` contract + mocks; teammate brief (needs teammate sign-off)
- [x] Module 3.1: contract v1.1 + `@sc/client` (audit fixes; INTEGRATION_AUDIT §11)
- [x] Module 4: learners, streamed + validated uploads (raw bytes `?filename=`), sources list/delete, `/api/files/[id]` with Range. 162 unit + 37 e2e (dev and prod), build clean
- [x] Stage-1 dataset in `data/demo/` (validated; PDF = 8 lecture pages + Round Robin slide; ground truth `tools/e2e/stage1/expectations.json`; test set `data/demo/testset.stage1.json`)
- [x] Module 4.5: Gemini limiter + cache + usage ledger (video measured ≈91 tokens/s)
- [x] Module 5: PDF ingestion via `POST /api/sources/[id]/ingest`. Real PDF: 47/47 facts, 9 requests, re-run free
- [x] Module 7: video ingestion in ≤60 s windows (`videoMetadata` offsets). Real video: 12/12 facts at true time, mean error 0.3 s
- [x] Module 8: retrieval + `POST /api/search`. Real test set: hit@6 100%, MRR 0.95. REFUSAL_TAU 0.55 is too low; scores overlap, so the tutor must use NOT_COVERED
- [x] Overfitting audit: prompt contamination removed. Holdout retrieval (36 new questions): hit@1 95%. Unchanged code on a REAL different PDF (21/21) and a SYNTHETIC different video (14/14, 5/5 cuts). Ledger multi-process bug and search query cap fixed. Open: code-page retrieval, title-chunk hubs, video boundary regression
- [x] Module 6: PPTX ingestion (exact XML text + Gemini figure descriptions per 5 slides). Real decks: 21/21, 15/15, 9/9 facts; parser keeps 100% of content text on 4 real decks. Limitation: shape-drawn diagrams lose layout
- [x] Module 9: course build (`POST /api/build`, `GET /api/topics`, Q9 409 unless force). Pre-registered real checks: VM deck 18/18, demo-course 19/21 (preemption not a named topic; tagging 79% < 80%)
- [x] Module 11: BKT (`updateMastery`, `applyObservation`, `difficultyFor`)
- [x] Module 10: tutor `POST/GET /api/chat`, `POST /api/eval/answer`. Real: off-material refused 86%, false refusals 0/30, correct citations 97%
- [x] Module 12: quiz `POST /api/quiz`, `GET /api/quiz/[id]` (generate + code checks + blind verify, no repeats, adaptive). Real: 16/16 checks
- [x] Module 13: submit + grading (code for MCQ/numeric; batched SHORT grading with answer-echo alignment guard) + report. Real: 12/12
- [x] Module 14: `GET /api/mastery` (topics, weak topics with revise citations, history, needsDiagnostic). Real: 4/4. All registry endpoints live
- [x] UI wired to the live API (sources, tutor + citation viewer, quiz, report, dashboard; learner picker)
- [x] Module 15 basic: `npm run eval:rag` (RAGAS definitions, Gemini judge) + `npm run eval:sim` (simulated students). Results in docs/PROGRESS.md
- [x] Subtopics: per-topic cited concepts from ingestion labels in `GET /api/topics`
- [x] Module 16: accounts (`/api/auth/signup|login|logout|session`, scrypt + HMAC session cookie); learner routes return 401 unless the session owns the learner (passwordless learners from tools/tests stay open). UI: /login, header account control, sign-in gate on tutor/quiz/dashboard
- [x] Codebase audit (docs/PROGRESS.md §4 "Codebase audit"): Gemini request timeout, rejected-key rotation, atomic quiz submit, no orphan chat turns, re-ingest keeps topic tags, lint clean; docs reconciled (ARCHITECTURE §0 deviations, banners on teammate design notes). 270 unit + 35 e2e, real-browser flow 8/8, build clean
- [x] Module 17: onboarding profile (tone → temperature, style, level, goal) personalises the tutor; tutor prompt v2 teaches (cited explanations + labelled outside examples); clean declines
- [x] Module 18: notebooks (many private courses per account; active one drives every course-scoped route); first notebook "My first notebook"
- [x] Module 19: evaluation page (/evaluation, GET /api/eval/report; reports in data/eval/; judge = LLM_MODEL_VERIFY; 58-question test set incl. slides). Latest: faithfulness 0.95, citation accuracy 1.00, 0/37 false declines, 17/21 declined + 4 flagged
- [x] Module 20: course map (/map, radial mind map from topics/concepts/mastery; no new API)
- [x] Module 21: flashcards (generate → code checks → second-model verify; Leitner review; FLASHCARD mastery evidence)
- [x] UI pass: client site header (active page, account menu, mobile menu), study hub on the home page, skeleton loaders, page transitions
- [ ] Next: demo video, Devpost (docs/SUBMISSION.md)
- Real-data checks (spend quota only when inputs or prompts change; cached otherwise): `npm run stage1:pdf`, `npm run stage1:video`, `npm run stage1:retrieval`, `npm run holdout:retrieval`, `npm run holdout:generalize`, `npm run stage1:pptx`, `npm run stage1:build`, `npm run stage1:tutor`, `npm run stage1:quiz`, `npm run stage1:grading`, `npm run stage1:mastery`
- [ ] Everything else
