"use client";
// Mind map (Module 20): the active notebook's course map. Topics around the notebook, concepts as
// branches, prerequisite arrows between topics, each topic coloured AND labelled by the learner's
// measured mastery. Built only from existing data (GET /api/topics: topics, prerequisites, cited
// concepts; GET /api/mastery), so every node and link is real; clicking a concept opens its source.
import type { MasteryView, NotebookView, TopicConcept, TopicView } from "@sc/schemas";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CitationViewer } from "@/components/citation-viewer";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api, errorText } from "@/lib/api";

const W = 1260;
const H = 1240;
const CX = W / 2;
const CY = H / 2;
const R_TOPIC = 235;
const R_CONCEPT = 385;
const MAX_CONCEPTS = 6;

type Band = "weak" | "developing" | "strong" | "none";
const BAND: Record<Band, { label: string; stroke: string; fill: string; text: string }> = {
  weak: { label: "Weak", stroke: "var(--color-proof)", fill: "var(--color-proof-ground)", text: "var(--color-proof-ink)" },
  developing: { label: "Developing", stroke: "var(--color-pending)", fill: "var(--color-pending-ground)", text: "var(--color-pending-ink)" },
  strong: { label: "Strong", stroke: "var(--color-verified)", fill: "var(--color-verified-ground)", text: "var(--color-verified-ink)" },
  none: { label: "Not assessed", stroke: "var(--color-graphite)", fill: "var(--color-surface)", text: "var(--color-ink)" },
};

type Selection = { kind: "topic"; topicId: string } | { kind: "concept"; topicId: string; label: string } | null;

const polar = (r: number, a: number) => ({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Pure: up to `max` lines of at most `width` characters, breaking at spaces (the last line is shortened). */
function wrap(s: string, width: number, max = 2): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if (!line) line = word;
    else if ((line + " " + word).length <= width) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > max ? [...lines.slice(0, max - 1), short(lines.slice(max - 1).join(" "), width)] : lines;
}

/** Pure layout: each topic gets an angular sector sized by its concept count; concepts fan inside it. */
function layout(topics: TopicView[]) {
  const weights = topics.map((t) => Math.max(1.6, Math.min(MAX_CONCEPTS, t.concepts.length)));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let start = -Math.PI / 2;
  return topics.map((t, i) => {
    const span = (weights[i] / total) * Math.PI * 2;
    const mid = start + span / 2;
    const shown = t.concepts.slice(0, MAX_CONCEPTS);
    const step = span / Math.max(1, shown.length);
    const concepts = shown.map((c, j) => {
      const a = shown.length === 1 ? mid : start + step * (j + 0.5);
      return { concept: c, angle: a, ...polar(R_CONCEPT, a) };
    });
    start += span;
    return { topic: t, angle: mid, ...polar(R_TOPIC, mid), concepts };
  });
}

export default function MapPage() {
  const { learner } = useLearner();
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  const [mastery, setMastery] = useState<MasteryView | null>(null);
  const [notebook, setNotebook] = useState<NotebookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!learner) return;
    Promise.all([api.listTopics(), api.mastery(learner.id), api.listNotebooks()])
      .then(([t, m, n]) => {
        setTopics(t);
        setMastery(m);
        setNotebook(n.notebooks.find((x) => x.active) ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, [learner]);

  const nodes = useMemo(() => (topics ? layout(topics) : []), [topics]);
  const pos = useMemo(() => new Map(nodes.map((n) => [n.topic.id, n])), [nodes]);
  const bandOf = (topicId: string): { band: Band; p: number | null } => {
    const m = mastery?.topics.find((t) => t.topicId === topicId);
    if (!m || m.n === 0) return { band: "none", p: null };
    return { band: m.band, p: m.p };
  };

  if (error) return <main className="mx-auto max-w-5xl p-8 text-proof">{error}</main>;
  if (!topics || !mastery) {
    return (
      <main className="mx-auto w-full max-w-7xl p-8">
        <div className="h-10 w-64 animate-pulse rounded-card bg-surface" />
        <div className="mt-6 aspect-[10/9] w-full animate-pulse rounded-3xl bg-surface" />
      </main>
    );
  }
  if (topics.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">No map yet</h1>
        <p className="mt-3 text-graphite">Add your material on the Sources page and build the topics: the map is drawn from them.</p>
        <Link href="/sources" className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper hover:opacity-85">Go to Sources</Link>
      </main>
    );
  }

  const focus = selected?.topicId ?? hover;
  const dim = (topicId: string) => (focus && focus !== topicId ? 0.28 : 1);
  const selTopic = selected ? topics.find((t) => t.id === selected.topicId) ?? null : null;
  const selConcept: TopicConcept | null = selected?.kind === "concept" ? selTopic?.concepts.find((c) => c.label === selected.label) ?? null : null;
  const nameOf = (id: string) => topics.find((t) => t.id === id)?.name ?? "";

  return (
    <main className="mx-auto grid w-full max-w-[96rem] grid-cols-1 gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-ink">Course map</h1>
            <p className="mt-1 text-graphite">{notebook?.name} · {topics.length} topics · tap a topic or a concept</p>
          </div>
          <ul className="flex flex-wrap gap-3 text-xs text-graphite" aria-label="Legend">
            {(["weak", "developing", "strong", "none"] as Band[]).map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: BAND[b].stroke, background: BAND[b].fill }} />
                {BAND[b].label}
              </li>
            ))}
            <li className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-graphite" /> prerequisite</li>
          </ul>
        </header>

        {/* Phones: a readable size you can pan sideways; from lg the map fits the column. */}
        <div className="overflow-x-auto rounded-3xl border border-rule bg-surface">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[880px] select-none lg:min-w-0" role="img" aria-label={`Course map of ${notebook?.name ?? "this notebook"}: ${topics.map((t) => t.name).join(", ")}`}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--color-graphite)" />
              </marker>
            </defs>
            <circle cx={CX} cy={CY} r={R_CONCEPT} fill="none" stroke="var(--color-rule)" strokeDasharray="2 8" />

            {/* spokes and branches */}
            {nodes.map((n) => (
              <g key={`b-${n.topic.id}`} style={{ opacity: dim(n.topic.id), transition: "opacity 200ms" }}>
                <line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="var(--color-rule-strong)" strokeWidth={2} />
                {n.concepts.map((c) => {
                  const ctrl = polar(R_TOPIC + 70, c.angle);
                  return <path key={c.concept.label} d={`M ${n.x} ${n.y} Q ${ctrl.x} ${ctrl.y} ${c.x} ${c.y}`} fill="none" stroke={BAND[bandOf(n.topic.id).band].stroke} strokeOpacity={0.55} strokeWidth={1.6} />;
                })}
              </g>
            ))}

            {/* prerequisite arrows (pulled toward the centre so they don't cross the branches) */}
            {nodes.flatMap((n) =>
              n.topic.prereqIds.map((pid) => {
                const from = pos.get(pid);
                if (!from) return null;
                const mx = (from.x + n.x) / 2;
                const my = (from.y + n.y) / 2;
                const ctrl = { x: CX + (mx - CX) * 0.35, y: CY + (my - CY) * 0.35 };
                const k = (v: number, w: number) => v + (w - v) * 0.16; // stop short of the node
                return (
                  <path
                    key={`p-${pid}-${n.topic.id}`}
                    d={`M ${k(from.x, ctrl.x)} ${k(from.y, ctrl.y)} Q ${ctrl.x} ${ctrl.y} ${k(n.x, ctrl.x)} ${k(n.y, ctrl.y)}`}
                    fill="none"
                    stroke="var(--color-graphite)"
                    strokeWidth={1.6}
                    strokeDasharray="6 6"
                    markerEnd="url(#arrow)"
                    style={{ opacity: focus && focus !== n.topic.id && focus !== pid ? 0.15 : 0.75, transition: "opacity 200ms" }}
                  />
                );
              }),
            )}

            {/* centre */}
            <circle cx={CX} cy={CY} r={86} fill="var(--color-ink)" />
            {(() => {
              const lines = wrap(notebook?.name ?? "Notebook", 14);
              const top = CY - 8 - (lines.length - 1) * 10;
              return (
                <>
                  {lines.map((l, i) => (
                    <text key={i} x={CX} y={top + i * 20} textAnchor="middle" fill="var(--color-paper)" fontSize={16} fontWeight={700}>{l}</text>
                  ))}
                  <text x={CX} y={top + lines.length * 20 + 6} textAnchor="middle" fill="var(--color-paper)" fontSize={13} opacity={0.7}>{topics.length} topics</text>
                </>
              );
            })()}

            {/* concept leaves */}
            {nodes.map((n) =>
              n.concepts.map((c) => {
                const right = Math.cos(c.angle) >= 0;
                const deg = (c.angle * 180) / Math.PI + (right ? 0 : 180);
                const isSel = selected?.kind === "concept" && selected.label === c.concept.label && selected.topicId === n.topic.id;
                return (
                  <g
                    key={`c-${n.topic.id}-${c.concept.label}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.concept.label}, in ${n.topic.name}`}
                    className="cursor-pointer focus:outline-none"
                    style={{ opacity: dim(n.topic.id), transition: "opacity 200ms" }}
                    onClick={() => setSelected({ kind: "concept", topicId: n.topic.id, label: c.concept.label })}
                    onKeyDown={(e) => e.key === "Enter" && setSelected({ kind: "concept", topicId: n.topic.id, label: c.concept.label })}
                    onMouseEnter={() => setHover(n.topic.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <circle cx={c.x} cy={c.y} r={isSel ? 9 : 6} fill={BAND[bandOf(n.topic.id).band].stroke} />
                    <text
                      x={c.x}
                      y={c.y}
                      dx={right ? 14 : -14}
                      dy={4}
                      textAnchor={right ? "start" : "end"}
                      transform={`rotate(${deg} ${c.x} ${c.y})`}
                      fontSize={14}
                      fontWeight={isSel ? 700 : 500}
                      fill="var(--color-ink)"
                    >
                      {short(c.concept.label, 24)}
                    </text>
                  </g>
                );
              }),
            )}

            {/* topic nodes */}
            {nodes.map((n, i) => {
              const { band, p } = bandOf(n.topic.id);
              const lines = wrap(n.topic.name, 22);
              const w = Math.max(150, Math.max(...lines.map((l) => l.length)) * 8.6 + 36);
              const h = 34 + lines.length * 19;
              const isSel = selected?.topicId === n.topic.id && selected.kind === "topic";
              return (
                <g
                  key={`t-${n.topic.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.topic.name}: ${p === null ? "not assessed" : `${Math.round(p * 100)}% mastery`}`}
                  className="cursor-pointer focus:outline-none"
                  style={{ opacity: dim(n.topic.id), transition: "opacity 200ms" }}
                  onClick={() => setSelected({ kind: "topic", topicId: n.topic.id })}
                  onKeyDown={(e) => e.key === "Enter" && setSelected({ kind: "topic", topicId: n.topic.id })}
                  onMouseEnter={() => setHover(n.topic.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={24} fill={BAND[band].fill} stroke={BAND[band].stroke} strokeWidth={isSel ? 4 : 2.5} />
                  {lines.map((l, k) => (
                    <text key={k} x={n.x} y={n.y - h / 2 + 24 + k * 19} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--color-ink)">{l}</text>
                  ))}
                  <text x={n.x} y={n.y + h / 2 - 12} textAnchor="middle" fontSize={13} fill={BAND[band].text}>
                    T{i + 1} · {p === null ? "not assessed" : `${Math.round(p * 100)}% · ${BAND[band].label.toLowerCase()}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-live="polite">
        {!selTopic && (
          <div className="rounded-3xl border border-rule bg-surface p-6 text-sm text-graphite">
            <p className="font-display text-xl font-bold text-ink">Explore your course</p>
            <p className="mt-2">Each topic shows your measured mastery. Tap a topic for what it covers and to practise it; tap a concept to open the exact page, slide or moment where it is taught.</p>
          </div>
        )}
        {selTopic && selected?.kind === "topic" && (() => {
          const { band, p } = bandOf(selTopic.id);
          return (
            <div className="space-y-4 rounded-3xl border border-rule bg-surface p-6">
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: BAND[band].text }}>{p === null ? "Not assessed yet" : `${Math.round(p * 100)}% · ${BAND[band].label}`}</p>
              <h2 className="font-display text-2xl font-bold text-ink">{selTopic.name}</h2>
              <p className="text-sm leading-relaxed text-graphite">{selTopic.description}</p>
              {selTopic.prereqIds.length > 0 && <p className="text-sm text-graphite">Builds on: {selTopic.prereqIds.map(nameOf).filter(Boolean).join(", ")}</p>}
              <div className="flex flex-wrap gap-2">
                {selTopic.concepts.map((c) => (
                  <button key={c.label} type="button" onClick={() => setSelected({ kind: "concept", topicId: selTopic.id, label: c.label })} className="rounded-full border border-rule px-3 py-1 text-xs text-ink hover:border-proof">
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/quiz?topics=${selTopic.id}`} className="rounded-full bg-proof px-5 py-2 text-sm font-bold text-white hover:opacity-90">Practise this topic</Link>
                <Link href="/tutor" className="rounded-full border border-rule-strong px-5 py-2 text-sm font-bold text-ink hover:bg-paper">Ask the tutor</Link>
              </div>
            </div>
          );
        })()}
        {selTopic && selConcept && (
          <div className="space-y-4 rounded-3xl border border-rule bg-surface p-6">
            <button type="button" onClick={() => setSelected({ kind: "topic", topicId: selTopic.id })} className="text-xs text-graphite hover:text-ink">← {selTopic.name}</button>
            <h2 className="font-display text-2xl font-bold text-ink">{selConcept.label}</h2>
            <p className="text-sm text-graphite">Taught in {selConcept.chunkCount} excerpt{selConcept.chunkCount === 1 ? "" : "s"} of your material.</p>
            {selConcept.citations[0] && <CitationViewer key={selConcept.citations[0].chunkId} citation={selConcept.citations[0]} />}
            {selConcept.citations.length > 1 && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-graphite">
                Also at {selConcept.citations.slice(1).map((c) => <Locator key={c.chunkId} citation={c} />)}
              </p>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}
