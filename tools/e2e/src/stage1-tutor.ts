// REAL-DATA check for Module 10 (tutor). Criteria fixed BEFORE the first run:
//   A. 51 test-set questions (Stage-1 + holdout) via POST /api/eval/answer:
//      off-material refused ≥ 80% · answerable wrongly refused ≤ 20% ·
//      answered questions citing an expected location ≥ 80% · every material block cites ≥ 1 retrieved excerpt (100%)
//   B. live chat as a new learner (POST /api/chat, GET /api/chat):
//      a stated misconception lowers some topic's mastery · a correct statement raises some topic's mastery ·
//      an off-material question is refused with no mastery change · history is stored in order
// Costs ~1 generate request per question above the retrieval floor (eval answers are cached; chat is not).
// Usage: npm run stage1:tutor   (dev server running)
import { REPO_ROOT, api, requireServer } from "./setup";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TestSet, type Citation, type ExpectedLocation, type TutorAnswer } from "@sc/schemas";
import { prisma } from "@sc/db";

const VIDEO_TOL = 2;
const matches = (c: Citation, e: ExpectedLocation) =>
  c.filename === e.filename && c.sourceType === e.sourceType &&
  (e.sourceType === "PDF" ? c.sourceType === "PDF" && c.page === e.page
    : e.sourceType === "PPTX" ? c.sourceType === "PPTX" && c.slide === e.slide
    : c.sourceType === "VIDEO" && c.tStart < e.tEnd + VIDEO_TOL && c.tEnd > e.tStart - VIDEO_TOL);

await requireServer();
const before = (await api.health()).usage!;
const items = [
  ...TestSet.parse(JSON.parse(await readFile(path.join(REPO_ROOT, "data/demo/testset.stage1.json"), "utf8"))),
  ...TestSet.parse(JSON.parse(await readFile(path.join(REPO_ROOT, "data/demo/testset.holdout.json"), "utf8"))),
];

// ── A. Test-set questions ──
const rows = [];
const details = [];
for (const item of items) {
  const r = await api.evalAnswer({ question: item.question });
  const answerable = item.modality !== "off_material";
  const citedRight = answerable && !r.refused ? r.citations.some((c) => item.expected.some((e) => matches(c, e))) : null;
  rows.push({
    id: item.id.slice(0, 30),
    kind: answerable ? item.modality : /near/.test(item.id) ? "off:near" : /unrelated|injection/.test(item.id) ? "off:unrelated" : "off:domain",
    top: +r.topScore.toFixed(3),
    result: r.refused ? "REFUSED" : r.coverage,
    citedRight: citedRight === null ? "" : citedRight ? "yes" : "NO",
    cites: r.citations.map((c) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `s.${c.slide}` : `${c.tStart}s`)).join(" "),
  });
  details.push({ id: item.id, question: item.question, groundTruth: item.groundTruth, expected: item.expected, ...r, contexts: undefined });
}
console.table(rows);
const ans = rows.filter((r) => !r.kind.startsWith("off"));
const off = rows.filter((r) => r.kind.startsWith("off"));
const answered = ans.filter((r) => r.result !== "REFUSED");
const pct = (a: number, b: number) => `${a}/${b} = ${b ? Math.round((a / b) * 100) : 0}%`;
const offRefused = off.filter((r) => r.result === "REFUSED").length;
const falseRefusals = ans.filter((r) => r.result === "REFUSED").length;
const citedRight = answered.filter((r) => r.citedRight === "yes").length;
for (const g of ["off:unrelated", "off:domain", "off:near"]) {
  const s = off.filter((r) => r.kind === g);
  console.log(`  ${g}: refused ${pct(s.filter((r) => r.result === "REFUSED").length, s.length)}`);
}
// Material blocks must cite retrieved excerpts: eval responses only expose citations, so check via the stored-in-guard invariant on chat below
// and here: an answer that is not refused has ≥ 1 citation.
const answeredWithCitations = details.filter((d) => !d.refused).every((d) => d.citations.length > 0);

// ── B. Live chat as a new learner ──
const learner = await api.createLearner({ name: `Tutor check ${new Date().toISOString().slice(11, 19)}` });
const turns: { say: string; expect: string; answer?: TutorAnswer }[] = [
  { say: "What does the dispatcher do when the scheduler has picked a process?", expect: "cited answer" },
  { say: "I think when a process finishes its I/O it goes straight from waiting back to running, right?", expect: "misconception → some topic's mastery falls" },
  { say: "Oh, so after the I/O completes it moves to the ready state and waits until the scheduler dispatches it again.", expect: "understands → some topic's mastery rises" },
  { say: "Who won the 2011 Cricket World Cup final?", expect: "refused, no mastery change" },
];
for (const t of turns) t.answer = await api.chat({ learnerId: learner.id, message: t.say });
const history = await api.chatHistory(learner.id);
const chatChecks: [string, boolean][] = [
  ["turn 1 answered with citations", !turns[0].answer!.refused && turns[0].answer!.blocks.some((b) => b.origin === "material")],
  ["turn 2 misconception lowers a topic's mastery", turns[1].answer!.masteryUpdates.some((u) => u.after < u.before)],
  ["turn 3 correct statement raises a topic's mastery", turns[2].answer!.masteryUpdates.some((u) => u.after > u.before)],
  ["turn 4 off-material refused, no mastery change", turns[3].answer!.refused && turns[3].answer!.masteryUpdates.length === 0],
  ["history: 8 messages, USER/ASSISTANT alternating", history.length === 8 && history.every((m, i) => m.role === (i % 2 ? "ASSISTANT" : "USER"))],
  ["every material block (all turns) cites ≥ 1 excerpt", turns.every((t) => t.answer!.blocks.every((b) => b.origin !== "material" || b.citations.length > 0))],
];
for (const t of turns) {
  console.log(`\n> ${t.say}\n  expected: ${t.expect}\n  got: ${t.answer!.refused ? `REFUSED (${t.answer!.refusalReason})` : t.answer!.coverage}; mastery ${JSON.stringify(t.answer!.masteryUpdates.map((u) => `${u.topicName} ${u.before.toFixed(3)}→${u.after.toFixed(3)}`))}`);
  for (const b of t.answer!.blocks) console.log(`  [${b.origin}${b.citations.length ? " " + b.citations.map((c) => (c.sourceType === "PDF" ? `p.${c.page}` : c.sourceType === "PPTX" ? `s.${c.slide}` : `${c.tStart}s`)).join(",") : ""}] ${b.text.slice(0, 220)}`);
}

const after = (await api.health()).usage!;
const checks: [string, boolean][] = [
  [`off-material refused ≥ 80% (${pct(offRefused, off.length)})`, offRefused / off.length >= 0.8],
  [`answerable wrongly refused ≤ 20% (${pct(falseRefusals, ans.length)})`, falseRefusals / ans.length <= 0.2],
  [`answered questions cite an expected location ≥ 80% (${pct(citedRight, answered.length)})`, answered.length > 0 && citedRight / answered.length >= 0.8],
  ["every non-refused eval answer has citations", answeredWithCitations],
  ...chatChecks,
];
console.log(`\nGemini usage: generate ${after.generate.requests - before.generate.requests} requests (${after.generate.inputTokens - before.generate.inputTokens} input tokens), embed ${after.embed.requests - before.embed.requests}`);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
await writeFile(path.join(REPO_ROOT, "data/demo/tutor-report.json"), JSON.stringify({ ranAt: new Date().toISOString(), rows, details, chat: turns, history }, null, 2));
console.log("full report: data/demo/tutor-report.json");
await prisma.$disconnect();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
