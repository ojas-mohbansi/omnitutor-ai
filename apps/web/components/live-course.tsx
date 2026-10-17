"use client";
// Landing-page evidence, all live: the course's real sources and topics, and the signed-in learner's
// latest grounded tutor answer. Nothing here is sample data; empty states say what to do next.
// Signed out, nothing about the course is shown: visitors see a sign-in prompt instead.
import type { ChatMessageView, SourceView, TopicView, TutorBlock } from "@sc/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

const STATUS: Record<SourceView["status"], string> = { PENDING: "Waiting", PROCESSING: "Processing", READY: "Ready", FAILED: "Failed" };

function SignInPrompt({ text }: { text: string }) {
  return (
    <p className="mt-4 text-meta text-graphite">
      <Link href="/login" className="text-ink underline underline-offset-2">Sign in</Link> {text}
    </p>
  );
}

export function LiveStats() {
  const { learner, ready: sessionReady } = useLearner();
  const [sources, setSources] = useState<SourceView[] | null>(null);
  const [topics, setTopics] = useState<TopicView[]>([]);
  useEffect(() => {
    if (!learner) return;
    Promise.all([api.listSources(), api.listTopics()]).then(([s, t]) => { setSources(s); setTopics(t); }).catch(() => setSources([]));
  }, [learner]);
  if (!sessionReady) return null;
  if (!learner) {
    return (
      <figure className="lg:col-span-4 lg:col-start-9">
        <div className="h-px w-full bg-rule-strong" />
        <figcaption className="mt-4 text-meta text-graphite">Your course</figcaption>
        <SignInPrompt text="to see your course: its sources, cited excerpts and topics." />
      </figure>
    );
  }
  if (!sources) return null;
  const ready = sources.filter((s) => s.status === "READY");
  return (
    <figure className="lg:col-span-4 lg:col-start-9">
      <div className="h-px w-full bg-rule-strong" />
      <figcaption className="mt-4 text-meta text-graphite">Your course right now · live from the database</figcaption>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {[["sources", ready.length], ["cited chunks", ready.reduce((n, s) => n + s.chunkCount, 0)], ["topics", topics.length]].map(([label, n]) => (
          <div key={label as string}>
            <dt className="text-meta text-graphite">{label}</dt>
            <dd className="font-display text-display text-ink">{n}</dd>
          </div>
        ))}
      </dl>
      {ready.length === 0 ? (
        <p className="mt-4 text-meta text-graphite">Nothing ingested yet: add a PDF, a deck or a lecture video.</p>
      ) : (
        <ul className="mt-4 space-y-1 text-meta text-graphite">
          {ready.map((s) => (
            <li key={s.id} className="truncate" title={s.filename}>
              <Link href="/sources" className="hover:text-ink">{s.filename}</Link> · {s.chunkCount} chunks
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function LiveGrounding() {
  const { learner } = useLearner();
  const [answer, setAnswer] = useState<ChatMessageView | null | undefined>(undefined);
  useEffect(() => {
    if (!learner) return;
    api.chatHistory(learner.id).then((h) => setAnswer([...h].reverse().find((m) => m.role === "ASSISTANT" && m.blocks?.some((b) => b.origin === "material")) ?? null)).catch(() => setAnswer(null));
  }, [learner]);
  if (answer === undefined) return null;
  if (!answer) {
    return (
      <p className="mt-10 text-body text-graphite">
        Ask the <Link href="/tutor" className="text-ink underline underline-offset-2">tutor</Link> a question and your latest grounded answer appears here, with its citations.
      </p>
    );
  }
  const blocks = answer.blocks ?? [];
  const material = blocks.filter((b): b is Extract<TutorBlock, { origin: "material" }> => b.origin === "material");
  const outside = blocks.filter((b) => b.origin === "outside");
  return (
    <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="rounded-panel border border-rule bg-surface p-6 sm:p-8 lg:col-span-7">
        <p className="text-meta font-medium text-verified">From your material · {learner?.name}&apos;s latest answer</p>
        {material.map((b, i) => (
          <div key={i} className="mt-4">
            <p className="measure text-body text-ink">{b.text}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {b.citations.map((c) => (
                <li key={c.chunkId} className="flex items-baseline gap-2"><Locator citation={c} /><span className="text-meta text-graphite">{c.filename}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="rounded-panel border border-dashed border-rule-strong p-6 sm:p-8 lg:col-span-5">
        <p className="text-meta font-medium text-graphite">Outside the material</p>
        <p className="measure mt-4 text-body text-graphite">
          {outside[0]?.text ?? "This answer needed nothing beyond your sources. When it does, that part is labelled here and carries no citation."}
        </p>
      </div>
    </div>
  );
}

export function LiveSources() {
  const { learner, ready: sessionReady } = useLearner();
  const [sources, setSources] = useState<SourceView[] | null>(null);
  useEffect(() => {
    if (!learner) return;
    api.listSources().then(setSources).catch(() => setSources([]));
  }, [learner]);
  if (!sessionReady) return null;
  if (!learner) return <div className="mt-10"><SignInPrompt text="to see the sources in your course." /></div>;
  if (!sources) return null;
  if (sources.length === 0) return <p className="mt-10 text-body text-graphite">No sources yet. <Link href="/sources" className="text-ink underline underline-offset-2">Add your course material</Link>.</p>;
  return (
    <ul className="mt-14">
      {sources.map((s) => (
        <li key={s.id} className="border-t border-rule py-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-12">
            <span className="locator text-proof lg:col-span-3">{s.type === "PDF" ? "pages" : s.type === "PPTX" ? "slides" : "timestamps"}</span>
            <div className="lg:col-span-8 lg:col-start-4">
              <h3 className="font-display text-title text-ink">{s.filename}</h3>
              <p className="mt-3 flex flex-wrap gap-x-4 text-meta tabular-nums text-graphite">
                <span>{s.type === "VIDEO" ? "MP4" : s.type}</span>
                <span>{STATUS[s.status]}</span>
                <span>{s.chunkCount} chunks</span>
                <span>{formatDate(s.createdAt)}</span>
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Hero call to action: signed out → create an account; signed in → straight back to studying. */
export function HeroCta() {
  const { learner, ready } = useLearner();
  if (!ready) return <span className="mt-9 inline-flex min-h-11 w-44 animate-pulse rounded-card bg-surface" aria-hidden="true" />;
  return (
    <Link
      href={learner ? "/tutor" : "/login"}
      className="mt-9 inline-flex min-h-11 items-center rounded-card bg-ink px-5 text-body font-medium text-paper transition-colors duration-200 ease-ledger hover:bg-ink/85"
    >
      {learner ? "Continue studying" : "Create your free account"}
    </Link>
  );
}

type Hub = { sources: number; topics: number; due: number; cards: number; needsDiagnostic: boolean; weak: number };

/** Signed-in study hub: where to go next, with live counts from the active notebook. */
export function StudyHub() {
  const { learner } = useLearner();
  const [hub, setHub] = useState<Hub | null>(null);
  useEffect(() => {
    if (!learner) return;
    Promise.all([api.listSources(), api.listTopics(), api.listFlashcards(), api.mastery(learner.id)])
      .then(([s, t, f, m]) => setHub({ sources: s.length, topics: t.length, due: f.due, cards: f.total, needsDiagnostic: m.needsDiagnostic, weak: m.weakTopics.length }))
      .catch(() => setHub(null));
  }, [learner]);
  if (!learner || !hub) return null;
  const empty = hub.sources === 0;
  const tiles = [
    { href: "/sources", emoji: "📚", title: empty ? "Add your material" : "Sources", text: empty ? "Upload a PDF, slides or a lecture video to start" : `${hub.sources} file${hub.sources === 1 ? "" : "s"} · ${hub.topics} topics`, accent: empty },
    { href: "/tutor", emoji: "💬", title: "Ask your tutor", text: "Explanations from your material, with sources", accent: false },
    { href: hub.needsDiagnostic ? "/quiz?kind=DIAGNOSTIC" : "/quiz", emoji: "🎯", title: hub.needsDiagnostic ? "Take the diagnostic" : "Quiz yourself", text: hub.needsDiagnostic ? "One question per topic to calibrate your map" : hub.weak ? `${hub.weak} weak topic${hub.weak === 1 ? "" : "s"} to work on` : "Adaptive questions at your level", accent: !empty && hub.needsDiagnostic },
    { href: "/flashcards", emoji: "🃏", title: "Flashcards", text: hub.cards ? `${hub.due} due now · ${hub.cards} cards` : "Make verified cards per topic", accent: hub.due > 0 },
    { href: "/map", emoji: "🗺️", title: "Course map", text: "Topics, concepts and your mastery at a glance", accent: false },
    { href: "/dashboard", emoji: "📈", title: "Your progress", text: "Mastery per topic and what changed", accent: false },
  ];
  return (
    <section aria-labelledby="hub-title" className="px-4 pt-10 sm:px-6">
      <div className="mx-auto w-full max-w-[68rem]">
        <h2 id="hub-title" className="font-display text-title text-ink">Hi {learner.name}, pick up where you left off</h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.title}>
              <Link href={t.href} className={`group flex h-full items-start gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${t.accent ? "border-proof bg-proof-ground" : "border-rule bg-surface hover:border-ink"}`}>
                <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                <span>
                  <span className="block font-medium text-ink">{t.title} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span>
                  <span className="mt-1 block text-sm text-graphite">{t.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
