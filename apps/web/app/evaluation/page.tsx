"use client";
// Evaluation (Module 19): the latest measured results of `npm run eval:rag` and `npm run eval:sim`,
// read from data/eval/ through GET /api/eval/report. Nothing here is estimated: a metric with no data
// shows "n/a", and a report that hasn't been run shows how to run it.
import type { EvalReportView, RagReport, RagRow, RagSlice, SimReport } from "@sc/schemas";
import { useEffect, useMemo, useState } from "react";
import { api, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";

const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
const dec = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));

type MetricKey = keyof Omit<RagSlice, "questions" | "answered">;
const METRICS: { key: MetricKey; label: string; format: (x: number | null) => string; definition: string }[] = [
  { key: "faithfulness", label: "Faithfulness", format: pct, definition: "Claims in the cited (material) part of the answer that the retrieved excerpts support" },
  { key: "faithfulnessAll", label: "Faithfulness, whole answer", format: pct, definition: "The same over the whole answer, including the labelled outside-knowledge parts" },
  { key: "answerRelevancy", label: "Answer relevancy", format: dec, definition: "Cosine similarity between the question and questions generated back from the answer" },
  { key: "contextPrecision", label: "Context precision", format: pct, definition: "How highly the useful excerpts rank among the 6 retrieved (rank-weighted)" },
  { key: "contextRecall", label: "Context recall", format: pct, definition: "Statements of the reference answer that the retrieved excerpts contain" },
  { key: "citationAccuracy", label: "Citation accuracy", format: pct, definition: "Answers citing at least one expected page, slide or time range (checked in code)" },
];

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface p-5">
      <p className="text-meta text-graphite">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-graphite">{note}</p>
    </div>
  );
}

function Missing({ what, command }: { what: string; command: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule-strong p-6 text-sm text-graphite">
      No {what} report yet. Run <code className="font-mono text-ink">{command}</code> with the server running; the page shows the results as soon as the report is written.
    </div>
  );
}

const FILTERS = {
  all: { label: "All", test: () => true },
  answered: { label: "Answered", test: (r: RagRow) => r.modality !== "off_material" && !r.refused },
  missed: { label: "Citation missed", test: (r: RagRow) => r.citationCorrect === false },
  wrongDecline: { label: "Wrongly declined", test: (r: RagRow) => r.modality !== "off_material" && r.refused },
  off: { label: "Off-material", test: (r: RagRow) => r.modality === "off_material" },
} as const;
const MODALITY: Record<RagRow["modality"], string> = { pdf: "PDF", pptx: "Slides", video: "Video", off_material: "Off-material" };

/** Declined, plus answered-but-flagged ("partly covered") off-material questions, counted from the measured rows. */
function offNote(rows: RagRow[]): string {
  const off = rows.filter((r) => r.modality === "off_material");
  const declined = off.filter((r) => r.refused).length;
  const flagged = off.filter((r) => !r.refused && r.coverage === "PARTIAL").length;
  const rest = off.length - declined - flagged;
  return `${declined} of ${off.length} declined${flagged ? `; ${flagged} answered but flagged "partly covered"` : ""}${rest ? `; ${rest} answered as covered` : ""}`;
}

function RagSection({ rag }: { rag: RagReport }) {
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");
  const rows = useMemo(() => rag.rows.filter(FILTERS[filter].test), [rag.rows, filter]);
  const o = rag.overall;
  const sets = Object.entries(rag.bySet);
  return (
    <>
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-ink">Grounded answers</h2>
        <p className="text-sm text-graphite">
          {rag.counts.questions} questions ({rag.counts.answerable} answerable, {rag.counts.offMaterial} off-material) · tutor {rag.models.tutor} · judged by a different model, {rag.models.judge} · run {formatDate(rag.ranAt)} · {rag.geminiRequests.generate} generation + {rag.geminiRequests.embed} embedding requests
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile label="Faithfulness" value={pct(o.faithfulness)} note={METRICS[0].definition} />
          <Tile label="Citation accuracy" value={pct(o.citationAccuracy)} note={METRICS[5].definition} />
          <Tile label="Off-material declined" value={pct(o.refusalRecall)} note={offNote(rag.rows)} />
          <Tile label="Wrongly declined" value={pct(o.falseRefusalRate)} note={`Of ${rag.counts.answerable} answerable questions (lower is better)`} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl font-bold text-ink">Metric matrix</h3>
        <p className="text-sm text-graphite">RAGAS metric definitions, scored over the {rag.counts.answered} answered questions; columns split them by where the answer lives.</p>
        <div className="overflow-x-auto rounded-2xl border border-rule bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule text-graphite">
              <tr>
                <th className="p-3 font-medium">Metric</th>
                <th className="p-3 text-right font-medium">All ({rag.counts.answered})</th>
                <th className="p-3 text-right font-medium">PDF ({rag.byModality.pdf.answered})</th>
                <th className="p-3 text-right font-medium">Slides ({rag.byModality.pptx.answered})</th>
                <th className="p-3 text-right font-medium">Video ({rag.byModality.video.answered})</th>
                {sets.map(([name, s]) => (
                  <th key={name} className="p-3 text-right font-medium">Set: {name} ({s.answered})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-rule last:border-0">
                  <td className="p-3">
                    <p className="font-medium text-ink">{m.label}</p>
                    <p className="text-xs text-graphite">{m.definition}</p>
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-ink">{m.format(o[m.key])}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{m.format(rag.byModality.pdf[m.key])}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{m.format(rag.byModality.pptx[m.key])}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{m.format(rag.byModality.video[m.key])}</td>
                  {sets.map(([name, s]) => (
                    <td key={name} className="p-3 text-right font-mono tabular-nums">{m.format(s[m.key])}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-rule">
                <td className="p-3">
                  <p className="font-medium text-ink">Refusal precision</p>
                  <p className="text-xs text-graphite">Declines that were really off-material</p>
                </td>
                <td className="p-3 text-right font-mono tabular-nums text-ink">{pct(o.refusalPrecision)}</td>
                <td colSpan={3 + sets.length} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-xl font-bold text-ink">Every question</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions">
            {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                aria-pressed={filter === k}
                className={`rounded-full border px-3 py-1 text-xs ${filter === k ? "border-ink bg-ink text-paper" : "border-rule-strong bg-surface text-graphite hover:text-ink"}`}
              >
                {FILTERS[k].label} ({rag.rows.filter(FILTERS[k].test).length})
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-rule bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule text-graphite">
              <tr>
                <th className="p-3 font-medium">Question</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3 font-medium">Outcome</th>
                <th className="p-3 font-medium">Expected → cited</th>
                <th className="p-3 text-right font-medium">Faithful</th>
                <th className="p-3 text-right font-medium">Relevancy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const off = r.modality === "off_material";
                const outcome = off ? (r.refused ? "Declined (correct)" : "Answered (should decline)") : r.refused ? "Declined (wrong)" : "Answered";
                return (
                  <tr key={r.id} className="border-b border-rule align-top last:border-0">
                    <td className="max-w-md p-3 text-ink">{r.question}</td>
                    <td className="p-3 text-graphite">{MODALITY[r.modality]}</td>
                    <td className="p-3 text-ink">{outcome}</td>
                    <td className="p-3 text-xs text-graphite">
                      {off ? "—" : (
                        <>
                          <span>{r.expected.join(" · ")}</span>
                          {!r.refused && (
                            <span className="block text-ink">
                              → {r.cited.length ? r.cited.join(" · ") : "no citation"} {r.citationCorrect ? "(match)" : "(no match)"}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">{pct(r.faithfulness)}</td>
                    <td className="p-3 text-right font-mono tabular-nums">{dec(r.answerRelevancy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SimSection({ sim }: { sim: SimReport }) {
  const profiles = [...new Set(sim.rows.map((r) => r.profile))];
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-bold text-ink">Personalisation: simulated students</h2>
      <p className="text-sm text-graphite">
        {sim.params.studentsPerProfile} simulated students per profile and policy · {sim.params.sessions} sessions × {sim.params.questionsPerSession} questions · the app&apos;s own question selection and mastery model (adaptive) against random quizzing · run {formatDate(sim.ranAt)}
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Topics learned, adaptive" value={pct(sim.overall.adaptive.gain)} note="Average share of topics a simulated student truly learned" />
        <Tile label="Topics learned, random" value={pct(sim.overall.random.gain)} note="The same students, quizzed at random" />
        <Tile label="Repeated questions, adaptive" value={pct(sim.overall.adaptive.repetition)} note="Questions a student had already seen" />
        <Tile label="Repeated questions, random" value={pct(sim.overall.random.repetition)} note="A naive generator without the no-repeat rule" />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-rule bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-rule text-graphite">
            <tr>
              <th className="p-3 font-medium">Student profile</th>
              <th className="p-3 font-medium">Policy</th>
              <th className="p-3 text-right font-medium">Topics learned</th>
              <th className="p-3 text-right font-medium">Mastery estimate error, session 1 → {sim.params.sessions}</th>
              <th className="p-3 text-right font-medium">Repeated questions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.flatMap((p) =>
              sim.rows.filter((r) => r.profile === p).map((r) => (
                <tr key={`${p}-${r.policy}`} className="border-b border-rule last:border-0">
                  <td className="p-3 text-ink">{r.policy === "adaptive" ? p : ""}</td>
                  <td className="p-3 text-graphite">{r.policy}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{pct(r.gain)} ± {pct(r.gainSd)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{dec(r.maeFirst)} → {dec(r.maeLast)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{pct(r.repetition)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EvaluationPage() {
  const [view, setView] = useState<EvalReportView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.evalReport().then(setView).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-8">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-bold text-ink">Evaluation</h1>
        <p className="max-w-3xl text-graphite">
          Measured on our team-built test set: lecture notes, slides and a lecture video with known answer locations, plus questions the material doesn&apos;t cover. Every number below comes from a recorded run; nothing is estimated. Reproduce with <code className="font-mono text-ink">npm run eval:rag</code> and <code className="font-mono text-ink">npm run eval:sim</code>.
        </p>
      </header>
      {error && <p role="alert" className="text-proof">{error}</p>}
      {!view && !error && <p className="text-graphite">Loading the latest reports…</p>}
      {view && (
        <>
          {view.problems.map((p) => (
            <p key={p} role="alert" className="rounded-2xl border border-proof/40 bg-proof/5 p-4 text-sm text-proof">{p}</p>
          ))}
          {view.rag ? <RagSection rag={view.rag} /> : <Missing what="answer-quality" command="npm run eval:rag" />}
          {view.sim ? <SimSection sim={view.sim} /> : <Missing what="simulated-student" command="npm run eval:sim" />}
          <section className="space-y-3 rounded-2xl border border-rule bg-surface p-6 text-sm text-graphite">
            <h2 className="font-display text-xl font-bold text-ink">How to read this</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Faithfulness, answer relevancy and context precision/recall follow the RAGAS definitions, scored by a Gemini judge that is a different model from the tutor&apos;s. This is not the ragas package itself.</li>
              <li>Citation accuracy and refusals are checked in code against the expected page, slide or time range written for each question before the run.</li>
              <li>The test set is small and team-built. The slide deck in it is synthetic (made by the team), and its facts also appear in the lecture notes, so a slide question also accepts the matching page.</li>
              <li>The simulated students follow a different learning model from the app&apos;s, so the app&apos;s mastery model is not graded against itself. It measures the policy, not real students.</li>
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
