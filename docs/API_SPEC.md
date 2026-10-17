# API Specification (contract v1.1)

Updated: **2026-10-14** after the codebase audit (Modules 0–16 live: ingestion, build + concepts, tutor, quiz, grading, mastery, accounts). Contract v1.1 + later additions listed per endpoint.
Source of truth for shapes: **`packages/schemas/src/*.ts`** (Zod). Typed client: **`@sc/client`**. This document restates them. If the two ever disagree, the code wins and this doc is wrong.

**Status legend**

| Label | Meaning |
|---|---|
| ✅ LIVE | Route exists, `status: "live"` in the registry, and the e2e suite exercises it against the running server |
| 📄 PLANNED | `status: "planned"` in `endpoints.ts`; **no route file** (a test enforces this); clients get the mock in `auto` mode |
| 🔶 PROPOSED | Not in schemas; needs agreement before use |

**Example provenance:** `[mock]` = copied from `packages/schemas/src/mocks.ts` (validated by tests) · `[test]` = from the contract/e2e tests · `[route]` = observed from the running route · `[proposed]` = valid against the schema, but no backend produces it yet.

---

## 0. Verified state (evidence, 2026-10-14)

| Check | Result |
|---|---|
| Unit + contract + DB tests (`npm run test`) | **270 pass** (schemas 121, client 16, core 133), after the audit fixes |
| End-to-end vs production server (`next build` + `next start`, `npm run test:e2e`) | **35 pass**; build 0 warnings; `npm run lint` clean |
| Real browser (headless Chrome via DevTools protocol) | sign-up form → tutor → reload keeps session (cookie not readable from JS) → dashboard → quiz setup → sources concepts → sign-out gate: **8/8**, 0 console errors |
| Live Gemini (minimal calls through `llm.ts`) | generate `LLM_MODEL_FAST` + `LLM_MODEL_VERIFY` OK, embed OK (768-d); a 1 ms `LLM_TIMEOUT_MS` aborts and fails cleanly; an invalid key → `config` error; invalid key + valid keys → rotates and succeeds |
| Real-data ingestion (`npm run stage1:pdf`) | 9-page PDF → READY, 47/47 facts; re-run 0 Gemini requests |
| Registry ↔ route files (test) | Every `live` endpoint is exported by its route file; no `planned` endpoint exists; no unregistered route |
| Planned endpoints over HTTP | Return Next's **HTML 404**. `@sc/client` maps this to `ApiError("http_error", 404)`, and in `auto` mode never calls them |
| Wrong method on a live route | **405**, empty body (e.g. `DELETE /api/learners`) |

---

## 1. Conventions (all JSON endpoints)

| Topic | Rule | Status |
|---|---|---|
| Base URL | Same origin as the UI (`http://localhost:3000`); Node scripts pass `baseUrl` to `createApiClient` | ✅ |
| URLs | Registry `path` values are **route patterns** (`/api/quiz/[id]`). Build concrete URLs with **`paths`** (`paths.quiz(id)`, `paths.mastery(learnerId)`); `@sc/client` does it for you | ✅ tested |
| Query strings | Typed per endpoint (`query` in the registry): `LearnerQuery {learnerId}`, `UploadQuery {filename}`, `HealthQuery {gemini?: "1"}`; invalid → 400 | ✅ |
| JSON bodies | `Content-Type: application/json`; validated server-side (`readBody`) **and** client-side before sending | ✅ |
| Upload body | **Raw file bytes** (`request: "binary"`), not multipart | ✅ |
| Dates | ISO-8601 UTC strings | ✅ |
| IDs | Opaque non-empty strings. Sources use UUIDs; other tables use cuids; seed/mocks use readable ids. **Never parse ids** | ✅ |
| Auth | **Accounts (Module 16).** `POST /api/auth/signup` / `login` set an HttpOnly, SameSite=Lax session cookie (`omnitutor_session`, HMAC-signed, 7 days). Learner-scoped routes (E9, E10, E12–E16) return **401** unless the learner has no password (open profile from `POST /api/learners`, used by tools/tests) or the session is that learner's. Course routes are not tied to an account | ✅ tested (unit, e2e via curl, browser) |
| Course | Single course; `courseId` optional, default `demo-course`. If the seed is missing, the API returns **409 `not_ready`** ("Run `npm run db:seed`") | ✅ tested |
| Success | **HTTP 200** for every JSON success, including POST/DELETE. Responses are validated against the response schema before sending; a violation is a 500 `internal` (backend bug, never silent) | ✅ |
| Errors | `ApiErrorBody` with fixed statuses (`API_ERROR_STATUS`), see below | ✅ |

### 1.1 Error contract: `ApiErrorBody` (`packages/schemas/src/common.ts`)

```ts
{ error: { code: ApiErrorCode, message: string } }   // message is written for end users
```

| `code` | HTTP (`API_ERROR_STATUS`) | Used when |
|---|---|---|
| `bad_request` | 400 | Body/query failed validation; unsupported, mismatched, empty, oversize or over-length upload |
| `not_found` | 404 | Unknown learner / source / quiz; stored file missing |
| `not_ready` | 409 | Seed missing; deleting a PROCESSING source; course not built; report before submit; quiz already submitted or being graded |
| `unauthorized` | 401 | Wrong name or password; a private learner's data without that learner's session |
| `rate_limited` | 429 | Gemini quota hit |
| `llm_error` | 502 | Gemini failed after retry; no quiz question survived verification; the course build returned no usable topics |
| `internal` | 500 | Anything else, including a response that broke the contract, and Gemini configuration problems (missing or rejected key: the message says which variable to check) |

`[mock]` `mockStates.error`: `{ "error": { "code": "not_ready", "message": "Sources are still processing. Try again when all are READY." } }`

**Client-side codes** (`@sc/client` `ApiError.code`, never sent by the server):

| Code | Meaning |
|---|---|
| `network` | Fetch failed (status 0) |
| `http_error` | Non-contract error response, e.g. HTML 404 from a route that doesn't exist |
| `invalid_response` | 2xx body failed the response schema; the message names the field |

The client also uses `bad_request` with **status 0** when it rejects input before sending.

### 1.2 Citation (`packages/schemas/src/citation.ts`), used by many responses

A discriminated union on `sourceType`. **Exactly one locator per type.**

| Field | Type | All types | Notes |
|---|---|---|---|
| `sourceType` | `"PDF" \| "PPTX" \| "VIDEO"` | ✓ | discriminator |
| `chunkId` | Id | ✓ | the `Chunk.id` cited |
| `sourceId` | Id | ✓ | the `Source.id`; used to build the file URL |
| `filename` | string (min 1) | ✓ | original upload name |
| `kind` | `"TEXT" \| "FIGURE" \| "SLIDE" \| "TRANSCRIPT"` | ✓ | |
| `title` | string \| **null** | ✓ | key **required**; slide title / figure caption, or `null` |
| `excerpt` | string (min 1) | ✓ | text to show beside the opened source. ≤ 600 chars from Module 10 (Q10) |
| `page` | int ≥ 1 | PDF only | 1-based page index **in the file** |
| `slide` | int ≥ 1 | PPTX only | 1-based slide number (presentation order) |
| `tStart`, `tEnd` | number ≥ 0, `tEnd ≥ tStart` | VIDEO only | seconds (float) |

Helpers exported from `@sc/schemas` (tested):

| Helper | PDF | PPTX | VIDEO |
|---|---|---|---|
| `formatLocator(c)` | `"p. 7"` | `"slide 9"` | `"12:34–13:32"` |
| `citationHref(c)` | `/api/files/{sourceId}#page=7` | `/api/files/{sourceId}` (UI shows a slide card instead) | `/api/files/{sourceId}#t=754` |

`formatTime(s)`: `75.4 → "1:15"`, `3725 → "1:02:05"`.

Examples `[mock]` (`citations` in `mocks.ts`):
```json
{ "sourceType": "PDF", "sourceId": "src-pdf", "filename": "Galvin_Ch5_CPU_Scheduling.pdf",
  "chunkId": "c-pdf-7-1", "kind": "FIGURE", "title": "Figure 5.4 Gantt chart for FCFS", "page": 7,
  "excerpt": "Gantt chart: P1 runs 0–24 ms, P2 runs 24–27 ms, P3 runs 27–30 ms. Waiting times 0, 24, 27 ms; average 17 ms." }

{ "sourceType": "PPTX", "sourceId": "src-pptx", "filename": "CPU_Scheduling_Lecture.pptx",
  "chunkId": "c-pptx-9", "kind": "SLIDE", "title": "Round Robin: the time quantum", "slide": 9,
  "excerpt": "Each process gets a small unit of CPU time (time quantum q), usually 10–100 ms. After q expires, the process is preempted and added to the end of the ready queue." }

{ "sourceType": "VIDEO", "sourceId": "src-video", "filename": "NPTEL_OS_Lec12_Scheduling.mp4",
  "chunkId": "c-video-14", "kind": "TRANSCRIPT", "title": null, "tStart": 754, "tEnd": 812.5,
  "excerpt": "If the quantum is very large, round robin degenerates into FCFS. If it is very small, context-switch overhead dominates." }
```

---

## 2. Endpoint inventory

| # | Method | Route pattern | URL builder | Status | Module | Request | Response |
|---|---|---|---|---|---|---|---|
| E1 | GET | `/api/health` | `paths.health({gemini?})` | ✅ | 0 | query `HealthQuery` | `HealthResponse` (200 or 503) |
| E2 | GET | `/api/learners` | `paths.learners()` | ✅ | 4 | — | `Learner[]` |
| E3 | POST | `/api/learners` | `paths.learners()` | ✅ | 4 | `CreateLearnerRequest` | `Learner` |
| E21 | POST | `/api/auth/signup` | `paths.signup()` | ✅ | 16 | `Credentials` | `Learner` + `Set-Cookie` |
| E22 | POST | `/api/auth/login` | `paths.login()` | ✅ | 16 | `Credentials` | `Learner` + `Set-Cookie` |
| E23 | POST | `/api/auth/logout` | `paths.logout()` | ✅ | 16 | — | `SessionView` (clears the cookie) |
| E24 | GET | `/api/auth/session` | `paths.session()` | ✅ | 16 | — | `SessionView` |
| E4 | POST | `/api/sources` | `paths.uploadSource(filename)` | ✅ | 4 | raw bytes + query `UploadQuery` | `UploadResponse` |
| E5 | GET | `/api/sources` | `paths.sources()` | ✅ | 4 | — | `SourceView[]` |
| E17 | DELETE | `/api/sources/[id]` | `paths.source(id)` | ✅ | 4 | — | `DeleteSourceResponse` |
| E6 | GET, HEAD | `/api/files/[id]` | `paths.file(id)` / `citationHref(c)` | ✅ | 4 | `Range` header | file bytes (200 / 206 / 416) |
| E7 | POST | `/api/build` | `paths.build()` | ✅ | 9 | `BuildRequest` | `BuildResponse` |
| E8 | GET | `/api/topics` | `paths.topics(courseId?)` | ✅ | 9 | query `CourseQuery` | `TopicView[]` |
| E9 | POST | `/api/chat` | `paths.chat()` | ✅ | 10 (+11) | `ChatRequest` | `TutorAnswer` |
| E10 | GET | `/api/chat` | `paths.chatHistory(learnerId)` | ✅ | 10 | query `LearnerQuery` | `ChatMessageView[]` |
| E11 | POST | `/api/eval/answer` | `paths.evalAnswer()` | ✅ | 10 | `EvalAnswerRequest` | `EvalAnswerResponse` |
| E12 | POST | `/api/quiz` | `paths.quizzes()` | ✅ | 12 | `CreateQuizRequest` | `Quiz` |
| E13 | GET | `/api/quiz/[id]` | `paths.quiz(id)` | ✅ | 12 | — | `Quiz` |
| E14 | POST | `/api/quiz/[id]/submit` | `paths.submitQuiz(id)` | ✅ | 13 (+11) | `SubmitRequest` | `QuizReport` |
| E15 | GET | `/api/quiz/[id]/report` | `paths.report(id)` | ✅ | 13 | — | `QuizReport` |
| E16 | GET | `/api/mastery` | `paths.mastery(learnerId)` | ✅ | 14 (+11) | query `LearnerQuery` | `MasteryView` |
| E18 | POST | `/api/sources/[id]/ingest` | `paths.ingestSource(id)` | ✅ | 5 (PDF), 7 (video) | — | `UploadResponse` (`PROCESSING`) |
| E20 | POST | `/api/search` | `paths.search()` | ✅ | 8 | `SearchRequest` | `SearchResponse` |
| E19 | GET | `/api/assessments?learnerId=` (quiz history list) | — | 🔶 | — | — | — |

Registry: `packages/schemas/src/endpoints.ts`, with 29 JSON endpoints (E1–E5, E7–E18, E20–E31) plus `NON_JSON_ROUTES.file` (E6).

| # | Method | Route pattern | URL builder | Status | Module | Request | Response |
|---|---|---|---|---|---|---|---|
| E25 | GET | `/api/profile` | `paths.profile()` | ✅ | 17 | — | `ProfileView` (`{ profile: LearnerProfile \| null }`; 401 without a session) |
| E26 | POST | `/api/profile` | `paths.profile()` | ✅ | 17 | `LearnerProfile` (`tone`, `style`, `level`, `goal`) | `ProfileView` |
| E27 | GET | `/api/notebooks` | `paths.notebooks()` | ✅ | 18 | — | `NotebookList` (newest first, `active` marked; creates the first notebook if none) |
| E28 | POST | `/api/notebooks` | `paths.notebooks()` | ✅ | 18 | `CreateNotebookRequest` (`name`, 1–80) | `NotebookList` (the new one is active) |
| E29 | POST | `/api/notebooks/active` | `paths.activeNotebook()` | ✅ | 18 | `SelectNotebookRequest` (`notebookId`) | `NotebookList` (401 for another account's notebook) |
| E30 | DELETE | `/api/notebooks/[id]` | `paths.notebook(id)` | ✅ | 18 | — | `NotebookList` (deletes everything inside; 409 while a file is processing) |
| E31 | GET | `/api/eval/report` | `paths.evalReport()` | ✅ | 19 | — | `EvalReportView` (`{ rag, sim, problems }`; public: test-set results only) |

**Course resolution (Modules 16–18):** every course-scoped route (sources, topics, build, search, chat, quiz, mastery, eval answer) calls `courseFor(session, requested?)`: signed in → the account's active notebook; no session → the shared evaluation course; a requested course must be owned by the session (ownerless only without a session), else 401. Source routes (delete, ingest, file) check `authorizeSource`.

### E21–E24. Accounts: ✅ LIVE (Module 16)
- **Body (signup, login):** `Credentials = { name: string (trimmed, 1–60), password: string (8–200) }`.
- **signup:** creates a private learner (scrypt hash). **400** if an account with that name exists (case-insensitive). Response `Learner`, plus `Set-Cookie: omnitutor_session=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` (`Secure` when served over HTTPS).
- **login:** **401 `unauthorized`** "Wrong name or password." for an unknown name or a wrong password (same work either way, so timing doesn't reveal names).
- **logout:** always 200 `{ "learner": null }`, clears the cookie. **session:** `{ "learner": Learner | null }`.
- **Secret:** `SESSION_SECRET` (≥ 32 chars), else a random secret generated once into `data/cache/session-secret` (gitignored).
- **Not built:** password reset, email verification, rate limiting of login attempts, roles.

### E20. `POST /api/search`: ✅ LIVE (Module 8)
- **Body:** `SearchRequest = { query: string (1–2000, trimmed; same cap as a tutor message), k?: 1–20 (default 6), courseId? }`.
- **Response 200:** `SearchResponse = { topScore, candidates, results: [{ score, citation: Citation }] }`. `score` is cosine similarity over all READY sources (PDF and video together). Citations follow §1.2 (PDF `page`, VIDEO `tStart`/`tEnd`, excerpt ≤ 600 chars).
- **Cost:** 1 embedding request per new query; repeats are cached (verified: +0).
- **Errors:** 400 invalid body · 409 `not_ready` if nothing is ingested yet.
- **Real check:** Stage-1 test set hit@6 100%, hit@1 90%, MRR 0.95.

---

## 3. Endpoint details

### E1. `GET /api/health`: ✅ LIVE
- **Code:** `apps/web/app/api/health/route.ts`. **Schema:** `HealthQuery`, `HealthResponse` (`packages/schemas/src/system.ts`).
- **Query:** `gemini=1` (optional) adds `checkModels()` (Gemini `models.get` per model: metadata only, no tokens).
- **Responses:** **200** when healthy, **503** when the DB (or a model, with `?gemini=1`) fails. **The body is the same `HealthResponse` either way.** `api.health()` returns it for both statuses.
- `[route]`:
```json
{ "ok": true, "db": { "ok": true, "latencyMs": 2 },
  "env": { "DATABASE_URL": true, "APP_GEMINI_API_KEY": true, "LLM_MODEL_FAST": true, "LLM_MODEL_STRONG": true, "EMBED_MODEL": true, "REFUSAL_TAU": true },
  "gemini": { "LLM_MODEL_FAST": { "ok": true }, "LLM_MODEL_STRONG": { "ok": true }, "EMBED_MODEL": { "ok": true } } }
```
- DB down: `503 {"ok":false,"db":{"ok":false,"error":"Server has closed the connection."},"env":{…}}`.
- `env` reports presence only, never values.
- `usage` (always present): today's Gemini usage **as counted by this app's limiter** (Pacific day), e.g.
  `"usage": { "day": "2026-10-13", "generate": { "requests": 10, "inputTokens": 12220, "requestsPerDay": 450, "requestsPerMinute": 12 }, "embed": { "requests": 14, "inputTokens": 0, "requestsPerDay": 900, "requestsPerMinute": 80 } }`.
  AI Studio remains the source of truth (calls made outside this app aren't counted).

### E2. `GET /api/learners`: ✅ LIVE
- **Code:** `apps/web/app/api/learners/route.ts` → `listLearners()` (`packages/core/src/learners.ts`).
- **Response:** `Learner[]` (`{ id, name, createdAt }`), oldest first. **Open profiles only** (no password); accounts are never listed. The UI doesn't call it any more (it uses E21–E24).
- `[route]` after seed: `[{"id":"demo-learner","name":"Demo Learner","createdAt":"2026-10-13T18:49:33.844Z"}]`

### E3. `POST /api/learners`: ✅ LIVE
- **Body:** `CreateLearnerRequest = { name }`: trimmed, 1–60 chars.
- **Response:** `Learner`. **Errors:** 400 for blank, too long, missing or non-JSON (e2e tested).
- `[test]` `{ "name": "  Asha  " }` → `{ "id": "cm…", "name": "Asha", "createdAt": "…" }`

### E4. `POST /api/sources`: ✅ LIVE (upload). Ingestion starts in Module 5
- **Request:** `POST /api/sources?filename=<url-encoded name>`. **Body = the raw file bytes.** Any `Content-Type` (the client sends `application/octet-stream`).
- **Client:** `api.uploadSource(file)`. Browser: `fetch(paths.uploadSource(file.name), { method: "POST", body: file })`.
- **Server pipeline** (`uploadSource()` in `packages/core/src/sources.ts`):
  1. Require the course (409 if the seed is missing).
  2. Reduce the filename to its base name.
  3. **The type comes from the extension:** `.pdf` / `.pptx` / `.mp4` (`ACCEPTED_EXTENSIONS`). The browser MIME type is ignored.
  4. Reject early if `Content-Length` exceeds **500 MiB** (`MAX_UPLOAD_BYTES`).
  5. **Stream** to `data/uploads/<uuid>.<ext>.part`, aborting at the cap (verified: a 2 GiB chunked upload was cut off after 503 MiB).
  6. **Check the content matches the extension** (`inspectMedia()` in `media.ts`):

| Type | Check | Extracted |
|---|---|---|
| PDF | `%PDF-` in the first 1 KB; parses with pdf-lib; not encrypted; ≥ 1 page | `pageCount` |
| PPTX | ZIP signature; `ppt/presentation.xml` present; ≥ 1 `<p:sldId>` | `pageCount` (slides) |
| VIDEO | `ftyp` box; `moov/mvhd` duration readable (moov before or after mdat, v0/v1, 64-bit boxes); **≤ 20:00** | `durationSec` |

  7. Rename to the final path and insert the `Source` row (`status: PENDING`, canonical `mimeType`, `sizeBytes`). Any failure removes the file, and no row is created.
- **Response:** `UploadResponse = { id, status: "PENDING" }`. **Uploading never starts ingestion and never calls Gemini** (e2e tested). Start it with E18.
- **Errors (all 400 `bad_request`, all e2e tested):**

| Case | Example message |
|---|---|
| Missing `filename` | validation message |
| Unsupported extension | `Unsupported file "notes.docx". Upload a .pdf, .pptx or .mp4 file.` |
| Empty body | `The file is empty.` |
| Wrong content | `This file has a .pdf extension but its content is not a PDF.` |
| Not a deck | `This archive is not a PowerPoint deck (ppt/presentation.xml is missing).` |
| Encrypted PDF | `This PDF is encrypted or password-protected. Upload an unprotected copy.` |
| Long video | `This video is 21:00 long; the limit is 20 minutes.` |
| Oversize | `File exceeds the 500 MB limit.` / `File exceeds the upload limit (500 MB).` |

- **DB:** `Source` (insert). **Disk:** `data/uploads/` under the repo root (resolved from `turbo.json`, or `REPO_ROOT`).

### E5. `GET /api/sources`: ✅ LIVE
- **Response:** `SourceView[]`, oldest first: `{ id, type, filename, status, error, progressDone, progressTotal, chunkCount, createdAt }`.
- Progress units: PDF pages · PPTX slide batches of 5 · VIDEO 0→1. Until Module 5 a new upload shows `PENDING`, `0/0`, `chunkCount: 0`. **The UI polls every 2 s** while any source is PENDING or PROCESSING.
- `[mock]` READY example: `{ "id": "src-pdf", "type": "PDF", "filename": "Galvin_Ch5_CPU_Scheduling.pdf", "status": "READY", "error": null, "progressDone": 28, "progressTotal": 28, "chunkCount": 61, "createdAt": "2026-10-14T09:00:00.000Z" }`

### E17. `DELETE /api/sources/[id]`: ✅ LIVE
- Deletes the row (chunks cascade), the stored file, and any Gemini Files API copy (best effort).
- **Response:** `DeleteSourceResponse = { id }`.
- **Errors:** 404 `not_found` (unknown or already deleted) · **409 `not_ready` while `PROCESSING`**.
- ⚠ Deleting a source after the course is built leaves its topics in place, so rebuild (Module 9).

### E18. `POST /api/sources/[id]/ingest`: ✅ LIVE (Module 5)
- **Purpose:** start (or re-run) ingestion. **This is the only call that spends Gemini quota for a source.**
- **Body:** none. **Response 200:** `UploadResponse` → `{ "id": "...", "status": "PROCESSING" }`. The job continues after the response (Next `after()`); poll `GET /api/sources` for `progressDone/progressTotal` and the final `READY` / `FAILED` (+ `error`).
- **Cost:** about 1 Flash Lite request per PDF page, plus 1 embedding request per chunk. Re-runs of an unchanged file are **free** (results cached on disk by file hash + page + prompt version). Measured on the Stage-1 PDF: 9 pages → 9 + 14 requests, re-run 0.
- **Errors:**

| Status | Code | Case |
|---|---|---|
| 404 | `not_found` | unknown id |
| 409 | `not_ready` | already processing |
| 409 | `not_ready` | seed missing |

  Gemini quota problems don't fail the request: they surface as `FAILED` with a readable `error` (e.g. "Daily generate budget reached …").
- **Failure semantics:**
  - A failing page fails the whole run ("Page N: …") and writes no chunks.
  - Re-running retries; finished pages come from the cache.
  - A run interrupted by a server restart is marked `FAILED` at the next start.
- **DB:** `Source` (status/progress/error), `Chunk` (replaced atomically on success).

### E6. `GET` / `HEAD` `/api/files/[id]`: ✅ LIVE (non-JSON)
- **Code:** `apps/web/app/api/files/[id]/route.ts`; `getSourceFile()` + `parseByteRange()` in `sources.ts`.
- **Response headers:**
  - `Content-Type` = stored canonical MIME.
  - `Accept-Ranges: bytes`.
  - `Content-Length`.
  - `Content-Disposition: inline; filename="<ascii>"; filename*=UTF-8''<exact name>`.
  - `Cache-Control: private, max-age=3600, no-transform`.
  - `X-Content-Type-Options: nosniff`.
- **Range** (single range, RFC 9110):

| Request | Response |
|---|---|
| no `Range` | 200, full file |
| `bytes=0-99`, `bytes=900-`, `bytes=-50` | 206 with `Content-Range: bytes s-e/size` |
| start ≥ size, or `bytes=-0` | 416 with `Content-Range: bytes */size` |
| multi-range, malformed or non-byte units | ignored → 200 full |

- **Browsers:** a PDF iframe uses `citationHref(c)` = `/api/files/{id}#page=N` (the fragment is handled by the browser's viewer, which is unverified). `<video>` sends `bytes=0-`, then seeks with ranges (server behaviour verified with a synthetic MP4).
- **Production:** with `Accept-Encoding: gzip, br`, responses are **never compressed** (verified on `next start`), so byte offsets stay valid.
- **Errors:** unknown id, or row present but file missing → 404 `ApiErrorBody`.

### E7. `POST /api/build`: ✅ LIVE (Module 9)
- **Body:** `BuildRequest = { courseId?: Id, force?: boolean }`, so `{}` is valid.
- **Behaviour:** one LLM call over all READY chunks (non-READY sources are ignored) produces 5–8 topics with prerequisites; each chunk is tagged to its nearest topic by embedding. Synchronous (a few seconds).
- **Cost:** 1 generate request + 1 embedding request per topic. A rebuild over unchanged chunks is free (cache).
- **Response 200:** `BuildResponse = { topics: TopicView[] }`. For `TopicView`, see E8.
- **Errors:** 400 `bad_request` (invalid body) · 409 `not_ready` (course not found; nothing ingested; learner progress exists and `force` is not true) · LLM errors.
- ⚠ **Rebuilding deletes all `Topic` rows, which cascades to `Mastery`, `MasteryEvent` and `Question` for those topics** (`schema.prisma` delete rules). Decision Q9 implemented: 409 unless `force: true`; the UI should warn.
- **DB:** `Topic` (delete + insert), `Chunk.topicId` (update).

### E8. `GET /api/topics`: ✅ LIVE (Module 9)
- **Query:** `CourseQuery = { courseId?: Id }` (omitted = default course). Unknown course → 409 `not_ready`.
- **Response 200:** `TopicView[]` ordered by `seq` (1-based, prerequisites first).

| Field | Type | Notes |
|---|---|---|
| `id` | Id | |
| `seq` | int ≥ 0 | display order, roughly prerequisite order |
| `name` | string (min 1) | |
| `description` | string | |
| `prereqIds` | Id[] | ids of other topics in the same course; **not FK-enforced** (`Topic.prereqIds String[]`) |
| `chunkCount` | int ≥ 0 | |
| `concepts` | `TopicConcept[]` (≤ 8) | subtopics: `{ label, chunkCount, citations: Citation[] (≤ 2) }`, most-taught first; merged from the chunks' ingestion concept labels (no Gemini call) |

`[mock]` (2 of 6):
```json
[ { "id": "t-fcfs", "seq": 2, "name": "FCFS scheduling", "description": "First-come first-served; the convoy effect.", "prereqIds": ["t-crit"], "chunkCount": 9 },
  { "id": "t-rr", "seq": 4, "name": "Round Robin", "description": "Time-sliced scheduling; choosing the time quantum.", "prereqIds": ["t-fcfs"], "chunkCount": 10 } ]
```
- Returns `[]` before the course is built.

### E9. `POST /api/chat`: ✅ LIVE (Module 10; chat evidence → damped BKT, Module 11)
- **Body:** `ChatRequest = { learnerId: Id, courseId?: Id, message: string }`. `message` is trimmed, length 1–2000.
- **Behaviour (ARCHITECTURE §6.3):**
  1. Embed the question and retrieve the top 6 chunks.
  2. Load the learner's mastery.
  3. Make one structured LLM call.
  4. Server-side guards: drop citations outside the retrieved set; turn uncited material into outside knowledge; refuse if `topScore < REFUSAL_TAU` or `NOT_COVERED`.
  5. Apply a damped (30%) BKT update.
  6. Store both messages.
- Decision Q6: single-turn (no conversation history sent to the model); confirmed in Module 10.
- **Response 200:** `TutorAnswer`

| Field | Type | Rule (enforced by schema, tested) |
|---|---|---|
| `messageId` | Id | id of the stored ASSISTANT message |
| `coverage` | `"SUPPORTED" \| "PARTIAL" \| "NOT_COVERED"` | `NOT_COVERED` ⇒ `refused: true` |
| `refused` | boolean | |
| `refusalReason` | `"off_material" \| "not_covered" \| null` | non-null **iff** `refused` |
| `blocks` | `TutorBlock[]` | render in order; must be non-empty unless refused |
| `masteryUpdates` | `MasteryUpdate[]` | `{topicId, topicName, before, after, source:"QUIZ"\|"CHAT"}` |

`TutorBlock` is a discriminated union on `origin`:
- `{ origin: "material", text: string(min 1), citations: Citation[] (min 1) }`
- `{ origin: "outside", text: string(min 1), citations: [] (max 0) }`, which **must be visually labelled as not from the course**.
- A refused answer may contain **outside** blocks only.

`[test]` request: `{ "learnerId": "demo-learner", "message": "What is a time quantum?" }`

`[mock]` response (`mocks.chat`, citations abbreviated to their ids here; real payloads carry full Citation objects):
```json
{ "messageId": "msg-2", "coverage": "SUPPORTED", "refused": false, "refusalReason": null,
  "blocks": [
    { "origin": "material", "text": "In Round Robin, each process runs for at most one time quantum q before it is preempted and moved to the back of the ready queue.", "citations": [ { "...": "rrSlide citation (§1.2)" } ] },
    { "origin": "material", "text": "If q is very large, RR behaves like FCFS; if it is very small, context-switch overhead dominates.", "citations": [ { "...": "rrVideo citation (§1.2)" } ] },
    { "origin": "outside", "text": "In practice, Linux's CFS scheduler doesn't use a fixed quantum at all; it derives time slices from a target latency.", "citations": [] } ],
  "masteryUpdates": [ { "topicId": "t-rr", "topicName": "Round Robin", "before": 0.67, "after": 0.74, "source": "CHAT" } ] }
```
Refusal `[mock]` (`mockStates.refusedAnswer`):
```json
{ "messageId": "msg-4", "coverage": "NOT_COVERED", "refused": true, "refusalReason": "off_material",
  "blocks": [ { "origin": "outside", "text": "Your course material doesn't cover photosynthesis, so I can't answer from it. Ask about CPU scheduling topics instead.", "citations": [] } ],
  "masteryUpdates": [] }
```
- **Errors (proposed):** 400 (validation) · 404 (unknown learner) · 409 `not_ready` (course not built / no chunks) · 429 / 502.
- **Latency:** each Gemini call took **8–9 s** in the Module 1 smoke run (`gemini-3.1-flash-lite`). Expect about 10 s or more per chat turn, so the UI needs a pending state.
- **DB:** `Chunk` (read), `Mastery` (read/upsert), `MasteryEvent` (insert, `chatMessageId`), `ChatMessage` (insert ×2).

### E10. `GET /api/chat?learnerId={id}`: ✅ LIVE (Module 10). Build with `paths.chatHistory(id)`
- **Query:** `LearnerQuery { learnerId }` (registry `query`). Unknown learner → 404.
- **Response 200:** `ChatMessageView[]`, oldest first:
  `{ id, role: "USER"|"ASSISTANT", content: string, blocks: TutorBlock[] | null, coverage: Coverage | null, refused: boolean, createdAt }`
- `blocks` and `coverage` are `null` for USER messages.
- History has **no `masteryUpdates`**; those only come in the live E9 response.
- `[mock]` (`mocks.chatHistory`):
```json
[ { "id": "msg-1", "role": "USER", "content": "How does the time quantum affect Round Robin?", "blocks": null, "coverage": null, "refused": false, "createdAt": "2026-10-14T09:10:00.000Z" },
  { "id": "msg-2", "role": "ASSISTANT", "content": "In Round Robin, each process runs … target latency.", "blocks": [ "…same as E9…" ], "coverage": "SUPPORTED", "refused": false, "createdAt": "2026-10-14T09:10:12.000Z" } ]
```
- **Errors (proposed):** 400 for a missing `learnerId`.
- **DB:** `ChatMessage` (read).

### E11. `POST /api/eval/answer`: ✅ LIVE (Module 10). Response also has `blocks` (origin-labelled answer)
- **Purpose:** used by `tools/eval` (RAGAS + citation scoring). Same pipeline as E9 but **no learner, no history, no mastery update**.
- **Body:** `EvalAnswerRequest = { question: string }` (trimmed, min 1).
- **Response 200:** `EvalAnswerResponse`
  `{ answer: string, contexts: string[], citations: Citation[], refused: boolean, coverage: Coverage, topScore: number in [-1, 1] }`
- `[mock]`:
```json
{ "answer": "In Round Robin, each process runs … target latency.",
  "contexts": [ "Each process gets a small unit of CPU time (time quantum q), …", "If the quantum is very large, round robin degenerates into FCFS. …" ],
  "citations": [ "…rrSlide…", "…rrVideo…" ], "refused": false, "coverage": "SUPPORTED", "topScore": 0.78 }
```
- ⚠ Unlike `TutorAnswer`, this shape doesn't enforce `NOT_COVERED ⇒ refused`.
- **DB:** `Chunk` (read only).

### E12. `POST /api/quiz`: ✅ LIVE (Module 12). 2 Gemini calls; 409 if the course has no topics
- **Body:** `CreateQuizRequest`

| Field | Type | Rule |
|---|---|---|
| `learnerId` | Id | required |
| `courseId` | Id | optional |
| `kind` | `"DIAGNOSTIC" \| "QUIZ" \| "MOCK"` | |
| `topicIds` | Id[] (min 1) | **required when `kind = "QUIZ"`** (schema refine) |
| `count` | int 1–20 | optional. Ignored for DIAGNOSTIC (1 per topic) and MOCK (10) (Q12) |

`[test]` requests:
- `{ "learnerId": "demo-learner", "kind": "DIAGNOSTIC" }`
- `{ "learnerId": "demo-learner", "kind": "QUIZ", "topicIds": ["t-rr"], "count": 5 }`

- **Behaviour:**
  1. Pick topics weighted by (1 − mastery), with difficulty set by mastery band.
  2. One batched generate call.
  3. One batched blind-verify call; drop questions where the two disagree.
  4. Reject stems this learner has already seen (`stemHash`).
- **Response 200:** `Quiz = { assessmentId, kind, createdAt, questions: QuizQuestion[] (min 1) }`

`QuizQuestion` is a discriminated union on `type`, **client-safe** (answers stripped, tested):

| `type` | Fields (plus common `id, position, topicId, topicName, difficulty 1–3, stem`) |
|---|---|
| `MCQ` | `options: string[]` (2–6) |
| `NUMERIC` | `unit: string \| null` (key required) |
| `SHORT` | none |

`[mock]` (`mocks.createQuiz`):
```json
{ "assessmentId": "asmt-1", "kind": "QUIZ", "createdAt": "2026-10-14T09:20:00.000Z",
  "questions": [
    { "id": "q-1", "position": 0, "topicId": "t-fcfs", "topicName": "FCFS scheduling", "difficulty": 1, "type": "MCQ",
      "stem": "P1, P2, P3 arrive at t=0 with bursts 24, 3, 3 ms. What is the average waiting time under FCFS?",
      "options": ["10 ms", "17 ms", "24 ms", "27 ms"] },
    { "id": "q-2", "position": 1, "topicId": "t-rr", "topicName": "Round Robin", "difficulty": 2, "type": "NUMERIC",
      "stem": "Same processes under Round Robin with q = 4 ms. What is P1's turnaround time (ms)?", "unit": "ms" },
    { "id": "q-3", "position": 2, "topicId": "t-rr", "topicName": "Round Robin", "difficulty": 2, "type": "SHORT",
      "stem": "Why does a very large time quantum make Round Robin behave like FCFS?" } ] }
```
- **Errors (proposed):** 400 · 404 (learner / topic) · 409 `not_ready` (course not built) · 429 / 502.
- **Latency:** at least 2 sequential LLM calls, about **20 s or more** at the measured 8–9 s per call. The UI needs a long-running state.
- **DB:** `Assessment` (insert), `Question` (insert, `verified`, `verifierAnswer`), `Mastery` (read), `Question.stemHash` via `Assessment.learnerId` (read).

### E13. `GET /api/quiz/[id]`: ✅ LIVE (Module 12)
- **Path:** `id` = `assessmentId`.
- **Response 200:** `Quiz` (same as E12). Used to reload `/quiz/[id]` after navigation. Questions are only those with `verified = true`, ordered by `position` (proposed).
- **Errors:** 404. Allowed after submission (Q14).

### E14. `POST /api/quiz/[id]/submit`: ✅ LIVE (Module 13). 409 if already submitted; 400 for foreign question ids or type mismatches
- **Body:** `SubmitRequest = { responses: { questionId: Id, response: QuizResponse }[] }`. **Duplicate `questionId`s are rejected.** Unanswered questions may be omitted and are graded as wrong; a blank SHORT answer counts as unanswered.
- **Concurrency:** the quiz is claimed atomically before grading; a second submit while it is being graded (or after) gets **409 `not_ready`**. If short-answer grading fails (Gemini error), the claim is released and the learner can submit again.
- `QuizResponse` is a discriminated union on `type` and **must match the question's type** (server-side check, not expressible in the schema):

| `type` | Shape |
|---|---|
| `MCQ` | `{ "type": "MCQ", "index": 1 }` (0-based option index) |
| `NUMERIC` | `{ "type": "NUMERIC", "value": 30 }` (finite number; graded in code with 1% tolerance) |
| `SHORT` | `{ "type": "SHORT", "text": "…" }` (trimmed, max 2000; graded by one batched LLM call) |

`[test]` request:
```json
{ "responses": [ { "questionId": "q-1", "response": { "type": "MCQ", "index": 1 } },
                 { "questionId": "q-2", "response": { "type": "NUMERIC", "value": 30 } } ] }
```
- **Response 200:** `QuizReport`

| Field | Type |
|---|---|
| `assessmentId`, `kind`, `submittedAt` | Id, AssessmentKind, IsoDate |
| `score` | `{ correct: int, total: int }` |
| `perTopic` | `{ topicId, topicName, correct, total, masteryBefore, masteryAfter }[]` |
| `misconceptions` | `{ label, topicId, topicName, count ≥ 1 }[]` |
| `revisit` | `Citation[]` |
| `attempts` | `AttemptResult[]` (below) |

`AttemptResult`:
```ts
{ questionId, position, topicId, type, stem,
  options: string[] | null,        // MCQ option texts (v1.1); null for NUMERIC/SHORT
  response: QuizResponse | null,   // null = unanswered; type must match the question type
  correct, score,                  // score in [0,1], partial credit for SHORT
  correctAnswer: string,           // display string
  feedback: { text, citations: Citation[] },
  misconception: string | null }
```
Show the learner's MCQ answer as `options[response.index]` (`options` added in v1.1, resolving INTEGRATION_AUDIT I-06).

`[mock]` (`mocks.submitQuiz`, one attempt shown):
```json
{ "assessmentId": "asmt-1", "kind": "QUIZ", "submittedAt": "2026-10-14T09:30:00.000Z",
  "score": { "correct": 2, "total": 3 },
  "perTopic": [ { "topicId": "t-fcfs", "topicName": "FCFS scheduling", "correct": 1, "total": 1, "masteryBefore": 0.67, "masteryAfter": 0.9 },
                { "topicId": "t-rr", "topicName": "Round Robin", "correct": 1, "total": 2, "masteryBefore": 0.74, "masteryAfter": 0.85 } ],
  "misconceptions": [ { "label": "Confuses waiting time with turnaround time", "topicId": "t-rr", "topicName": "Round Robin", "count": 1 } ],
  "revisit": [ "…rrSlide…", "…rrVideo…" ],
  "attempts": [ { "questionId": "q-2", "position": 1, "topicId": "t-rr", "type": "NUMERIC",
      "stem": "Same processes under Round Robin with q = 4 ms. What is P1's turnaround time (ms)?",
      "options": null, "response": { "type": "NUMERIC", "value": 6 }, "correct": false, "score": 0, "correctAnswer": "30 ms",
      "feedback": { "text": "P1 finishes last, at t = 30 ms, so its turnaround time is 30 ms. 6 ms is its waiting time.", "citations": [ "…rrSlide…" ] },
      "misconception": "Confuses waiting time with turnaround time" } ] }
```
- **Errors (proposed):** 400 (validation, or response type doesn't match the question) · 404 · 409 (already submitted) · 429 / 502 (SHORT grading).
- **DB:** `Attempt` (insert; unique `(assessmentId, questionId)`), `Mastery` (update), `MasteryEvent` (insert, `attemptId`), `Assessment` (status=SUBMITTED, `report`, `submittedAt`).

### E15. `GET /api/quiz/[id]/report`: ✅ LIVE (Module 13). 409 until submitted
- **Response 200:** `QuizReport` (same as E14, read from `Assessment.report`).
- **Errors:** 404 · 409 `not_ready` if not yet submitted (proposed).

### E16. `GET /api/mastery?learnerId={id}`: ✅ LIVE (Module 14). Build with `paths.mastery(id)`
- **Response 200:** `MasteryView`

| Field | Type | Notes |
|---|---|---|
| `learnerId` | Id | |
| `needsDiagnostic` | boolean | true until a DIAGNOSTIC assessment is SUBMITTED (proposed derivation) |
| `topics` | `TopicMastery[]` by `seq` | `{topicId, name, description, seq, prereqIds, p, n, band}`; **`band` must equal `masteryBand(p)`** (schema refine) |
| `weakTopics` | `{topicId, name, p, citations: Citation[] (max 3)}[]` | topics with band `weak`, lowest `p` first (Q7) |
| `history` | `{topicId, at, before, after, source}[]` oldest first | no `topicName`, so join with `topics` |

Bands (`MASTERY_BANDS`): `p < 0.4` → `weak`, `0.4 ≤ p ≤ 0.7` → `developing`, `p > 0.7` → `strong`. A learner with no `Mastery` row for a topic should get the prior `p = 0.3, n = 0` (proposed; the DB default is 0.3).

`[mock]` (`mocks.mastery`, abbreviated):
```json
{ "learnerId": "demo-learner", "needsDiagnostic": false,
  "topics": [ { "topicId": "t-fcfs", "name": "FCFS scheduling", "description": "…", "seq": 2, "prereqIds": ["t-crit"], "p": 0.9, "n": 2, "band": "strong" },
              { "topicId": "t-sjf", "name": "SJF & SRTF", "description": "…", "seq": 3, "prereqIds": ["t-fcfs"], "p": 0.2, "n": 1, "band": "weak" } ],
  "weakTopics": [ { "topicId": "t-sjf", "name": "SJF & SRTF", "p": 0.2, "citations": [ "…sjfText (PDF p. 9)…" ] } ],
  "history": [ { "topicId": "t-rr", "at": "2026-10-14T09:10:12.000Z", "before": 0.67, "after": 0.74, "source": "CHAT" } ] }
```
History has one event per answered question or chat turn; `n` = events per topic; each event's `before` = the previous `after` (prior 0.3). These are tested invariants of the mocks.

Cold start `[mock]` (`mockStates.newLearnerMastery`): `needsDiagnostic: true`, every topic `p: 0.3, n: 0, band: "weak"`, `weakTopics: []`, `history: []`.
- **DB:** `Topic`, `Mastery`, `MasteryEvent`, `Assessment` (read); `Chunk` for weak-topic citations.

---

## 4. What the frontend can call today

| Endpoint | Live? |
|---|---|
| every registry endpoint (E1–E5, E7–E18, E20–E24) and files (E6) | ✅ live (through `@sc/client`; `auto` mode calls the API for every `live` endpoint) |
| E19 (quiz history list) | 🔶 proposed only; not in the registry |

## 5. Decisions (adopted 2026-10-14; the teammate may reopen any of them)

| # | Question | Decision |
|---|---|---|
| Q1 | Success status | **200** for all JSON successes |
| Q2 | Upload cap; video limit | **500 MiB**, streamed to disk; **MP4 duration parsed server-side**, > 20:00 rejected |
| Q3 | Mock switching | **Per endpoint**, from the registry `status` (`NEXT_PUBLIC_API_MODE=auto`) |
| Q4 | Report MCQ text | **`AttemptResult.options`** added |
| Q5 | Fix a failed source | **`DELETE /api/sources/[id]`** and **`POST /api/sources/[id]/ingest`** (re-run; cached pages free), both live |
| Q6 | Tutor turns | Single-turn (decide finally in Module 10) |
| Q7 | Weak topics | `band === "weak"`, lowest `p` first, ≤ 3 citations |
| Q8 | MasteryEvent granularity | **One per answered question / chat turn** (mocks updated) |
| Q9 | Rebuild with learner data | **Implemented (Module 9):** 409 unless `force: true` |
| Q10 | Excerpt length | ≤ 600 chars, truncated server-side (Module 10) |
| Q11 | Video chunk content | `transcript + "\n[On screen] " + onScreen` (Module 7) |
| Q12 | `count` for DIAGNOSTIC/MOCK | Ignored |
| Q13 | Upload error code | **`bad_request` 400** (implemented) |
| Q14 | `GET /api/quiz/[id]` after submit | Allowed |
| Q15 | Unknown `learnerId` | 404 `not_found` (`requireLearner()` implemented) |
| Q16 | Embedded text | `title + "\n" + content` (Module 8) |
| Q17 | Restart recovery | **Implemented:** `instrumentation.ts` marks PROCESSING rows with no progress for 2 min as FAILED |
| Q18 | Unsupported PPTX images | **Implemented (Module 6):** skipped, noted in the slide's chunk as `[Figure omitted: …]` |
| Q19 | Gemini limiter values | **Implemented:** verified free tier (15/250K/500; 100/30K/1K), enforced below it (12/200K/450; 80/24K/900), env-overridable; budgets scale with the number of keys in `APP_GEMINI_API_KEYS` |
| Q20 | Learner privacy | **Implemented (Module 16):** accounts with server-enforced ownership of learner data; open profiles remain for tools/tests |
| Q21 | Double submit | **Implemented:** atomic claim (`submittedAt` set while `IN_PROGRESS`; a claim older than 5 min can be taken over after a crash) |
