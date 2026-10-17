// Video ingestion: upload the MP4 once to the Gemini Files API → segment it in windows of ≤ 60 s
// (videoMetadata start/end offsets) → one chunk per segment, cited by tStart/tEnd seconds.
//
// Why windows: on the real Stage-1 video, ONE call over 154 s drifted (a 29 s slide was given 69 s
// and every later timestamp was ~39 s late). A probe on a 60 s window gave ≤ 0.5 s error.
// Each window's result is validated, then cached (file hash + window + prompt version).
import { z } from "zod";
import { sha256, writeCache } from "../cache";
import { cachedGenerateJson, deleteFile, generateCacheKey, generateJson, modelFor, uploadFile, type UploadedFile } from "../llm";
import type { ChunkDraft, IngestStats } from "./types";

/** Bump when the schema or windowing changes. (Prompt text changes miss the cache automatically: its hash is in the key.) */
export const VIDEO_PROMPT_VERSION = "video-v3-windowed";

/** Measured on the real Stage-1 video: ≈91–96 input tokens per second of video. */
export const VIDEO_TOKENS_PER_SECOND = 96;

/** Protobuf Duration string (Gemini rejects more than 9 fractional digits, e.g. "154.15727891156462s"). */
const offset = (t: number) => `${t.toFixed(1)}s`;

/** Longest clip sent in one request (accuracy measured at this size). */
export const MAX_WINDOW_SEC = 60;

export const VideoSegmentation = z.object({
  segments: z.array(
    z.object({
      tStart: z.number(),
      tEnd: z.number(),
      title: z.string(),
      transcript: z.string(),
      onScreen: z.string(),
      conceptLabels: z.array(z.string()),
    }),
  ),
});
export type VideoSegmentation = z.infer<typeof VideoSegmentation>;

/** Subject-agnostic: the course name (Course.name in the DB) is the only context given. */
export function videoPrompt(courseName: string): string {
  return `You index a clip of a lecture video for a study assistant. The course is: "${courseName}". Students will ask questions and every answer must cite the exact moment in the video, so timestamps must be accurate.

Split the WHOLE clip, from its first frame to its last, into consecutive segments:
- Start a new segment whenever the slide or visual changes, or the speaker moves to a new point.
- tStart and tEnd: seconds RELATIVE TO THE START OF THE CLIP (0 = its first frame), as numbers (for example 13.5). Segments must not overlap and together must cover the whole clip.
- title: a short heading for the segment (for example the slide title).
- transcript: what is said during the segment, word for word. Do not summarise. Use "" if nothing is said.
- onScreen: everything shown that carries information: slide titles, all visible text, table contents, and a precise description of diagrams and illustrations.
- conceptLabels: 1 to 4 short concepts covered in the segment.

Use only what is in the clip. Do not add outside knowledge.`;
}

export type RawSegment = VideoSegmentation["segments"][number];
export type SegmentReport = { windows: number; returned: number; kept: number; dropped: number; mergedAtEdges: number; coverage: number; longest: number };

/** Equal windows of at most MAX_WINDOW_SEC covering [0, duration]. */
export function videoWindows(durationSec: number, maxSec = MAX_WINDOW_SEC): [number, number][] {
  const n = Math.max(1, Math.ceil(durationSec / maxSec));
  const size = durationSec / n;
  const r = (t: number) => Math.round(t * 10) / 10;
  const end = Math.floor(durationSec * 10) / 10; // never past the real end
  return Array.from({ length: n }, (_, i) => [r(i * size), i === n - 1 ? end : r((i + 1) * size)]);
}

/**
 * Makes segments safe to cite inside [from, to]: clamp, sort, remove overlaps,
 * drop empty/zero-length ones. Returns the cleaned segments and their coverage of [from, to].
 */
export function normalizeSegments(raw: RawSegment[], from: number, to: number): { segments: RawSegment[]; coverage: number; dropped: number } {
  const clamp = (t: number) => Math.min(to, Math.max(from, Math.round(t * 10) / 10));
  const sorted = raw
    .map((s) => ({ ...s, tStart: clamp(s.tStart), tEnd: clamp(s.tEnd) }))
    .sort((a, b) => a.tStart - b.tStart || a.tEnd - b.tEnd);
  const kept: RawSegment[] = [];
  for (const s of sorted) {
    const tStart = Math.max(s.tStart, kept.at(-1)?.tEnd ?? from);
    const hasContent = (s.transcript + s.onScreen).trim().length > 0;
    if (s.tEnd - tStart < 0.5 || !hasContent) continue;
    kept.push({ ...s, tStart });
  }
  const covered = kept.reduce((sum, s) => sum + (s.tEnd - s.tStart), 0);
  return { segments: kept, coverage: to > from ? covered / (to - from) : 0, dropped: raw.length - kept.length };
}

/** A clip's segments in whole-video seconds. Clip-relative is asked for; absolute is detected and accepted. */
export function toAbsolute(raw: RawSegment[], from: number, to: number): RawSegment[] {
  const clipLen = to - from;
  const looksAbsolute = from > 0 && raw.some((s) => s.tEnd > clipLen + 2);
  return looksAbsolute ? raw : raw.map((s) => ({ ...s, tStart: s.tStart + from, tEnd: s.tEnd + from }));
}

/** Re-joins a segment that a window edge cut in two (same title, touching). */
export function mergeAtEdges(segments: RawSegment[], edges: number[]): { segments: RawSegment[]; merged: number } {
  const out: RawSegment[] = [];
  let merged = 0;
  for (const s of segments) {
    const prev = out.at(-1);
    const atEdge = prev && edges.some((e) => Math.abs(prev.tEnd - e) <= 1 && Math.abs(s.tStart - e) <= 1);
    if (prev && atEdge && prev.title.trim().toLowerCase() === s.title.trim().toLowerCase()) {
      prev.tEnd = s.tEnd;
      prev.transcript = [prev.transcript, s.transcript].filter((t) => t.trim()).join(" ");
      if (s.onScreen.trim() && !prev.onScreen.includes(s.onScreen.trim())) prev.onScreen = `${prev.onScreen} ${s.onScreen}`.trim();
      prev.conceptLabels = [...new Set([...prev.conceptLabels, ...s.conceptLabels])];
      merged++;
    } else {
      out.push({ ...s });
    }
  }
  return { segments: out, merged };
}

/** One TRANSCRIPT chunk per segment (decision Q11: transcript + on-screen content). */
export function segmentChunks(segments: RawSegment[]): ChunkDraft[] {
  return segments.map((s) => {
    const transcript = s.transcript.trim();
    const onScreen = s.onScreen.trim();
    return {
      kind: "TRANSCRIPT",
      title: s.title.trim() || null,
      content: [transcript, onScreen && `[On screen] ${onScreen}`].filter(Boolean).join("\n"),
      page: null,
      slide: null,
      tStart: s.tStart,
      tEnd: s.tEnd,
      conceptLabels: [...new Set(s.conceptLabels.map((l) => l.trim()).filter(Boolean))].slice(0, 4),
    };
  });
}

/** A window whose segments cover less than this is rejected (timestamps unreliable) and not cached. */
export const MIN_WINDOW_COVERAGE = 0.6;

export type GeminiFileHandle = { name: string; uri: string; expiresAt: Date | null };

/**
 * Which key uploaded each Files API file (in this process). A file is readable only by its uploader's
 * project, so every window call is pinned to that key; a handle whose uploader is unknown (e.g. after a
 * restart) is re-uploaded rather than guessed.
 */
const uploaderOf = new Map<string, number>();

export async function extractVideo(opts: {
  courseName: string;
  absPath: string;
  fileSha: string;
  durationSec: number;
  /** A previous, still-valid Files API upload (reused on retries). */
  existingFile: GeminiFileHandle | null;
  /** Persist/clear the remote handle on the Source row. */
  onUploaded: (f: UploadedFile | null) => Promise<void>;
  onStep: () => Promise<void>;
}): Promise<{ chunks: ChunkDraft[]; stats: IngestStats; report: SegmentReport }> {
  const windows = videoWindows(opts.durationSec);
  const stats: IngestStats = { units: windows.length + 1, geminiCalls: 0, cached: 0, inputTokens: 0, outputTokens: 0 };
  const system = videoPrompt(opts.courseName);
  const keyOf = ([a, b]: [number, number]) => `video|${VIDEO_PROMPT_VERSION}|${sha256(system).slice(0, 16)}|${opts.fileSha}|${a}-${b}`;

  const results: (RawSegment[] | undefined)[] = await Promise.all(
    windows.map(async (w) => (await cachedGenerateJson("strong", VideoSegmentation, keyOf(w)))?.segments),
  );
  const missing = windows.map((w, i) => (results[i] ? null : i)).filter((i): i is number => i !== null);

  let file: GeminiFileHandle | null = null;
  let fileKey: number | undefined;
  if (missing.length) {
    const prior = opts.existingFile;
    const reusable = prior && uploaderOf.has(prior.name) && (!prior.expiresAt || prior.expiresAt.getTime() > Date.now() + 10 * 60_000);
    if (reusable) {
      file = prior;
      fileKey = uploaderOf.get(prior.name);
    } else {
      const up = await uploadFile(opts.absPath, "video/mp4");
      uploaderOf.set(up.name, up.keyIndex);
      [file, fileKey] = [up, up.keyIndex];
      await opts.onUploaded(up);
    }
  }
  await opts.onStep(); // step 1: upload (or nothing to upload)

  for (const [i, w] of windows.entries()) {
    if (results[i]) {
      stats.cached++;
      await opts.onStep();
      continue;
    }
    const [from, to] = w;
    const r = await generateJson({
      role: "strong",
      schema: VideoSegmentation,
      system,
      parts: [
        { fileData: { fileUri: file!.uri, mimeType: "video/mp4" }, videoMetadata: { startOffset: offset(from), endOffset: offset(to) } },
        { text: `You are given only a clip of the video: from ${from} s to ${to} s (${(to - from).toFixed(1)} s long). Give tStart and tEnd in seconds relative to the start of this clip (0 = its first frame). Segment all of the clip.` },
      ],
      estimatedInputTokens: Math.ceil((to - from) * VIDEO_TOKENS_PER_SECOND * 1.3) + 1_000,
      keyIndex: fileKey, // only the uploader's project can read the file
    });
    stats.geminiCalls++;
    stats.inputTokens += r.usage.inputTokens;
    stats.outputTokens += r.usage.outputTokens;
    const absolute = toAbsolute(r.data.segments, from, to);
    const check = normalizeSegments(absolute, from, to);
    if (check.coverage < MIN_WINDOW_COVERAGE) {
      throw new Error(`Video window ${from}–${to} s: segments cover only ${(check.coverage * 100).toFixed(0)}% of it; timestamps unreliable, try ingest again (finished windows are cached).`);
    }
    // Cache only validated windows, in whole-video seconds.
    await writeCache("generate", generateCacheKey(modelFor("strong"), VideoSegmentation, keyOf(w)), { data: { segments: absolute }, usage: r.usage });
    results[i] = absolute;
    await opts.onStep();
  }

  if (file) {
    await deleteFile(file.name, fileKey).catch(() => {}); // all windows cached; the remote copy is no longer needed
    uploaderOf.delete(file.name);
    await opts.onUploaded(null);
  }

  const all = normalizeSegments(results.flatMap((s) => s ?? []), 0, opts.durationSec);
  const edges = windows.slice(1).map(([a]) => a);
  const { segments, merged } = mergeAtEdges(all.segments, edges);
  const returned = results.reduce((n, s) => n + (s?.length ?? 0), 0);
  return {
    chunks: segmentChunks(segments),
    stats,
    report: {
      windows: windows.length,
      returned,
      kept: segments.length,
      dropped: all.dropped,
      mergedAtEdges: merged,
      coverage: all.coverage,
      longest: segments.reduce((m, s) => Math.max(m, s.tEnd - s.tStart), 0),
    },
  };
}
