# Ingestion Specification

Updated: **2026-10-14** after Module 5. **Upload, validation, storage, file serving (Module 4) and PDF ingestion (Module 5) are implemented and tested, PDF ingestion on your real Stage-1 PDF.** PPTX/video ingestion (Modules 6–7) and retrieval (Module 8) are not. Labels:

- **VERIFIED:** implemented and exercised by unit or e2e tests (or a recorded smoke run).
- **DEFINED:** present in the Prisma schema, Zod contract or config, but not exercised by any pipeline.
- **PLANNED:** described in `docs/ARCHITECTURE.md` §6.1–6.2 / `CLAUDE.md`, with no code.
- **UNRESOLVED:** see §9.

---

## 1. Accepted inputs (VERIFIED, Module 4)

| Type | Extension (decides the type) | Content check | Stored MIME | Limits |
|---|---|---|---|---|
| PDF | `.pdf` | `%PDF-` in the first 1 KB, parses with pdf-lib, not encrypted, ≥ 1 page | `application/pdf` | 500 MiB |
| PPTX | `.pptx` | ZIP signature, `ppt/presentation.xml`, ≥ 1 slide | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | 500 MiB |
| VIDEO | `.mp4` | `ftyp` box, readable `moov/mvhd` duration | `video/mp4` | 500 MiB **and ≤ 20:00** |

- **The browser MIME type is ignored.** The extension picks the type and the content must match it, so a renamed `.docx`, a `.ppt` or a ZIP that isn't a deck are all rejected with a clear 400.
- **Not accepted:** `.ppt`, `.key`, PDF-exported decks (LibreOffice is cut), YouTube URLs (cut), non-MP4 containers.
- Scanned-only PDFs pass upload. Whether Gemini extracts them well is unverified (Module 5).

**Implementation:**
- `sourceTypeFromFilename()`, `ACCEPTED_EXTENSIONS`, `MAX_UPLOAD_BYTES` live in `@sc/schemas`, shared by client and server.
- `inspectMedia()` / `readMp4DurationSec()` live in `packages/core/src/media.ts`.
- MP4 duration is read **without ffmpeg** by walking ISO BMFF boxes. It handles `moov` before or after `mdat`, `mvhd` v0 and v1, and 64-bit box sizes, and is verified on synthetic MP4 structures. **It has not yet been run on a real lecture file;** run one through upload as soon as the dataset exists.

---

## 2. Upload contract (VERIFIED, Module 4; contract v1.1)

`POST /api/sources?filename=<url-encoded name>`, with **the raw file bytes as the body** (not multipart).

```
POST /api/sources?filename=NPTEL_OS_Lec12_Scheduling.mp4 HTTP/1.1
Content-Type: application/octet-stream
Content-Length: 187654321

…binary…
```

- Client: `api.uploadSource(file)` (`@sc/client`). It checks the extension and size before sending.
- Server (`uploadSource()` in `packages/core/src/sources.ts`):
  1. Requires the course.
  2. Rejects an oversize `Content-Length` before reading.
  3. **Streams** to `data/uploads/<uuid>.<ext>.part` with the 500 MiB cap.
  4. Runs the content check.
  5. Renames to the final path and inserts the `Source`. Any failure leaves no file and no row.
- Response (`UploadResponse`): `{ "id": "<uuid>", "status": "PENDING" }`. `PENDING` means stored and waiting for ingestion; Module 5 will start ingestion on upload and return `PROCESSING`.
- **Why raw bytes:** `request.formData()` buffers the whole upload in memory, and no Next body limit applies without a proxy. **Verified:** a 2 GiB chunked upload was rejected after **503 MiB** had been sent, which proves the body is streamed and cut off, not buffered.
- No extra metadata fields (title, course, language). `filename` comes from the query (base name only); `mimeType` and `sizeBytes` come from the server.

## 3. Pipeline overview

```mermaid
flowchart LR
  UI[UI /sources] -->|raw bytes ?filename=| UP["POST /api/sources (VERIFIED)"]
  UP -->|stream + cap + content check| FS[(data/uploads/&lt;uuid&gt;.&lt;ext&gt;)]
  UP -->|insert Source PENDING · no Gemini| DB[(Postgres)]
  UI -->|Process button| IN["POST /api/sources/[id]/ingest (VERIFIED, PDF)"]
  IN -->|status PROCESSING · job via after()| ING["runIngestion (packages/core/src/ingest)"]
  ING --> PDF["PDF: split → 1 Gemini call/page (VERIFIED)"]
  ING -.-> PPTX[PPTX: Module 6]
  ING -.-> VID[VIDEO: Module 7]
  PDF --> LIM["limiter: RPM/TPM/RPD + cache (VERIFIED)"] --> GEM[Gemini]
  PDF --> CH[Chunks: one page locator each]
  CH --> EMB["embed() 768-dim, cached per text (VERIFIED)"]
  EMB -->|atomic replace + READY| DB
  ING -->|progressDone/Total, FAILED + error| DB
  UI -->|poll every 2 s| LIST["GET /api/sources (VERIFIED)"] --> DB
  UI -->|citations| FILES["GET /api/files/[id] + Range (VERIFIED)"] --> FS
  BOOT["instrumentation.ts (VERIFIED)"] -->|stale PROCESSING → FAILED| DB
  BUILD["POST /api/build (Module 9)"] -->|topics + prereqs, tag chunks| DB
```

Steps (all VERIFIED for PDF):
1. Upload saves the original and creates `Source { status: PENDING, pageCount | durationSec }`. **No Gemini call.**
2. `POST /api/sources/[id]/ingest` sets `status: PROCESSING, progressTotal: pageCount` and starts the job (Next `after()` keeps it alive after the response).
3. The job extracts each page (§4.1), turns blocks into chunks with exactly one locator, and embeds every chunk (`RETRIEVAL_DOCUMENT`).
4. On success, one transaction: delete the source's old chunks, insert the new ones, set `READY`. On any failure: `FAILED` with a readable `error` ("Page 4: …", "Daily generate budget reached …"), no chunks written.
5. Later, `POST /api/build` creates topics and sets `Chunk.topicId` (Module 9).

**Re-ingestion (VERIFIED):** call ingest again; chunks are replaced (no duplicates). Unchanged pages and texts come from the cache at zero cost.

**Startup recovery (VERIFIED):** `apps/web/instrumentation.ts` marks `PROCESSING` rows with no progress for 2 min as `FAILED` ("interrupted … run ingest again; finished pages are cached").

**Quota guard (VERIFIED):** every Gemini call goes through `limiter.ts`:
- **Per-minute windows:** RPM and TPM.
- **Concurrency.**
- **Daily budget:** a ledger in `data/cache/usage.json`, Pacific day.

Embedding requests count once per text. Defaults: Flash Lite 12 RPM / 200K TPM / 450 per day; embeddings 80 / 24K / 900. The limits verified in AI Studio are 15 / 250K / 500 and 100 / 30K / 1K. Today's usage is shown in `GET /api/health` → `usage`.

---

## 4. Per-type processing

### 4.1 PDF (VERIFIED, Module 5; real data)

| Step | Detail | Evidence |
|---|---|---|
| Split | `pdf-lib` copies each page into a 1-page PDF (`splitPdf`) | unit test |
| Extract | One `generateJson` call per page on `LLM_MODEL_FAST`: inline `application/pdf` + prompt `pdfPagePrompt(courseName)` (version `pdf-page-v2`; subject-agnostic, the course name from the DB is the only context, no dataset examples). Output `{ blocks: [{ kind: text \| figure \| table, title, content }], conceptLabels }`. Cached by file SHA-256 + page + prompt version + SHA-256 of the prompt + model + schema | **real:** 9 pages → 9 requests, 8,091 input tokens (≈900/page), 12 s |
| Chunk | Consecutive text/table blocks are grouped (≤ 1,200 chars) into `TEXT`; **each figure becomes its own `FIGURE` chunk** (caption = `title`); empty blocks dropped; footers/boilerplate skipped by the prompt | **real:** 14 chunks, 5 figures (pages 3 ×2, 4, 5, 9) |
| Image-only pages | Slides embedded as pictures are transcribed (text) and described (figures) | **real:** pages 4 and 9 extracted fully (facts 5/5, 7/7) |
| Locator | `page` = 1-based page index in the file | **real:** all 14 chunks page-only, 1–9 |
| Concurrency | 4 pages in flight; the limiter paces requests | real run within limits |
| Progress | `progressTotal` = pages; `progressDone` +1 per page | real: 0 → 3 → 6 → 8 → 9 |
| Quality | Ground truth `tools/e2e/stage1/expectations.json` (47 facts) | **47/47 (100%)**. Manual review: faithful. Minor: histogram start value imprecise (p3), nested bullets flattened (p4), title-only chunk (p5) |

### 4.2 PPTX (VERIFIED, Module 6; real decks)

| Step | Detail (`packages/core/src/ingest/pptx.ts`) | Evidence |
|---|---|---|
| Order | `ppt/presentation.xml` `<p:sldIdLst>` + `ppt/_rels/presentation.xml.rels` (file names are ignored) | unit test with slide files numbered in reverse; matches an independent count on 4 real decks |
| Text | `<a:t>` runs per paragraph, line breaks, bullet levels; tables → Markdown rows; SmartArt text (diagram data part); speaker notes (notes body placeholder). Slide-number / date / footer placeholders and slide-number fields dropped; XML entities decoded | **4 real decks: 100% of content text runs reach the output (5,061 runs)** |
| Title | Title/ctrTitle placeholder; else a first line of ≤ 120 chars | real decks without title placeholders get correct titles |
| Images | Pictures placed on the slide (`r:embed` → slide rels → `ppt/media/*`), with alt text. Skipped: unsupported formats (EMF/WMF/SVG/GIF/TIFF), short side < 32 px (icons), on ≥ 3 slides and > half the deck (logos), > 7 MB, > 14 MB per batch. Unreadable content pictures add `[Figure omitted: …]` (Q18) | unit tests; real decks: 8 + 1 pictures sent |
| Extract | Batches of **5 slides**: one `generateJson` call with all slide texts, then each picture labelled "Slide N, picture K". Returns per slide `figures[{title, content}]` + `conceptLabels`. Prompt `pptxBatchPrompt(courseName)`, subject-agnostic; cached by file hash + slide numbers + prompt version (`pptx-batch-v1`) + prompt hash | **real:** 40 slides → 8 requests (16,567 tokens); 24 → 5 (5,151); 10 → 2 (1,137); re-runs 0 |
| Chunk | **One `Chunk(kind=SLIDE)` per slide with content**: `title`, `content` = text, then `[Speaker notes] …`, then `[Figure] title: description` | 40/40, 24/24, 10/10 chunks in slide order |
| Locator | `slide` = 1-based presentation order | ground-truth facts found on the right slide: 21/21, 15/15, 9/9 |
| Progress | `progressTotal` = ⌈slides/5⌉ batches | unit + orchestrator test |

**Limitations (real decks):**
- Diagrams drawn with PowerPoint shapes (no picture) become loose labels with no layout, e.g. page-table and FIFO/LRU trace slides.
- Charts are not extracted.
- Notes are verified on synthetic decks only (the real decks' notes are empty).

### 4.3 Video (VERIFIED, Module 7; real data)

**As built:**
- The MP4 is uploaded once to the Files API (handle stored on `Source`, reused on retries, deleted after success).
- It is processed in **equal windows of at most 60 s** (`videoMetadata` start/end offsets, one request each). Times are clip-relative and converted to whole-video seconds.
- Each window is validated (coverage ≥ 60%), then cached per (file hash, window, prompt version `video-v3-windowed`, SHA-256 of the prompt). The prompt (`videoPrompt(courseName)`) is subject-agnostic.
- **Holdout (2026-10-14):** unchanged code on a SYNTHETIC 69.4 s hash-tables video (different subject, window edge inside a slide). Result: 14/14 facts, 5/5 slide cuts, mean start error 0.22 s. The same code on a REAL 3-page C-code PDF: 21/21 facts. Details in PROGRESS.md §4 "Overfitting audit".
- Segments are clamped, sorted and de-overlapped; a segment cut at a window edge is re-joined.
- Chunk = transcript + `[On screen] …`, with `tStart`/`tEnd`.

**Why windows:**
- One request over the whole 154 s video drifted: every timestamp after 46 s was about 39 s late, and 2 sections were missing.
- A 60 s window gave ≤0.5 s error.

**Real result:** 12/12 on-screen facts in a segment overlapping the true time, mean start error 0.3 s, coverage 100%. **Transcript word-accuracy NOT verified.**

Original plan (kept for reference):

| Step | Detail | Evidence |
|---|---|---|
| Upload | `uploadFile(path, "video/mp4")` → Gemini Files API, polled every 2 s until `ACTIVE` (5-min timeout) | **VERIFIED** (smoke on the 45 s sample: upload + ACTIVE 7.6 s) |
| Remote handle | `Source.geminiFileName`, `geminiFileUri`, `geminiFileExpiresAt` (remote copies expire after 48 h; the original stays in `data/uploads`) | **VERIFIED** (stored during a run, cleared after success) |
| "Transcription" | **No dedicated ASR.** One multimodal `generateJson` call on `LLM_MODEL_STRONG` (currently `gemini-3.1-flash-lite`) returns `segments: [{ tStart, tEnd, transcript, onScreen, conceptLabels }]` | Smoke: works, but only **2 segments for 45 s** (coarse). Module 7's prompt must request finer segments; timestamp accuracy to be checked against the known segment map (data/demo/README.md) |
| Chunk | One `Chunk(kind=TRANSCRIPT)` per segment; `content = "<transcript>\n[On screen] <onScreen>"` (Q11, adopted) | PLANNED |
| Locator | `tStart`, `tEnd` in seconds (float). Clamp to `[0, durationSec]`, but **`durationSec` is never measured** | DEFINED / UNRESOLVED |
| Progress | `progressTotal = 1` | DEFINED (schema comment) |
| Cost | **Measured: ≈91 input tokens per second of video** (45.1 s → 4,129 tokens). So the 2:34 clip ≈ 14K tokens, and a 20-min lecture ≈ 110K tokens, under the verified 250K/min limit in one call | **VERIFIED** (one smoke run) |

---

## 5. Embeddings and retrieval

| Item | Detail | Status |
|---|---|---|
| Model | `EMBED_MODEL = gemini-embedding-001`, `outputDimensionality: 768` (`EMBED_DIM`) | **VERIFIED** (smoke `embed`: dim 768; the RR query ranked the RR doc first, 0.806 vs 0.483) |
| Task types | documents `RETRIEVAL_DOCUMENT`, queries `RETRIEVAL_QUERY` | VERIFIED (`embed()` in `llm.ts`) |
| Batching | ≤ min(100, RPM) texts and ≤ TPM tokens per request; **each text counts as one request** (verified on the dashboard) | **VERIFIED** (real: 14 texts → 14 requests) |
| Cache | Per text, keyed by model + dimension + task type + text (`data/cache/embed/`) | **VERIFIED** (real re-run: 0 requests) |
| Embedded text | `title ? title + "\n" + content : content` (Q16) | **VERIFIED** (`embedText`) |
| Storage | `Chunk.embedding Float[]` → Postgres `DOUBLE PRECISION[]`; empty array until embedded | **VERIFIED** (`db:verify`: 768 values round-trip, max error 5.6e-17) |
| Index | **No vector index** (pgvector is cut). Cosine is computed in JS over all READY chunks of the course (26 now) | **VERIFIED** (`retrieve.ts`, `POST /api/search`) |
| Query | Top k (default 6) by cosine; `topScore` = best cosine | **VERIFIED:** hit@6 100%, hit@1 90%, MRR 0.95 on the Stage-1 test set |
| Refusal | Answerable 0.70–0.82 vs off-material 0.60–0.70 (overlapping at ~0.70). A score threshold alone can't decide, so the tutor must use the model's NOT_COVERED judgment with τ as a floor (~0.60). Placeholder 0.55 is too low | measured, not calibrated (15 questions) |
| Topics | `Topic.embedding` (name + description) tags each chunk to its nearest topic at build time | DEFINED (schema) / PLANNED |

---

## 6. What is stored where

| Data | Location | Status |
|---|---|---|
| Original files | Local disk `data/uploads/<sourceId>.<ext>` (gitignored). `Source.path` holds it **relative to the repo root**, resolved by `repoRoot()` (nearest `turbo.json`, or `REPO_ROOT`), so it works although `next dev` runs in `apps/web`. Paths outside `data/uploads` are refused | **VERIFIED** (core + e2e tests) |
| Video remote copy | Gemini Files API, 48 h | DEFINED |
| Source metadata (`type`, `filename`, `mimeType`, `sizeBytes`, `path`, `pageCount`/`durationSec`), status | Postgres `Source` | **VERIFIED** (upload); progress/errors written from Module 5 |
| Chunk text, locators, concept labels, embeddings, topic tag | Postgres `Chunk` | DEFINED |
| Topics, prerequisites, topic embeddings | Postgres `Topic` | DEFINED |
| Object storage / CDN | none (by design: single local process) | n/a |

---

## 7. Concrete data examples

**Source row right after upload (VERIFIED shape, Module 4):**
```json
{ "id": "3f8a2c1e-…", "courseId": "demo-course", "type": "PDF", "filename": "Galvin_Ch5_CPU_Scheduling.pdf",
  "mimeType": "application/pdf", "sizeBytes": 2483112, "path": "data/uploads/3f8a2c1e-….pdf",
  "status": "PENDING", "error": null, "progressDone": 0, "progressTotal": 0, "pageCount": 28,
  "durationSec": null, "geminiFileName": null, "geminiFileUri": null, "geminiFileExpiresAt": null }
```
**What the UI sees during ingestion (DEFINED: `SourceView`; values PLANNED for Module 5):**
```json
{ "id": "3f8a2c1e-…", "type": "PDF", "filename": "Galvin_Ch5_CPU_Scheduling.pdf", "status": "PROCESSING",
  "error": null, "progressDone": 12, "progressTotal": 28, "chunkCount": 0, "createdAt": "2026-10-14T09:00:00.000Z" }
```
**Processed chunk (DEFINED columns: `Chunk`; values PLANNED):**
```json
{ "id": "c-pdf-7-1", "sourceId": "src-pdf", "kind": "FIGURE", "seq": 14, "title": "Figure 5.4 Gantt chart for FCFS",
  "content": "Gantt chart: P1 runs 0–24 ms, P2 runs 24–27 ms, P3 runs 27–30 ms. Waiting times 0, 24, 27 ms; average 17 ms.",
  "page": 7, "slide": null, "tStart": null, "tEnd": null,
  "conceptLabels": ["FCFS", "Gantt chart", "waiting time"], "embedding": [0.0123, -0.0456, "… 768 numbers …"], "topicId": "t-fcfs" }
```
**Citation referencing that chunk (DEFINED: `Citation`; `[mock]` `citations.fcfsGantt`):**
```json
{ "sourceType": "PDF", "sourceId": "src-pdf", "filename": "Galvin_Ch5_CPU_Scheduling.pdf", "chunkId": "c-pdf-7-1",
  "kind": "FIGURE", "title": "Figure 5.4 Gantt chart for FCFS", "page": 7,
  "excerpt": "Gantt chart: P1 runs 0–24 ms, P2 runs 24–27 ms, P3 runs 27–30 ms. Waiting times 0, 24, 27 ms; average 17 ms." }
```
**Chunk → Citation mapping (PLANNED; the rule follows from the two schemas):**

| Citation field | From |
|---|---|
| `chunkId`, `kind`, `title` | `Chunk.id`, `Chunk.kind`, `Chunk.title` |
| `excerpt` | `Chunk.content`, truncated to ≤ 600 chars (Q10) |
| `sourceId`, `filename` | `Chunk.sourceId`, `Source.filename` |
| `sourceType` | `Source.type` |
| `page` / `slide` / `tStart`, `tEnd` | the one non-null locator on the chunk |

The URL is built client-side with `citationHref()`: `/api/files/{sourceId}#page=N` · `#t=S` · plain URL for PPTX.

---

## 8. What the frontend must show during ingestion

| State | UI (from TEAMMATE_BRIEF Task 4 + `SourceView`) |
|---|---|
| `PENDING` / `PROCESSING` | status badge + progress bar `progressDone / progressTotal` (if `progressTotal = 0`, show indeterminate); keep polling every 2 s. Until Module 5, uploads stay `PENDING` |
| `READY` | `chunkCount` |
| `FAILED` | `error` text + **Delete** (`DELETE /api/sources/[id]`, live; 409 while PROCESSING). Retry endpoint proposed for Module 5 |
| All READY | enable "Build course" (`POST /api/build`) |
| Expected durations | PDF: about ⌈pages/4⌉ × ~9 s per call (≈ 60 s for 28 pages, before any rate limiting). Video: one long call plus upload (unmeasured) |

---

## 9. Ingestion decisions

| # | Question | Status |
|---|---|---|
| Q2 | Upload cap; video-length enforcement | **Resolved (Module 4):** 500 MiB streamed cap; MP4 duration parsed server-side, > 20:00 rejected |
| Q13 | Error code for bad uploads | **Resolved:** `bad_request` 400 with a user-readable message |
| Q11 | Video chunk `content` composition | Adopted: `transcript + "\n[On screen] " + onScreen` (implement in Module 7) |
| Q16 | Embedded text | Adopted: `title + "\n" + content` (Module 8) |
| Q17 | Restart recovery for `PROCESSING` sources | Adopted: mark stale PROCESSING as FAILED ("interrupted") on boot (Module 5) |
| Q18 | Unsupported PPTX media (`.emf`/`.wmf`/`.svg`) | **Implemented (Module 6):** skipped and noted in the chunk as `[Figure omitted: unsupported format (.emf)]`; icons/logos are skipped silently |
| Q19 | Gemini rate limiting | **Resolved (Module 4.5):** limiter with verified limits, daily ledger, cache |
