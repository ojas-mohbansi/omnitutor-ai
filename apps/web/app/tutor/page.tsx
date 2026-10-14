"use client";
import type { ChatMessageView, Citation, Coverage, MasteryUpdate, TutorBlock } from "@sc/schemas";
import { useEffect, useRef, useState } from "react";
import { CitationViewer } from "@/components/citation-viewer";
import { BookOpenIcon } from "@/components/icons";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api, errorText } from "@/lib/api";

const COVERAGE: Record<Coverage, { label: string; className: string }> = {
  SUPPORTED: { label: "Grounded in your material", className: "bg-verified-ground text-verified-ink" },
  PARTIAL: { label: "Partly covered by your material", className: "bg-pending-ground text-pending-ink" },
  NOT_COVERED: { label: "Not in your material", className: "bg-proof-ground text-proof-ink" },
};

type Message = ChatMessageView & { updates?: MasteryUpdate[] };

function Block({ block, onCite, active }: { block: TutorBlock; onCite: (c: Citation) => void; active: Citation | null }) {
  if (block.origin === "outside") {
    return (
      <div className="rounded-2xl border border-dashed border-rule-strong p-3">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-graphite">Outside your material · not from your sources</p>
        <p className="text-sm leading-relaxed text-graphite">{block.text}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-ink">{block.text}</p>
      <div className="flex flex-wrap gap-2">
        {block.citations.map((c) => (
          <button
            key={c.chunkId}
            onClick={() => onCite(c)}
            title={c.excerpt}
            className={`rounded border px-2 py-1 transition-colors ${active?.chunkId === c.chunkId ? "border-proof bg-proof-ground" : "border-rule bg-graphite/5 hover:border-proof"}`}
          >
            <Locator citation={c} /> <span className="font-mono text-[10px] text-graphite">{c.filename}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TutorPage() {
  const { learner } = useLearner();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Citation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // The learner only changes by signing out, which unmounts this page (LearnerGate): no reset needed.
  useEffect(() => {
    if (!learner) return;
    api
      .chatHistory(learner.id)
      .then((h) => {
        setMessages(h);
        const last = [...h].reverse().find((m) => m.blocks?.some((b) => b.citations.length));
        setActive(last?.blocks?.flatMap((b) => b.citations)[0] ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, [learner]);

  // Block body on purpose: newer Chrome returns a Promise from smooth scrollIntoView, and React would call it as a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || !learner || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `local-${now}`, role: "USER", content: text, blocks: null, coverage: null, refused: false, createdAt: now }]);
    try {
      const a = await api.chat({ learnerId: learner.id, message: text });
      setMessages((m) => [
        ...m,
        { id: a.messageId, role: "ASSISTANT", content: a.blocks.map((b) => b.text).join("\n\n"), blocks: a.blocks, coverage: a.coverage, refused: a.refused, createdAt: new Date().toISOString(), updates: a.masteryUpdates },
      ]);
      const first = a.blocks.flatMap((b) => b.citations)[0];
      if (first) setActive(first);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-paper">
      {/* Chat area */}
      <section className="flex h-full w-full flex-col border-r border-rule lg:w-[60%]">
        <header className="flex items-center justify-between border-b border-rule bg-surface p-6">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Personal Tutor</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-graphite">
              {learner ? `${learner.name} · answers only from your sources` : "Pick a learner"}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-proof/10 px-3 py-1 text-xs font-bold text-proof" title="Explanations adapt to your per-topic mastery; what you say updates it.">
            <span className="h-2 w-2 animate-pulse rounded-full bg-proof" />
            Adaptive Mode
          </span>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {messages.length === 0 && !sending && (
            <p className="mx-auto max-w-md pt-16 text-center text-sm text-graphite">
              Ask anything about your course material. Answers cite the exact page, slide or timestamp; anything your sources don&apos;t cover is declined or clearly marked.
            </p>
          )}
          {messages.map((msg) =>
            msg.role === "USER" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-none bg-proof p-4 text-white">
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[85%] space-y-3 rounded-2xl rounded-tl-none border border-rule bg-surface p-4 shadow-sm">
                  {msg.coverage && (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${COVERAGE[msg.coverage].className}`}>{COVERAGE[msg.coverage].label}</span>
                  )}
                  {(msg.blocks ?? [{ origin: "outside", text: msg.content, citations: [] } as TutorBlock]).map((b, i) => (
                    <Block key={i} block={b} onCite={setActive} active={active} />
                  ))}
                  {msg.updates && msg.updates.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t border-rule pt-2">
                      {msg.updates.map((u) => (
                        <span key={u.topicId} className={`font-mono text-[10px] ${u.after >= u.before ? "text-verified" : "text-proof"}`}>
                          {u.after >= u.before ? "▲" : "▼"} {u.topicName} {Math.round(u.before * 100)}% → {Math.round(u.after * 100)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {sending && <p className="animate-pulse text-sm text-graphite" role="status">Searching your material and writing a cited answer…</p>}
          {error && <p role="alert" className="text-sm text-proof">{error}</p>}
          <div ref={bottom} />
        </div>

        <footer className="border-t border-rule bg-surface p-6">
          <form
            className="relative mx-auto max-w-4xl"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the material..."
              maxLength={2000}
              disabled={!learner}
              className="w-full rounded-2xl border border-rule bg-paper p-4 pr-24 font-body transition-all focus:outline-none focus:ring-2 focus:ring-proof/50"
            />
            <button disabled={sending || !input.trim() || !learner} className="absolute bottom-2 right-2 top-2 rounded-xl bg-proof px-4 text-white transition-opacity hover:opacity-90 disabled:opacity-40">
              <span className="text-sm font-bold">{sending ? "…" : "Send"}</span>
            </button>
          </form>
        </footer>
      </section>

      {/* Grounding panel */}
      <aside className="hidden h-full w-[40%] flex-col bg-surface lg:flex">
        <header className="border-b border-rule p-6">
          <h2 className="font-display text-lg font-bold text-ink">Material Grounding</h2>
          <p className="text-xs text-graphite">The cited source, opened at the exact page, slide or timestamp</p>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {active ? (
            <CitationViewer citation={active} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center space-y-4 p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-graphite/10 text-graphite">
                <BookOpenIcon size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">No active citation</p>
                <p className="text-xs text-graphite">Select a source tag in the chat to view the material here.</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
