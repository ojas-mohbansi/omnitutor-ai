"use client";
import type { AssessmentKind, Quiz, QuizResponse, TopicView } from "@sc/schemas";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { GraduationCapIcon } from "@/components/icons";
import { useLearner } from "@/components/learner";
import { api, errorText } from "@/lib/api";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const DIFFICULTY = ["", "Easy", "Medium", "Hard"];

function QuizFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { learner } = useLearner();
  // Deep links from the dashboard: /quiz?kind=DIAGNOSTIC · /quiz?kind=MOCK · /quiz?topics=id1,id2
  // (topic ids are validated by the server). The quiz starts generating right away.
  const deepLink = useMemo((): { kind: AssessmentKind; topicIds?: string[] } | null => {
    const kind = params.get("kind");
    const ids = params.get("topics")?.split(",").filter(Boolean) ?? [];
    return kind === "DIAGNOSTIC" || kind === "MOCK" ? { kind } : ids.length ? { kind: "QUIZ", topicIds: ids } : null;
  }, [params]);
  const [topics, setTopics] = useState<TopicView[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(deepLink?.topicIds ?? []));
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [phase, setPhase] = useState<"setup" | "generating" | "answering" | "submitting">(() => (deepLink ? "generating" : "setup"));
  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, QuizResponse>>({});
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    api.listTopics().then(setTopics).catch((e) => setError(errorText(e)));
  }, []);

  /** The request itself; state changes only when it answers. */
  async function generate(learnerId: string, kind: AssessmentKind, topicIds?: string[]) {
    try {
      const q = await api.createQuiz({ learnerId, kind, ...(kind === "QUIZ" && { topicIds, count }) });
      setQuiz(q);
      setIdx(0);
      setResponses({});
      setPhase("answering");
    } catch (e) {
      setError(errorText(e));
      setPhase("setup");
    }
  }

  function start(kind: AssessmentKind, topicIds?: string[]) {
    if (!learner) return;
    setError(null);
    setPhase("generating");
    void generate(learner.id, kind, topicIds);
  }

  // A deep link starts once (phase already began as "generating").
  useEffect(() => {
    if (autoStarted.current || !learner || !deepLink) return;
    autoStarted.current = true;
    void generate(learner.id, deepLink.kind, deepLink.topicIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate reads `count` at call time; must not re-run
  }, [learner, deepLink]);

  async function submit() {
    if (!quiz) return;
    const unanswered = quiz.questions.filter((q) => !responses[q.id]).length;
    if (unanswered && !window.confirm(`${unanswered} question(s) unanswered; they count as wrong. Submit anyway?`)) return;
    setPhase("submitting");
    try {
      await api.submitQuiz(quiz.assessmentId, { responses: Object.entries(responses).map(([questionId, response]) => ({ questionId, response })) });
      router.push(`/quiz/${quiz.assessmentId}/report`);
    } catch (e) {
      setError(errorText(e));
      setPhase("answering");
    }
  }

  if (phase === "setup" || phase === "generating") {
    return (
      <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center bg-paper p-8 font-body">
        <div className="w-full max-w-3xl space-y-10">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-proof/10 text-proof">
              <GraduationCapIcon size={32} />
            </div>
            <h1 className="font-display text-4xl font-bold text-ink">Adaptive Assessment</h1>
            <p className="text-graphite">Questions come from your own material, are checked by a second, independent pass, and never repeat for you.</p>
          </div>
          {phase === "generating" ? (
            <p role="status" className="animate-pulse text-center text-graphite">Generating and verifying questions from your material… (about 10–15 s)</p>
          ) : topics.length === 0 ? (
            <p className="text-center text-graphite">No topics yet: add sources and build the course topics on the Sources page first.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button onClick={() => start("DIAGNOSTIC")} disabled={!learner} className="space-y-2 rounded-2xl border-2 border-rule bg-surface p-6 text-left transition-all hover:border-proof disabled:opacity-50">
                  <p className="font-display text-title text-ink">Diagnostic</p>
                  <p className="text-sm text-graphite">One question per topic ({topics.length}). Start here if you&apos;re new: it calibrates your mastery map.</p>
                </button>
                <button onClick={() => start("MOCK")} disabled={!learner} className="space-y-2 rounded-2xl border-2 border-rule bg-surface p-6 text-left transition-all hover:border-proof disabled:opacity-50">
                  <p className="font-display text-title text-ink">Mock exam</p>
                  <p className="text-sm text-graphite">10 questions across all topics, weighted toward your weakest, difficulty matched to your level.</p>
                </button>
              </div>
              <div className="space-y-4 rounded-2xl border border-rule bg-surface p-6">
                <p className="font-display text-title text-ink">Custom quiz</p>
                <div className="flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${picked.has(t.id) ? "border-proof bg-proof/5 text-ink" : "border-rule text-graphite hover:border-proof"}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2 text-sm text-graphite">
                    Questions
                    <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="w-16 rounded-card border border-rule bg-paper px-2 py-1 text-ink" />
                  </label>
                  <button onClick={() => start("QUIZ", [...picked])} disabled={!learner || picked.size === 0} className="rounded-full bg-workspace px-8 py-3 font-bold text-white transition-colors hover:bg-proof disabled:cursor-not-allowed disabled:opacity-30">
                    Start quiz
                  </button>
                </div>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-center text-sm text-proof">{error}</p>}
        </div>
      </main>
    );
  }

  const q = quiz!.questions[idx];
  const n = quiz!.questions.length;
  const response = responses[q.id];
  const setResponse = (r: QuizResponse | null) =>
    setResponses((all) => {
      const next = { ...all };
      if (r) next[q.id] = r;
      else delete next[q.id];
      return next;
    });

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center bg-paper p-8 font-body">
      <div className="w-full max-w-3xl space-y-12">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-graphite">Question {idx + 1} of {n}</span>
          <span className="font-mono text-xs font-bold text-proof">{q.topicName} · {DIFFICULTY[q.difficulty]}</span>
        </div>
        <div className="mx-auto h-1 w-full max-w-md overflow-hidden rounded-full bg-rule">
          <div className="h-full bg-proof transition-all duration-500" style={{ width: `${((idx + 1) / n) * 100}%` }} />
        </div>

        <div className="space-y-8 text-center">
          <h2 className="font-display text-2xl font-bold leading-tight text-ink md:text-3xl">{q.stem}</h2>

          {q.type === "MCQ" && (
            <div className="grid grid-cols-1 gap-4 text-left md:grid-cols-2">
              {q.options.map((opt, i) => {
                const selected = response?.type === "MCQ" && response.index === i;
                return (
                  <button
                    key={i}
                    onClick={() => setResponse({ type: "MCQ", index: i })}
                    className={`rounded-2xl border-2 p-6 text-left transition-all ${selected ? "border-proof bg-proof/5 text-ink ring-2 ring-proof/20" : "border-rule bg-surface text-ink hover:border-proof"}`}
                  >
                    <div className="flex items-start gap-4">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? "border-proof bg-proof text-white" : "border-rule bg-transparent text-graphite"}`}>{LETTERS[i]}</span>
                      <span className="text-sm leading-relaxed">{opt}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {q.type === "NUMERIC" && (
            <label className="mx-auto flex max-w-xs items-center gap-3">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={response?.type === "NUMERIC" ? response.value : ""}
                onChange={(e) => setResponse(e.target.value === "" ? null : { type: "NUMERIC", value: Number(e.target.value) })}
                placeholder="Your answer"
                className="w-full rounded-2xl border-2 border-rule bg-surface p-4 text-center text-lg focus:border-proof focus:outline-none"
              />
              {q.unit && <span className="font-mono text-graphite">{q.unit}</span>}
            </label>
          )}
          {q.type === "SHORT" && (
            <textarea
              value={response?.type === "SHORT" ? response.text : ""}
              onChange={(e) => setResponse(e.target.value.trim() ? { type: "SHORT", text: e.target.value } : null)}
              rows={4}
              maxLength={2000}
              placeholder="Answer in one to three sentences"
              className="w-full rounded-2xl border-2 border-rule bg-surface p-4 text-sm leading-relaxed focus:border-proof focus:outline-none"
            />
          )}

          <div className="flex justify-center gap-4 pt-4">
            <button onClick={() => setIdx((i) => i - 1)} disabled={idx === 0} className="rounded-full border border-rule-strong px-8 py-3 font-bold text-ink disabled:opacity-30">
              Back
            </button>
            {idx < n - 1 ? (
              <button onClick={() => setIdx((i) => i + 1)} className="rounded-full bg-workspace px-10 py-3 font-bold text-white transition-colors hover:bg-proof">
                Next
              </button>
            ) : (
              <button onClick={() => void submit()} disabled={phase === "submitting"} className="rounded-full bg-proof px-10 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                {phase === "submitting" ? "Grading…" : "Submit quiz"}
              </button>
            )}
          </div>
          <p className="text-xs text-graphite">{Object.keys(responses).length} of {n} answered · feedback with citations comes in the report</p>
          {error && <p role="alert" className="text-sm text-proof">{error}</p>}
        </div>
      </div>
    </main>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<main className="p-8 text-graphite">Loading…</main>}>
      <QuizFlow />
    </Suspense>
  );
}
