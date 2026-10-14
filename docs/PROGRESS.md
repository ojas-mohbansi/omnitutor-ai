# Progress Tracker

Updated: **2026-10-14** (after the codebase audit; cross-referenced with ARCHITECTURE.md) · Deadline: **12 AM, 15 Oct 2026** (Devpost)
Rule: one module at a time → test → user review → next. A module is ✅ only after its tests pass.

Legend: ✅ done & verified · 🟡 in progress / awaiting review · ⬜ not started · ❌ blocked

---

## 0. Summary

**Latest (2026-10-14, after subtopics, Module 16 accounts and the codebase audit):** every endpoint is live; 270 unit/DB tests, 35 e2e, lint clean, production build 0 warnings, real-browser flow 8/8, live Gemini checks pass (details: the last two entries of §4). The history below is kept as it was written.

### Earlier summary (after the overfitting audit + Module 6)

- **Done and verified on your real data:**
  - **PDF ingestion (5):** 47/47 facts.
  - **PPTX ingestion (6):** 3 decks, real Gemini.
    - REAL lecture deck (40 slides): 21/21 facts.
    - REAL lab deck (24 slides): 15/15, including a table read from a picture.
    - Generated deck: 9/9.
    - The parser kept every content text run of 4 real decks (5,061 runs).
  - **Video ingestion (7):** 12/12 on-screen facts at the right time, mean start error 0.9 s (0.3 s before the prompt de-contamination; see the audit).
  - **Retrieval (8):** Stage-1 hit@1 90%, MRR 0.95. **New holdout (36 unseen questions): hit@1 95%, MRR 0.97** vs a random baseline of 10% / 0.26.
- **Overfitting audit (§4):**
  - Dataset examples were removed from the ingestion prompts.
  - Unchanged code was run on a REAL different PDF (21/21 facts) and a SYNTHETIC different video (14/14 facts, 5/5 slide cuts).
  - Two bugs were fixed: the ledger lost updates across processes, and the search query cap was too low.
- **Knowledge base:** `process-scheduling-9pages.pdf` (14 chunks) + `cpu-scheduling-2min.mp4` (12 segments) in `demo-course`. The holdout files live in their own courses (`holdout-pipes`, `holdout-hash`).
- **Gemini used today (app ledger, Pacific day 2026-10-13):** generate 48/450 (109.7K input tokens), embed 220/900.
- **Tests:** 211 unit/contract · 39 e2e · typecheck 7/7 · production build 0 warnings (last checked after Module 8).
- **Not verified:**
  - Video transcript word-accuracy on the real video (no reference transcript; on the synthetic holdout all 6 spoken facts were found).
  - PDF `#page=` / video seek in a real browser (needs the UI).
  - Refusal: a score threshold cannot do it alone (§4 audit, point 7); the tutor's NOT_COVERED judgment is still to be evaluated.
- **Weak spots found:**
  - Retrieval on code pages (hit@1 2/5).
  - The title page acts as a "hub" for off-material queries.
  - Video boundary regression (2 of 11 boundaries off).
  - PPTX diagrams drawn with shapes lose their layout.
- **Next:**
  - Module 9 done (2 pre-registered checks failed on demo-course; see §4) → Module 10 (tutor).
- **Waiting on you:**
  - Review.
  - Push.
  - Confirm the deadline.
  - Choose the demo deck. The real decks are about VM/file systems; the only scheduling deck is the generated one.

## 1. Backend modules (Parth): cross-referenced with ARCHITECTURE.md §10

| # | Module | "Done when" (ARCHITECTURE §10) | Status | Evidence / gap |
|---|---|---|---|---|
| 0 | Skeleton: Turborepo + Postgres + Prisma + `/api/health` | health returns `db.ok: true` | ✅ | §4 Module 0/0b |
| 1 | Gemini wrapper `llm.ts` + `tools/smoke` | all 5 checks pass | ✅ partial | 4/5 pass. **Video check never run** (no sample mp4); carried to Module 7 |
| 2 | Prisma schema + migration + seed | migrate succeeds, rows visible | ✅ | 11 tables + seed rows verified via psql and `db:verify` 12/12. Your Beekeeper check is pending |
| 3 | `@sc/schemas` contract + mocks | both teammates sign off | 🟡 | Built + tested. **Needs teammate sign-off** (v1.1 brief) |
| 3.1 | Contract v1.1 + `@sc/client` (audit fixes I-01…I-07) | integration issues resolved, tested | ✅ | 103 schema tests + 16 client tests; INTEGRATION_AUDIT §11 |
| 4 | Learners API, upload (streamed, validated), sources list/delete, `/api/files/[id]` (Range) | file uploads; video seeks in browser | 🟡 awaiting review | 43 core + 37 e2e (dev **and** prod). **Browser seek not yet tried with a real mp4** (server Range verified) |
| 4.5 | Gemini rate limiter + result cache + usage ledger (`limiter.ts`, `cache.ts`) | stay under free-tier limits; re-runs free | ✅ | 17 unit tests (fake clock); real: smoke + Stage-1 runs paced, re-run 0 requests |
| 5 | PDF ingestion (`POST /api/sources/[id]/ingest`) | chunks with page + figure chunks | 🟡 awaiting review | **Real PDF: 14 chunks (5 figures), 47/47 facts, page locators exact, re-run free**; 12 unit tests (fake Gemini) + 2 e2e |
| 6 | PPTX ingestion | one chunk per slide, in order | 🟡 awaiting review | **Real decks: 21/21 (40 slides, 8 pictures), 15/15 (24 slides, table read from a picture), 9/9 (generated)**; one SLIDE chunk per slide in order; re-run free; parser keeps 100% of content text on 4 real decks. Limitation: shape-drawn diagrams lose layout |
| 7 | Video ingestion (≤60 s windows via Files API `videoMetadata`) | timestamped segments | 🟡 awaiting review | **Real video: 12/12 facts at the true time, mean start error 0.3 s, coverage 100%, re-run free.** Transcript accuracy NOT verified |
| 8 | Retrieval + `POST /api/search` | top-6 includes the right chunk | 🟡 awaiting review | **Real test set: hit@1 90%, hit@3/6 100%, MRR 0.95** (10 answerable questions, PDF + video). **Holdout (20 answerable): hit@1 95%, MRR 0.97**; weak on code pages |
| 9 | Course build + `/api/build`, `/api/topics` | 5–8 sensible topics, chunks tagged | 🟡 awaiting review | **Real: VM deck 18/18 pre-registered checks; demo-course 19/21** (preemption not named in any topic; tagging 79% vs 80% threshold). Rebuild free (cache); Q9 409 unless force |
| 10 | Tutor API + grounding guards (+ `/api/eval/answer`) | cited answer; off-material refused | 🟡 awaiting review | **Real: off-material refused 86%, false refusals 0/30, correct citation 97%**; chat updates mastery. Citation panel UI is teammate Task 3 |
| 11 | BKT `updateMastery` (unit tested) | known sequences → expected values | ✅ | 6 tests incl. hand-computed values; `updateMastery` exported for the simulator |
| 12 | Quiz generate + verify + no-repeat | verified questions, no seen stems | 🟡 awaiting review | **Real: 16/16 checks** (diagnostic, mock, adaptivity, no repeats, other course); 2 calls per quiz |
| 13 | Submit, grading, report API | report with misconceptions + citations | 🟡 awaiting review | **Real: 12/12 checks** (after fixing a batch-grading misalignment found by the adversarial test) |
| 14 | Mastery API (`/api/mastery`) | mastery bars, history chart | 🟡 awaiting review | **Real: 4/4 checks**; dashboard UI is teammate Task 7 |
| 15 | Eval + simulator | metrics table in README | 🟡 basic done | RAGAS-definition metrics: faithfulness 0.97, relevancy 0.84, context precision 0.87, recall 0.93; refusal recall 0.86 / precision 1.00; simulator: adaptive > random, 0% vs 30% repetition |
| 16 | README, demo video, Devpost | submitted | ⬜ | teammate Task 11 + both |

## 1b. Teammate track (docs/TEAMMATE_BRIEF.md §5)

| Task | What | Blocks / feeds | Status |
|---|---|---|---|
| 1 | Demo dataset (mp4 15–20 min, PDF 20–30 pp, .pptx ~20 slides) | **blocks Modules 5–7 real testing** | ⬜ brief (v1.1) not sent yet. Uploading each file now validates format and length |
| 2 | App shell + learner picker | all pages | ⬜ |
| 3 | Citation panel (PDF page / slide card / video seek) | Module 10 demo; judged (KB & Grounding 20) | ⬜ |
| 4 | `/sources` page | Modules 4–9 demo | ⬜ (its endpoints are **live**) |
| 5 | `/tutor` page | Module 10 | ⬜ |
| 6 | `/quiz` + report pages | Modules 12–13 | ⬜ |
| 7 | `/dashboard` | Module 14 | ⬜ |
| 8 | Eval test set (20 items) | Module 15; `REFUSAL_TAU` calibration | ⬜ |
| 9 | `score.ts` + `ragas.py` | Module 15 | ⬜ |
| 10 | Simulator `tools/sim` | Module 15 (needs `updateMastery`, Module 11) | ⬜ |
| 11 | README + demo script | Module 16 | ⬜ |

## 2. Track D requirement coverage

| Requirement | Pts | Status | Where it stands |
|---|---|---|---|
| Multimodal KB (video/PDF/PPTX, topics, prereqs, locators, figures) | 20 | 🟡 | **Upload of all 3 types works** (streamed, content-validated, page/slide count, video duration ≤ 20:00); originals served with Range for citations. Gemini reads PDF figures + slide images (smoke ✅). Parsing/chunking/topics not built (5–9) |
| Grounding (cited excerpts, refusals, outside-knowledge labels) | (in 20) | 🟡 foundation | Rules enforced in the contract + tested (material ⇒ citation, refusal shape). Tutor not built (10) |
| Assessment (MCQ/short/numeric, tagged, verified, no repeats, report) | 15 | 🟡 foundation | DB + contract support all fields, no-answer-leak tested. Engine not built (12–13) |
| Learner model (BKT after quiz + chat, diagnostic cold start) | 20 | 🟡 foundation | Mastery + event history (QUIZ/CHAT evidence) in DB; `needsDiagnostic` in contract. BKT not built (11) |
| Evaluation (RAGAS metrics, simulated students) | 15 | 🟡 foundation | Test-set schema + gap checker; eval endpoint contract. Scripts not built (15) |
| UX & demo | 15 | ⬜ | `@sc/client` + mocks ready for all pages; Postman collection for live endpoints; no pages yet |

## 3. Health

| Check | Status | Last checked |
|---|---|---|
| Postgres (docker `study-companion-db`, :5434) | ✅ `SELECT 1` 1–48 ms | 2026-10-14 |
| Env: DATABASE_URL, REFUSAL_TAU | ✅ present (`REFUSAL_TAU` = placeholder 0.55, uncalibrated) | 2026-10-14 |
| Env: APP_GEMINI_API_KEY (from `.env` only) | ✅ present | 2026-10-14 |
| Env: LLM_MODEL_FAST / LLM_MODEL_STRONG = `gemini-3.1-flash-lite`, EMBED_MODEL = `gemini-embedding-001` | ✅ present | 2026-10-14 |
| Gemini API reachable (`/api/health?gemini=1`, metadata only, 0 tokens) | ✅ all 3 models ok | 2026-10-14 |
| Gemini smoke (`npm run smoke`) | ✅ 5/5 (video run 2026-10-14 on the 45 s sample: 4,129 tokens ≈ 91 tokens/s) | 2026-10-14 |
| Gemini usage today (`/api/health` → `usage`) | generate 10/450 · embed 14/900 (app ledger; AI Studio is authoritative) | 2026-10-14 |
| Typecheck (7 workspaces) / lint | ✅ clean | 2026-10-14 |
| Production build (`npm run build`) | ✅ 0 warnings; 7 dynamic API routes | 2026-10-14 |
| Prisma CLI → DB (reads root `.env`) | ✅ connects to localhost:5434 | 2026-10-14 |
| Migrations (`npm run db:status`) | ✅ `init` applied, schema up to date | 2026-10-14 |
| Schema checks (`npm run db:verify`) | ✅ 12/12 | 2026-10-14 |
| Unit + contract tests (`npm run test`) | ✅ 197/197 (schemas 109 · client 16 · core 72) | 2026-10-14 |
| End-to-end (`npm run test:e2e`) | ✅ 39/39 on dev server (no Gemini usage) | 2026-10-14 |
| Stage-1 real-data PDF check (`npm run stage1:pdf`) | ✅ 7/7 checks · 47/47 facts | 2026-10-14 |
| Stage-1 real-data video check (`npm run stage1:video`) | ✅ 8/8 checks · 12/12 facts at true time | 2026-10-14 |
| Stage-1 retrieval check (`npm run stage1:retrieval`) | ✅ hit@6 100%, MRR 0.95 | 2026-10-14 |

Live check: `GET http://localhost:3000/api/health` (Postman or curl). Add `?gemini=1` to also check the key and models (no tokens used).
DB GUI: PostgreSQL · `localhost:5434` · user `study` · password `study` · db `study`

## 4. Test log

### Module 0 — 2026-10-13
| Test | Result |
|---|---|
| `npm run typecheck` (next typegen + tsc) | ✅ 0 errors |
| `npm run lint` | ✅ 0 problems |
| `npm run db:up` → container healthy | ✅ |
| `GET /api/health`, DB up | ✅ HTTP 200, `db.ok: true` |
| `GET /api/health`, DB stopped | ✅ HTTP 503, `"Server has closed the connection."` |
| `GET /api/health` after DB restart (recovery without app restart) | ✅ HTTP 200 |

### Module 0b — Turborepo restructure — 2026-10-13
| Test | Result |
|---|---|
| `npm install` (4 workspaces linked: @sc/web, @sc/core, @sc/db, @sc/schemas) | ✅ |
| `npm run db:up` on port 5434 | ✅ healthy |
| `npm run db:status` (Prisma CLI loads root `.env`) | ✅ connects to localhost:5434. Non-zero exit is expected: no migrations until Module 2 |
| `npm run typecheck` (turbo, 4 packages) | ✅ 0 errors |
| `npm run lint` | ✅ 0 problems |
| `npm run dev` (turbo) → `GET /` | ✅ HTTP 200 |
| `GET /api/health`, DB up / stopped / restarted | ✅ 200 / 503 / 200 |
| Env reaches route handlers from root `.env` | ✅ after fix (see issues) |

### Module 1 — Gemini wrapper + smoke test — 2026-10-14
Models: fast = strong = `gemini-3.1-flash-lite`, embed = `gemini-embedding-001` (768-dim).

| Check | Result | Time | Tokens in/out | What it proves |
|---|---|---|---|---|
| `json` | ✅ avg waiting = 17 (expected 17) | 9.1 s | 45 / 64 | Zod-schema JSON output + numeric reasoning |
| `pdf` | ✅ 3 blocks, figure described with P1/24 values, 4 concepts | 9.2 s | 578 / 318 | 1-page PDF input; diagrams extracted as figure blocks |
| `slides` | ✅ slide 1: 3 bars [red, green, blue]; slide 2: 2 bars [yellow, purple] | 8.3 s | 2214 / 137 | Batched text + image per slide, correct slide numbering |
| `video` | ⏭ skipped (no `tools/smoke/fixtures/sample.mp4`) | — | — | Files API upload → ACTIVE → timestamped segments |
| `embed` | ✅ dim 768; cosine RR=0.806 > FCFS=0.642 > bread=0.483 | 0.7 s | — | Embeddings + retrieval ranks the right doc first |
| `GET /api/health?gemini=1` | ✅ HTTP 200, all 3 models reachable | — | 0 | Key + model IDs valid from the web app |
| typecheck / lint | ✅ 5/5 packages, 0 problems | — | — | |

Total smoke cost: **~2.8k input / 0.5k output tokens**. Run one check: `npm run smoke -- pdf`.

### Module 2 — Database schema — 2026-10-14
Migration `init`: 11 tables, 9 enums, 18 foreign keys, 12 indexes. Seed: course `demo-course`, learner `demo-learner` (fixed ids for Postman).

| Check (`npm run db:verify`) | Result | Why it matters (module) |
|---|---|---|
| Source defaults (PENDING, progress 0/0) | ✅ | Upload + status polling (4) |
| Embedding 768 round-trip | ✅ max err 5.6e-17 | Retrieval (8). Exact bit equality fails: Prisma sends ~16 significant digits. Irrelevant, since Gemini vectors are float32 (~1e-7) |
| PDF locator (page) + concept labels | ✅ | Citations (5, 10), course build (9) |
| Video tStart/tEnd as float seconds | ✅ | Video seek (7, 10) |
| Mastery defaults p=0.3, n=0 | ✅ | BKT prior (11) |
| Mastery unique (learner, topic) | ✅ P2002 on duplicate | One mastery value per topic (11) |
| Question JSON round-trip (options/answer/misconceptions) | ✅ | Quiz generation + grading (12, 13) |
| Attempt unique (assessment, question) | ✅ P2002 on duplicate | No double submissions (13) |
| Mastery history linked to attempt + chat message | ✅ | "Updated after every quiz AND conversation" evidence (11, 14) |
| Seen-stems query per learner | ✅ | No-repeat rule (12) |
| Topic delete → chunks untagged, mastery/questions removed | ✅ | Course rebuild (9) |
| Course delete cascades, no leftovers | ✅ | Clean resets |
| Seed run twice (idempotent) | ✅ same ids | |
| `/api/health` after schema change | ✅ HTTP 200 | |
| typecheck / lint | ✅ 5/5, 0 problems | |

### Module 3 — Shared contract `@sc/schemas` — 2026-10-14
Files: `common`, `citation`, `course`, `tutor`, `quiz`, `mastery`, `eval`, `endpoints` (registry of 14 JSON endpoints), `mocks` (one per endpoint + 4 extra UI states).

| Test group (`npm run test`, node:test via tsx) | Tests | Result |
|---|---|---|
| Every endpoint mock validates against its response schema; no missing/extra mocks; extra UI states valid | 16 | ✅ |
| Valid requests parse; invalid ones rejected (QUIZ without topics, blank message, duplicate answers, malformed response) | 5 | ✅ |
| Citations: exactly one locator per type, tEnd ≥ tStart, positive page, non-empty excerpt | 5 | ✅ |
| Grounding: material ⇒ ≥ 1 citation; outside ⇒ none; refused ⇒ no material; NOT_COVERED ⇒ refused | 6 | ✅ |
| Quiz safety: client question strips answer/explanation/misconceptions/verifier data; MCQ ≥ 2 options; difficulty 1–3 | 3 | ✅ |
| Mastery bands (0.4 / 0.7 boundaries) + band/p consistency | 2 | ✅ |
| Helpers: formatTime, formatLocator, citationHref | 3 | ✅ |
| Eval test-set schema + composition gaps | 4 | ✅ |
| Zod enums == Prisma enums (9) | 9 | ✅ |
| **Total** | **53** | **✅ 53/53** |

Other checks: all 14 mocks validate inside the Next.js app via `@sc/schemas` + `@sc/schemas/mocks` (temporary route, removed) ✅; the brief's `api.ts` fetch snippet typechecks ✅; DB has no drift after the schema comment edit (`migrate diff` → no difference) ✅; typecheck 5/5, lint clean ✅.

### Module 3.1 — Contract v1.1 + `@sc/client` — 2026-10-14
Fixes from INTEGRATION_AUDIT (I-01…I-07, I-17): typed client package, per-endpoint mock switching (`NEXT_PUBLIC_API_MODE=auto`), `paths` builders + query schemas, registry `status` enforced against route files, `HealthResponse` in the contract, `AttemptResult.options`, consistent mock timeline, 200-on-success + `API_ERROR_STATUS`.

| Test group | Tests | Result |
|---|---|---|
| Schemas: v1.0 contract (mocks, grounding, quiz safety, enums…) | 55 | ✅ |
| Schemas: `paths` ↔ registry pattern + query schema (one per endpoint) + encoding | 17 | ✅ |
| Schemas: registry `status` ↔ route files (both directions), non-JSON routes, no unregistered routes | 19 | ✅. **Red first:** 6 Module 4 checks failed until the routes existed |
| Schemas: mock consistency (n = events, chained values, report ↔ events, chat ↔ events, options) | 6 | ✅ |
| Schemas: v1.1 rules (options refine, response-type match, extensions, query blanks, error statuses, cap) | 6 | ✅ |
| Client: modes (mock/auto/live), deep-copied mocks, delay, baseUrl | 4 | ✅ |
| Client: HTML 404 / empty 405 → `http_error`, ApiErrorBody → code+status, contract break → `invalid_response`, network, health 503 | 6 | ✅ |
| Client: request validation before send, trimmed JSON, URL building, DELETE, raw upload, pre-send upload rejection | 6 | ✅ |

### Module 4 — Learners, uploads, sources, file serving — 2026-10-14
Code:
- `packages/core/src/{errors,storage,media,course,learners,sources,testing}.ts`.
- Routes `learners`, `sources`, `sources/[id]`, `files/[id]`, plus a refactored `health` on the shared `api/_lib/http.ts`.
- `tools/e2e`.

| Check | Result |
|---|---|
| Core: content validation (PDF pages / damaged / non-PDF; PPTX slides / not-a-deck / no slides / non-ZIP) | ✅ 7 |
| Core: MP4 duration (mvhd v0/v1, moov after mdat, 64-bit box, unknown marker, no moov, truncated) + 20:00 / 20:01 + non-MP4 | ✅ 11 |
| Core: streaming save (exact bytes, cap abort + cleanup, no overwrite); repo-root detection; path traversal refused | ✅ 5 |
| Core: `parseByteRange` (12 header cases) | ✅ 12 |
| Core (DB): learners; PDF/PPTX/MP4 upload → row, file, list, serve, delete; rejected uploads leave nothing; early Content-Length reject; base-name filenames; 409 while PROCESSING; missing course → 409 | ✅ 8 |
| e2e: registry vs server (live answer + validate; planned → 404; client `http_error`; 405s; ApiErrorBody) | ✅ 15 |
| e2e: learners (create/trim/list, 4 invalid bodies → 400, client pre-validation) | ✅ 3 |
| e2e: sources (unicode filename, repo-root path, PPTX slides, MP4 duration, delete + 404, 409 PROCESSING, 6 invalid uploads → 400 + no leftovers, early Content-Length reject) | ✅ 7 |
| e2e: **2 GiB chunked upload cut off after 503 MiB** (streaming proven; partial file removed) | ✅ |
| e2e: files (full GET headers + bytes, HEAD, 4 Range cases → 206, 416, multi-range → 200, video probe + seek, unknown id 404, missing file 404) | ✅ 12 |
| Production server: same 37 e2e tests | ✅ 37/37 |
| Production: `Accept-Encoding: gzip, br` on full and Range requests → no compression, bytes exact | ✅ |
| `next build` | ✅ 0 warnings (after fixes N-3, N-4) |
| Leftovers after all runs (`data/uploads`, test rows) | ✅ none |

Bugs found and fixed by these tests (INTEGRATION_AUDIT §11.2):
- **N-1:** a damaged PDF caused a 500 → now 400.
- **N-2:** `bytes=<size>-` returned 200 → now 416.
- **N-3:** a Turbopack warning on every request (`export *` from Prisma).
- **N-4:** whole-project output tracing.

Not verified yet:
- A real browser playing and seeking a real mp4.
- The PDF iframe `#page=N` in a browser (needs the UI).
- A real lecture file through the MP4 parser.

### Module 7 — Video ingestion — 2026-10-14 (REAL Gemini, your video)
| Attempt | What happened | Fix |
|---|---|---|
| v1: one call over the whole 154 s | Content right, first 46 s accurate (±0.6 s), then the 46–75 s slide was given 46–115 s: **every later timestamp ~39 s late, the last 2 sections missing** (6/12 facts at the right time) | Probe: the same model on a 60 s clip (Files API `videoMetadata` offsets) → **≤0.5 s error**. Rebuilt as ≤60 s windows, clip-relative times, per-window validation + cache |
| v2 first run | Windows 1–2 OK; window 3 → **HTTP 400** "invalid duration": end offset `154.15727891156462s` exceeds the 9-decimal Duration format. Progress also showed 3/2 | Offsets formatted to 0.1 s; last window ends at floor(duration); progress = windows + 1 |
| v2 final | **12/12 on-screen facts found, 12/12 in a segment overlapping the true time (±3 s), mean start error 0.3 s (max 0.9 s)**, 12 segments, coverage 100%, longest 28.9 s; re-run 0 requests | — |

- **Known small flaw:** a word is cut at the 102.8 s window edge ("…is where it all comes together").
- **NOT VERIFIED:** transcript word-accuracy (no reference transcript). It reads as natural speech, ~186 words/min.
- **Cost of Module 7 (incl. failures and the probe):** about 6 generate requests (≈30K input tokens) + 22 embedding requests.

### Module 8 — Retrieval — 2026-10-14 (REAL Gemini embeddings, your knowledge base)
`retrieve()` embeds the question (`RETRIEVAL_QUERY`, cached), scores all 26 chunks by cosine similarity, and returns the top k as contract citations (excerpt ≤ 600 chars). Exposed as `POST /api/search`.

| Check (`npm run stage1:retrieval`, 15 test-set questions) | Result |
|---|---|
| Answerable (6 PDF + 4 video): right page / time range in top 6 | **10/10 (hit@6 100%)**; hit@1 90%, hit@3 100%, MRR 0.95 |
| Only rank-1 miss | "what does the clerk represent": rank 1 = the clerk illustration segment, rank 2 = the table segment that states it (0.81 vs 0.80) |
| topScore answerable vs off-material | 0.713–0.824 vs 0.596–0.702 |
| Extra natural query ("What happens to a process when it waits for I/O?") | top = page 5 state diagram, score 0.702: **same score as the off-material SJF question**. A score threshold alone can't separate them; the tutor needs the model's NOT_COVERED judgment, with τ only as a floor (~0.60). `REFUSAL_TAU` 0.55 is too low |
| Repeated query | 0 new embedding requests (cache) |
| Cost | 16 embedding requests, 0 generate |

### Stage-1 dataset preparation — 2026-10-14 (inputs: YOUR real files, read-only checks)
| Check | Result |
|---|---|
| Copied package → `data/demo/` | ✅ 10 files, byte-identical (`cmp`), all gitignored |
| PDF content (viewed every page) | 8 pages of "CS C372" lecture slides; pages 4, 9 image-only; no Gantt chart / numerical in the original |
| Round Robin slide (your screenshot) | Headline numbers **verified by independent simulation** (schedule, 7.75, 3, 7 switches); **one slide error** found (FIFO at t=8 shows P3 after it finished) |
| `process-scheduling-9pages.pdf` | ✅ original 8 pages + RR slide; deterministic rebuild; upload validator accepts (9 pages) |
| Video (ffprobe + scene detection + frames) | ✅ 154.16 s H.264+AAC, narration throughout; 12-segment map with exact times (data/demo/README.md) |
| `tools/smoke/fixtures/sample.mp4` | ✅ 45 s lossless cut (25.8–70.8 s), accepted by validator, gitignored |
| Test set `data/demo/testset.stage1.json` | ✅ 15 items (6 PDF, 4 video, 5 off-material; 4 need a figure), `TestSet` schema valid |
| Ground truth `tools/e2e/stage1/expectations.json` | ✅ 9 pages, 47 regex facts (written by reading each page) |

### Module 4.5 — Gemini rate limiter, cache, usage ledger — 2026-10-14
Verified free-tier limits (your AI Studio screenshot): Flash Lite 15 RPM / 250K TPM / 500 RPD; Embedding 100 RPM / 30K TPM / 1K RPD. **Embedding requests count per text** (dashboard showed 4 for 4 texts in 2 calls). The limiter enforces defaults below these (12 / 200K / 450 and 80 / 24K / 900), configurable via env.

| Test (no Gemini; fake clock / temp files) | Result |
|---|---|
| RPM sliding window; TPM window; settle() with real tokens frees room; oversize call fails fast | ✅ 3 |
| Concurrency cap | ✅ 1 |
| Daily budget: stops at RPD, persists across restart, resets next Pacific day; embeds count per text | ✅ 2 |
| Pacific-day boundary (PDT/PST), env overrides | ✅ 2 |
| Disk cache round-trip / miss / `LLM_CACHE=off` | ✅ 1 |
| `generateJson` cache: miss tries Gemini; **hit works with no API key**; stale entries ignored; key varies by model/schema/key | ✅ 4 |
| `embed` cache: cached texts need no network; task type is part of the key | ✅ 2 |
| `retryDelayMs` (RetryInfo parsing), token estimates | ✅ 2 |
| **Real:** video smoke via limiter (1 request) | ✅ 45.1 s → 4,129 input tokens (≈91 tokens/s), 2 segments (coarse: Module 7 prompt must ask for finer segments) |

### Module 5 — PDF ingestion — 2026-10-14
Design:
- Upload is free and stays `PENDING`.
- `POST /api/sources/[id]/ingest` → `PROCESSING` → `READY` / `FAILED`.
- Job flow: split pages (pdf-lib) → 1 cached Gemini call per page (4 in flight, limiter-paced) → text/figure/table blocks → chunks with exactly one page locator → embeddings (cached per text) → atomic chunk replace.
- Server start marks stale `PROCESSING` rows `FAILED` (`instrumentation.ts`).

| Test | Inputs | Result |
|---|---|---|
| `pageChunks` grouping / figures / tables / empties / long text / labels; `embedText` | synthetic | ✅ 4 |
| `splitPdf` | synthetic (`makePdf`) | ✅ 1 |
| PENDING→PROCESSING→READY, page-cited chunks, embeddings, stats, progress | synthetic PDF + **fake Gemini** | ✅ |
| Re-run replaces chunks; failing page → FAILED "Page 2: …", no chunks; empty → FAILED; 2nd request while running → 409; PPTX/unknown → 409/404 | synthetic + fake Gemini | ✅ 5 |
| Stale-PROCESSING recovery (only stale rows) | DB | ✅ 1 |
| e2e: upload never starts ingestion (usage unchanged); ingest PPTX → 409, unknown → 404 (Module 6 replaced the PPTX case with "already processing → 409") | synthetic, no Gemini | ✅ 2 |
| **Real:** `npm run stage1:pdf` on `process-scheduling-9pages.pdf` | **your PDF, real Gemini** | ✅ run 1: 12 s, 9 requests (8,091 input tokens), 14 embeddings · run 2: 0 requests (cache) |
| **Real:** fact recall vs ground truth | your PDF | ✅ **47/47 (100%)**; figures on pages 3 (×2), 4, 5, 9; locators page-only 1–9; 768-dim embeddings |

Manual review of all 14 chunks:
- **Faithful:** verbatim text on pages 1–2 and 6–8; footers dropped.
- **Page 5:** all 6 state transitions correct.
- **Page 9:** table, formulas and a Gantt timeline with correct times reconstructed from the image; the slide's FIFO error reproduced, not "fixed".
- **Minor issues:**
  - The page 3 histogram description says it starts at ~160 at 0 ms (it actually peaks at ~155 near 2 ms).
  - Page 4's nested bullets were flattened onto one line.
  - Page 5 has an extra title-only text chunk.

### Overfitting audit — 2026-10-14 (your request; nothing in retrieval changed before results were recorded)

**1. Dataset-specific values in the implementation.** Found in the ingestion prompts, now fixed:

| Where | Contamination | Fix |
|---|---|---|
| `ingest/pdf.ts` prompt | Examples copied from the Stage-1 PDF: footer "CS C372 OPERATING SYSTEMS" (page footer), "Process state diagram" and "running -> waiting: I/O or event wait" (page 5); subject fixed to "Operating Systems" | `pdfPagePrompt(courseName)`: subject-agnostic, no examples from any dataset; the course name comes from the DB |
| `ingest/video.ts` prompt | Subject fixed to "Operating Systems" | `videoPrompt(courseName)`, same treatment |
| Cache keys | Prompt text not in the key | Key now includes `sha256(prompt)`, so any prompt change misses the cache automatically |

A grep of `packages/*/src` and `apps/web` for file names, page numbers, timestamps, concept words, chunk/question ids and expected answers finds nothing else. Every numeric constant has a non-dataset origin (architecture, design decision, limiter estimate), with one exception: the 60 s video window was chosen after v1 drifted on the Stage-1 video. Point 8 shows it carries over to a different video.

**2. Tuning to the 26 chunks / 15 questions:** none in retrieval. `retrieve.ts` was last modified at 03:47:09, before the first Stage-1 query (03:48:24). It has no thresholds, keyword rules or re-ranking.

**3. Origin of the 15 Stage-1 questions:**
- 8 come from the IIIT Nagpur exam papers: CPU/I-O bound, the printf transition, missing transitions, and the off-material Banker's, page faults, disk seek, SJF order and EDF questions.
- 7 were written from the material: dispatcher, RR numerical, TAT formula, and the 4 video questions.
- All 15 were written at 03:12, before any ingestion or retrieval existed.

**4. Manually encoded expected results:** yes, by design, and only in test files (`tools/e2e/stage1/*.json`, `data/demo/testset.*.json`). No application code reads them (grep).

**5. Video ground truth:** ffmpeg scene detection (`select='gt(scene,0.25)'`) on the original file gave 11 cuts. One frame per segment was read for its on-screen text. Re-measured during the audit, all 11 cuts match within 0.04 s. Speech is not part of the ground truth because no reference transcript exists.

**6. NEW holdout retrieval test** (`data/demo/testset.holdout.json`, sha `a7d488da`). Written at 04:11, after `retrieve.ts` was frozen, and run once.
- **Answerable items (20):** 4 verbatim exam questions (partial coverage), 11 new PDF questions (6 need a figure or image-only page; 1 Hinglish, 1 misspelled) and 5 video on-screen facts.
- **Off-material items (16):** 5 unrelated, 5 same course but not covered, 6 near-miss scheduling questions (4 of them verbatim exam questions).

| Metric | Holdout | Random ranking of the same 26 chunks |
|---|---|---|
| hit@1 / hit@3 / hit@6 | **95% / 100% / 100%** | 10% / 28% / 48% |
| MRR | **0.97** | 0.26 |

- **Only rank-1 miss:** "where does the scheduler choose the next process from?" The rank-1 result was the definition segment (24.8–38.8 s), which also says "picks one process from the ready queue". The pre-registered segment came 3rd. It stays counted as a miss.
- **Caveat:** 26 chunks is a tiny pool; top-6 covers 23% of it.

**7. Off-material probes** (top-3 chunks and scores in `data/demo/testset.holdout.report.json`):

| Group | top score | Refused at τ=0.55 / 0.60 (both fixed before the run) |
|---|---|---|
| Answerable (20) | 0.650–0.820 | 0 refused at either τ (all kept) |
| Unrelated (capital, photosynthesis, linked list, cricket, prompt injection) | 0.493–0.569 | 3/5 · 5/5 |
| Same course, not covered (deadlock, thrashing, TestAndSet, zombie, first-fit) | 0.597–0.666 | 0/5 · 2/5 |
| Near-miss scheduling (kernel mode, priority, SRTF, MLFQ, CFS, convoy) | 0.629–0.707 | 0/6 · 0/6 |

- **A score threshold cannot separate near-miss questions from answerable ones.** The SRTF exam question scores 0.707, above the lowest answerable question (0.650). The tutor must refuse on the model's NOT_COVERED judgment and use τ only as a floor (0.60 removes all unrelated questions and keeps every answerable one).
- **The title page (p.1) is a "hub":** it is the top-1 chunk for 7/16 off-material queries.
- **API limit found:** the 608-char verbatim SRTF question was rejected because the search query cap was 500 chars. It was recorded as a failure, then the cap was raised to 2,000 (the same cap as a tutor message). After the fix the question is accepted, with a top score of 0.707.

**8. A different PDF / video / question set, unchanged code** (`npm run holdout:generalize`; ground truth `tools/e2e/holdout/generalization.json` written before the first run; each file in its own course):

| Input | Ingestion | Ground truth | Retrieval (own course) |
|---|---|---|---|
| **REAL** `pipes-c-program.pdf`: C code listing, 3 A4 pages, course "Systems Programming Lab: Pipes in C" | READY in 4.2 s; 3 requests (2,616 tokens); re-run 0 | **21/21** facts (code copied verbatim) | **hit@1 2/5** (random 1/3): weak on code; one chunk per page, and the pages embed alike |
| **SYNTHETIC** `hash-tables-synthetic.mp4`: 69.4 s, 6 rendered slides + Windows TTS, built for this test | READY in 19.1 s; 2 windows (6,880 tokens); re-run 0 | **14/14** facts (8 on-screen, 6 spoken); **5/5 slide cuts** (±1.5 s), 0 extra; mean start error **0.22 s**; window edge at 34.7 s (inside a slide) merged correctly | **hit@1 5/5** |

- **No cross-course results:** 0 across 14 queries.
- **Question set:** the retrieval check now takes any test-set path (`npm run stage1:retrieval -- <file>`). It was hardcoded to the Stage-1 file.
- **Code path:** upload → `requestIngestion` → `extractPdf` / `extractVideo` (course name only) → `embed` → `retrieve(courseId)`. There is no branch on file name, page, time or subject.

**Regression found by re-running Stage-1 after the prompt fix:**
- **PDF:** unchanged at 47/47.
- **Video:** still 12/12 facts at ±3 s, but the mean start error went from 0.3 s to 0.9 s.
- **Video boundary recall vs the scene cuts:** 10/11 at ±1.5 s.
  - The 132.4 s cut ("Key Exam Points") is missed: it is merged into 124.8–154.1 s, a 7.6 s start error for that section.
  - There is an extra boundary at 51.4 s: the "How Scheduling Works" slide was split at the window edge with different titles, so the edge merge didn't apply.
- **Status:** open, not tuned away.

**Bug found and fixed:** the usage ledger lost updates when two processes used Gemini (dev server + a script). Each process kept a cached copy and overwrote the other's counts. It now re-reads the file before every update and writes atomically. Covered by a unit test and verified live: the server reported the script's 5 requests.

**Audit cost:** generate 17 requests, about 30K input tokens (12 for the Stage-1 re-ingestion after the prompt fix, 5 for the holdout files); embed about 80 requests (36 holdout questions, about 22 re-ingestion, 9 holdout chunks, 14 holdout-course queries).

### Module 6 — PPTX ingestion — 2026-10-14 (REAL Gemini, real decks)

**As built:**
- Exact parts from the XML, with no model:
  - slide order from `ppt/presentation.xml` (not file names)
  - titles (title placeholder, or a short first line when the deck has no title placeholders)
  - text with bullet levels, tables as Markdown rows, SmartArt text, speaker notes
- Slide-number, date and footer placeholders are dropped, along with slide-number fields.
- Pictures go to Gemini in batches of 5 slides. Gemini returns figure descriptions and concept labels (cached by file hash + slides + prompt hash).
- Pictures that are skipped, with the reason:
  - EMF, WMF, SVG, GIF: unsupported format
  - icons under 32 px
  - logos on ≥ 3 slides and more than half the deck
  - pictures over 7 MB, or over 14 MB per batch
- Unreadable content pictures leave a `[Figure omitted: …]` note in the chunk (decision Q18).
- Output: one `SLIDE` chunk per slide.

**How it was verified:**
- **1. Parser on the real decks, no Gemini.** Every text run in the slide XML was compared with the parser output.
  - Decks: VM deck (40 slides), Lab2 deck (24), Deadlock deck (167), generated deck (10).
  - Result: **all 5,061 runs present** except slide numbers, slide-number fields and tab-only runs (all dropped on purpose).
  - Slide order matches an independent count on all 4 decks.
- **2. Ground truth before ingestion** (`tools/e2e/pptx/decks.json`):
  - text facts from the XML
  - figure facts written by viewing every picture the parser sends
- **3. Real Gemini run** (`npm run stage1:pptx`). Each deck in its own course:

| Deck | Gemini | Facts | Retrieval (own course) |
|---|---|---|---|
| **REAL** OS Module 5 deck (Virtual Memory + File Mgmt): 40 slides, 8 pictures, no title placeholders | 8 requests, 16,567 input tokens, 40 embeds; re-run 0 | **21/21** (titles, order, count; disk, directory and linked-list figures) | hit@1 4/4 |
| **REAL** OS lab deck (file system calls): 24 slides, code-heavy, slide 4 = title + picture only | 5 requests, 5,151 tokens, 24 embeds; re-run 0 | **15/15**, including all 8 `O_*` flags read from the picture | hit@1 3/3 ("What does O_TRUNC do?" → the picture-only slide) |
| **GENERATED** Stage-1 deck: 10 slides, text only | 2 requests, 1,137 tokens | **9/9** | hit@1 2/2 |

**Manual review of the figure descriptions:**
- Faithful, nothing invented: platters, spindle, actuator arm, heads; tracks and sectors; partitions → directory → metadata table → directory entry; linked list of file names with pointers to data blocks; all 8 flag rows verbatim.
- Minor issues:
  - "heads extending to each surface" overstates the drawing, which shows one head per platter.
  - The user/file/folder icons on VM slide 19 were described; that's harmless, slight noise.
- The decorative illustration on slide 40 was correctly not described.

**Unit tests (fake Gemini; they only cover our deterministic code, they are not evidence that the feature works):** 13 new tests.
- slide order vs file names, placeholders, entities, fallback titles
- picture filtering + omitted notes
- PNG/JPEG header sizes
- chunk composition, batching + progress, failure message, request parts
- PPTX → READY through the orchestrator

**Not verified / limitations:**
- **Diagrams drawn with PowerPoint shapes** (e.g. VM slides 5–8 and 12–18: page tables and FIFO/LRU traces) become loose labels with no layout. Only placed pictures get descriptions. A fix needs slide rendering (LibreOffice is on the cut list).
- Speaker notes are verified on the synthetic deck only. The real decks' notes parts are empty.
- Charts are not extracted (noted as `[Figure omitted: chart (not extracted)]`). None of the real decks has one.

### Module 9 — Course build — 2026-10-14 (REAL Gemini, 2 courses)

**As built:**
- `POST /api/build` (`buildCourse` in `packages/core/src/build.ts`).
- One `generateJson` call (role strong) over an outline of the course: one line per chunk with location, kind, title (or excerpt) and concept labels, grouped by source in material order.
  - Returns 5–8 topics: name, description, prerequisite keys.
  - The prompt is subject-agnostic (course name only).
  - Cached by prompt hash + outline hash.
- Prerequisites that are unknown, self-referencing or forward are dropped. The graph is acyclic and `seq` follows prerequisites.
- Topics are embedded (`RETRIEVAL_QUERY`). Each chunk is tagged to its nearest topic by cosine.
- One transaction: delete the old topics (cascade), insert the new ones, tag the chunks.
- **Q9:** if any topic has mastery, mastery events or questions, the build is refused with 409 unless `{ force: true }`.
- `GET /api/topics?courseId=` lists topics by `seq` with chunk counts.

**Acceptance criteria written BEFORE the code** (`tools/e2e/build/expectations.json`):
- structure
- concepts the material teaches must appear
- concepts absent from the material must not appear (absence verified by SQL over the chunks)
- tagging of pre-registered locations ≥ 80%
- basics before algorithms

| Course | Gemini | Result |
|---|---|---|
| `pptx-vm` (REAL 40-slide VM + file-management deck) | 1 request (1,359 tokens) + 6 embeds; rebuild 0 | **18/18 checks pass.** 6 topics (VM intro → VM mechanics & faults → page replacement; file systems & disk → allocation → directory & free space). Tagging 11/12 (92%). Nothing invented |
| `demo-course` (REAL PDF + video) | 1 request (1,079 tokens) + 5 embeds; rebuild 0 | **19/21 pass, 2 FAIL** (see below). 5 topics: Foundations of CPU Scheduling → Process Execution and States → Scheduler and Dispatcher → Performance Metrics → Round Robin. Nothing invented (no FCFS, SJF, deadlock…) |

**The 2 demo-course failures, recorded as is (criteria not changed after the run):**
1. **No topic names preemptive / non-preemptive scheduling.** It appears in one video segment, which was folded into "Foundations of CPU Scheduling".
2. **Tagging 11/14 = 79%** (threshold 80%).
   - Real miss: the p.4 "CPU-bound usage timeline" figure went to Foundations, while its p.4 siblings went to "Process Execution and States".
   - The 2 "How scheduling works" video segments went to Foundations. That is defensible by meaning, but it doesn't match the pre-registered regex.
- **Also observed:** topic sizes are uneven (Foundations 15 chunks, including all 12 video segments; Scheduler and Dispatcher 1).
- **Not tuned on these criteria.** A candidate improvement is to let the planning call assign units to topics instead of nearest-embedding. It would need a fresh course with new pre-registered criteria to evaluate fairly. Your call.

**Tests:**
- 8 unit/DB tests with a fake planner (pure helpers; tagging; rebuild; Q9 409 + force cascade; unknown/empty course).
- 2 e2e tests (validation 400, unknown/empty course 409, no quota spent).
- Contract: build + topics are live; `listTopics` takes `?courseId`.

### Modules 10–12 — Tutor, BKT, Quiz — 2026-10-14 (REAL Gemini; criteria fixed before each run)

**Module 11: BKT** (`packages/core/src/bkt.ts`).
- `updateMastery(p, correct, type, weight?)`: standard BKT.
  - Prior 0.3, learn 0.15, slip 0.1.
  - Guess MCQ 0.25 / SHORT 0.1 / NUMERIC 0.05.
  - Chat evidence is weighted 0.3.
- `applyObservation` updates `Mastery` and writes a `MasteryEvent` (before/after, source, cause) in one transaction.
- `difficultyFor(p)`: weak → 1, developing → 2, strong → 3.
- 6 tests: hand-computed values, damping, monotone/bounded, DB trail.

**Module 10: Tutor** (`packages/core/src/tutor.ts`; `POST /api/chat`, `GET /api/chat`, `POST /api/eval/answer`).
- **Pipeline:**
  - retrieve top 6
  - below `REFUSAL_TAU` → refuse (`off_material`) with no LLM call
  - learner mastery and weak prerequisites go into the prompt
  - one structured call returns coverage, blocks (`material` cite excerpt ids / `outside`) and learner evidence
- **Server guards:** unretrieved citations dropped; uncited material → `outside`; `NOT_COVERED` or no material left → refused (`not_covered`), with the refusal listing the course's topics.
- **Chat evidence:** damped BKT update.
- **Eval endpoint:** the same pipeline with no learner and no writes, cached; it returns labelled blocks + contexts for RAGAS.
- 8 guard tests + 2 e2e (no quota).

| Real check (`npm run stage1:tutor`, 51 test-set questions + a live 4-turn chat) | Target | Result |
|---|---|---|
| Off-material refused | ≥ 80% | **18/21 = 86%** (unrelated 5/5, same course 8/8, near-miss 5/8) |
| Answerable wrongly refused | ≤ 20% | **0/30** |
| Answered questions citing an expected location | ≥ 80% | **29/30 = 97%** |
| Chat: misconception lowers mastery, correct statement raises it, off-material refused, history stored | all | **all pass** (0.300 → 0.267 → 0.427) |
| Cost | — | 53 generate requests (70K tokens) |

- **Near-miss answers:** the 3 near-miss questions answered PARTIAL (SJF order, priority, SRTF). Each says what the material lacks. The SJF naming sits in an `outside` block.
- **Faithfulness issue:** one `material` block slightly over-reaches beyond its citation (p.7 defines waiting time; the block adds "prioritize short bursts"). RAGAS faithfulness will quantify this kind of issue.

**Module 12: Quiz** (`packages/core/src/quiz.ts`; `POST /api/quiz`, `GET /api/quiz/[id]`).
- **Plan:** diagnostic = 1 per topic; mock = 10; quiz = chosen topics. Allocation by (1 − mastery); difficulty by band; type mix MCQ/SHORT/NUMERIC.
- **Generation:** one call, +50% candidates, using each topic's own excerpts plus the stems already seen. Distractors carry misconception labels.
- **Code checks:**
  - shape and answer index
  - citations must be real excerpts **of the question's own topic**
  - stem hash not seen before (no repeats)
- **Blind verification:** one call. MCQ/NUMERIC are answered without the key (numeric within 1%, compared in code); SHORT reference answers are checked against their sources.
- **Storage:** rejected questions are stored unattached.
- 11 unit + 1 e2e (no quota).

| Real check (`npm run stage1:quiz`) | Result |
|---|---|
| Diagnostic, new learner | 5/5 topics, 1 each |
| Mock | 10 questions; second mock shares **0** stems with earlier quizzes |
| Types | MCQ, SHORT, NUMERIC all generated |
| Adaptivity (topic at p 0.99 vs 0.20) | weak topic 5 questions at difficulty 1, strong topic 1 at difficulty 3 |
| Other course (VM deck) | diagnostic 6/6 topics |
| Answer leak in `GET /api/quiz/[id]` | none |
| Run 1 → fix | FAIL: 2 questions cited another topic's excerpt → fixed (own-topic citations only); run 2: **16/16** |
| Cost per quiz | 2 generate requests (~3.7K input tokens) |

- **Manual review of answer keys:** VM bit-vector and Belady keys checked against slides 30 and 16 (correct); Round Robin 7.75 correct.
- **Quality notes:**
  - Some NUMERIC questions are shallow (summing burst times) when a topic has no worked computation.
  - One SHORT question asked about the structure of a slide rather than a concept.

### Modules 13–14 — Grading, report, mastery API — 2026-10-14 (REAL Gemini; criteria fixed before each run)

**Module 13** (`packages/core/src/grading.ts`; `POST /api/quiz/[id]/submit`, `GET /api/quiz/[id]/report`).
- **Grading:**
  - MCQ / NUMERIC are graded in code against the stored, verified key (numeric within 1%).
  - SHORT answers are scored by one batched call against reference, key points and sources; pass at ≥ 0.6.
- **Alignment guard:** items go in as JSON objects, and the grader must echo the first words of the answer it graded. A mismatch is re-graded alone.
- **Per question:**
  - feedback citing the question's own sources
  - the misconception label of the chosen distractor
  - one BKT update (unanswered = wrong)
  - an Attempt row
- **Report:** score, per-topic correct/total + mastery before → after, misconceptions grouped, revisit citations (sources of missed questions, weakest topics first). Resubmit → 409.
- 3 unit + 1 e2e (no quota).

| Real check (`npm run stage1:grading`) | Run 1 | Run 2 (after fix) |
|---|---|---|
| Perfect student: objective 100%, SHORT references pass ≥ 90%, mastery up, every feedback cited | pass | pass (10/10; mastery 0.30 → ~0.96) |
| Wrong student: objective 0%, wrong SHORT pass ≤ 20%, chosen misconceptions reported, mastery down, revisit = missed sources | **FAIL: 2/4 wrong SHORT answers passed** | pass (0/10; mastery 0.30 → ~0.17) |
| Empty submission: all wrong, 0 Gemini calls · resubmit 409 · GET report = submit response | pass | pass |

- **Run-1 bug:** the batched grader misaligned answers and questions. It credited an answer about the ready queue for a turnaround-time question, with feedback describing the previous item's answer.
- **Fix:** structured JSON input + answer-echo check + per-item fallback. In run 2 the echo check never needed the fallback.
- **Cost:** about 1 request per submission with short answers; 0 without.

**Module 14** (`packages/core/src/mastery.ts`; `GET /api/mastery?learnerId=`).
- **Per-topic data:** p, band, n and prerequisites.
- **Weak topics:** assessed and weak, lowest first, with ≤ 3 revise citations (sources of missed questions first).
- **History:** every quiz/chat mastery event.
- **`needsDiagnostic`:** stays true until a submitted DIAGNOSTIC.
- **Real check (`npm run stage1:mastery`): 4/4.**
  - perfect: no weak topics, p consistent with history
  - wrong: 5 weak topics lowest-first, revise p.6 / video / p.3–5 / p.9 / p.7–8
  - chat-only learner: CHAT events
  - new learner: needsDiagnostic true → false after a diagnostic

- **All endpoints in the registry are now live.**

### UI wiring — 2026-10-14 (teammate's design kept; data layer replaced)

- **Every page reads the live API through `@sc/client`.** The teammate's mock arrays and invented numbers (study streak, milestones, "Alex") are gone.
- **Header:** learner picker; `?learner=<id>` in any URL selects that learner.
- **`/sources`:** list (polls while processing), upload by button or drag-and-drop with processing started automatically, retry and delete, build/rebuild topics (Q9 confirm), topics with prerequisites.
- **`/tutor`:**
  - real history and grounded chat
  - blocks labelled *from your material* (citation chips) vs *outside your material*
  - coverage badge, mastery change per turn
  - the grounding panel opens the citation at the exact place: PDF `#page=N` iframe, video seeked to tStart, reconstructed slide card
- **`/quiz`:** Diagnostic / Mock / Custom (topics + count); deep links `?kind=` and `?topics=`; MCQ, numeric and short answer; submit → report.
- **`/quiz/[id]/report`:** score, per-topic mastery before → after, misconceptions, every question with the correct answer and cited feedback, revisit list, citation viewer.
- **`/dashboard`:**
  - topology with band labels and prerequisites
  - overall mastery and evidence counts
  - diagnostic banner (cold start)
  - weak topics with revise links and a Practice quiz
  - recent activity
  - mastery-history small multiples (single hue; band shown as text; hover tooltips)
- **`/`:** the teammate's landing specimens are labelled illustrative; no fake counts.
- **Bugs found by rendering in headless Chrome (production build):**
  1. The report route needed `<Suspense>` around `useParams()` (Cache Components prerender error).
  2. The tutor crashed with "i is not a function": an expression-bodied `useEffect` returned the Promise that newer Chrome's smooth `scrollIntoView` returns, and React called it as a cleanup.
  3. Dashboard banner text claimed "every topic at the starting estimate" for a learner who already had evidence.
  All fixed and re-rendered.
- **Not automated:** click-through flows (uploading a file, sending a chat, answering a quiz) are verified at the API level and by page rendering, not by a scripted browser session.

### Module 15 (basic) — Evaluation — 2026-10-14

**RAG metrics** (`npm run eval:rag`; 51 questions = Stage-1 15 + holdout 36; answers from `POST /api/eval/answer`):
- RAGAS **definitions** re-implemented with a Gemini judge (`gemini-3.1-flash-lite`), one call per answered question.
- Not the `ragas` package: its per-metric LLM calls would exceed the free-tier daily quota for this set.

| Metric | All answered (30) | Stage-1 (10) | Holdout (20) |
|---|---|---|---|
| Faithfulness (material blocks) | **0.97** | 0.95 | 0.97 |
| Answer relevancy | **0.84** | 0.86 | 0.83 |
| Context precision | **0.87** | 0.94 | 0.83 |
| Context recall | **0.93** | 0.97 | 0.90 |
| Faithfulness (full answer incl. outside blocks) | 0.92 | | |

- **Computed in code:** citation accuracy **0.97**, refusal recall **0.86** (18/21 off-material), refusal precision **1.00**, false refusals **0/30**.
- **Caveats:**
  - The judge is the same model family as the generator.
  - Single judge; small team-built test set; references written by us.
  - Partial-coverage exam questions have low recall by construction (h-exam-context-switch, h-exam-doubling-quantum: 0.00).

**Simulated students** (`npm run eval:sim`; no LLM).
- **Setup:** the real course's 5 topics and prerequisites, a synthetic pool of 30 items (6 per topic, MCQ/SHORT/NUMERIC, difficulty 1–3), 3 sessions × 10 questions, 500 students per profile and policy, paired seeds.
- **Adaptive policy:** the app's `allocate` + `difficultyFor` + no-repeat rule; mastery estimated with the app's `updateMastery`.
- **Random policy:** a fresh random draw each session.
- **The students use a different model:** binary knowledge, learning 0.30 if prerequisites are known else 0.08, slip 0.08 + 0.04 per difficulty step, guess MCQ 0.30 / SHORT 0.05 / NUMERIC 0.02.

| Profile | Gain adaptive | Gain random | MAE s1 → s3 adaptive | MAE s1 → s3 random | Repetition adaptive / random |
|---|---|---|---|---|---|
| novice | **74.4%** | 63.7% | 0.314 → **0.184** | 0.325 → 0.217 | **0.0%** / 29.9% |
| basics only | **48.4%** | 41.5% | 0.239 → **0.104** | 0.267 → 0.141 | **0.0%** / 29.8% |
| prerequisite gap | 17.2% | 17.2% | 0.167 → **0.039** | 0.236 → 0.049 | **0.0%** / 30.0% |
| almost there | 17.0% | 16.2% | 0.152 → **0.037** | 0.229 → 0.055 | **0.0%** / 29.5% |

- **Reading:** the adaptive policy learns more where there is more to learn, and the two profiles missing one topic are capped at 20%.
- **Estimation:** it estimates mastery better in every profile.
- **Repetition:** it never repeats a question; random repeats about 30%.
- **Caveat:** synthetic students and items. This evaluates the policy and learner model under stated assumptions, not real learning.

### Subtopics (concepts) — 2026-10-14 (no Gemini calls)
- `GET /api/topics` returns per topic up to 8 **concepts**, merged from the chunks' ingestion concept labels (`conceptKey`: case, punctuation, spacing and simple plurals ignored), most-taught first, each with ≤ 2 citations. Shown as chips on /sources.
- Real course: all 5 topics got sensible concepts (e.g. Performance Metrics → turnaround, response and waiting time, CPU utilization, throughput); "CPU bursts"/"CPU burst" and "Turn Around time"/"Turnaround time" merge.

### Module 16 — Accounts — 2026-10-14
- `POST /api/auth/signup|login|logout`, `GET /api/auth/session`; scrypt (node:crypto) hashes; HMAC-SHA256 session cookie (HttpOnly, SameSite=Lax, 7 days); migration `20261014200000_learner_auth` adds the nullable `Learner.passwordHash`.
- Learner-scoped routes call `authorizeLearner` / `authorizeAssessment`: 401 unless the learner is an open (passwordless) profile or the session is theirs.
- Verified against the running server: 200 with the cookie; 401 without it, with a forged cookie, and for a wrong password; 400 for a duplicate name; logout clears the session; accounts never listed.

### Codebase audit — 2026-10-14 (fixes each with a regression test that fails on the old code)

| # | Finding (evidence) | Status |
|---|---|---|
| 1 | Gemini calls had **no timeout**: the SDK applies one only if `httpOptions.timeout` is set (verified in `@google/genai` 2.29.1 source). A hung call blocked a request forever | **Fixed and verified:** `LLM_TIMEOUT_MS` (120 s); a live 1 ms timeout aborted and failed cleanly |
| 2 | A **rejected key** (HTTP 400 `API_KEY_INVALID`) was neither rotated past nor explained (raw JSON) | **Fixed and verified live:** bad key alone → clear `config` error; bad key + valid keys → rotates and succeeds; unit test `isKeyRejected` |
| 3 | **Key rotation thrash:** concurrent 429s on one key each rotated, cycling back to it | **Fixed, not fully verified** (needs concurrent real 429s): rotate only if the failed call's key is still current |
| 4 | **Double submit** graded a quiz twice (check-then-write race; the old code crashed on `Attempt` uniqueness or doubled mastery) | **Fixed and verified:** atomic claim; concurrent submits → one 200, one 409, mastery once per question |
| 5 | A failed tutor turn left an **unanswered USER message** in the history | **Fixed and verified:** messages stored only once answered |
| 6 | **Re-ingesting** a source dropped its chunks' topic tags (they vanished from quizzes and concepts until a rebuild) | **Fixed and verified:** new chunks are tagged to the nearest stored topic vector (no Gemini call) |
| 7 | "No question survived verification" and "no usable topics" came back as **500 internal** | **Fixed:** `llm_error` (502) |
| 8 | A blank SHORT answer was reported as "could not be graded" | **Fixed and verified:** counts as unanswered |
| 9 | Dashboard "revise" chips for slides **downloaded the .pptx** | **Fixed:** slides show the excerpt on hover |
| 10 | `npm run lint` failed (4 × `react-hooks/set-state-in-effect`) | **Fixed without disabling the rule:** effects only set state in async callbacks; the quiz deep link derives its initial state from the URL |
| 11 | Docs described unbuilt parts as planned-and-current (`tools/eval/ragas.py`, `tools/sim`, lowercase tutor schema, one video call, "no auth") and 10 teammate design notes describe pgvector/hybrid search | **Fixed:** ARCHITECTURE §0 lists every deviation; teammate notes carry a "proposal, not implemented" banner; API_SPEC and README updated |

**Verified OK (no change needed):** the SDK never retries on its own (we never set `retryOptions`), so the limiter counts every request; per-request `httpOptions` merges with the client's; all colour tokens used by the UI exist; registry ↔ route files.

**Open risks (not fixed; need a decision):**
- No roles: anyone who can reach the server can upload/delete sources and force a rebuild (erases learners' progress on those topics). Needs an owner/admin role (**requires approval**).
- Login attempts aren't rate-limited.
- `applyObservation` is read-modify-write under READ COMMITTED: two simultaneous updates of the same learner+topic (a quiz submit and a chat turn at the same instant) could lose one.
- A DB failure halfway through writing a submit's attempts leaves a partial quiz; a retry after 5 min could duplicate the written part.
- The "already asked" stem list sent to the quiz generator grows with every quiz (token cost).
- Retrieval scores every chunk of the course in JS per query: fine at hundreds to low thousands of chunks, by design (no pgvector).

**Runs:** `npm run typecheck` 7/7 · `npm run lint` clean · `npm run test` 270 pass · `npm run build` 0 warnings · `npm run test:e2e` 35 pass (production server) · real browser 8/8, 0 console errors · live Gemini: generate ×2 models, embed, timeout, bad key, key rotation (≈ 6 requests).

## 5. Accuracy / eval metrics (filled in Module 15)

| Metric | Target | Current |
|---|---|---|
| Faithfulness | ≥ 0.85 | — |
| Answer relevancy | ≥ 0.80 | — |
| Context precision / recall | ≥ 0.75 | — |
| Citation accuracy (correct page/slide/timestamp) | ≥ 80% | — |
| Refusal precision / recall (off-material) | ≥ 0.8 / ≥ 0.8 | — |
| Quiz verify pass rate | report | — |
| PDF ingestion fact recall (Stage-1 ground truth) | ≥ 90% | **100% (47/47)** |
| Gemini cost: PDF ingestion (9 pages) | ~1 request/page | **9 requests, 8,091 input tokens; re-run 0** |
| Gemini cost: video | — | **≈91–96 input tokens per second of video**; 1 request per ≤60 s window |
| Video timestamp accuracy (Stage-1, on-screen ground truth) | ≤ 3 s | **mean 0.3 s, max 0.9 s (12/12)** |
| Retrieval hit@6 / hit@1 / MRR (Stage-1 test set) | ≥ 80% | **100% / 90% / 0.95** |
| Retrieval hit@6 / hit@1 / MRR (**holdout**, 20 answerable, written after retrieval was frozen) | ≥ 80% | **100% / 95% / 0.97** (random: 48% / 10% / 0.26) |
| Off-material top score (holdout): unrelated / same course / near-miss | separable? | 0.49–0.57 / 0.60–0.67 / 0.63–0.71 vs answerable 0.65–0.82: **not separable by τ alone** |
| Generalization: REAL other PDF (code listing) facts | ≥ 90% | **21/21**; retrieval hit@1 2/5 (weak) |
| Generalization: SYNTHETIC other video facts / slide cuts / start error | ≤ 3 s | **14/14 · 5/5 · 0.22 s** |
| PPTX ingestion facts (2 REAL decks + generated) | ≥ 90% | **21/21 · 15/15 · 9/9** |
| PPTX parser text coverage (4 real decks, 5,061 text runs) | 100% of content | **100%** (only slide numbers / tabs dropped) |
| Gemini cost: PPTX | ~1 request per 5 slides | **40 slides → 8 requests (16.6K tokens); 24 → 5 (5.2K); re-run 0** |
| Sim: mastery gain, adaptive vs random | adaptive > random | — |
| Sim: repetition rate | 0% | — |

## 6. Open issues / decisions
- Prisma pinned to **6.19.3**: npm `latest` currently points at an 8.0 RC, and 7.x needs driver adapters. 6 is the stable, simple choice.
- Postgres on host port **5434**: 5432 and 5433 are used by other containers on the dev machine.
- Gemini key var renamed to `APP_GEMINI_API_KEY` so a machine-wide `GEMINI_API_KEY` can never override `.env`. `packages/core/src/llm.ts` must pass `apiKey` explicitly (the SDK otherwise falls back to `GEMINI_API_KEY` / `GOOGLE_API_KEY`).
- **Root `.env` in a monorepo:** loading it from `next.config.ts` did NOT reach route handlers (Next 16 runs them in a separate process). Fix: `apps/web/scripts/next.mjs` calls Node's `process.loadEnvFile` before starting Next, so child processes inherit the values.
- **Windows DLL lock:** `prisma generate` fails with EPERM while the dev server runs. Typecheck no longer depends on it. The client is generated on `npm install` (postinstall) and at `npm run dev` start.
- Schema additions beyond the original plan (each needed by a later module): Source `filename/mimeType/sizeBytes/progressDone/progressTotal/pageCount/durationSec/gemini*`; Chunk `seq/title/conceptLabels`; Topic `seq/embedding`; Question `assessmentId/position/explanation/verifierAnswer`; Assessment `status/courseId/submittedAt`; Attempt `score`; MasteryEvent `attemptId/chatMessageId`; ChatMessage `blocks/refused/topScore/courseId`.
- **Rebuilding topics wipes mastery and questions for those topics** (cascade). That's acceptable for the demo: build the course once, before learners start.
- Contract additions vs. the original API list: `GET /api/topics` (quiz scope picker), `GET /api/chat?learnerId=` (history), `GET /api/quiz/[id]` and `GET /api/quiz/[id]/report` (pages load after navigation), `TutorAnswer.masteryUpdates` (shows learner-model updates from chat), `MasteryView.needsDiagnostic` (cold start), standard `ApiErrorBody`.
- **Promised to teammate:** Module 11 exports `updateMastery(p, correct, type, weight?) => number` from `@sc/core` (the simulator depends on it).
- `data/demo/` created for the dataset (gitignored except its README).
- **Cross-reference fixes (2026-10-14):**
  1. Module 1's "all 5 checks" isn't fully met, since video was never run. Tracked as a gap.
  2. Module 3 needs the teammate's sign-off.
  3. Modules 10 and 14 were split: the backend API is Parth's, and the citation panel and dashboard UI belong to the teammate. ARCHITECTURE §10 is updated to match.
  4. Module 4 now also covers the learners endpoints, and Module 9 covers `/api/topics`.
- **Module 5 decisions:**
  - **Ingestion is explicit** (`POST /api/sources/[id]/ingest`), not automatic on upload. This gives control over when Gemini quota is spent, and tests never trigger calls. The same call re-runs or retries, with finished pages from the cache.
  - Ingestion supported PDF only at Module 5. Video was added in Module 7, PPTX in Module 6 (2026-10-14).
  - A failed page fails the whole run (no partial chunks); retrying is cheap because finished pages are cached.
  - Cache key = file SHA-256 + page + `PDF_PROMPT_VERSION` + SHA-256 of the prompt text + model + schema. Prompt edits miss the cache automatically. Bump the version for schema/chunking changes.
- **Module 4 decisions:**
  - Uploads are **raw bytes + `?filename=`** (not multipart) so they stream to disk.
  - The **extension decides the type** and the **content must match**; the browser MIME type is ignored.
  - Source ids are UUIDs.
  - New uploads stay `PENDING` until Module 5 starts ingestion.
- `docs/TEAMMATE_BRIEF.md`: you deleted it on purpose. I recreated it by mistake; per your instruction it is left alone until you decide.
- Considered and deferred: an `LlmCall` table logging tokens per call (useful for quota tracking). Add only if needed.
- **Stop the dev server before `npm install`**: `@sc/db`'s postinstall (`prisma generate`) hits the same Windows DLL lock.
- `@sc/core` and `@sc/schemas` are `"type": "module"`. Without it `tsx` loaded them as CommonJS and named exports failed. `@sc/db` stays CommonJS because `prisma.config.ts` uses `__dirname`.
- Free tier: the limits are requests per minute and per day, and no charges apply unless billing is enabled on the AI Studio project. Check per-model limits in AI Studio → Rate limits.
- First `docker pull` failed with a transient Docker Hub auth EOF; the retry worked.
- **Audit follow-ups (open, not tuned on the holdout):**
  1. Code pages retrieve poorly (one chunk per page). Candidate fix: add each page's concept labels to the embedded text, or split code by blocks. Decide with the Module 15 eval, not this holdout.
  2. Title-only chunks (PDF page 1, video section cards) act as hubs for off-material queries. Candidate fix: merge title-only chunks into the next chunk.
  3. Video boundaries regressed after the prompt fix (132.4 s cut missed, extra 51.4 s boundary).
  4. Refusal needs the model's NOT_COVERED judgment (Module 10). τ = 0.60 is a reasonable floor on both test sets.
