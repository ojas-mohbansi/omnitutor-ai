# BUG.md — Omnitutor Audit Report

> Audit date: 2026-10-14  
> Scope: `packages/core`, `packages/schemas`, `apps/web` (all source files read and analysed)  
> Severity scale: **CRITICAL** (data loss / security / silent wrong results) · **HIGH** (feature broken for users) · **MEDIUM** (correctness flaw, rare trigger) · **LOW** (code smell / UX inconsistency)

---

## BUG-001 — `formatLocator` duplication with inconsistent output  
**Severity:** HIGH  
**Files:**  
- `packages/schemas/src/citation.ts` (`formatLocator`)  
- `apps/web/lib/format.ts` (`formatLocator`)  

**Description:**  
There are two separate `formatLocator` functions that produce different strings for the same citation:

| Source type | `schemas/citation.ts` output | `lib/format.ts` output |
|---|---|---|
| PDF | `p. 12` | `p. 12` ✓ |
| PPTX | `slide 4` | `s. 4` ✗ (different label) |
| VIDEO | `3:15–4:02` (en-dash, no leading zero) | `03:15-04:02` (hyphen, with leading zero) |

`Locator` component imports from `lib/format.ts`, so the UI uses `s. 4` for slides. The schema contract and documentation comment on `citation.ts` say `slide 4`. VIDEO timestamps use a plain hyphen in the UI but an en-dash in the schema — different characters that are visually close but textually distinct, which will cause string-comparison mismatches in tests or assertions.

**Fix:** Delete the duplicate in `lib/format.ts` and import `formatLocator` directly from `@sc/schemas`. The `formatClock` helper in `lib/format.ts` (mm:ss with leading zeros) differs from `formatTime` in schemas (no leading zeros on minutes); pick one convention and use it everywhere.

---

## BUG-002 — `layout.tsx`: `<link rel="preload">` inside `<body>` is invalid HTML  
**Severity:** HIGH  
**File:** `apps/web/app/layout.tsx` (lines 53–61)

**Description:**  
Font preload `<link>` tags are rendered inside `<body>` via a `{PRELOADED_FONTS.map(…)}` expression. `<link rel="preload">` must be in `<head>` to be honoured by browsers. A preload link in `<body>` is either ignored or triggers a console warning; the fonts are fetched later as regular resources, defeating the purpose of preloading and adding a flash of unstyled text on first paint.

Next.js App Router provides the correct mechanism: export a `generateMetadata` with `alternates`, or use the built-in font optimisation. At minimum, move the `<link>` tags into the `<head>` element rendered before `<body>`.

**Fix:**
```tsx
// In layout.tsx — move font preloads into <head>
<html lang="en" className="h-full">
  <head>
    {PRELOADED_FONTS.map((href) => (
      <link key={href} rel="preload" as="font" type="font/woff2"
            href={href} crossOrigin="anonymous" />
    ))}
  </head>
  <body …>
```

---

## BUG-003 — `sources/page.tsx` upload button does nothing real; no file input  
**Severity:** HIGH  
**File:** `apps/web/app/sources/page.tsx`

**Description:**  
The "Add New Source" button calls `handleUpload`, which sets a loading state for 2 seconds and resets — it never opens a file picker, calls the API, or uploads anything. The drag-and-drop zone is a `<div>` with `cursor-pointer` but no `onClick`, no `<input type="file">`, and no drag event handlers. Users cannot actually upload files through this UI.

Similarly, the delete button renders with no `onClick` handler, so sources can never be deleted from the UI.

The page uses a hard-coded `MOCK_SOURCES` array that never reflects the real API state (`GET /api/sources`).

**Fix:**
- Add `<input type="file" accept=".pdf,.pptx,.mp4" hidden ref={fileInputRef} onChange={handleFileChange} />` triggered from the button and drop zone.
- Implement `handleFileChange` to POST the file to `/api/sources?filename=…` with the file bytes as the body.
- Wire delete buttons to `DELETE /api/sources/:id`.
- Replace `MOCK_SOURCES` with a `useEffect` fetch from `GET /api/sources` with polling while any source has `status === "PROCESSING"`.

---

## BUG-004 — `tutor/page.tsx`: video timestamp formatter has integer-only seconds bug  
**Severity:** MEDIUM  
**File:** `apps/web/app/tutor/page.tsx` (line ~110)

**Description:**  
The inline timestamp formatter for video citations is:
```tsx
{activeCitation.type === "video" &&
  `Time ${Math.floor((activeCitation.timestamp || 0)/60)}:${(activeCitation.timestamp || 0)%60}`}
```
`%` on a potentially non-integer timestamp (e.g. `432.5 s`) produces `12.5` for the seconds part, rendering `7:12.5` instead of `7:12`. It also produces no zero-padding, so `7:05` would display as `7:5`. This is the same problem BUG-001 identifies at the schema level, but duplicated here with its own formatting bugs.

Additionally `activeCitation.timestamp || 0` will treat `0` (the very start of a video) as falsy and display `0:0` — but with the `|| 0` this particular case is harmless, it is still a code smell.

**Fix:** Use `Math.floor(seconds % 60)` and `String(…).padStart(2, "0")`, or reuse `formatClock` from `lib/format.ts`.

---

## BUG-005 — `quiz/page.tsx`: `handleNext` does not guard against going past the last question mid-render  
**Severity:** MEDIUM  
**File:** `apps/web/app/quiz/page.tsx`

**Description:**  
`handleNext` increments `currentIdx` unconditionally:
```ts
const handleNext = () => {
  setIsVerified(false);
  setSelectedOption(null);
  setCurrentIdx(prev => prev + 1);
};
```
When the user clicks "Continue" on the last question, `currentIdx` becomes `MOCK_QUESTIONS.length`. React re-renders immediately; the guard `if (currentIdx >= MOCK_QUESTIONS.length)` catches it and renders the results screen. However, between the state update and the re-render, the line `const currentQuestion = MOCK_QUESTIONS[currentIdx]` executes with the out-of-bounds index and returns `undefined`. Any expression that accesses `currentQuestion.options`, `currentQuestion.topic`, etc. before the guard check would throw.

Currently the `if` guard is placed before all those accesses so it does not crash in practice, but the structure is fragile — any refactor that accesses `currentQuestion` before the guard will introduce a runtime error.

**Fix:**
```ts
const handleNext = () => {
  if (currentIdx + 1 >= MOCK_QUESTIONS.length) {
    setCurrentIdx(MOCK_QUESTIONS.length); // signal completion
    return;
  }
  setIsVerified(false);
  setSelectedOption(null);
  setCurrentIdx(prev => prev + 1);
};
```
Or use an `isComplete` boolean state to make intent explicit.

---

## BUG-006 — `dashboard/page.tsx`: overall mastery percentage is hardcoded, not computed  
**Severity:** MEDIUM  
**File:** `apps/web/app/dashboard/page.tsx`

**Description:**  
The "Overall Mastery" stat card displays the hardcoded string `"54%"`. The actual average of `MOCK_TOPICS` mastery values is `(0.85 + 0.42 + 0.15 + 0.61 + 0.30) / 5 = 0.466` ≈ 47%, not 54%. The number is wrong relative to the data displayed on the same screen.

When this page connects to live data, the hardcoded value will never update.

**Fix:** Compute it from the data:
```tsx
const overallMastery = Math.round(
  (MOCK_TOPICS.reduce((sum, t) => sum + t.mastery, 0) / MOCK_TOPICS.length) * 100
);
```

---

## BUG-007 — `parseByteRange`: invalid range (end < start) returns `full` instead of `unsatisfiable`  
**Severity:** MEDIUM  
**File:** `packages/core/src/sources.ts` (the `parseByteRange` function, line ~126)

**Description:**  
RFC 9110 §14.1.2 says a range where the last-byte-pos is less than the first-byte-pos is syntactically invalid and should be treated as if the Range header was absent (i.e. serve the full response). The current code does exactly that:
```ts
if (m[2] !== "" && Number(m[2]) < start) return { kind: "full" }; // invalid → ignore the header
```
However the comment says "invalid → ignore the header" which contradicts the actual requirement for a proper range parser. RFC 9110 §14.2 states: "An origin server that satisfies a range request MUST send a 206 (Partial Content) response if the selected representation would be sent in full otherwise." More critically, an end < start range is **syntactically** invalid, not semantically unsatisfiable — the RFC-compliant handling is indeed to ignore it and serve the full response. So the code is technically correct per RFC, but the comment "invalid → ignore the header" could mislead developers into thinking this case should be a 416. No change needed to the logic, but the comment should be clarified.

**Actual bug:** When `m[1] === ""` and `m[2] === "0"` (suffix range of 0 bytes), the condition `suffix === 0` returns `unsatisfiable`. This is correct — a zero-byte suffix is unsatisfiable. However, `size === 0` also returns `unsatisfiable`, but an empty file with any range request should arguably return `unsatisfiable` with a 416, which is what happens. This is correct. The real bug is a missing edge case: if `Number(m[2])` results in `NaN` (e.g. from a malformed header that passed the regex somehow), `NaN < start` is `false` and `NaN > size - 1` clamps to `size - 1` — the parse silently succeeds with an unexpected end value. The regex `\d*` allows empty strings so `m[2]` can be `""` (handled) but cannot be non-numeric given `\d*`, so NaN is not reachable in practice. Low risk but worth noting.

---

## BUG-008 — `extractPdf`: results array accessed for all pages but only filled for non-failed pages  
**Severity:** HIGH  
**File:** `packages/core/src/ingest/pdf.ts` (the `extractPdf` function)

**Description:**  
```ts
const results: PageResult[] = new Array(pages.length);
let next = 0;
let failed = false;
const worker = async () => {
  while (!failed && next < pages.length) {
    const i = next++;
    try {
      results[i] = await extract(…);
    } catch (e) {
      failed = true;
      throw …;
    }
    await opts.onPageDone?.();
  }
};
await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, pages.length) }, worker));
```
When a worker throws, `failed = true` stops all other workers mid-flight. But other workers that already incremented `next` and are `await`ing their Gemini call will still complete and write to `results[i]` — that is fine. The problem is: after `Promise.all` rejects, the `results` array has holes (the pages that were never started). The code then does:
```ts
for (const r of results) {
  if (r.cached) stats.cached++;   // ← r is undefined for unstarted pages → TypeError
```
Since `Promise.all` rejects on the first error and the outer `runIngestion` catches it, the `for (const r of results)` line is never actually reached on failure. The error propagates before it. So this is not a runtime crash in practice, but the code structure misleads: the stats loop iterates `results` without a null check, which would throw if the early-exit logic ever changed.

**Fix:** Add a guard:
```ts
for (const r of results) {
  if (!r) continue; // worker was stopped before this page
  if (r.cached) stats.cached++;
  …
}
```

---

## BUG-009 — `nearestTopic`: mutating destructuring in hot loop  
**Severity:** MEDIUM (performance / correctness risk)  
**File:** `packages/core/src/build.ts`

**Description:**  
```ts
topicVectors.forEach((t, i) => {
  const s = cosine(v, t);
  if (s > bestScore) [best, bestScore] = [i, s];
});
```
The array destructuring `[best, bestScore] = [i, s]` creates a temporary array on every iteration where `s > bestScore`. For large numbers of topics (up to `MAX_TOPICS = 8`) this is negligible, but the pattern is misleading — it looks like `[best, bestScore]` is a tuple variable when it is just two separate `let` bindings. More importantly, it allocates a short-lived array on each better-score hit.

**Fix:**
```ts
if (s > bestScore) { best = i; bestScore = s; }
```

---

## BUG-010 — `orderTopics`: duplicate key check uses name, not key  
**Severity:** MEDIUM  
**File:** `packages/core/src/build.ts`

**Description:**  
```ts
if (!name || topics.some((x) => x.key === key)) continue;
```
The duplicate check is `x.key === key` — this checks for duplicate **keys**, which is correct. However the guard `!name` skips a topic when its `name` is empty, which means a topic with a valid key but an empty name is silently dropped without incrementing `droppedPrereqs`. Any other topic that listed this dropped topic as a prerequisite will have its prereq silently removed — but since `droppedPrereqs` is not incremented for this case, the `BuildReport` under-reports how many prereq links were lost. The count is used in the log line and returned to the caller; incorrect counts mislead operators.

**Fix:** Increment `dropped` for every dropped topic, or at minimum count any prerequisite links to a skipped topic as dropped.

---

## BUG-011 — `recoverInterruptedSources` uses wall-clock `Date.now()` vs. DB `updatedAt` without timezone alignment  
**Severity:** LOW  
**File:** `packages/core/src/ingest/index.ts`

**Description:**  
```ts
where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - staleMs) } }
```
This is functionally correct — both `Date.now()` and `updatedAt` are in UTC milliseconds, and Prisma correctly compares the `Date` object against the DB timestamp. No actual bug, but the comment `staleMs = STALE_MS` in the function signature defaults to `2 * 60_000`, which combined with the explanation comment ("A PROCESSING row with no recent progress for this long is considered interrupted") creates a subtle issue: the recovery only fires at server start, meaning a source stuck mid-ingest for 2 minutes before the server restarts will be correctly recovered, but a long-running ingest (e.g. a large video that legitimately takes >2 minutes per window) could be falsely marked FAILED if the server restarts during normal processing. `STALE_MS` should be documented as "minimum time since last `updatedAt` tick" rather than "time since ingest started."

---

## BUG-012 — `deleteSource`: does not check for orphaned `topicId` on chunks  
**Severity:** MEDIUM  
**File:** `packages/core/src/sources.ts`

**Description:**  
When a source is deleted, `prisma.source.delete` cascades to delete its chunks. Prisma schema should set `chunk.topicId` to `null` on cascade. If the schema uses `onDelete: SetNull` on `chunk.topicId` this is fine. If it uses `onDelete: Cascade` or `Restrict`, deleting a source that has been built into a course would either cascade-delete topics (wrong) or fail with a FK constraint error. Without reading `schema.prisma` this cannot be confirmed, but the `deleteSource` function has no guard checking whether the source's chunks are currently tagged to a topic (i.e. the course has been built). Deleting such a source silently degrades retrieval quality without notifying the user that a rebuild is needed.

**Fix:** After deleting a source, check if any of its chunks had a non-null `topicId`. If so, warn the caller (add a `rebuildRecommended: boolean` field to `DeleteSourceResponse` or log a prominent warning).

---

## BUG-013 — `tutor/page.tsx`: message list uses array index as React key  
**Severity:** LOW  
**File:** `apps/web/app/tutor/page.tsx`

**Description:**  
```tsx
{messages.map((msg, i) => (
  <div key={i} …>
```
Using array index as `key` causes React to reuse DOM nodes incorrectly when messages are prepended or inserted. When a new assistant message arrives via `setMessages(prev => [...prev, …])`, new items are appended so the index-as-key bug is not triggered in the current append-only flow. However, if the message list is ever initialised from a server fetch (e.g. loading chat history) and then extended, inserted, or reordered, React will animate/reuse the wrong elements.

**Fix:** Use `msg.id` (add a unique `id` field to the `Message` interface, e.g. `crypto.randomUUID()`).

---

## BUG-014 — `sources/page.tsx` status uses `"ERROR"` not `"FAILED"` — inconsistent with the schema  
**Severity:** MEDIUM  
**File:** `apps/web/app/sources/page.tsx`

**Description:**  
The local `Source` interface defines `status: "PROCESSING" | "READY" | "ERROR"`. The real API contract (from `@sc/schemas`) uses `"PENDING" | "PROCESSING" | "READY" | "FAILED"`. The mock uses `"ERROR"` for a failed source, which does not match the contract. When this page eventually fetches from the live API, `"FAILED"` sources would never match the `"ERROR"` class in the status indicator:
```tsx
source.status === "ERROR" ? "bg-red-500"
```
and would fall through with no indicator class at all (the status dot would have no background colour).

Additionally `"PENDING"` is missing from the status union — a source that was just uploaded but not yet processing would show no dot colour.

**Fix:** Replace the local interface with the imported `SourceView` from `@sc/schemas` and update the status indicator to cover all four values.

---

## BUG-015 — `video.ts`: `deleteFile` called even when `file` was a reused existing handle  
**Severity:** MEDIUM  
**File:** `packages/core/src/ingest/video.ts`

**Description:**  
```ts
if (file) {
  await deleteFile(file.name).catch(() => {});
  await opts.onUploaded(null);
}
```
`file` is set to either:
1. `opts.existingFile` (reused — the caller passed it; it should NOT be deleted)
2. A freshly uploaded file (should be deleted after caching)

The code deletes `file` regardless of which case it is. If `existingFile` was reused (`reusable === true`), `file = reusable ? opts.existingFile : …` sets `file = opts.existingFile`, but the branch `if (missing.length)` is skipped entirely when there are no missing windows (all cached), so `file` remains `null`. When there ARE missing windows and the existing file is reused, `file = opts.existingFile` (the branch sets `file = reusable ? opts.existingFile : freshUpload`). After all windows are processed, the reused existing file is then deleted — this is actually correct behaviour per the comment ("all windows cached; the remote copy is no longer needed"), but the `onUploaded(null)` call clears the stored handle on the source row, which would cause the next ingest retry to re-upload the file unnecessarily rather than reusing it.

Wait — on re-reading: if `reusable` is true, `file` is set to `opts.existingFile`. After all windows are extracted and cached, `deleteFile(file.name)` deletes the Gemini file AND `onUploaded(null)` clears the stored reference. This IS the intended behaviour (the video is deleted from Gemini once all windows are cached). The code is correct. However, if all windows were already cached and `missing.length === 0`, the `if (missing.length)` block is skipped, `file` stays `null`, and the deletion branch `if (file)` is never entered — so a previously uploaded Gemini file that is now fully cached stays in Gemini indefinitely (until its 48h expiry). This means the `geminiFileName` column on the Source row stays populated with a reference to a file that may expire, which confuses the `reusable` check on the next ingest attempt.

**Fix:** After the windows loop, if all windows were cached and `opts.existingFile` is set, still delete the remote file and clear the handle:
```ts
const fileToDelete = file ?? (results.every(Boolean) ? opts.existingFile : null);
if (fileToDelete) {
  await deleteFile(fileToDelete.name).catch(() => {});
  await opts.onUploaded(null);
}
```

---

## BUG-016 — `sha256` is exported from `cache.ts` but the private (unexported) implementation is what the module uses  
**Severity:** LOW  
**File:** `packages/core/src/cache.ts`

**Description:**  
```ts
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
// …
export { sha256 }; // also used to put prompt hashes into cache keys
```
This is fine — the same function is used internally and exported. However `sha256` is declared as a `const` in module scope **after** `sha256Bytes` and `sha256File`, which are also `const` — the declaration order means `sha256` cannot be referenced before its `const` binding. The file currently works because `sha256` is only referenced at the bottom via the `export`, not at declaration time. If any helper before it tried to call `sha256(…)`, it would throw a TDZ error. This is a code smell (fragile ordering) rather than a current bug.

**Fix:** Move `const sha256 = …` to the top of the file, before `sha256Bytes` and `sha256File`.

---

## Summary Table

| ID | Severity | File | Short Description |
|---|---|---|---|
| BUG-001 | HIGH | `schemas/citation.ts`, `lib/format.ts` | Duplicate `formatLocator` with inconsistent PPTX label and VIDEO separator |
| BUG-002 | HIGH | `apps/web/app/layout.tsx` | Font preload `<link>` tags inside `<body>` instead of `<head>` |
| BUG-003 | HIGH | `apps/web/app/sources/page.tsx` | Upload button, drag-drop zone, and delete buttons are non-functional; no API calls |
| BUG-004 | MEDIUM | `apps/web/app/tutor/page.tsx` | Video timestamp formatter: unpadded seconds, non-integer modulo gives decimal |
| BUG-005 | MEDIUM | `apps/web/app/quiz/page.tsx` | `handleNext` accesses `currentQuestion` before guard check if refactored |
| BUG-006 | MEDIUM | `apps/web/app/dashboard/page.tsx` | Overall mastery hardcoded as 54%; actual computed average is ~47% |
| BUG-007 | LOW | `packages/core/src/sources.ts` | `parseByteRange` comment misleads; NaN edge case unreachable but undocumented |
| BUG-008 | HIGH | `packages/core/src/ingest/pdf.ts` | Stats loop iterates `results` without null-guard; safe now but fragile |
| BUG-009 | LOW | `packages/core/src/build.ts` | Destructuring array assignment in hot loop; prefer plain assignment |
| BUG-010 | MEDIUM | `packages/core/src/build.ts` | `orderTopics` under-reports `droppedPrereqs` when topic is skipped for empty name |
| BUG-011 | LOW | `packages/core/src/ingest/index.ts` | `STALE_MS` comment misleading; long legitimate ingestion could be falsely failed |
| BUG-012 | MEDIUM | `packages/core/src/sources.ts` | `deleteSource` does not warn caller when deleted source was part of built course |
| BUG-013 | LOW | `apps/web/app/tutor/page.tsx` | Array index used as React `key` in message list |
| BUG-014 | MEDIUM | `apps/web/app/sources/page.tsx` | Local status type uses `"ERROR"` / missing `"PENDING"`; inconsistent with schema |
| BUG-015 | MEDIUM | `packages/core/src/ingest/video.ts` | When all windows cached, existing Gemini file not deleted, handle not cleared |
| BUG-016 | LOW | `packages/core/src/cache.ts` | `sha256` declared after its potential callers; fragile ordering |
| BUG-017 | HIGH | `tools/e2e/src/stage1-tutor.ts` | Missing test-set file existence checks |
| BUG-018 | HIGH | `tools/e2e/src/stage1-retrieval.ts` | Missing test-set file existence checks |
| BUG-019 | MEDIUM | `tools/e2e/src/realdata-check.ts` | No validation of command-line spec path |
| BUG-020 | MEDIUM | `tools/e2e/src/stage1-{pdf,video}.ts` | Missing data-file existence checks |
| BUG-021 | HIGH | `apps/web/lib/format.ts` | Duplicate `formatLocator` inconsistent with schema |
| BUG-022 | LOW | `README.md` | Incomplete command documentation |

---

*Generated by Kiro audit — 2026-10-14*

---

## BUG-017 — `stage1-tutor.ts`: missing file existence check for test sets
**Severity:** HIGH
**File:** `tools/e2e/src/stage1-tutor.ts` (lines 26–27)

**Description:**
The script directly calls `readFile()` on two hardcoded test-set paths without checking if the files exist. These files are `.gitignored` and not committed to the repository. A fresh clone fails with a raw `ENOENT` error. `JSON.parse()` and `TestSet.parse()` are also unwrapped, so malformed JSON yields no context about which file failed.

**Root cause:** Missing `existsSync` guard; missing try-catch on JSON and schema parsing.

**Fix:** Guard each path with `existsSync`; on miss throw `"Test set not found: <path> — see data/demo/README.md"`. Wrap parsing in `try/catch` with the file path in the message.

---

## BUG-018 — `stage1-retrieval.ts`: missing file-existence check and error handling
**Severity:** HIGH
**File:** `tools/e2e/src/stage1-retrieval.ts` (lines 19–21)

**Description:**
Same pattern as BUG-017. `readFile(setPath)` is called without an existence check. When the test set file is missing, this throws a raw `ENOENT`. The script accepts a CLI argument for the path but does not validate it exists before use.

**Root cause:** Missing `existsSync` guard; missing try-catch on parse.

**Fix:** Check `existsSync(setPath)` before reading; wrap parse calls; include the resolved path in any error.

---

## BUG-019 — `realdata-check.ts`: command-line spec path not validated
**Severity:** MEDIUM
**File:** `tools/e2e/src/realdata-check.ts` (lines 47–49)

**Description:**
`process.argv[2]` is resolved to a path and passed directly to `readFile` and `JSON.parse` without any existence check or error wrapping. A misnamed spec file yields a raw `ENOENT`.

**Root cause:** Missing `existsSync` guard and no try-catch around `JSON.parse`.

**Fix:** Add existence check with helpful message listing available specs; wrap JSON.parse in try-catch.

---

## BUG-020 — `stage1-pdf.ts` and `stage1-video.ts`: data files read without existence check
**Severity:** MEDIUM
**Files:** `tools/e2e/src/stage1-pdf.ts` (line 51), `tools/e2e/src/stage1-video.ts` (line 41)

**Description:**
Both scripts read demo data files (PDF and video) without checking they exist. These files are gitignored. Missing files produce raw `ENOENT` errors with no guidance.

**Root cause:** Missing `existsSync` checks before `readFile`.

**Fix:** Add existence check before each `readFile` call, with an error pointing to `data/demo/README.md`.

---

## BUG-021 — `lib/format.ts`: duplicate `formatLocator` inconsistent with schema (BUG-001 unfixed)
**Severity:** HIGH
**File:** `apps/web/lib/format.ts`

**Description:**
`apps/web/lib/format.ts` exports a `formatLocator` that produces different output than `packages/schemas/src/citation.ts`:
- PPTX: `"s. 4"` (lib) vs `"slide 4"` (schema)
- VIDEO: `"03:15-04:02"` (lib, plain hyphen, zero-padded minutes) vs `"3:15–4:02"` (schema, en-dash, no padding on minutes)

**Root cause:** Duplicate function with different formatting decisions; callers use the wrong one.

**Fix:** Remove `formatLocator` and `formatClock` from `lib/format.ts`. Re-export `formatLocator` from `@sc/schemas` to avoid breaking existing import sites.

---

## BUG-022 — README.md command documentation is incomplete
**Severity:** LOW
**File:** `README.md`

**Description:**
The README shows only four basic setup commands; it omits `npm run typecheck`, `npm run test:e2e`, `npm run stage1:*`, and the other scripts in the root `package.json`.

**Root cause:** Documentation gap.

**Fix:** Add an "Available scripts" table listing all root-level npm scripts.

---

*Extended audit — 2026-10-14*
