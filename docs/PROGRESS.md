# Progress Tracker

Updated: **2026-10-13** · Deadline: **NOT CONFIRMED (check Devpost)**
Rule: one module at a time → test → user review → next. A module is ✅ only after its tests pass.

Legend: ✅ done & verified · 🟡 in progress / awaiting review · ⬜ not started · ❌ blocked

---

## 1. Module status

| # | Module | Status | Verified by |
|---|---|---|---|
| 0 | Skeleton: Turborepo (web/core/db/schemas) + Postgres + Prisma + `/api/health` | 🟡 awaiting review | see §4 log |
| 1 | Gemini smoke test (`packages/core/src/llm.ts`, `tools/smoke`) | ❌ needs model IDs | — |
| 2 | Prisma schema (all models) + migration | ⬜ | — |
| 3 | `@sc/schemas` shared contract | ⬜ | — |
| 4 | Upload + `/api/files/[id]` (Range) | ⬜ | — |
| 5 | PDF ingestion (text + figures, page cite) | ⬜ | — |
| 6 | PPTX ingestion (slide cite) | ⬜ | — |
| 7 | Video ingestion (timestamp cite) | ⬜ | — |
| 8 | Embeddings + retrieval | ⬜ | — |
| 9 | Course build (topics + prereqs) | ⬜ | — |
| 10 | Tutor + grounding guards + citation panel | ⬜ | — |
| 11 | BKT learner model | ⬜ | — |
| 12 | Quiz generate + verify + no-repeat | ⬜ | — |
| 13 | Grading + post-quiz report | ⬜ | — |
| 14 | Dashboard | ⬜ | — |
| 15 | Eval (RAGAS) + simulator | ⬜ | — |
| 16 | README, demo video, Devpost | ⬜ | — |

## 2. Track D requirement coverage

| Requirement | Pts | Status |
|---|---|---|
| Multimodal KB (video/PDF/PPTX, topics, prereqs, locators, figures) | 20 | ⬜ |
| Grounding (cited excerpts, refusals, outside-knowledge labels) | (in 20) | ⬜ |
| Assessment (MCQ/short/numeric, tagged, verified, no repeats, report) | 15 | ⬜ |
| Learner model (BKT after quiz + chat, diagnostic cold start) | 20 | ⬜ |
| Evaluation (RAGAS metrics, simulated students) | 15 | ⬜ |
| UX & demo | 15 | ⬜ |

## 3. Health

| Check | Status | Last checked |
|---|---|---|
| Postgres (docker `study-companion-db`, :5434) | ✅ `SELECT 1` 1–17 ms | 2026-10-13 |
| Env: DATABASE_URL, REFUSAL_TAU | ✅ present | 2026-10-13 |
| Env: APP_GEMINI_API_KEY (from `.env` only) | ✅ present | 2026-10-13 |
| Env: LLM_MODEL_FAST / LLM_MODEL_STRONG / EMBED_MODEL | ❌ missing | 2026-10-13 |
| Gemini API reachable | ⬜ not tested (Module 1) | — |
| Typecheck (4 workspaces) / lint | ✅ clean | 2026-10-13 |
| Prisma CLI → DB (reads root `.env`) | ✅ connects to localhost:5434 | 2026-10-13 |

Live check: `GET http://localhost:3000/api/health` (Postman or curl)
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

## 5. Accuracy / eval metrics (filled in Module 15)

| Metric | Target | Current |
|---|---|---|
| Faithfulness | ≥ 0.85 | — |
| Answer relevancy | ≥ 0.80 | — |
| Context precision / recall | ≥ 0.75 | — |
| Citation accuracy (correct page/slide/timestamp) | ≥ 80% | — |
| Refusal precision / recall (off-material) | ≥ 0.8 / ≥ 0.8 | — |
| Quiz verify pass rate | report | — |
| Sim: mastery gain, adaptive vs random | adaptive > random | — |
| Sim: repetition rate | 0% | — |

## 6. Open issues / decisions
- Prisma pinned to **6.19.3**: npm `latest` currently points at an 8.0 RC, and 7.x needs driver adapters. 6 is the stable, simple choice.
- Postgres on host port **5434**: 5432 and 5433 are used by other containers on the dev machine.
- Gemini key var renamed to `APP_GEMINI_API_KEY` so a machine-wide `GEMINI_API_KEY` can never override `.env`. `packages/core/src/llm.ts` must pass `apiKey` explicitly (the SDK otherwise falls back to `GEMINI_API_KEY` / `GOOGLE_API_KEY`).
- **Root `.env` in a monorepo:** loading it from `next.config.ts` did NOT reach route handlers (Next 16 runs them in a separate process). Fix: `apps/web/scripts/next.mjs` calls Node's `process.loadEnvFile` before starting Next, so child processes inherit the values.
- **Windows DLL lock:** `prisma generate` fails with EPERM while the dev server runs. Typecheck no longer depends on it. The client is generated on `npm install` (postinstall) and at `npm run dev` start.
- First `docker pull` failed with a transient Docker Hub auth EOF; the retry worked.
