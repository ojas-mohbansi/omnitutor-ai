"use client";
// Header notebook switcher (Module 18). Switching or creating a notebook changes the server-side
// active notebook, then reloads, so every page shows that notebook's sources, chats, quizzes and mastery.
import type { NotebookView } from "@sc/schemas";
import { useEffect, useState } from "react";
import { useLearner } from "@/components/learner";
import { api, errorText } from "@/lib/api";

const NEW = "__new__";
const DELETE = "__delete__";

export function NotebookSwitcher() {
  const { learner } = useLearner();
  const [notebooks, setNotebooks] = useState<NotebookView[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!learner) return;
    api.listNotebooks().then((l) => setNotebooks(l.notebooks)).catch(() => setNotebooks(null));
  }, [learner]);

  if (!learner || !notebooks) return null;
  const active = notebooks.find((n) => n.active);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      window.location.reload();
    } catch (e) {
      window.alert(errorText(e));
      setBusy(false);
    }
  }

  function onChange(value: string) {
    if (value === NEW) {
      const name = window.prompt("Name the new notebook after its subject (e.g. Computer Networks):")?.trim();
      if (name) void run(() => api.createNotebook({ name }));
      return;
    }
    if (value === DELETE) {
      if (active && window.confirm(`Delete the notebook "${active.name}" and everything in it (files, topics, tutor history, quizzes, mastery)? This cannot be undone.`)) {
        void run(() => api.deleteNotebook(active.id));
      }
      return;
    }
    if (value !== active?.id) void run(() => api.selectNotebook(value));
  }

  return (
    <label className="flex items-center gap-2 text-meta text-graphite">
      <span aria-hidden="true" title="Notebook">📓</span>
      <select
        aria-label="Notebook"
        value={active?.id ?? ""}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-52 rounded-full border border-rule-strong bg-surface px-3 text-meta text-ink focus:outline-none focus:ring-2 focus:ring-proof/40 disabled:opacity-50"
      >
        {notebooks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name} ({n.sourceCount})
          </option>
        ))}
        <option value={NEW}>+ New notebook…</option>
        <option value={DELETE}>Delete this notebook…</option>
      </select>
    </label>
  );
}
