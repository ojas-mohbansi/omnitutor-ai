// Tests for ChunkExport and SourcesManifest schemas (Requirement 6).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChunkExport, SourcesManifest } from "../src/dataset";

function makeChunkExport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chunk_id: "chunk-001",
    source_id: "source-001",
    source_type: "PDF",
    filename: "chapter3.pdf",
    kind: "TEXT",
    seq: 0,
    title: "CPU Scheduling",
    section: "3.2 Scheduling Criteria",
    content: "CPU scheduling is the basis of multiprogrammed operating systems.",
    page: 5,
    slide: null,
    t_start: null,
    t_end: null,
    concept_labels: ["CPU scheduling", "multiprogramming"],
    topic_id: "topic-001",
    topic_name: "Process Scheduling",
    language: "en",
    quality_score: 0.75,
    embedding: Array.from({ length: 768 }, (_, i) => i / 1000),
    created_at: "2026-01-14T10:23:00.000Z",
    ...overrides,
  };
}

function makeManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    course_id: "demo-course",
    course_name: "Operating Systems",
    exported_at: "2026-01-14T10:30:00.000Z",
    sources: [{ source_id: "src-1", filename: "chapter.pdf", source_type: "PDF", chunk_count: 21 }],
    topics: [{ topic_id: "t-1", topic_name: "CPU Scheduling", seq: 0, description: "Intro", prereq_ids: [], chunk_count: 7 }],
    stats: { total_chunks: 21, by_kind: { TEXT: 15, FIGURE: 6 }, by_source_type: { PDF: 21 } },
    ...overrides,
  };
}

describe("ChunkExport schema", () => {
  it("parses a valid full chunk export", () => {
    const result = ChunkExport.parse(makeChunkExport());
    assert.equal(result.chunk_id, "chunk-001");
    assert.equal(result.quality_score, 0.75);
    assert.equal(result.embedding.length, 768);
  });

  it("rejects embedding with wrong length (Req 6.2)", () => {
    assert.throws(() => ChunkExport.parse(makeChunkExport({ embedding: [0.1, 0.2, 0.3] })));
  });

  it("rejects quality_score > 1 (Req 6.3)", () => {
    assert.throws(() => ChunkExport.parse(makeChunkExport({ quality_score: 1.5 })));
  });

  it("rejects quality_score < 0 (Req 6.3)", () => {
    assert.throws(() => ChunkExport.parse(makeChunkExport({ quality_score: -0.1 })));
  });

  it("accepts null quality_score (Req 6.3)", () => {
    const result = ChunkExport.parse(makeChunkExport({ quality_score: null }));
    assert.equal(result.quality_score, null);
  });

  it("rejects invalid created_at (Req 6.4)", () => {
    assert.throws(() => ChunkExport.parse(makeChunkExport({ created_at: "14-01-2026" })));
  });

  it("accepts null title and section", () => {
    const result = ChunkExport.parse(makeChunkExport({ title: null, section: null }));
    assert.equal(result.title, null);
    assert.equal(result.section, null);
  });

  it("round-trip: parse → JSON.stringify → parse produces equivalent object (Property 3, Req 6.10)", () => {
    const original = ChunkExport.parse(makeChunkExport());
    const roundTripped = ChunkExport.parse(JSON.parse(JSON.stringify(original)));
    assert.equal(roundTripped.chunk_id, original.chunk_id);
    assert.equal(roundTripped.embedding.length, 768);
    assert.equal(roundTripped.quality_score, original.quality_score);
  });

  it("all source_type + kind combinations parse (exhaustive property check)", () => {
    for (const source_type of ["PDF", "PPTX", "VIDEO"] as const) {
      for (const kind of ["TEXT", "FIGURE", "SLIDE", "TRANSCRIPT"] as const) {
        const locator =
          source_type === "PDF"   ? { page: 1, slide: null, t_start: null, t_end: null } :
          source_type === "PPTX"  ? { page: null, slide: 2, t_start: null, t_end: null } :
                                    { page: null, slide: null, t_start: 10.5, t_end: 30.0 };
        assert.doesNotThrow(
          () => ChunkExport.parse(makeChunkExport({ source_type, kind, ...locator })),
          `should parse source_type=${source_type} kind=${kind}`
        );
      }
    }
  });
});

describe("SourcesManifest schema", () => {
  it("parses a valid manifest (Req 6.8)", () => {
    const result = SourcesManifest.parse(makeManifest());
    assert.equal(result.course_id, "demo-course");
    assert.equal(result.stats.total_chunks, 21);
  });

  it("rejects invalid exported_at", () => {
    assert.throws(() => SourcesManifest.parse(makeManifest({ exported_at: "not-a-date" })));
  });

  it("rejects negative total_chunks", () => {
    assert.throws(() => SourcesManifest.parse(makeManifest({ stats: { total_chunks: -1, by_kind: {}, by_source_type: {} } })));
  });

  it("accepts empty sources and topics arrays", () => {
    const result = SourcesManifest.parse(makeManifest({ sources: [], topics: [] }));
    assert.deepEqual(result.sources, []);
  });

  it("round-trip: parse → JSON.stringify → parse produces equivalent object", () => {
    const original = SourcesManifest.parse(makeManifest());
    const parsed = SourcesManifest.parse(JSON.parse(JSON.stringify(original, null, 2)));
    assert.equal(parsed.course_id, original.course_id);
    assert.equal(parsed.stats.total_chunks, original.stats.total_chunks);
  });
});
