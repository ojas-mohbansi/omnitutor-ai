"use client";
// Sign in / create account. On success, goes to ?next= (same-site paths only) or the tutor.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLearner } from "@/components/learner";
import { errorText } from "@/lib/api";

function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return next.startsWith("/") && !next.startsWith("//") && next !== "/login" ? next : "/tutor";
}

export default function LoginPage() {
  const { learner, signIn, signOut } = useLearner();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "mt-1.5 h-11 w-full rounded-card border border-rule-strong bg-surface px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-proof/40";

  if (learner) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-title text-ink">Signed in as {learner.name}</h1>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => router.push(nextPath())} className="h-11 rounded-card bg-ink px-6 text-body text-paper transition-opacity hover:opacity-85 active:opacity-70">Continue</button>
          <button onClick={() => void signOut()} className="h-11 rounded-card border border-rule-strong px-6 text-body text-graphite transition-colors hover:bg-surface hover:text-ink">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="font-display text-title text-ink">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-2 text-meta text-graphite">
        Your account keeps your own tutor history, quizzes and mastery map. Course material is shared by everyone.
      </p>
      <form
        className="mt-8 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await signIn(mode, name, password);
            router.push(nextPath());
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <label className="block text-meta text-graphite">
          Name
          <input autoFocus required maxLength={60} autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block text-meta text-graphite">
          Password
          <input
            required
            type="password"
            minLength={8}
            maxLength={200}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          {mode === "signup" && <span className="mt-1 block text-xs">At least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="rounded-card border border-proof/40 bg-proof/5 px-3 py-2 text-meta text-proof">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-card bg-ink text-body text-paper transition-opacity hover:opacity-85 active:opacity-70 disabled:opacity-50">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-meta text-graphite">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="text-ink underline underline-offset-2 hover:text-proof"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </main>
  );
}
