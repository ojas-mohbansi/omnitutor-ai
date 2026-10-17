// Module 5: PDF ingestion with FAKE Gemini (injected extractor + embedder) against the real DB.
// No API calls. Files go to a temp REPO_ROOT. Run: npm run test
import "./env";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@sc/db";
import { AppError } from "../src/errors";
import {
  MAX_TEXT_CHARS, embedText, pageChunks, recoverInterruptedSources, requestIngestion, splitPdf,
  type ExtractPage, type ExtractSlides, type PdfPageExtraction,
} from "../src/ingest/index";
import { listSources, uploadSource } from "../src/sources";
import { chunked, makeDeck, makePdf, makePng } from "../src/testing";

const TAG = `__test__ingest${Date.now()}`;
let tempRoot: string;
before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "sc-ingest-"));
  process.env.REPO_ROOT = tempRoot;
});
after(async () => {
  await prisma.source.deleteMany({ where: { filename: { startsWith: TAG } } });
  await prisma.$disconnect();
  await rm(tempRoot, { recursive: true, force: true });
});

const ex = (blocks: PdfPageExtraction["blocks"], conceptLabels: string[] = []): PdfPageExtraction => ({ blocks, conceptLabels });
const t = (content: string, title = "") => ({ kind: "text" as const, title, content });
const fig = (content: string, title = "") => ({ kind: "figure" as const, title, content });

describe("pageChunks (pure)", () => {
  it("groups text, keeps each figure separate, preserves reading order", () => {
    const c = pageChunks(5, ex([t("Intro", "Dispatcher"), t("- switching context"), fig("Diagram: ready -> running", "Process states"), t("After the figure")], ["dispatcher", " dispatcher ", "context switch"]));
    assert.deepEqual(c.map((x) => [x.kind, x.title, x.page]), [["TEXT", "Dispatcher", 5], ["FIGURE", "Process states", 5], ["TEXT", null, 5]]);
    assert.equal(c[0].content, "Intro\n\n- switching context");
    assert.deepEqual(c[0].conceptLabels, ["dispatcher", "context switch"]);
  });
  it("tables become TEXT with their title; empty blocks are dropped; untitled figures get 'Figure'", () => {
    const c = pageChunks(1, ex([{ kind: "table", title: "Processes", content: "| P | Burst |\n| P1 | 5 |" }, t("   "), fig("Gantt chart P1 P2")]));
    assert.deepEqual(c.map((x) => [x.kind, x.title]), [["TEXT", null], ["FIGURE", "Figure"]]);
    assert.ok(c[0].content.startsWith("Processes\n| P | Burst |"));
  });
  it("long text starts a new chunk past MAX_TEXT_CHARS", () => {
    const long = "x".repeat(MAX_TEXT_CHARS - 10);
    assert.equal(pageChunks(1, ex([t(long), t("y".repeat(50))])).length, 2);
  });
  it("embedText = title + newline + content", () => {
    assert.equal(embedText({ title: "Dispatcher", content: "gives the CPU" }), "Dispatcher\ngives the CPU");
    assert.equal(embedText({ title: null, content: "plain" }), "plain");
  });
});

describe("splitPdf", () => {
  it("one single-page PDF per page, in order", async () => {
    const pages = await splitPdf(await makePdf(3));
    assert.equal(pages.length, 3);
    for (const p of pages) assert.equal((await PDFDocument.load(p)).getPageCount(), 1);
  });
});

// Fake Gemini: page i returns predictable blocks; records which pages were "called".
function fakeDeps(opts: { failOn?: number; empty?: boolean; gate?: Promise<void> } = {}) {
  const calls: number[] = [];
  const extractPage: ExtractPage = async (_bytes, { pageIndex }) => {
    calls.push(pageIndex);
    await opts.gate;
    if (opts.failOn === pageIndex) throw new Error("[llm:validation] model returned junk");
    const blocks = opts.empty ? [] : pageIndex === 1 ? [t(`Text of page ${pageIndex + 1}`, `Heading ${pageIndex + 1}`), fig(`Figure on page ${pageIndex + 1}`, "Diagram")] : [t(`Text of page ${pageIndex + 1}`)];
    return { extraction: ex(blocks, ["scheduling"]), cached: pageIndex === 0, usage: { inputTokens: 600, outputTokens: 100 } };
  };
  const embed = async (texts: string[]) => texts.map((_, i) => Array.from({ length: 768 }, () => i / 1000));
  return { calls, deps: { extractPage, embed } };
}
const uploadPdf = async (name: string, pages = 3) => (await uploadSource({ body: chunked(await makePdf(pages)), filename: `${TAG}-${name}` })).id;
const isCode = (code: string, pattern?: RegExp) => (e: unknown) => e instanceof AppError && e.code === code && (!pattern || pattern.test(e.message));

describe("requestIngestion / runIngestion (fake Gemini, real DB)", () => {
  it("PENDING → PROCESSING (immediately) → READY with page-cited chunks and embeddings", async () => {
    const id = await uploadPdf("ok.pdf");
    const { calls, deps } = fakeDeps();
    const { response, job } = await requestIngestion(id, deps);
    assert.deepEqual(response, { id, status: "PROCESSING" });
    assert.equal((await prisma.source.findUniqueOrThrow({ where: { id } })).status, "PROCESSING");

    const result = await job;
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual({ ...result.stats }, { units: 3, geminiCalls: 2, cached: 1, inputTokens: 1800, outputTokens: 300 });
    assert.deepEqual([...calls].sort(), [0, 1, 2]);

    const src = await prisma.source.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([src.status, src.error, src.progressDone, src.progressTotal], ["READY", null, 3, 3]);
    const chunks = await prisma.chunk.findMany({ where: { sourceId: id }, orderBy: { seq: "asc" } });
    assert.deepEqual(chunks.map((c) => [c.seq, c.kind, c.page, c.slide, c.tStart]), [[0, "TEXT", 1, null, null], [1, "TEXT", 2, null, null], [2, "FIGURE", 2, null, null], [3, "TEXT", 3, null, null]]);
    assert.ok(chunks.every((c) => c.embedding.length === 768 && c.conceptLabels[0] === "scheduling"));
    assert.equal((await listSources()).find((s) => s.id === id)?.chunkCount, 4);
  });

  it("re-running replaces the chunks (no duplicates)", async () => {
    const id = await uploadPdf("rerun.pdf");
    await (await requestIngestion(id, fakeDeps().deps)).job;
    await (await requestIngestion(id, fakeDeps().deps)).job;
    assert.equal(await prisma.chunk.count({ where: { sourceId: id } }), 4);
  });

  it("a failing page → FAILED with 'Page N:' message, no chunks written", async () => {
    const id = await uploadPdf("fail.pdf");
    const result = await (await requestIngestion(id, fakeDeps({ failOn: 1 }).deps)).job;
    assert.equal(result.ok, false);
    const src = await prisma.source.findUniqueOrThrow({ where: { id } });
    assert.equal(src.status, "FAILED");
    assert.match(src.error ?? "", /^Page 2: model returned junk/);
    assert.equal(await prisma.chunk.count({ where: { sourceId: id } }), 0);
  });

  it("nothing extractable → FAILED with a clear message", async () => {
    const id = await uploadPdf("empty.pdf", 2);
    await (await requestIngestion(id, fakeDeps({ empty: true }).deps)).job;
    assert.match((await prisma.source.findUniqueOrThrow({ where: { id } })).error ?? "", /No content could be extracted/);
  });

  it("a second request while processing is refused (409)", async () => {
    const id = await uploadPdf("busy.pdf");
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const { job } = await requestIngestion(id, fakeDeps({ gate }).deps);
    await assert.rejects(requestIngestion(id, fakeDeps().deps), isCode("not_ready", /already being processed/));
    open();
    assert.ok((await job).ok);
  });

  it("PPTX → READY with one SLIDE chunk per slide, cited by slide number (fake Gemini)", async () => {
    const bytes = await makeDeck([{ title: "Scheduling", paragraphs: ["Picks the next process"] }, { title: "Gantt", images: [{ name: "gantt.png", bytes: makePng(400, 200) }] }, {}]);
    const id = (await uploadSource({ body: chunked(bytes), filename: `${TAG}-deck.pptx` })).id;
    const extractSlides: ExtractSlides = async (slides) => ({
      extraction: { slides: slides.map((s) => ({ slide: s.slide, figures: s.images.map(() => ({ title: "Gantt chart", content: "P1 0-2" })), conceptLabels: ["scheduling"] })) },
      cached: false,
      usage: { inputTokens: 900, outputTokens: 90 },
    });
    const result = await (await requestIngestion(id, { extractSlides, embed: fakeDeps().deps.embed })).job;
    assert.ok(result.ok && result.deck);
    assert.deepEqual(result.deck.emptySlides, [3]);
    const source = await prisma.source.findUniqueOrThrow({ where: { id }, include: { chunks: { orderBy: { seq: "asc" } } } });
    assert.equal(source.status, "READY");
    assert.deepEqual([source.progressDone, source.progressTotal], [1, 1]);
    assert.deepEqual(source.chunks.map((c) => [c.kind, c.slide, c.page, c.title]), [["SLIDE", 1, null, "Scheduling"], ["SLIDE", 2, null, "Gantt"]]);
    assert.equal(source.chunks[1].content, "[Figure] Gantt chart: P1 0-2");
  });

  it("unknown sources are refused", async () => {
    await assert.rejects(requestIngestion("no-such-source", fakeDeps().deps), isCode("not_found"));
  });
});

describe("recoverInterruptedSources", () => {
  it("marks only stale PROCESSING rows as FAILED", async () => {
    const stale = await uploadPdf("stale.pdf", 1);
    const fresh = await uploadPdf("fresh.pdf", 1);
    await prisma.source.update({ where: { id: stale }, data: { status: "PROCESSING", updatedAt: new Date(Date.now() - 10 * 60_000) } });
    await prisma.source.update({ where: { id: fresh }, data: { status: "PROCESSING" } });
    assert.ok((await recoverInterruptedSources()) >= 1);
    const [s, f] = await Promise.all([stale, fresh].map((id) => prisma.source.findUniqueOrThrow({ where: { id } })));
    assert.equal(s.status, "FAILED");
    assert.match(s.error ?? "", /interrupted/);
    assert.equal(f.status, "PROCESSING");
    await prisma.source.update({ where: { id: fresh }, data: { status: "FAILED" } });
  });
});
