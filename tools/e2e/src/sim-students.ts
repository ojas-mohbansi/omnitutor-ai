// Module 15 (basic): simulated students across sessions. NO LLM. Compares the adaptive policy (the app's
// own allocate() + difficultyFor() + no-repeat rule, with mastery estimated by the app's updateMastery())
// against random quizzing, and reports true mastery gain, estimation error and repetition rate.
//
// Caveat (by design): the simulated students follow a DIFFERENT model than the app assumes
// (binary knowledge, prerequisite-dependent learning, their own slip/guess rates), so the app's BKT is
// not being graded against itself. The item pool is synthetic (ids only); this evaluates the policy and
// the learner model, not question generation.
// Usage: npm run eval:sim   (dev/prod server running: topic names + prerequisites come from GET /api/topics)
import { REPO_ROOT, api, requireServer } from "./setup";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BKT, EVAL_DIR, SIM_REPORT_FILE, allocate, difficultyFor, updateMastery } from "@sc/core";
import { SimReport, type QuestionType } from "@sc/schemas";

// ── simulated-student parameters (deliberately different from the app's BKT: prior .3, learn .15, slip .1, guess .25/.1/.05)
const SIM = {
  learnWithPrereqs: 0.3, // chance to learn a topic from one practised item + its cited feedback
  learnWithoutPrereqs: 0.08, // much lower if a prerequisite is still unknown
  slip: 0.08,
  slipPerDifficulty: 0.04,
  guess: { MCQ: 0.3, SHORT: 0.05, NUMERIC: 0.02 } satisfies Record<QuestionType, number>,
};
const SESSIONS = 3;
const PER_SESSION = 10;
const STUDENTS_PER_PROFILE = 500;
const ITEMS_PER_TOPIC = 6;
const TYPES: QuestionType[] = ["MCQ", "SHORT", "MCQ", "NUMERIC", "MCQ", "SHORT"];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

await requireServer();
const topics = (await api.listTopics()).map((t) => ({ id: t.id, name: t.name, prereqs: t.prereqIds }));
if (topics.length === 0) throw new Error("No topics: build the course first.");
const pool = topics.flatMap((t) => Array.from({ length: ITEMS_PER_TOPIC }, (_, i) => ({ id: `${t.id}#${i}`, topicId: t.id, type: TYPES[i % TYPES.length], difficulty: 1 + Math.floor((i * 3) / ITEMS_PER_TOPIC) })));
const n = topics.length;
const PROFILES: { name: string; knows: (i: number) => boolean }[] = [
  { name: "novice (knows nothing)", knows: () => false },
  { name: "basics only (first 2 topics)", knows: (i) => i < 2 },
  { name: "prerequisite gap (all but topic 2)", knows: (i) => i !== 1 },
  { name: "almost there (all but the last)", knows: (i) => i < n - 1 },
];

type Policy = "adaptive" | "random";
function runStudent(policy: Policy, initial: boolean[], rand: () => number) {
  const known = [...initial];
  const p = new Map<string, number>(topics.map((t) => [t.id, BKT.prior]));
  const seen = new Set<string>();
  let asked = 0;
  let repeats = 0;
  const maeBySession: number[] = [];
  const knownBefore = known.filter(Boolean).length;
  for (let s = 0; s < SESSIONS; s++) {
    let items: typeof pool;
    if (policy === "adaptive") {
      const alloc = allocate("MOCK", PER_SESSION, topics.map((t) => ({ id: t.id, p: p.get(t.id)! })));
      items = [];
      for (const t of topics) {
        const want = difficultyFor(p.get(t.id)!);
        const candidates = pool.filter((q) => q.topicId === t.id && !seen.has(q.id) && !items.includes(q)).sort((a, b) => Math.abs(a.difficulty - want) - Math.abs(b.difficulty - want));
        items.push(...candidates.slice(0, alloc.get(t.id)!));
      }
      // topic exhausted → fill from any unseen item (the app's no-repeat rule)
      for (const q of pool) if (items.length < PER_SESSION && !seen.has(q.id) && !items.includes(q)) items.push(q);
    } else {
      // naive generator: a fresh random draw each session (unique within a session, not across sessions)
      items = [...pool].sort(() => rand() - 0.5).slice(0, PER_SESSION);
    }
    for (const q of items) {
      const ti = topics.findIndex((t) => t.id === q.topicId);
      asked++;
      if (seen.has(q.id)) repeats++;
      seen.add(q.id);
      const pCorrect = known[ti] ? 1 - SIM.slip - SIM.slipPerDifficulty * (q.difficulty - 1) : SIM.guess[q.type];
      const correct = rand() < pCorrect;
      p.set(q.topicId, updateMastery(p.get(q.topicId)!, correct, q.type)); // the app's learner model
      if (!known[ti]) {
        const prereqsKnown = topics[ti].prereqs.every((id) => known[topics.findIndex((t) => t.id === id)]);
        if (rand() < (prereqsKnown ? SIM.learnWithPrereqs : SIM.learnWithoutPrereqs)) known[ti] = true; // learns from the cited feedback
      }
    }
    maeBySession.push(topics.reduce((sum, t, i) => sum + Math.abs(p.get(t.id)! - (known[i] ? 1 : 0)), 0) / n);
  }
  return { gain: (known.filter(Boolean).length - knownBefore) / n, finalKnown: known.filter(Boolean).length / n, maeBySession, repetition: repeats / asked };
}

type Agg = { gain: number[]; finalKnown: number[]; mae: number[][]; repetition: number[] };
const results: Record<string, Record<Policy, Agg>> = {};
for (const [pi, prof] of PROFILES.entries()) {
  results[prof.name] = { adaptive: { gain: [], finalKnown: [], mae: [], repetition: [] }, random: { gain: [], finalKnown: [], mae: [], repetition: [] } };
  for (const policy of ["adaptive", "random"] as Policy[]) {
    for (let s = 0; s < STUDENTS_PER_PROFILE; s++) {
      // same seed per student for both policies: paired comparison
      const r = runStudent(policy, topics.map((_, i) => prof.knows(i)), rng(1_000_003 * (pi + 1) + s));
      const a = results[prof.name][policy];
      a.gain.push(r.gain);
      a.finalKnown.push(r.finalKnown);
      a.mae.push(r.maeBySession);
      a.repetition.push(r.repetition);
    }
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`topics: ${topics.map((t) => t.name).join(" → ")} · pool ${pool.length} items · ${SESSIONS} sessions × ${PER_SESSION} questions · ${STUDENTS_PER_PROFILE} students per profile and policy\n`);
console.log("| Profile | Policy | True mastery gain (topics learned) | Estimation error (MAE) after s1 → s3 | Repetition rate |");
console.log("|---|---|---|---|---|");
const table: { profile: string; policy: Policy; gain: number; gainSd: number; maeFirst: number; maeLast: number; repetition: number }[] = [];
for (const [profile, byPolicy] of Object.entries(results)) {
  for (const policy of ["adaptive", "random"] as Policy[]) {
    const a = byPolicy[policy];
    const mae = [0, SESSIONS - 1].map((s) => mean(a.mae.map((m) => m[s])));
    const row = { profile, policy, gain: mean(a.gain), gainSd: sd(a.gain), maeFirst: mae[0], maeLast: mae[1], repetition: mean(a.repetition) };
    table.push(row);
    console.log(`| ${profile} | ${policy} | ${pct(row.gain)} ± ${pct(row.gainSd)} | ${row.maeFirst.toFixed(3)} → ${row.maeLast.toFixed(3)} | ${pct(row.repetition)} |`);
  }
}
const overall = (policy: Policy, k: "gain" | "repetition") => mean(Object.values(results).flatMap((r) => r[policy][k]));
console.log(`\noverall: adaptive gain ${pct(overall("adaptive", "gain"))} vs random ${pct(overall("random", "gain"))} · repetition adaptive ${pct(overall("adaptive", "repetition"))} vs random ${pct(overall("random", "repetition"))}`);
const report = SimReport.parse({
  ranAt: new Date().toISOString(),
  params: { sessions: SESSIONS, questionsPerSession: PER_SESSION, studentsPerProfile: STUDENTS_PER_PROFILE, itemsPerTopic: ITEMS_PER_TOPIC, simulatedStudent: SIM, appModel: BKT },
  topics: topics.map((t) => t.name),
  rows: table,
  overall: {
    adaptive: { gain: overall("adaptive", "gain"), repetition: overall("adaptive", "repetition") },
    random: { gain: overall("random", "gain"), repetition: overall("random", "repetition") },
  },
});
await mkdir(path.join(REPO_ROOT, EVAL_DIR), { recursive: true });
await writeFile(path.join(REPO_ROOT, EVAL_DIR, SIM_REPORT_FILE), JSON.stringify(report, null, 2));
console.log(`full report: ${EVAL_DIR}/${SIM_REPORT_FILE}`);
