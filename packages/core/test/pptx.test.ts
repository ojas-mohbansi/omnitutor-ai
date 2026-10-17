// Module 6: PPTX parsing + batching with FAKE Gemini (injected extractor). No API calls, no DB.
// Decks come from makeDeck (structurally realistic OOXML, slide files numbered against the
// presentation order). Real decks are checked by `npm run stage1:pptx`. Run: npm run test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLIDES_PER_BATCH, batchParts, decodeXml, extractPptx, imageSize, parsePptx, slideChunk,
  type ExtractSlides, type ParsedSlide,
} from "../src/ingest/pptx";
import { makeDeck, makePng, makePptx } from "../src/testing";

const png = (w = 200, h = 120) => makePng(w, h);

describe("parsePptx (pure, no model)", () => {
  it("orders slides by <p:sldIdLst> (not file names); reads titles, bullet levels, tables, notes", async () => {
    const deck = await parsePptx(
      await makeDeck([
        { title: "Intro", paragraphs: ["First point", { text: "Sub point", level: 1 }], slideNumber: true, footer: "CS101 Course Footer" },
        { title: "Table slide", table: [["Process", "Burst"], ["P1", "5"]] },
        { title: "Notes slide", paragraphs: ["Body"], notes: "Say this out loud" },
      ]),
    );
    assert.deepEqual(deck.slides.map((s) => [s.slide, s.title]), [[1, "Intro"], [2, "Table slide"], [3, "Notes slide"]]);
    assert.equal(deck.slides[0].text, "First point\n  Sub point", "slide number and footer placeholders are dropped");
    assert.equal(deck.slides[1].text, "| Process | Burst |\n| P1 | 5 |");
    assert.equal(deck.slides[2].notes, "Say this out loud", "notes body only (no notes slide number)");
  });

  it("decodes XML entities and keeps symbols", async () => {
    const deck = await parsePptx(await makeDeck([{ title: "A & B <x>", paragraphs: ["if (a < b && c > d) → “quoted”"] }]));
    assert.equal(deck.slides[0].title, "A & B <x>");
    assert.equal(deck.slides[0].text, "if (a < b && c > d) → “quoted”");
    assert.equal(decodeXml("&#x41;&#66;&amp;lt;&unknown;"), "AB&lt;&unknown;");
  });

  it("without a title placeholder, a short first line becomes the title", async () => {
    const deck = await parsePptx(await makeDeck([{ paragraphs: ["Virtual Memory", "It gives an illusion of a large memory"] }, { paragraphs: ["x".repeat(130)] }]));
    assert.equal(deck.slides[0].title, "Virtual Memory");
    assert.equal(deck.slides[0].text, "It gives an illusion of a large memory");
    assert.equal(deck.slides[1].title, null, "a long first line is not a title");
  });

  it("keeps content pictures; skips unsupported formats, icons and logos repeated on most slides", async () => {
    const logo = { name: "logo.png", bytes: png(300, 100) };
    const deck = await parsePptx(
      await makeDeck([
        { title: "S1", images: [logo, { name: "diagram.png", bytes: png(), alt: "State diagram" }] },
        { title: "S2", images: [logo, { name: "chart.emf", bytes: new Uint8Array([1, 2, 3]) }, { name: "bullet.png", bytes: png(16, 16) }] },
        { title: "S3", images: [logo] },
        { title: "S4" },
      ]),
    );
    assert.deepEqual(deck.slides[0].images.map((i) => [i.media, i.mimeType, i.alt]), [["ppt/media/diagram.png", "image/png", "State diagram"]]);
    assert.deepEqual(deck.slides[1].images, []);
    assert.deepEqual(deck.slides.map((s) => s.omitted), [[], ["unsupported format (.emf)"], [], []], "only unreadable content pictures are noted; logos and icons are not");
    assert.deepEqual(
      deck.skipped.map((s) => [s.slide, s.media.replace("ppt/media/", ""), s.reason.split(" (")[0]]),
      [[1, "logo.png", "repeated on 3 slides"], [2, "logo.png", "repeated on 3 slides"], [2, "chart.emf", "unsupported format"], [2, "bullet.png", "icon-sized"], [3, "logo.png", "repeated on 3 slides"]],
    );
  });

  it("a deck whose slide parts are missing yields empty slides instead of failing", async () => {
    const deck = await parsePptx(await makePptx(2));
    assert.equal(deck.slides.length, 2);
    assert.ok(deck.slides.every((s) => !s.text && !s.title && s.images.length === 0));
  });
});

describe("imageSize (headers only)", () => {
  it("PNG, JPEG (SOF after APP0) and unknown", () => {
    assert.deepEqual(imageSize(makePng(320, 200)), { width: 320, height: 200 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x40, 0x03, ...Array(12).fill(0)]);
    assert.deepEqual(imageSize(jpeg), { width: 320, height: 200 });
    assert.equal(imageSize(new Uint8Array([1, 2, 3, 4])), null);
  });
});

const slide = (n: number, extra: Partial<ParsedSlide> = {}): ParsedSlide => ({ slide: n, title: `Slide ${n}`, text: `Text ${n}`, notes: "", images: [], omitted: [], ...extra });

describe("slideChunk (pure)", () => {
  it("text, then notes, then figures; labels de-duplicated, at most 5", () => {
    const c = slideChunk(slide(4, { notes: "Explain slowly" }), {
      figures: [{ title: "Gantt chart", content: "P1 0-2, P2 2-4" }, { title: "", content: "  " }, { title: "", content: "Arrow from A to B" }],
      conceptLabels: ["RR", " RR ", "quantum", "a", "b", "c", "d"],
    })!;
    assert.equal(c.kind, "SLIDE");
    assert.deepEqual([c.slide, c.page, c.tStart, c.title], [4, null, null, "Slide 4"]);
    assert.equal(c.content, "Text 4\n\n[Speaker notes] Explain slowly\n\n[Figure] Gantt chart: P1 0-2, P2 2-4\n\n[Figure] Figure: Arrow from A to B");
    assert.deepEqual(c.conceptLabels, ["RR", "quantum", "a", "b", "c"]);
  });
  it("a title-only slide keeps its title as content; an empty slide gives no chunk", () => {
    assert.equal(slideChunk(slide(1, { text: "" }))!.content, "Slide 1");
    assert.equal(slideChunk(slide(2, { title: null, text: "" })), null);
  });
  it("unreadable content pictures are noted (decision Q18), but alone don't make a chunk", () => {
    assert.equal(slideChunk(slide(5, { omitted: ["unsupported format (.emf)"] }))!.content, "Text 5\n\n[Figure omitted: unsupported format (.emf)]");
    assert.equal(slideChunk(slide(6, { title: null, text: "", omitted: ["unsupported format (.wmf)"] })), null);
  });
});

describe("extractPptx (fake Gemini)", () => {
  const fake = (opts: { failOn?: number } = {}) => {
    const batches: number[][] = [];
    const extractSlides: ExtractSlides = async (slides) => {
      batches.push(slides.map((s) => s.slide));
      if (slides.some((s) => s.slide === opts.failOn)) throw new Error("[llm:validation] model returned junk");
      return {
        extraction: {
          slides: [
            ...slides.map((s) => ({ slide: s.slide, figures: s.images.map((i) => ({ title: "Fig", content: `describes ${i.media}` })), conceptLabels: [`c${s.slide}`] })),
            { slide: 999, figures: [{ title: "x", content: "not asked for" }], conceptLabels: [] }, // ignored
          ],
        },
        cached: slides[0].slide === 1,
        usage: { inputTokens: 1000, outputTokens: 100 },
      };
    };
    return { batches, extractSlides };
  };

  it(`batches of ${SLIDES_PER_BATCH}, one SLIDE chunk per slide in order, figures attached, stats + progress`, async () => {
    const specs = Array.from({ length: 12 }, (_, i) => ({ title: `T${i + 1}`, paragraphs: [`Body ${i + 1}`], ...(i === 6 && { images: [{ name: "fig7.png", bytes: png() }] }) }));
    const { batches, extractSlides } = fake();
    let progress = 0;
    const { chunks, stats, report } = await extractPptx(await makeDeck(specs), "sha", { courseName: "Any course", extractSlides, onBatchDone: () => void progress++, concurrency: 1 });
    assert.deepEqual(batches, [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
    assert.deepEqual(chunks.map((c) => c.slide), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.match(chunks[6].content, /^Body 7\n\n\[Figure\] Fig: describes ppt\/media\/fig7\.png$/);
    assert.ok(chunks.every((c) => !c.content.includes("not asked for")));
    assert.deepEqual(chunks[0].conceptLabels, ["c1"]);
    assert.deepEqual(stats, { units: 3, geminiCalls: 2, cached: 1, inputTokens: 3000, outputTokens: 300 });
    assert.equal(progress, 3);
    assert.deepEqual([report.slides, report.batches, report.imagesSent], [12, 3, 1]);
  });

  it("a failing batch fails the run with the slide range in the message", async () => {
    const specs = Array.from({ length: 7 }, (_, i) => ({ title: `T${i + 1}` }));
    await assert.rejects(extractPptx(await makeDeck(specs), "sha", { courseName: "c", extractSlides: fake({ failOn: 6 }).extractSlides }), /^Error: Slides 6–7: model returned junk/);
  });

  it("request parts: slide texts first, then each picture labelled with its slide and alt text", () => {
    const parts = batchParts([slide(3, { notes: "N" }), slide(4, { images: [{ media: "ppt/media/a.png", mimeType: "image/png", bytes: png(), alt: "Process states" }] })]);
    assert.match(parts[0].text!, /=== Slide 3 ===\nTitle: Slide 3\nText:\nText 3\nSpeaker notes:\nN\nPictures: 0/);
    assert.match(parts[0].text!, /=== Slide 4 ===[\s\S]*Pictures: 1 \(shown below\)/);
    assert.equal(parts[1].text, 'Slide 4, picture 1 (alt text: "Process states"):');
    assert.equal(parts[2].inlineData?.mimeType, "image/png");
    assert.equal(parts.at(-1)!.text, "Return one entry for each of these slides: 3, 4.");
  });
});
