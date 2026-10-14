# Teammate Brief: What You're Building (contract v1.1)

**Project:** Study Companion, IIT Mandi Multimodal AI Hackathon 2026, Track D (Personalized Tutoring & Adaptive Learning)
**Repo:** https://github.com/ojas-mohbansi/omnitutor-ai
**Your area:** demo dataset, all UI pages, eval test set + scripts, student simulator, README, demo video script.
**Parth's area:** ingestion, Gemini calls, retrieval, tutor, quiz engine, BKT, database, API routes, the contract and client packages.

Read [ARCHITECTURE.md](ARCHITECTURE.md) once for the big picture. The exact JSON of every endpoint is in [API_SPEC.md](API_SPEC.md). This brief tells you what to build and how to work without waiting for the backend.

---

## 1. The key idea: build against the contract, not the backend

- **`@sc/schemas`** defines the exact JSON every endpoint accepts and returns (Zod schemas + TypeScript types), the URL builders (`paths`), and a realistic **mock for every endpoint** (`@sc/schemas/mocks`).
- **`@sc/client`** is a ready-made, tested HTTP client built on that contract. **Use it for every API call; don't write your own fetch layer.**
  - It validates every response against the contract.
  - It turns every failure into a typed `ApiError`.
  - It serves mocks for endpoints the backend hasn't built yet.

The registry (`packages/schemas/src/endpoints.ts`) marks each endpoint `live` or `planned`. A test fails if that status doesn't match the real route files, so the registry is always accurate. With `NEXT_PUBLIC_API_MODE="auto"`, **live endpoints automatically use the real API and planned ones use mocks.** When Parth ships an endpoint, your page starts using real data with no change on your side.

If you think the contract is missing something, **tell Parth before changing it**. Both sides depend on it, and `npm run test` must stay green.

| What | Where |
|---|---|
| Typed client: `api.listSources()`, `api.chat({...})`, … | `@sc/client` (`packages/client/src/index.ts`) |
| Every endpoint: method, path, query, request, response, **status**, module | `packages/schemas/src/endpoints.ts` |
| Mocks + extra UI states (refused answer, new learner, failed source, error) | `@sc/schemas/mocks` → `mocks`, `mockStates` |
| Citation helpers | `formatLocator(c)` → `"p. 7"` / `"slide 9"` / `"12:34–13:32"`; `citationHref(c)` opens the PDF at the page or seeks the video |
| Mastery colours / rule | `masteryBand(p)` → `weak` (<0.4) / `developing` / `strong` (>0.7) |
| Upload rules | `ACCEPTED_EXTENSIONS` (.pdf/.pptx/.mp4), `MAX_UPLOAD_MB` (500), `MAX_VIDEO_MINUTES` (20) |

**Live today (Module 4):** health, learners (list/create), sources (upload/list/delete), files (`/api/files/[id]` with Range). **Everything else is mocked** until its module lands.

---

## 2. Setup (about 15 min, Windows)

Prerequisites: Node ≥ 20.12, Docker Desktop (running), Git.

```bash
git clone https://github.com/ojas-mohbansi/omnitutor-ai.git
cd omnitutor-ai
npm install
cp .env.example .env
```

Edit **your own** `.env`. Never commit it, and never share keys in chat.
- `APP_GEMINI_API_KEY`: your own free key from https://aistudio.google.com/apikey. Only needed for eval/smoke; UI work doesn't need it.
- `NEXT_PUBLIC_API_MODE="auto"` (default). Use `"mock"` to work fully offline.
- `NEXT_PUBLIC_MOCK_DELAY_MS="600"` (optional) makes mocked calls slow, so you can see your loading states.

```bash
npm run db:up        # Postgres in Docker on localhost:5434
npm run db:deploy    # create tables from the existing migrations
npm run db:seed      # demo course + demo learner (required: the API returns 409 without it)
npm run dev          # http://localhost:3000
```

Check it works:
- `GET http://localhost:3000/api/health` → `"ok": true`.
- `npm run test` → all unit/contract tests pass (162 at Module 4).
- With the dev server running, `npm run test:e2e` → all end-to-end tests pass.
- Postman: import `docs/postman/study-companion.postman_collection.json`.
- DB GUI (Beekeeper/DBeaver): PostgreSQL, `localhost:5434`, user `study`, password `study`, database `study`.

**Windows gotchas:**
- Stop `npm run dev` before `npm install` or any `db:*` command. Prisma's engine file is locked while the server runs (EPERM).
- `NEXT_PUBLIC_*` values are read when the dev server starts, so restart it after changing them.

---

## 3. Where your code goes (and what not to touch)

| You own | Path |
|---|---|
| UI pages + components | `apps/web/app/**` (except `app/api/`), `apps/web/components/`, `apps/web/lib/` |
| Eval | `tools/eval/` (new) |
| Simulator | `tools/sim/` (new workspace package) |
| Dataset notes | `data/demo/README.md` (files themselves are gitignored) |
| README, demo script | `README.md`, `docs/DEMO_SCRIPT.md` |

**Don't edit:**
- `packages/core`, `packages/db`, `apps/web/app/api/**`, `tools/e2e`, `.env.example` (ask first).
- `packages/schemas` and `packages/client`: discuss with Parth first.

---

## 4. The API client (create `apps/web/lib/api.ts` first)

```ts
import { createApiClient, type ApiMode } from "@sc/client";

export const api = createApiClient({
  mode: (process.env.NEXT_PUBLIC_API_MODE as ApiMode | undefined) ?? "auto",
  mockDelayMs: Number(process.env.NEXT_PUBLIC_MOCK_DELAY_MS ?? 0),
});
```

Then use it from client components or server components:

```ts
import { ApiError } from "@sc/client";
import { api } from "@/lib/api";

const sources = await api.listSources();                       // SourceView[]
const { id } = await api.uploadSource(file);                   // File from <input type="file">, status "PENDING"
await api.deleteSource(id);
const answer = await api.chat({ learnerId, message });         // TutorAnswer (mock until Module 10)
const report = await api.getReport(assessmentId);              // QuizReport (mock until Module 13)
const mastery = await api.mastery(learnerId);                  // MasteryView (mock until Module 14)
```

**Errors.** Every failure is an `ApiError` with `code`, `message` and `status`:

| `code` | Meaning | Show |
|---|---|---|
| `bad_request`, `not_found`, `not_ready`, `rate_limited`, `llm_error`, `internal` | Server error (`ApiErrorBody`), or `bad_request` with `status: 0` when the client rejected your input before sending | `e.message` (written for users) |
| `network` | Server unreachable | "Can't reach the server" |
| `http_error` | Non-contract response (e.g. HTML 404: route not built) | Generic error. You shouldn't see this in `auto` mode |
| `invalid_response` | The server broke the contract | Report it to Parth with `e.message` (it lists the exact field) |

**Uploads.**
- `api.uploadSource(file)` sends the raw file bytes (no multipart) and streams them to disk on the server.
- The client rejects wrong extensions and files over 500 MB **before** sending. The server also checks the actual content (a renamed `.docx` is rejected) and enforces the 20-minute video limit. Show `e.message` as is.
- Use `accept=".pdf,.pptx,.mp4"` on the file input.
- `fetch` has no upload progress. A spinner is fine; files are local, so uploads are fast.

**First-PR check:** render `api.isLive("listSources")` somewhere temporarily. It should show `true` in `auto` mode, which confirms the env flag reaches the browser.

---

## 5. Your tasks, in priority order

The deadline isn't confirmed yet (check Devpost). The order follows what blocks others and what judges weigh: KB & Grounding 20, Personalization 20, UX & Demo 15, Assessment 15, System Eval 15, Tech 15.

### Task 1: Demo dataset (do this first; it blocks backend Modules 5–7)
Topic: **Operating Systems, CPU scheduling**. Put the files in `data/demo/` (gitignored) and share them with Parth via Drive.

| File | Requirement |
|---|---|
| Lecture video | `.mp4`, **15–20 min (hard max 20:00; the upload is rejected above that)**, e.g. NPTEL / MIT OCW, with slides or board on screen |
| Textbook chapter | `.pdf`, not password-protected, 20–30 pages, CPU scheduling chapter **with Gantt-chart figures** and worked numericals |
| Slide deck | `.pptx` (**not** .ppt or PDF), about 20 slides, same topic, ideally with diagrams |

All three should cover the same concepts (FCFS, SJF/SRTF, RR, priority, multilevel queues, scheduling criteria). Record the source and licence of each in `data/demo/README.md`. **Quick check:** upload each file in Postman (or on your `/sources` page). If it's accepted, the format is fine.

### Task 2: App shell + learner picker
- `apps/web/app/layout.tsx`: nav (Sources · Tutor · Quiz · Dashboard) and a **learner picker** in the header.
- Picker: `api.listLearners()`, with "+ New learner" calling `api.createLearner({ name })` (**live now**). Keep `learnerId` in `localStorage` and a React context. Default to `demo-learner`.
- Replace the template home page with a simple landing page.

### Task 3: Citation panel (shared component; the most important UI piece)
Judges click citations. **All three source types must work in the demo.**
- `components/CitationChip`: shows `filename` and `formatLocator(c)`; clicking opens the panel.
- `components/CitationPanel` (side drawer):
  - **PDF:** `<iframe src={citationHref(c)}>` (opens at `#page=N`), with the **excerpt shown beside it**.
  - **PPTX:** a reconstructed **slide card** with title, excerpt and "slide N of filename".
  - **VIDEO:** `<video src={citationHref(c)} controls>`. Also set `currentTime = c.tStart` on `loadedmetadata`. Show the excerpt below.
- **`/api/files/[id]` is live** and supports Range, so seeking works. To test with real files, upload a PDF and an mp4, then build a citation by hand with that `sourceId`. The mock citations point at ids that don't exist.

### Task 4: `/sources` (endpoints live now)
- Upload input (`accept=".pdf,.pptx,.mp4"`): `api.uploadSource(file)`. Show `ApiError.message` on rejection.
- List from `api.listSources()`: filename, type, status badge, a progress bar (`progressDone/progressTotal`; indeterminate when total is 0), `chunkCount`, and `error` when FAILED.
- **Delete** button: `api.deleteSource(id)`. Disable it while `PROCESSING` (the server returns 409).
- **Poll every 2 s** while any source is `PENDING` or `PROCESSING`.
  - Until Module 5 (ingestion), uploads stay `PENDING`. That's expected.
- **"Build course"** button (`api.buildCourse()`, mock until Module 9): enable only when all sources are READY. Then show the topics (`api.listTopics()`) with their prerequisites.

### Task 5: `/tutor`
- `api.chat({ learnerId, message })` and history via `api.chatHistory(learnerId)`.
- Render `blocks` in order:
  - `origin: "material"`: normal text plus citation chips.
  - `origin: "outside"`: **visually distinct**, labelled *"General knowledge — not from your course material"*.
- `refused: true`: a refusal banner (`mockStates.refusedAnswer`).
- `masteryUpdates`: a toast like "Round Robin 67% → 74%".
- Expect about **10 s per answer** once live (Gemini latency). Show a clear pending state.

### Task 6: `/quiz` and `/quiz/[id]/report`
- `/quiz`:
  - Start a **Diagnostic** (prominent if `mastery.needsDiagnostic`), a **Quiz** (choose topics from `api.listTopics()`) or a **Mock** test.
  - `api.createQuiz(...)` takes **about 20 s** once live, so show progress text.
  - Render by `type`: MCQ radio, NUMERIC number input with `unit`, SHORT textarea.
  - Submit: `api.submitQuiz(id, { responses: [{ questionId, response: { type, ... } }] })`, then navigate to the report.
- `/quiz/[id]/report` (`api.getReport(id)`):
  - Overall score.
  - Per-topic table showing **mastery before → after**.
  - **Misconceptions** list.
  - Each question with the learner's answer: for MCQ, `attempt.options[attempt.response.index]` (**`options` is included in v1.1**). Also the correct answer and feedback with citation chips.
  - A "Revisit" list of citations.

### Task 7: `/dashboard`
`api.mastery(learnerId)`:
- A mastery bar per topic coloured by `band`, with prerequisites shown.
- If `needsDiagnostic`, a call to action: "Take the diagnostic".
- **Weak topics** (rule: band `weak`, lowest `p` first) with citation chips.
- A **history line chart** (Recharts) from `history`: **one point per answered question or chat turn**. Mark QUIZ vs CHAT points differently.
- Test with both `mocks.mastery` and `mockStates.newLearnerMastery`.

### Task 8: Eval test set (`tools/eval/testset.json`)
20 items following the `TestSetItem` schema:
- **5 PDF, 5 PPTX, 5 video**, with **at least 2 that need a figure**.
- **5 off-material**, including 2 tricky near-topic ones like "How does Linux CFS work?".

Locations:
- **PDF `page` = page index in the file (1-based, as the PDF viewer shows it), not the printed page number.**
- PPTX `slide` = slide number.
- Video `tStart`/`tEnd` in **seconds**.

Validate with a small script: `TestSet.parse(json)` then `testSetGaps(items)` (`[]` means complete).

### Task 9: Eval scripts (build now against the `evalAnswer` mock; real endpoint in Module 10)
- **`tools/eval/score.ts`:** use `createApiClient({ mode: "auto", baseUrl: "http://localhost:3000" })` and `api.evalAnswer({ question })` for each test item. Report:
  - **Citation accuracy:** a hit means same file and same page/slide, or overlapping time range for video.
  - **Refusal precision/recall.**
  - A **`REFUSAL_TAU` sweep** over `topScore`.
- **`tools/eval/ragas.py`:** the same endpoint over HTTP (`POST /api/eval/answer`, JSON `{question}`). Score with RAGAS **faithfulness, answer relevancy, context precision, context recall**. Use Gemini as the judge with your own free key and a lite model. Add `tools/eval/requirements.txt`.
- Output a markdown table for `docs/PROGRESS.md` §5 and the README.

### Task 10: Student simulator (`tools/sim`, no LLM, no DB)
Workspace package `@sc/sim` (copy `tools/e2e/package.json`), run with `npm run sim`.
- **About 30 questions** tagged `{topicId, difficulty 1–3, type}`.
- **4 profiles** with hidden true mastery. Correct-answer probability comes from true mastery plus the simulator's own slip/guess, **with different parameters from the model** (model: slip 0.1, guess 0.25 MCQ / 0.1 short / 0.05 numeric). Say so in the README.
- True mastery rises after practice.
- **3 sessions**, comparing adaptive selection (weight 1 − estimate; difficulty by `masteryBand`) with random selection.
- Report **mastery gain**, **estimation error** and **repetition rate** (0% for adaptive).
- The estimator: `@sc/core` will export `updateMastery(p: number, correct: boolean, type: QuestionType, weight?: number): number` in Module 11. Until then, use a local stub with exactly that signature.

### Task 11: README + demo script
- **README:** what it does, setup (§2), architecture summary, eval and simulator results (with the caveat), limitations.
- **`docs/DEMO_SCRIPT.md`:** 3–10 min, English, unlisted YouTube. Suggested flow:
  1. Upload the 3 files.
  2. Build the course and show topics with prerequisites.
  3. Diagnostic quiz, then the dashboard.
  4. Tutor answer with citations into the PDF page, the slide card and the video timestamp.
  5. An off-material question gets refused.
  6. Adaptive quiz, then the report with misconceptions.
  7. Dashboard history.
  8. Eval and simulator numbers.
- **Devpost:** both teammates with their real full names.

---

## 6. When the real endpoints arrive

Nothing to do. In `auto` mode the client switches each endpoint to the real API as soon as Parth marks it `live`, and a test guarantees that's only done when the route exists.

| Module | Endpoints | Status |
|---|---|---|
| 0 | health | ✅ live |
| 4 | learners, sources (upload/list/delete), files | ✅ live |
| 9 | build, topics | mock |
| 10 | chat, chat history, eval/answer | mock |
| 12 | create/get quiz | mock |
| 13 | submit, report | mock |
| 14 | mastery | mock |

If a live response fails validation, you'll get `ApiError("invalid_response")` with the exact field. Send it to Parth: it's a backend bug.

---

## 7. Definition of done (per task)
- [ ] Works in `auto` mode, including the `mockStates` edge cases (refused, new learner, failed source, error)
- [ ] Loading, error (`ApiError.message`) and empty states for every call
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` pass
- [ ] No console errors. No `.env`, keys or data files committed

## 8. Git workflow
One branch per task, merged with a pull request.

```bash
git checkout main && git pull
git checkout -b ui/citation-panel          # e.g. ui/sources, ui/tutor, eval/testset, sim/core
# ...work...
npm run typecheck && npm run lint && npm run test
git add .
git status                                 # .env and data/demo files must NOT appear
git commit -m "UI: citation panel (PDF page, slide card, video seek)"
git push -u origin ui/citation-panel
```

Open a PR on GitHub and ask Parth to review. Pull `main` often.

## 9. Contract changes in v1.1 (vs. the first brief)
1. **Use `@sc/client`** instead of the hand-written `api()` snippet. The old snippet crashed with a `SyntaxError` on non-JSON 404/405 responses.
2. `NEXT_PUBLIC_USE_MOCKS` is replaced by **`NEXT_PUBLIC_API_MODE`** (`auto` | `mock` | `live`), with per-endpoint switching driven by the registry.
3. **Upload is raw bytes + `?filename=`**, not multipart (streamed to disk; no memory blow-up for large videos). `api.uploadSource(file)` handles it.
4. New endpoint: **`DELETE /api/sources/[id]`**. Health is now part of the contract (`HealthResponse`).
5. Registry paths are patterns (`/api/quiz/[id]`). Build URLs with **`paths`** (the client does this for you).
6. `AttemptResult` has **`options`** (MCQ option texts, `null` for other types).
7. Mock mastery history is now **one event per answer or chat turn**, consistent with `n` and the report.
8. Every success is HTTP **200**. Errors use `ApiErrorBody` with fixed statuses (`API_ERROR_STATUS`).
