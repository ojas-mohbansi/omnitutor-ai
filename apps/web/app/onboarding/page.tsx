"use client";
// Onboarding (Module 17): four quick, game-like questions that personalise the tutor's voice and
// explanations. Saved to the account (POST /api/profile); can be retaken any time from the Tutor.
import type { LearnerProfile } from "@sc/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLearner } from "@/components/learner";
import { api, errorText } from "@/lib/api";

type Key = keyof LearnerProfile;
type Option = { value: string; emoji: string; label: string; hint: string };

const STEPS: { key: Key; title: string; subtitle: string; options: Option[] }[] = [
  {
    key: "tone",
    title: "Pick your tutor's personality",
    subtitle: "How should your tutor talk to you?",
    options: [
      { value: "friendly", emoji: "😊", label: "Friendly", hint: "warm, encouraging, plain words" },
      { value: "funny", emoji: "😂", label: "Funny", hint: "jokes and silly analogies, facts stay exact" },
      { value: "serious", emoji: "🎓", label: "Serious", hint: "formal and precise, like a textbook" },
      { value: "concise", emoji: "⚡", label: "Straight to the point", hint: "shortest complete answer" },
    ],
  },
  {
    key: "style",
    title: "How do you learn best?",
    subtitle: "How should explanations be built?",
    options: [
      { value: "step_by_step", emoji: "🪜", label: "Step by step", hint: "small steps, one after another" },
      { value: "examples_first", emoji: "🧪", label: "Examples first", hint: "a concrete case, then the rule" },
      { value: "big_picture", emoji: "🗺️", label: "Big picture first", hint: "the main idea, then the details" },
    ],
  },
  {
    key: "level",
    title: "How well do you know this subject?",
    subtitle: "Your quizzes will refine this per topic.",
    options: [
      { value: "new", emoji: "🌱", label: "I'm new to it", hint: "define every term" },
      { value: "some", emoji: "🌿", label: "I've seen it before", hint: "recall the basics quickly" },
      { value: "confident", emoji: "🌳", label: "I'm confident", hint: "skip basics, go deep" },
    ],
  },
  {
    key: "goal",
    title: "What's your mission?",
    subtitle: "Every answer ends with what helps most.",
    options: [
      { value: "exam", emoji: "🎯", label: "Ace the exam", hint: "typical questions and common traps" },
      { value: "understand", emoji: "💡", label: "Really understand it", hint: "the why, not just the what" },
      { value: "revise", emoji: "🔁", label: "Quick revision", hint: "short recaps to remember" },
    ],
  },
];

const nameOf = (key: Key, value: string) => STEPS.find((s) => s.key === key)?.options.find((o) => o.value === value);

export default function OnboardingPage() {
  const { learner } = useLearner();
  const [answers, setAnswers] = useState<Partial<LearnerProfile>>({});
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Retaking: start from the saved answers.
  useEffect(() => {
    if (!learner) return;
    api.getProfile().then((v) => v.profile && setAnswers(v.profile)).catch(() => {});
  }, [learner]);

  async function choose(key: Key, value: string) {
    const next = { ...answers, [key]: value } as Partial<LearnerProfile>;
    setAnswers(next);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(next as LearnerProfile);
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (saved && answers.tone && answers.style && answers.level && answers.goal) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-proof">Profile complete · level 1 unlocked</p>
        <h1 className="mt-4 font-display text-4xl font-bold text-ink">Your tutor is ready, {learner?.name}</h1>
        <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
          {(Object.keys(answers) as Key[]).filter((k) => STEPS.some((s) => s.key === k)).map((k) => {
            const o = nameOf(k, answers[k] as string);
            return (
              <div key={k} className="rounded-2xl border border-rule bg-surface p-4">
                <p className="text-2xl">{o?.emoji}</p>
                <p className="mt-2 text-sm font-semibold text-ink">{o?.label}</p>
              </div>
            );
          })}
        </div>
        <p className="mx-auto mt-6 max-w-xl text-sm text-graphite">
          This sets how your tutor talks and explains. What it teaches still comes only from your material, and your quizzes keep measuring what you actually know.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/quiz?kind=DIAGNOSTIC" className="rounded-full bg-proof px-6 py-3 text-sm font-bold text-white hover:opacity-90">Take the diagnostic</Link>
          <Link href="/tutor" className="rounded-full border border-rule-strong bg-surface px-6 py-3 text-sm font-bold text-ink hover:bg-graphite/5">Meet your tutor</Link>
        </div>
      </main>
    );
  }

  const s = STEPS[step];
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-graphite">Step {step + 1} of {STEPS.length}</p>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="text-sm text-graphite underline-offset-2 hover:text-ink hover:underline">Back</button>
        )}
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rule">
        <div className="h-full rounded-full bg-proof transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <h1 className="mt-10 font-display text-4xl font-bold text-ink">{s.title}</h1>
      <p className="mt-2 text-graphite">{s.subtitle}</p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {s.options.map((o) => {
          const picked = answers[s.key] === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => void choose(s.key, o.value)}
              className={`rounded-2xl border-2 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-proof disabled:opacity-50 ${picked ? "border-proof bg-proof/5" : "border-rule bg-surface"}`}
            >
              <p className="text-3xl">{o.emoji}</p>
              <p className="mt-3 text-lg font-semibold text-ink">{o.label}</p>
              <p className="mt-1 text-sm text-graphite">{o.hint}</p>
            </button>
          );
        })}
      </div>
      {busy && <p role="status" className="mt-6 animate-pulse text-sm text-graphite">Saving your tutor…</p>}
      {error && <p role="alert" className="mt-6 text-sm text-proof">{error}</p>}
    </main>
  );
}
