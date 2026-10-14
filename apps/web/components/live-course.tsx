"use client";
// Landing-page evidence, all live: the course's real sources and topics, and the selected learner's
// latest grounded tutor answer. Nothing here is sample data; empty states say what to do next.
import type { ChatMessageView, SourceView, TopicView, TutorBlock } from "@sc/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

const STATUS: Record<SourceView["status"], string> = { PENDING: "Waiting", PROCESSING: "Processing", READY: "Ready", FAILED: "Failed" };

export function LiveStats() {
  const [sources, setSources] = useState<SourceView[] | null>(null);
  const [topics, setTopics] = useState<TopicView[]>([]);
  useEffect(() => {
    Promise.all([api.listSources(), api.listTopics()]).then(([s, t]) => { setSources(s); setTopics(t); }).catch(() => setSources([]));
  }, []);
  if (!sources) return null;
  const ready = sources.filter((s) => s.status === "READY");
  return (
    <figure className="lg:col-span-4 lg:col-start-9">
      <div className="h-px w-full bg-rule-strong" />
      <figcaption className="mt-4 text-meta text-graphite">Your course right now</figcaption>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {[["sources", ready.length], ["cited chunks", ready.reduce((n, s) => n + s.chunkCount, 0)], ["topics", topics.length]].map(([label, n]) => (
          <div key={label as string}>
            <dt className="text-meta text-graphite">{label}</dt>
            <dd className="font-display text-display text-ink">{n}</dd>
          </div>
        ))}
      </dl>
      {ready.length === 0 && <p className="mt-4 text-meta text-graphite">Nothing ingested yet: add a PDF, a deck or a lecture video.</p>}
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
  const [sources, setSources] = useState<SourceView[] | null>(null);
  useEffect(() => {
    api.listSources().then(setSources).catch(() => setSources([]));
  }, []);
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
