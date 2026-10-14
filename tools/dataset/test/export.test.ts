// Unit tests for export.ts pure helpers (Requirements 8.3–8.5, 9.1–9.5, Properties 4, 5, 8).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChunkExport, SourcesManifest } from "@sc/schemas";
import { toChunkExport, buildManifest, chunksToCsv } from "../src/export";

// ── Fixtures ──
const mockSource = { id: "src-1", type: "PDF", filename: "chapter3.pdf" };
const mockTopic  = { id: "topic-1", name: "CPU Scheduling", seq: 0, description: "Intro to scheduling", prereqIds: [] };

function makeChunkRow(overrides: Partial<Record<string, unknown>> = {}): Parameters<typeof toChunkExport>[0] {
  return {
    id: "chunk-001",
    seq: 0,
    kind: "TEXT",
    title: "CPU Scheduling",
    content: "CPU scheduling is the basis of multiprogrammed operating systems.",
    page: 5,
    slide: null,
    tStart: null,
    tEnd: null,
    conceptLabels: ["CPU scheduling", "multiprogramming"],
    topicId: "topic-1",
    section: "3.2 Scheduling Criteria",
    language: "en",
    qualityScore: 0.75,
    embedding: Array.from({ length: 768 }, (_, i) => i / 1000),
    createdAt: new Date("2026-01-14T10:23:00.000Z"),
    ...overrides,
  } as Parameters<typeof toChunkExport>[0];
}

describe("toChunkExport", () => {
  it("maps all fields correctly and passes ChunkExport.parse (Property 3, Req 8.3)", () => {
    const row = makeChunkRow();
    const result = toChunkExport(row, mockSource, mockTopic);
    assert.equal(result.chunk_id, "chunk-001");
    assert.equal(result.source_type, "PDF");
    assert.equal(result.filename, "chapter3.pdf");
    assert.equal(result.page, 5);
    assert.equal(result.quality_score, 0.75);
    assert.equal(result.topic_name, "CPU Scheduling");
    assert.equal(result.embedding.length, 768);
    // Confirm it parses cleanly
    assert.doesNotThrow(() => ChunkExport.parse(result));
  });

  it("handles null topic", () => {
    const result = toChunkExport(makeChunkRow(), mockSource, null);
    assert.equal(result.topic_id, "topic-1");
    assert.equal(result.topic_name, null);
  });

  it("maps VIDEO chunk correctly (tStart/tEnd)", () => {
    const videoSource = { id: "src-2", type: "VIDEO", filename: "lecture.mp4" };
    const row = makeChunkRow({ kind: "TRANSCRIPT", page: null, slide: null, tStart: 30.5, tEnd: 60.0, embedding: Array.from({ length: 768 }, () => 0) });
    const result = toChunkExport(row, videoSource, mockTopic);
    assert.equal(result.t_start, 30.5);
    assert.equal(result.t_end, 60.0);
    assert.equal(result.page, null);
  });
});

describe("buildManifest (Property 5, Req 9.1–9.4)", () => {
  it("stats.total_chunks equals chunks.length", () => {
    const chunk = toChunkExport(makeChunkRow(), mockSource, mockTopic);
    const sourceChunkCounts = new Map([["src-1", 1]]);
    const topicChunkCounts  = new Map([["topic-1", 1]]);
    const manifest = buildManifest("demo-course", "OS", [mockSource], [mockTopic], topicChunkCounts, sourceChunkCounts, [chunk]);
    assert.equal(manifest.stats.total_chunks, 1);
  });

  it("by_kind sums equal total_chunks", () => {
    const chunks = [
      toChunkExport(makeChunkRow({ id: "c1" }), mockSource, mockTopic),
      toChunkExport(makeChunkRow({ id: "c2", kind: "FIGURE" }), mockSource, mockTopic),
    ];
    const sourceChunkCounts = new Map([["src-1", 2]]);
    const topicChunkCounts  = new Map([["topic-1", 2]]);
    const manifest = buildManifest("demo-course", "OS", [mockSource], [mockTopic], topicChunkCounts, sourceChunkCounts, chunks);
    const kindSum = Object.values(manifest.stats.by_kind).reduce((a, b) => a + b, 0);
    assert.equal(kindSum, manifest.stats.total_chunks);
  });

  it("by_source_type sums equal total_chunks", () => {
    const chunks = [
      toChunkExport(makeChunkRow({ id: "c1" }), mockSource, mockTopic),
      toChunkExport(makeChunkRow({ id: "c2" }), mockSource, mockTopic),
    ];
    const sourceChunkCounts = new Map([["src-1", 2]]);
    const topicChunkCounts  = new Map([["topic-1", 2]]);
    const manifest = buildManifest("demo-course", "OS", [mockSource], [mockTopic], topicChunkCounts, sourceChunkCounts, chunks);
    const typeSum = Object.values(manifest.stats.by_source_type).reduce((a, b) => a + b, 0);
    assert.equal(typeSum, manifest.stats.total_chunks);
  });

  it("passes SourcesManifest.parse without error", () => {
    const chunks = [toChunkExport(makeChunkRow(), mockSource, mockTopic)];
    const manifest = buildManifest("demo-course", "OS", [mockSource], [mockTopic], new Map([["topic-1", 1]]), new Map([["src-1", 1]]), chunks);
    assert.doesNotThrow(() => SourcesManifest.parse(manifest));
  });
});

describe("chunksToCsv (Property 4, 8, Req 8.4, 9.1, 9.5)", () => {
  it("has a header row and one data row per chunk (Property 4)", () => {
    const c1 = toChunkExport(makeChunkRow({ id: "c1" }), mockSource, mockTopic);
    const c2 = toChunkExport(makeChunkRow({ id: "c2" }), mockSource, mockTopic);
    const csv = chunksToCsv([c1, c2]);
    const lines = csv.split("\n").filter(Boolean);
    assert.equal(lines.length, 3); // header + 2 data rows
  });

  it("header does NOT contain 'embedding' (Property 8, Req 9.5)", () => {
    const csv = chunksToCsv([toChunkExport(makeChunkRow(), mockSource, mockTopic)]);
    const header = csv.split("\n")[0];
    assert.ok(!header.includes("embedding"), `header should not contain 'embedding': ${header}`);
  });

  it("each data row has the same column count as the header", () => {
    const c1 = toChunkExport(makeChunkRow({ id: "c1" }), mockSource, mockTopic);
    const csv = chunksToCsv([c1]);
    const [header, dataRow] = csv.split("\n");
    // Simple column count (ignores quoted commas, but good enough for our data)
    assert.equal(header.split(",").length, dataRow.split(",").length);
  });

  it("content_preview is first 200 chars of content, not the full content", () => {
    const longContent = "x".repeat(400);
    const c = toChunkExport(makeChunkRow({ content: longContent }), mockSource, mockTopic);
    const csv = chunksToCsv([c]);
    const dataRow = csv.split("\n")[1];
    // content is 400 chars; content_preview should be 200
    assert.ok(!dataRow.includes("x".repeat(201)), "data row should not contain 201+ consecutive x's (preview should be capped at 200)");
    assert.ok(dataRow.includes("x".repeat(200)), "data row should contain exactly 200 x's");
  });

  it("empty chunks array produces header only", () => {
    const csv = chunksToCsv([]);
    const lines = csv.split("\n").filter(Boolean);
    assert.equal(lines.length, 1); // header only
  });
});
