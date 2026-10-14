"use client";
import type { AttemptResult, Citation, QuizReport } from "@sc/schemas";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CitationViewer } from "@/components/citation-viewer";
import { Locator } from "@/components/locator";
import { api, errorText } from "@/lib/api";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const pct = (p: number) => `${Math.round(p * 100)}%`;

function given(a: AttemptResult): string {
  if (!a.response) return "Not answered";
  if (a.response.type === "MCQ") return `${LETTERS[a.response.index]}. ${a.options?.[a.response.index] ?? ""}`;
  if (a.response.type === "NUMERIC") return String(a.response.value);
  return a.response.text;
}

function CiteChips({ citations, onCite }: { citations: Citation[]; onCite: (c: Citation) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {citations.map((c) => (
        <button key={c.chunkId} onClick={() => onCite(c)} title={c.excerpt} className="rounded border border-rule bg-graphite/5 px-2 py-1 hover:border-proof">
          <Locator citation={c} /> <span className="font-mono text-[10px] text-graphite">{c.filename}</span>
        </button>
      ))}
    </div>
  );
}

function ReportView() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<QuizReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Citation | null>(null);

  useEffect(() => {
    api.getReport(id).then(setReport).catch((e) => setError(errorText(e)));
  }, [id]);

  if (error) return <main className="mx-auto max-w-3xl p-8 text-proof">{error}</main>;
  if (!report) return <main className="mx-auto max-w-3xl p-8 text-graphite">Loading report…</main>;

  const { correct, total } = report.score;
  return (
    <main className="mx-auto grid w-full max-w-7xl grid-cols-12 gap-8 p-8">
      <div className="col-span-12 space-y-10 lg:col-span-7">
        <header className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-graphite">{report.kind.toLowerCase()} report</p>
          <div className="flex items-baseline gap-4">
            <span className="font-display text-6xl font-bold text-ink">{total ? Math.round((correct / total) * 100) : 0}%</span>
            <span className="font-mono text-graphite">{correct} of {total} correct</span>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard" className="rounded-full bg-proof px-5 py-2 text-sm font-medium text-white hover:opacity-90">View dashboard</Link>
            <Link href="/quiz" className="rounded-full border border-rule-strong bg-surface px-5 py-2 text-sm font-medium hover:bg-graphite/5">New quiz</Link>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">By topic</h2>
          {report.perTopic.map((t) => {
            const up = t.masteryAfter >= t.masteryBefore;
            return (
              <div key={t.topicId} className="space-y-2 rounded-2xl border border-rule bg-surface p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-ink">{t.topicName}</span>
                  <span className="font-mono text-xs text-graphite">{t.correct}/{t.total} correct</span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-rule">
                  <div className={`absolute h-full ${up ? "bg-verified" : "bg-proof"}`} style={{ width: `${t.masteryAfter * 100}%` }} />
                </div>
                <p className={`font-mono text-xs ${up ? "text-verified" : "text-proof"}`}>
                  mastery {pct(t.masteryBefore)} → {pct(t.masteryAfter)}
                </p>
              </div>
            );
          })}
        </section>

        {report.misconceptions.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-xl font-bold">Likely misconceptions</h2>
            <ul className="space-y-2">
              {report.misconceptions.map((m, i) => (
                <li key={i} className="rounded-2xl border border-proof/30 bg-proof-ground p-4 text-sm text-proof-ink">
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-2 font-mono text-xs">{m.topicName}{m.count > 1 ? ` · ×${m.count}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">Questions</h2>
          {report.attempts.map((a) => (
            <article key={a.questionId} className={`space-y-3 rounded-2xl border-2 bg-surface p-5 ${a.correct ? "border-verified/40" : "border-proof/40"}`}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium text-ink">{a.position + 1}. {a.stem}</p>
                <span className={`shrink-0 font-mono text-xs font-bold ${a.correct ? "text-verified" : "text-proof"}`}>
                  {a.correct ? "✓ correct" : "✗ wrong"}{a.type === "SHORT" && a.response ? ` · ${pct(a.score)}` : ""}
                </span>
              </div>
              <p className="text-sm text-graphite"><span className="font-mono text-[10px] uppercase tracking-widest">Your answer</span><br />{given(a)}</p>
              {!a.correct && <p className="text-sm text-ink"><span className="font-mono text-[10px] uppercase tracking-widest text-graphite">Correct answer</span><br />{a.correctAnswer}</p>}
              <p className="text-sm leading-relaxed text-ink">{a.feedback.text}</p>
              {a.misconception && <p className="text-xs text-proof">Misconception: {a.misconception}</p>}
              <CiteChips citations={a.feedback.citations} onCite={setActive} />
            </article>
          ))}
        </section>
      </div>

      <aside className="col-span-12 space-y-6 lg:col-span-5">
        <div className="sticky top-20 space-y-6">
          {report.revisit.length > 0 && (
            <section className="space-y-3 rounded-[2rem] bg-workspace p-6 text-paper">
              <h2 className="font-display text-lg font-bold">Revisit before your next quiz</h2>
              <p className="text-xs text-white/60">The source passages behind the questions you missed, weakest topic first.</p>
              <div className="flex flex-wrap gap-2">
                {report.revisit.map((c) => (
                  <button key={c.chunkId} onClick={() => setActive(c)} className="rounded border border-white/15 bg-white/5 px-2 py-1 text-left hover:bg-white/10">
                    <span className="locator text-proof-ground">{c.sourceType === "PDF" ? `p. ${c.page}` : c.sourceType === "PPTX" ? `s. ${c.slide}` : "video"}</span>{" "}
                    <span className="font-mono text-[10px] text-white/60">{c.title ?? c.filename}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="rounded-[2rem] border border-rule bg-surface p-6">
            {active ? <CitationViewer citation={active} /> : <p className="text-sm text-graphite">Select a citation to open the source at that exact place.</p>}
          </section>
        </div>
      </aside>
    </main>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl p-8 text-graphite">Loading report…</main>}>
      <ReportView />
    </Suspense>
  );
}
