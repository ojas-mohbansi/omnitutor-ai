"use client";
import { citationHref, type MasteryBand, type MasteryPoint, type MasteryView, type TopicMastery } from "@sc/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";

// Band = status, so it always ships with its text label (never color alone).
const BAND: Record<MasteryBand, { label: string; bar: string; text: string }> = {
  weak: { label: "Weak", bar: "bg-proof", text: "text-proof" },
  developing: { label: "Developing", bar: "bg-pending", text: "text-pending" },
  strong: { label: "Strong", bar: "bg-verified", text: "text-verified" },
};
const pct = (p: number) => `${Math.round(p * 100)}%`;

const MasteryBar = ({ topic }: { topic: TopicMastery }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule">
    <div className={`h-full transition-all duration-500 ease-out ${topic.n ? BAND[topic.band].bar : "bg-graphite/30"}`} style={{ width: `${topic.p * 100}%` }} />
  </div>
);

const StatCard = ({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) => (
  <div className="flex flex-col items-center justify-center space-y-2 rounded-[2rem] border border-rule bg-surface p-6 text-center shadow-sm">
    <span className="text-xs uppercase tracking-widest text-graphite">{label}</span>
    <span className="font-display text-5xl font-bold text-ink">{value}</span>
    {subvalue && <span className="text-xs text-graphite">{subvalue}</span>}
  </div>
);

type Point = { step: number; p: number; at: string | null; source: string };

function TopicTrend({ topic, events }: { topic: TopicMastery; events: MasteryPoint[] }) {
  const data: Point[] = [
    { step: 0, p: events[0].before, at: null, source: "start" },
    ...events.map((e, i) => ({ step: i + 1, p: e.after, at: e.at, source: e.source === "QUIZ" ? "quiz answer" : e.source === "FLASHCARD" ? "flashcard" : "tutor chat" })),
  ];
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">{topic.name}</span>
        <span className="font-mono text-xs text-graphite">{pct(topic.p)} · {BAND[topic.band].label}</span>
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 2, left: 6 }}>
            <XAxis dataKey="step" hide />
            <YAxis domain={[0, 1]} hide />
            <ReferenceLine y={0.4} stroke="rgb(22 24 28 / 0.12)" strokeDasharray="3 3" />
            <ReferenceLine y={0.7} stroke="rgb(22 24 28 / 0.12)" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: "rgb(22 24 28 / 0.24)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!d) return null;
                return (
                  <div className="rounded-card border border-rule-strong bg-surface px-2 py-1 text-xs text-ink shadow-sm">
                    <span className="font-mono">{pct(d.p)}</span> <span className="text-graphite">{d.at ? `after ${d.source}, ${formatDate(d.at)}` : "starting estimate"}</span>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="p" stroke="#16181c" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fafaf7", fill: "#16181c" }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { learner } = useLearner();
  const [view, setView] = useState<MasteryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The learner only changes by signing out, which unmounts this page (LearnerGate): no reset needed.
  useEffect(() => {
    if (!learner) return;
    api.mastery(learner.id).then(setView).catch((e) => setError(errorText(e)));
  }, [learner]);

  if (error) return <main className="mx-auto w-full max-w-7xl p-8 text-proof">{error}</main>;
  if (!view || !learner) {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-8 p-8" aria-busy="true" aria-label="Loading your mastery map">
        <div className="h-10 w-72 animate-pulse rounded-card bg-surface" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-3xl bg-surface lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-3xl bg-surface" />
        </div>
        <div className="h-56 animate-pulse rounded-3xl bg-surface" />
      </main>
    );
  }

  const assessed = view.topics.filter((t) => t.n > 0);
  const overall = assessed.length ? assessed.reduce((s, t) => s + t.p, 0) / assessed.length : null;
  const quizEvents = view.history.filter((h) => h.source === "QUIZ").length;
  const chatEvents = view.history.filter((h) => h.source === "CHAT").length;
  const cardEvents = view.history.filter((h) => h.source === "FLASHCARD").length;
  const nameOf = new Map(view.topics.map((t) => [t.topicId, t.name]));
  const recent = [...view.history].reverse().slice(0, 6);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-12 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">Your progress</h1>
          <p className="font-body text-graphite">
            Welcome back, <span className="font-medium text-ink">{learner.name}</span>. Your mastery map updates after every quiz answer and tutor conversation.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/quiz" className="rounded-full border border-rule bg-surface px-5 py-2 text-sm font-medium transition-colors hover:bg-graphite/5">Take a quiz</Link>
          <Link href="/tutor" className="rounded-full bg-proof px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">Start Study Session</Link>
        </div>
      </header>

      {view.needsDiagnostic && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-pending/30 bg-pending-ground p-6">
          <div>
            <p className="font-display text-title text-ink">New here? Start with the diagnostic.</p>
            <p className="text-sm text-pending-ink">
              One question per topic, so the tutor and quizzes can adapt to you.{" "}
              {assessed.length === 0
                ? `Until then every topic sits at the starting estimate (${pct(view.topics[0]?.p ?? 0.3)}).`
                : `So far ${assessed.length} of ${view.topics.length} topics have evidence; the diagnostic checks each one once.`}
            </p>
          </div>
          <Link href="/quiz?kind=DIAGNOSTIC" className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90">Take the diagnostic</Link>
        </div>
      )}

      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 grid grid-cols-2 gap-6 lg:col-span-8">
          <div id="topology" className="col-span-2 rounded-[2.5rem] border border-rule bg-surface p-8 shadow-sm">
            <h2 className="mb-6 font-display text-xl font-bold">Knowledge Topology</h2>
            {view.topics.length === 0 ? (
              <p className="text-sm text-graphite">No topics yet: build the course on the Sources page.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
                {view.topics.map((topic) => (
                  <div key={topic.topicId} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{topic.name}</span>
                      <span className={`font-mono text-xs ${topic.n ? BAND[topic.band].text : "text-graphite"}`}>
                        {pct(topic.p)} · {topic.n ? BAND[topic.band].label : "not assessed"}
                      </span>
                    </div>
                    <MasteryBar topic={topic} />
                    <p className="text-xs text-graphite">
                      {topic.prereqIds.length ? `Requires ${topic.prereqIds.map((p) => nameOf.get(p) ?? p).join(", ")} · ` : ""}
                      {topic.n ? `${topic.n} update${topic.n > 1 ? "s" : ""}` : "no evidence yet"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <StatCard label="Overall Mastery" value={overall === null ? "—" : pct(overall)} subvalue={`${assessed.length} of ${view.topics.length} topics assessed`} />
          <StatCard label="Evidence" value={String(view.history.length)} subvalue={`${quizEvents} quiz answers · ${chatEvents} tutor turns · ${cardEvents} flashcards`} />
        </div>

        <div className="col-span-12 space-y-6 lg:col-span-4">
          <div className="space-y-6 rounded-[2.5rem] bg-workspace p-8 text-paper shadow-xl">
            <h2 className="font-display text-xl font-bold">Focus Areas</h2>
            {view.weakTopics.length === 0 ? (
              <p className="text-sm text-white/60">{assessed.length ? "No weak topics right now." : "Weak topics appear here once you've been assessed."}</p>
            ) : (
              <div className="space-y-4">
                {view.weakTopics.map((w) => (
                  <div key={w.topicId} className="space-y-3 rounded-2xl border border-white/10 bg-surface/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-paper">{w.name}</p>
                        <p className="text-xs text-white/50">{pct(w.p)} · needs reinforcement</p>
                      </div>
                      <Link href={`/quiz?topics=${w.topicId}`} className="rounded-full bg-proof px-3 py-1 text-xs text-white hover:opacity-90">Practice</Link>
                    </div>
                    {w.citations.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-white/40">Revise</span>
                        {w.citations.map((c) =>
                          // A browser can't show a slide of a .pptx (the link would download the deck): slides show their excerpt on hover.
                          c.sourceType === "PPTX" ? (
                            <span key={c.chunkId} title={`${c.title ? `${c.title}: ` : ""}${c.excerpt}`} className="cursor-help rounded border border-white/15 px-1.5 py-0.5">
                              <Locator citation={c} />
                            </span>
                          ) : (
                            <a key={c.chunkId} href={citationHref(c)} target="_blank" rel="noreferrer" title={c.excerpt} className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/10">
                              <Locator citation={c} />
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link href={view.needsDiagnostic ? "/quiz?kind=DIAGNOSTIC" : "/quiz?kind=MOCK"} className="block w-full rounded-2xl bg-paper py-3 text-center text-sm font-bold text-ink transition-colors hover:bg-surface">
              {view.needsDiagnostic ? "Generate Diagnostic Quiz" : "Generate Mock Exam"}
            </Link>
          </div>

          <div className="space-y-4 rounded-[2.5rem] border border-rule bg-surface p-8 shadow-sm">
            <h2 className="font-display text-lg font-bold">Recent Activity</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-graphite">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="rounded bg-graphite/10 px-2 py-1 font-mono text-xs text-graphite">{h.source === "QUIZ" ? "Quiz" : h.source === "FLASHCARD" ? "Card" : "Chat"}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{nameOf.get(h.topicId) ?? "Topic"}</span>
                    <span className={`font-mono text-xs ${h.after >= h.before ? "text-verified" : "text-proof"}`}>{pct(h.before)} → {pct(h.after)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {assessed.length > 0 && (
        <section className="space-y-6 rounded-[2.5rem] border border-rule bg-surface p-8 shadow-sm">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold">Mastery History</h2>
            <p className="text-xs text-graphite">Each point is one piece of evidence (a graded answer or a tutor turn), same 0–100% scale for every topic; dashed lines mark the weak (40%) and strong (70%) bands.</p>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
            {assessed.map((t) => (
              <TopicTrend key={t.topicId} topic={t} events={view.history.filter((h) => h.topicId === t.topicId)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
