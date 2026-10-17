"use client";
// Flashcards (Module 21): study the active notebook's cards, per topic. Each card is generated from
// the topic's own excerpts, checked by a second model, and cited; reviews are spaced (Leitner boxes)
// and the self-check updates the topic's mastery at reduced weight.
import type { Citation, FlashcardDeck, FlashcardView, MasteryUpdate } from "@sc/schemas";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CitationViewer } from "@/components/citation-viewer";
import { useLearner } from "@/components/learner";
import { Locator } from "@/components/locator";
import { api, errorText } from "@/lib/api";

const BOX_LABEL = ["", "new", "learning", "familiar", "known", "mastered"];
const pct = (p: number) => `${Math.round(p * 100)}%`;

function when(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `in ${h} h`;
  return `in ${Math.round(h / 24)} days`;
}

export default function FlashcardsPage() {
  const { learner } = useLearner();
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [topicId, setTopicId] = useState<string | undefined>(undefined);
  const [ahead, setAhead] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [source, setSource] = useState<Citation | null>(null);
  const [busy, setBusy] = useState<"generate" | "review" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<MasteryUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((t?: string) => api.listFlashcards(t).then(setDeck).catch((e) => setError(errorText(e))), []);
  useEffect(() => {
    if (!learner) return;
    void load(topicId);
  }, [learner, topicId, load]);

  // The server orders due cards first and counts them, so the due queue is the deck's first `due` cards.
  const queue: FlashcardView[] = useMemo(() => (!deck ? [] : ahead ? deck.cards : deck.cards.slice(0, deck.due)), [deck, ahead]);
  const card = queue[index] ?? null;

  function pickTopic(id?: string) {
    setTopicId(id);
    setIndex(0);
    setFlipped(false);
    setSource(null);
    setAhead(false);
    setNote(null);
  }

  async function generate() {
    const target = topicId ?? deck?.topics.find((t) => t.total === 0)?.topicId ?? deck?.topics[0]?.topicId;
    if (!target) return;
    setBusy("generate");
    setNote(null);
    setError(null);
    try {
      const r = await api.generateFlashcards({ topicId: target });
      setNote(`${r.added} new card${r.added === 1 ? "" : "s"} added${r.rejected ? ` · ${r.rejected} dropped by the accuracy checks` : ""}.`);
      setTopicId(target);
      setDeck(r.deck);
      setIndex(0);
      setFlipped(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const review = useCallback(
    async (knew: boolean) => {
      if (!card || busy) return;
      setBusy("review");
      try {
        const r = await api.reviewFlashcard(card.id, knew);
        setLastUpdate(r.mastery);
        setFlipped(false);
        setSource(null);
        const fresh = await api.listFlashcards(topicId);
        setDeck(fresh);
        setIndex(0);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(null);
      }
    },
    [card, busy, topicId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === "1") void review(false);
      else if (flipped && e.key === "2") void review(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped, review]);

  if (error && !deck) return <main className="mx-auto max-w-3xl p-8 text-proof">{error}</main>;
  if (!deck) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-6 p-8">
        <div className="h-10 w-56 animate-pulse rounded-card bg-surface" />
        <div className="h-80 w-full animate-pulse rounded-3xl bg-surface" />
      </main>
    );
  }
  if (deck.topics.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">No topics yet</h1>
        <p className="mt-3 text-graphite">Flashcards are made from your material, topic by topic. Add sources and build the topics first.</p>
        <Link href="/sources" className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 text-sm font-bold text-paper hover:opacity-85">Go to Sources</Link>
      </main>
    );
  }

  const selected = deck.topics.find((t) => t.topicId === topicId);
  const target = selected ?? deck.topics.find((t) => t.total === 0) ?? deck.topics[0];
  const nextDue = deck.cards.length ? deck.cards.map((c) => c.dueAt).sort()[0] : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-ink">Flashcards</h1>
          <p className="mt-1 text-graphite">Made from your own material, checked by a second AI model, spaced so you review just before you forget.</p>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy !== null}
          className="rounded-full bg-proof px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy === "generate" ? "Writing and checking cards…" : target?.total ? `More cards: ${target.name}` : `Make cards: ${target?.name ?? ""}`}
        </button>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Topics">
        <button type="button" onClick={() => pickTopic(undefined)} aria-pressed={!topicId} className={`rounded-full border px-4 py-1.5 text-sm ${!topicId ? "border-ink bg-ink text-paper" : "border-rule-strong bg-surface text-graphite hover:text-ink"}`}>
          All topics · {deck.topics.reduce((n, t) => n + t.due, 0)} due
        </button>
        {deck.topics.map((t) => (
          <button key={t.topicId} type="button" onClick={() => pickTopic(t.topicId)} aria-pressed={topicId === t.topicId} className={`rounded-full border px-4 py-1.5 text-sm ${topicId === t.topicId ? "border-ink bg-ink text-paper" : "border-rule-strong bg-surface text-graphite hover:text-ink"}`}>
            {t.name} · {t.due}/{t.total}
          </button>
        ))}
      </nav>

      {note && <p role="status" className="rounded-2xl border border-verified/30 bg-verified-ground px-4 py-3 text-sm text-verified-ink">{note}</p>}
      {error && <p role="alert" className="text-sm text-proof">{error}</p>}
      {lastUpdate && (
        <p className="text-sm text-graphite">
          {lastUpdate.topicName} mastery {pct(lastUpdate.before)} → <span className={lastUpdate.after >= lastUpdate.before ? "text-verified" : "text-proof"}>{pct(lastUpdate.after)}</span>
        </p>
      )}

      {card ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between text-xs text-graphite">
            <span className="font-mono uppercase tracking-widest">{ahead ? "Studying ahead" : `${queue.length} due`} · {card.topicName}</span>
            <span className="font-mono uppercase tracking-widest">box {card.box} · {BOX_LABEL[card.box]}</span>
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Show the question" : "Show the answer"}
            className="block w-full text-left [perspective:1600px]"
          >
            <div className="relative h-80 w-full transition-transform duration-500 [transform-style:preserve-3d] sm:h-72" style={{ transform: flipped ? "rotateY(180deg)" : "none" }}>
              <div className="absolute inset-0 flex flex-col justify-between rounded-3xl border-2 border-rule bg-surface p-8 shadow-sm [backface-visibility:hidden]">
                <p className="font-mono text-xs uppercase tracking-widest text-proof">Question</p>
                <p className="font-display text-2xl font-bold leading-snug text-ink sm:text-3xl">{card.front}</p>
                <p className="text-xs text-graphite">Tap or press Space to flip</p>
              </div>
              <div className="absolute inset-0 flex flex-col justify-between rounded-3xl border-2 border-ink bg-ink p-8 text-paper shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <p className="font-mono text-xs uppercase tracking-widest text-paper/60">Answer</p>
                <p className="text-xl leading-relaxed sm:text-2xl">{card.back}</p>
                <p className="text-xs text-paper/60">From your material · tap to flip back</p>
              </div>
            </div>
          </button>

          {flipped && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-graphite">
                <span>Source:</span>
                {card.citations.map((c) => (
                  <button key={c.chunkId} type="button" onClick={() => setSource(source?.chunkId === c.chunkId ? null : c)} className={`rounded border px-2 py-1 ${source?.chunkId === c.chunkId ? "border-proof bg-proof-ground" : "border-rule bg-surface hover:border-proof"}`}>
                    <Locator citation={c} /> <span className="font-mono text-[11px] text-graphite">{c.filename}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={busy !== null} onClick={() => void review(false)} className="rounded-2xl border-2 border-proof bg-proof-ground py-4 text-base font-bold text-proof-ink hover:opacity-90 disabled:opacity-50">
                  Again <span className="font-mono text-xs opacity-70">(1)</span>
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void review(true)} className="rounded-2xl border-2 border-verified bg-verified-ground py-4 text-base font-bold text-verified-ink hover:opacity-90 disabled:opacity-50">
                  Knew it <span className="font-mono text-xs opacity-70">(2)</span>
                </button>
              </div>
              {source && (
                <div className="rounded-3xl border border-rule bg-surface p-5">
                  <CitationViewer key={source.chunkId} citation={source} />
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-rule bg-surface p-10 text-center">
          {deck.total === 0 ? (
            <>
              <p className="font-display text-2xl font-bold text-ink">No cards yet{selected ? ` for ${selected.name}` : ""}</p>
              <p className="mt-2 text-graphite">Make a set: about 8 cards from this topic&apos;s material, each checked against its source before you see it.</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-ink">All caught up 🎉</p>
              <p className="mt-2 text-graphite">{nextDue ? `Next review ${when(nextDue)}.` : ""} Cards you know come back less often.</p>
              <button type="button" onClick={() => { setAhead(true); setIndex(0); }} className="mt-6 rounded-full border border-rule-strong px-5 py-2 text-sm font-bold text-ink hover:bg-paper">Study ahead anyway</button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
