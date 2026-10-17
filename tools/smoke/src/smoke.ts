// Gemini API smoke test. Usage: npm run smoke [-- json pdf slides video embed]
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPartFromBase64, createPartFromUri } from "@google/genai";
import { z } from "zod";
import { deleteFile, embed, generateJson, modelFor, readMp4DurationSec, todayUsage, uploadFile, type Usage } from "@sc/core";
import { makeBarsPng, makeSchedulingPdf } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.resolve(here, "../../../.env"));
const VIDEO = path.resolve(here, "../fixtures/sample.mp4");

type Result = { ok: boolean; detail: string; usage?: Usage; skipped?: boolean };

const checks: Record<string, () => Promise<Result>> = {
  // 1. Structured JSON + numeric reasoning.
  async json() {
    const schema = z.object({ averageWaitingTime: z.number(), explanation: z.string() });
    const { data, usage } = await generateJson({
      role: "fast",
      schema,
      parts: [{ text: "FCFS scheduling. Processes P1, P2, P3 arrive at t=0 in that order with burst times 24, 3, 3 ms. What is the average waiting time in ms?" }],
    });
    const ok = Math.abs(data.averageWaitingTime - 17) < 0.01;
    return { ok, detail: `avg waiting = ${data.averageWaitingTime} (expected 17)`, usage };
  },

  // 2. Single-page PDF → blocks incl. a figure (same shape as PDF ingestion).
  async pdf() {
    const schema = z.object({
      blocks: z.array(z.object({ kind: z.enum(["text", "figure", "table"]), content: z.string() })),
      conceptLabels: z.array(z.string()),
    });
    const pdf = await makeSchedulingPdf();
    const { data, usage } = await generateJson({
      role: "fast",
      schema,
      parts: [
        createPartFromBase64(Buffer.from(pdf).toString("base64"), "application/pdf"),
        { text: "Extract this textbook page into blocks. Text paragraphs → kind 'text' (verbatim). Each diagram → kind 'figure' with a precise description of what it shows including all labels and values. Also list the key concepts." },
      ],
    });
    const fig = data.blocks.find((b) => b.kind === "figure");
    const ok = !!fig && /P1/.test(fig.content) && /24/.test(fig.content) && data.conceptLabels.length > 0;
    return {
      ok,
      detail: `${data.blocks.length} blocks, figure: ${fig ? `"${fig.content.slice(0, 90)}…"` : "MISSING"}, concepts: ${data.conceptLabels.slice(0, 4).join(", ")}`,
      usage,
    };
  },

  // 3. Batch of slides: text + image per slide (same shape as PPTX ingestion).
  async slides() {
    const schema = z.object({
      slides: z.array(z.object({ slide: z.number().int(), summary: z.string(), barCount: z.number().int(), barColors: z.array(z.string()) })),
    });
    const s1 = makeBarsPng([[220, 30, 30], [30, 160, 30], [30, 60, 220]]);
    const s2 = makeBarsPng([[240, 200, 0], [120, 0, 160]]);
    const { data, usage } = await generateJson({
      role: "fast",
      schema,
      parts: [
        { text: "Slide 1 text: 'Three queues in a multilevel queue scheduler'" },
        createPartFromBase64(s1.toString("base64"), "image/png"),
        { text: "Slide 2 text: 'Two priority classes'" },
        createPartFromBase64(s2.toString("base64"), "image/png"),
        { text: "For each slide return its number, a one-line summary using text and image, how many horizontal bars the image shows, and their colors." },
      ],
    });
    const byNo = new Map(data.slides.map((s) => [s.slide, s]));
    const ok = data.slides.length === 2 && byNo.get(1)?.barCount === 3 && byNo.get(2)?.barCount === 2;
    return { ok, detail: data.slides.map((s) => `slide ${s.slide}: ${s.barCount} bars [${s.barColors.join(", ")}]`).join(" | "), usage };
  },

  // 4. Video via Files API → timestamped segments (same shape as video ingestion).
  async video() {
    if (!existsSync(VIDEO)) return { ok: true, skipped: true, detail: "no tools/smoke/fixtures/sample.mp4 — add a short mp4 to run" };
    const durationSec = (await readMp4DurationSec(VIDEO)) ?? 60;
    const t0 = Date.now();
    const file = await uploadFile(VIDEO, "video/mp4");
    const uploadMs = Date.now() - t0;
    try {
      const schema = z.object({
        segments: z.array(z.object({ tStart: z.number(), tEnd: z.number(), transcript: z.string(), onScreen: z.string(), conceptLabels: z.array(z.string()) })),
      });
      const { data, usage } = await generateJson({
        role: "strong",
        schema,
        parts: [
          createPartFromUri(file.uri, file.mimeType),
          { text: "Split this video into coherent segments. For each give tStart and tEnd in seconds, the spoken transcript, a description of what is on screen, and key concepts." },
        ],
        estimatedInputTokens: Math.ceil(durationSec * 300) + 500, // reserve TPM: ~300 tokens/s until measured
        keyIndex: file.keyIndex, // only the uploader's project can read the file
      });
      const s = data.segments;
      const ok = s.length > 0 && s.every((x) => x.tEnd >= x.tStart && x.tStart >= 0);
      const rate = usage.inputTokens / durationSec;
      return {
        ok,
        detail: `${durationSec.toFixed(1)} s video → ${usage.inputTokens} input tokens (≈${rate.toFixed(0)} tokens/s), upload+ACTIVE ${uploadMs} ms, ${s.length} segments, first [${s[0]?.tStart}s–${s[0]?.tEnd}s] "${s[0]?.transcript.slice(0, 60)}…"`,
        usage,
      };
    } finally {
      await deleteFile(file.name, file.keyIndex).catch(() => {});
    }
  },

  // 5. Embeddings: 768-dim, and retrieval ranks the right doc first.
  async embed() {
    const docs = [
      "Round Robin scheduling gives each process a small unit of CPU time called a time quantum, usually 10-100 ms.",
      "To make banana bread, mash three ripe bananas and mix them with flour, sugar and butter.",
      "First-come, first-served scheduling runs processes in the order they arrive in the ready queue.",
    ];
    const [d, [q]] = await Promise.all([
      embed(docs, "RETRIEVAL_DOCUMENT"),
      embed(["What is the time quantum in RR scheduling?"], "RETRIEVAL_QUERY"),
    ]);
    const cos = (a: number[], b: number[]) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
      return dot / Math.sqrt(na * nb);
    };
    const scores = d.map((v) => cos(q, v));
    const best = scores.indexOf(Math.max(...scores));
    const ok = d.every((v) => v.length === 768) && best === 0;
    return { ok, detail: `dim ${d[0].length}, cosine RR=${scores[0].toFixed(3)} bread=${scores[1].toFixed(3)} FCFS=${scores[2].toFixed(3)}` };
  },
};

async function main() {
  const wanted = process.argv.slice(2).filter((a) => a in checks);
  const names = wanted.length ? wanted : Object.keys(checks);
  console.log(`models: fast=${modelFor("fast")} strong=${modelFor("strong")} embed=${process.env.EMBED_MODEL}\n`);

  let failed = 0;
  const total: Usage = { inputTokens: 0, outputTokens: 0 };
  for (const name of names) {
    const t0 = Date.now();
    let r: Result;
    try {
      r = await checks[name]();
    } catch (e) {
      r = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
    const ms = Date.now() - t0;
    if (r.usage) { total.inputTokens += r.usage.inputTokens; total.outputTokens += r.usage.outputTokens; }
    if (!r.ok) failed++;
    const mark = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
    const tok = r.usage ? ` tokens in/out ${r.usage.inputTokens}/${r.usage.outputTokens}` : "";
    console.log(`${mark}  ${name.padEnd(7)} ${String(ms).padStart(6)} ms${tok}\n      ${r.detail}`);
  }
  const u = todayUsage();
  console.log(`\n${names.length - failed}/${names.length} passed · total tokens in/out ${total.inputTokens}/${total.outputTokens}`);
  console.log(`today (${u.day}, counted by this app): generate ${u.generate.requests}/${u.limits.generate.rpd} · embed ${u.embed.requests}/${u.limits.embed.rpd}`);
  process.exit(failed ? 1 : 0);
}

main();
