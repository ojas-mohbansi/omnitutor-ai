# Omnitutor: a study companion grounded in your own course material

**IIT Mandi Multimodal AI Hackathon 2026, Track D: Personalized Tutoring & Adaptive Learning**

Upload a lecture **video**, a **textbook PDF** and a **slide deck**. Omnitutor turns them into a source-cited knowledge base and uses it to:

- **Tutor you.** Every claim cites the exact **page, slide or timestamp**, which opens beside the answer. Questions your material doesn't cover are declined, and anything from outside your sources is labelled as such.
- **Quiz you adaptively.**
  - MCQ, short-answer and numerical questions are generated from your material and **checked by a second, blind model pass**.
  - They never repeat for you, and they're weighted toward your weak topics at a difficulty matched to your level.
  - Every answer gets **cited feedback**, and each quiz ends in a report with weak topics and likely misconceptions.
- **Model you as a learner.** Per-topic mastery uses Bayesian Knowledge Tracing and updates after **every quiz answer and every tutor conversation**. New learners start with a diagnostic.

## Prerequisites

- **Node.js** ≥ 20.12 (developed on 24) and npm
- **Docker Desktop**, which runs PostgreSQL only
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey). The free tier works.
- Optional: Python 3.11+ only for the optional `ragas` cross-check, if you add it. Nothing else needs Python.

## Setup and run

```bash
npm install
cp .env.example .env        # then set APP_GEMINI_API_KEY (or several keys, see below) and the model IDs
npm run db:up               # PostgreSQL on localhost:5434
npm run db:deploy           # apply the database migration
npm run db:seed             # default course + a demo learner (set COURSE_NAME in .env first)
npm run dev                 # http://localhost:3000
```

Production mode: `npm run build && npm run start -w @sc/web`.

**Health check:** `GET http://localhost:3000/api/health` returns `{"ok": true, ...}`. Add `?gemini=1` to check the key and every model; this spends no tokens.

### Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `APP_GEMINI_API_KEY` | one Gemini key |
| `APP_GEMINI_API_KEYS` | optional: several keys, comma-separated. When one hits its quota or is rejected (invalid/revoked), calls move to the next, and the built-in rate limits scale with the number of keys |
| `LLM_MODEL_FAST` / `LLM_MODEL_STRONG` | generation models (bulk extraction + grading / tutor, quiz generation, video, course build) |
| `LLM_MODEL_VERIFY` | the **different** model that blindly re-answers every generated quiz question (**cross-model validation**); we use `gemini-3.5-flash-lite` against `gemini-3.1-flash-lite` for generation |
| `LLM_MODEL_FALLBACK` | optional: used when a model is overloaded or out of quota on every key (default: whichever of `LLM_MODEL_VERIFY` / `LLM_MODEL_FAST` differs from the failing model) |
| `EMBED_MODEL` | embedding model (`gemini-embedding-001`, 768 dimensions) |
| `LLM_TIMEOUT_MS` | optional: per-request timeout for Gemini calls (default 120000); a timed-out call is retried once |
| `SESSION_SECRET` | optional, ≥32 chars; signs login cookies. If unset, a random secret is generated once into `data/cache/session-secret` |
| `REFUSAL_TAU` | retrieval similarity floor below which the tutor declines without calling the LLM (we use 0.60) |
| `COURSE_NAME` | name of the default course; it's given to every prompt as context |

## Using it

1. **Sources:** drop a PDF, a `.pptx` and an `.mp4` (up to 20 min). Processing starts automatically and you can watch the progress. Then click **Build topics**.
2. **Quiz → Diagnostic:** one question per topic, to calibrate your mastery map.
3. **Tutor:** ask questions. Click a citation chip to open the PDF at that page, the video at that second, or the slide.
4. **Quiz report:** your score, mastery before → after per topic, misconceptions, cited feedback, and what to revisit.
5. **Dashboard:** mastery per topic with prerequisites, weak topics with "revise here" links and one-click practice, plus a mastery history.

Sign in (or create an account) from the header. **Each account has its own private course**: the files it uploads, its topics, tutor history, quizzes and mastery map are visible only to that account. The server enforces this on every route (a signed HttpOnly session cookie; another account's course, file or data returns 401). Passwords are hashed with scrypt. Requests without a session (the eval scripts and e2e tests) use the shared demo course.

## Features at a glance

- **Private accounts and notebooks:** each student signs in; every notebook (one per subject) has its own files, topics, tutor history, quizzes, flashcards and mastery, enforced on the server.
- **Onboarding:** four quick questions set the tutor's personality (friendly, funny, serious or concise; also the sampling temperature), explanation style, level and goal.
- **A tutor that teaches:** explains in its own words with citations that open the exact PDF page, slide or video second; outside knowledge is labelled; off-material questions are declined or flagged.
- **Course map:** an interactive mind map of topics, prerequisites and concepts, coloured by the student's measured mastery; every concept opens its source.
- **Flashcards:** generated per topic from the topic's own excerpts, each checked by a second model and cited; spaced repetition (Leitner boxes); reviews update mastery.
- **Verified quizzes and reports:** MCQ, short-answer and numerical questions verified by a second model, no repeats, cited feedback, misconceptions.
- **Dashboard and study hub:** per-topic mastery from quizzes, tutor chats and flashcards; the home page shows what to do next.
- **Evaluation page:** the measured RAGAS-style metrics and simulated-student results.

## How it works

```
Browser (Next.js pages) ──@sc/client──► Next.js API routes (Zod-validated contract)
                                              │
                                   @sc/core (TypeScript)
     ingest (PDF · PPTX · MP4) → chunks with page/slide/timestamp → embeddings
     course build → topics + prerequisites;  retrieval → tutor (grounding guards)
     quiz (generate → code checks → blind verify) → grading → BKT learner model
                                              │
                 PostgreSQL (Prisma)   ·   Gemini API (generation, embeddings, Files API)
```

- **Ingestion is multimodal, with no manual preprocessing.**
  - **PDF:** each page goes to Gemini as an image + text, so scanned and image-only pages and figures work. Figures become their own cited chunks.
  - **PPTX:** slide order and exact text, tables, SmartArt and speaker notes come straight from the file's XML. Pictures go to Gemini for descriptions. One chunk per slide.
  - **Video:** processed in ≤60 s windows through the Gemini Files API, with transcript + on-screen content and accurate timestamps.
- **Retrieval:** embed the question → cosine similarity over the course's chunks (exact search) → top 6.
- **Grounded tutor:** one structured call returns coverage + blocks labelled `material` (citing excerpt IDs) or `outside`. The **server enforces grounding**:
  - citations that weren't retrieved are dropped;
  - uncited "material" claims are relabelled as outside knowledge;
  - "not covered", or no surviving material, means a refusal.

  Uploaded text and student answers are treated as data, never as instructions.
- **Learner model:** BKT per topic (prior 0.3, learn 0.15, slip 0.1, guess MCQ 0.25 / short 0.1 / numeric 0.05). Chat evidence counts at 30% weight. Mastery bands drive question difficulty.
- **Quiz integrity:**
  - **no repeats:** stem hashes are compared against everything the learner has seen;
  - **topic tagging:** every question must cite excerpts of its own topic;
  - **blind cross-model verification:** a *different* model answers each MCQ and numeric question without the key, compared in code (±1%), and checks short reference answers against their sources. In our runs it rejected 6 of 30 mock-exam candidates as not answerable from the sources;
  - **short-answer grading:** includes an alignment check, so a grade always belongs to the right answer;
  - **one grading per quiz:** a submit claims the quiz atomically, so a double click or a second tab can't grade it twice.
- **Topics, concepts and prerequisites:** the course build groups the material into 5–8 topics with prerequisite links; each topic lists its concepts (subtopics), merged from the concept labels found during ingestion, each linked to where it is taught. Sources added later are tagged to the nearest existing topic automatically (rebuild to re-plan the topics).

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API contract: [docs/API_SPEC.md](docs/API_SPEC.md) · ingestion: [docs/INGESTION_SPEC.md](docs/INGESTION_SPEC.md) · every test run with its numbers: [docs/PROGRESS.md](docs/PROGRESS.md).

## Evaluation (team-built test sets, real Gemini)

Results are shown in the app on the **Evaluation** page (reports in `data/eval/`, regenerated with `npm run eval:rag` and `npm run eval:sim`).

Test sets (58 questions, all in `data/demo/testset.*.json`):
- **Stage-1:** 15 questions: 8 from real IIIT Nagpur OS exam papers, 7 written from the material.
- **Holdout:** 36 questions written *after* retrieval was frozen: 4 verbatim exam questions, 16 new, and 16 off-material (unrelated, same course but not covered, and near-miss).
- **Slides:** 7 questions on a team-made (synthetic) 10-slide deck; each also accepts the lecture-note page with the same fact.

Latest run (2026-10-15, current tutor with the teaching prompt; tutor `gemini-3.1-flash-lite`, judged by a different model, `gemini-3.5-flash-lite`):

| Metric | All | PDF | Slides | Video |
|---|---|---|---|---|
| Faithfulness (claims in the cited part supported by the retrieved excerpts) | **0.95** | 0.96 | 0.86 | 1.00 |
| Answer relevancy | **0.85** | 0.85 | 0.85 | 0.85 |
| Context precision / recall | **0.92 / 0.94** | 0.93 / 0.93 | 0.97 / 0.90 | 0.87 / 1.00 |
| Citation accuracy (cites an expected page/slide/time) | **1.00** | 1.00 | 1.00 | 1.00 |

Off-material: **17 of 21 declined**; the other 4 (numerical problems for algorithms the material doesn't teach) were answered but flagged *partly covered*, with the uncovered part labelled outside knowledge. **0 of 37** answerable questions wrongly declined; refusal precision 1.00. Faithfulness over the whole answer (including the labelled outside-knowledge teaching) is 0.61, as expected for a tutor that adds analogies and examples. Earlier: retrieval hit@1 on the holdout 95% (random ranking: 10%); extraction ground truth PDF 47/47, PPTX 21/21 + 15/15, video 12/12 facts.

**Faithfulness, relevancy and context precision/recall** use the **RAGAS metric definitions**, computed with a Gemini judge that is a different model from the tutor's (`npm run eval:rag`); not the ragas package itself.

**Simulated students** (`npm run eval:sim`): 4 hidden-knowledge profiles × 500 students × 3 sessions, the app's own question selection and mastery model against random quizzing. The simulated students follow a *different* learning model than the app assumes.

| | Adaptive | Random |
|---|---|---|
| Topics learned (novice / basics-only) | **73% / 48%** | 64% / 41% |
| Mastery estimation error after 3 sessions | **lower in all 4 profiles** | |
| Question repetition rate | **0%** | 30% |

**Reproduce:** `npm run test` (unit + DB), `npm run test:e2e` (against a running server; spends no quota), `npm run eval:rag` / `npm run eval:sim`, and the real-data checks in `tools/e2e` (`stage1:*`, `holdout:*`).

## Honest limitations

- **Simple accounts.** Name + password with a signed session cookie; no email verification, password reset or roles. Each account's course is private; requests without a session use the shared demo course. Learners created through `POST /api/learners` (used by the eval tools and tests) have no password and stay open.
- **RAG metrics:** they use the RAGAS definitions with a Gemini judge from the same model family, not the `ragas` package itself. The test set is small and team-built.
- **Speech:** transcription is done by Gemini (no separate speech-recognition engine). Word accuracy on our real lecture video hasn't been measured against a human transcript.
- **Slides:** diagrams drawn with PowerPoint shapes (not pictures) lose their layout. Charts aren't extracted (they're noted in the slide chunk).
- **Retrieval:** dense search only (no keyword/hybrid search or reranking); weakest on pages of source code.
- **Topics:** topics + prerequisites + concepts (concepts are grouped labels, not a planned hierarchy). On our demo course, 79% of sampled chunks were tagged to the expected topic.
- **Security:** course actions aren't tied to accounts: anyone who can reach the server can upload or delete sources and force a topic rebuild (which erases every learner's progress on those topics). Login attempts aren't rate-limited. Fine for a local, single-machine demo; roles would be needed before sharing a server.
- **Other:** one course per account (no multiple notebooks yet); old `.ppt`, images and URLs are not accepted.

## Repo layout

| Path | Contents |
|---|---|
| `apps/web` | Next.js pages (`/sources`, `/tutor`, `/quiz`, `/quiz/[id]/report`, `/dashboard`) and API routes |
| `packages/core` | ingestion, Gemini client (rate limiter, cache, key rotation), retrieval, course build, tutor, quiz, grading, BKT, mastery |
| `packages/db` | Prisma schema, migration, seed |
| `packages/schemas` | shared Zod contract for every request and response |
| `packages/client` | typed API client used by the UI and the tools |
| `tools/e2e` | end-to-end tests, real-data checks with ground truth written before each run, evaluation and simulator |

Team: Parth Mankawade, Ojas Mohbansi.
