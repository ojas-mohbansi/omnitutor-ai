"use client";
import { ACCEPTED_EXTENSIONS, type SourceView, type TopicView } from "@sc/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { SendIcon, TrashIcon } from "@/components/icons";
import { Locator } from "@/components/locator";
import { ApiError, api, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";

const ACCEPT = Object.values(ACCEPTED_EXTENSIONS).join(",");
const STATUS_DOT: Record<SourceView["status"], string> = {
  READY: "bg-verified",
  PROCESSING: "bg-pending animate-pulse",
  PENDING: "bg-graphite/40",
  FAILED: "bg-proof",
};

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceView[] | null>(null);
  const [topics, setTopics] = useState<TopicView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildNote, setBuildNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.listSources(), api.listTopics()]);
      setSources(s);
      setTopics(t);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  // Initial load: state is set only in the promise callbacks (load() is for event handlers and polling).
  useEffect(() => {
    Promise.all([api.listSources(), api.listTopics()])
      .then(([s, t]) => {
        setSources(s);
        setTopics(t);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  // Poll while anything is being processed (ingestion runs in the background on the server).
  const processing = sources?.some((s) => s.status === "PROCESSING") ?? false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [processing, load]);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const { id } = await api.uploadSource(file);
        await api.ingestSource(id); // processing starts right away (spends Gemini quota; cached re-runs are free)
      } catch (e) {
        setError(`${file.name}: ${errorText(e)}`);
      }
    }
    setUploading(null);
    await load();
  }

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
      await load();
    }
  }

  async function build(force = false) {
    setBuilding(true);
    setBuildNote(null);
    try {
      const { topics: built } = await api.buildCourse(force ? { force: true } : {});
      setTopics(built);
      setBuildNote(`Built ${built.length} topics from your material.`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "not_ready" && /progress/i.test(e.message) && window.confirm(`${e.message}\n\nRebuild anyway?`)) {
        setBuilding(false);
        return build(true);
      }
      setBuildNote(errorText(e));
    } finally {
      setBuilding(false);
    }
  }

  const ready = sources?.filter((s) => s.status === "READY").length ?? 0;
  const topicName = new Map(topics.map((t) => [t.id, t.name]));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 p-8">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">Knowledge Base</h1>
          <p className="font-body text-graphite">Ingest lecture materials to build your personal tutoring model.</p>
        </div>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading !== null}
          className="rounded-full bg-proof px-6 py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Add New Source"}
        </button>
      </header>

      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />

      {/* Upload area */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center space-y-4 rounded-[3rem] border-2 border-dashed bg-surface p-12 text-center transition-colors ${dragOver ? "border-proof" : "border-rule hover:border-proof"}`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-paper shadow-sm transition-transform group-hover:scale-110">
          <SendIcon size={28} />
        </div>
        <div className="space-y-1">
          <p className="font-display text-lg font-bold text-ink">{uploading ? `Uploading ${uploading}…` : "Drop your materials here"}</p>
          <p className="text-sm text-graphite">Supports PDF, PPTX, and MP4 (up to 20 min). Processing starts automatically.</p>
        </div>
        <div className="flex gap-2 pt-4">
          {Object.keys(ACCEPTED_EXTENSIONS).map((t) => (
            <span key={t} className="rounded bg-graphite/10 px-2 py-1 font-mono text-[10px] text-graphite">{t === "VIDEO" ? "MP4" : t}</span>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-proof/30 bg-proof-ground p-4 text-meta text-proof-ink">
          {error}
        </p>
      )}

      {/* Sources list */}
      <section className="space-y-6">
        <h2 className="font-display text-xl font-bold">Ingested Materials</h2>
        {sources === null ? (
          <p className="text-meta text-graphite">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-meta text-graphite">No sources yet. Add a PDF, a slide deck or a lecture video.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sources.map((source) => (
              <div key={source.id} className="group flex items-center justify-between gap-4 rounded-2xl border border-rule bg-surface p-5 transition-colors hover:border-proof">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-rule bg-paper text-sm font-bold text-graphite">
                    {source.type === "VIDEO" ? "MP4" : source.type}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-ink transition-colors group-hover:text-proof">{source.filename}</p>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-graphite">
                      <span>{formatDate(source.createdAt)}</span>
                      <span>•</span>
                      <span>{source.chunkCount} chunks</span>
                      {source.status === "PROCESSING" && (
                        <>
                          <span>•</span>
                          <span>step {source.progressDone}/{source.progressTotal}</span>
                        </>
                      )}
                    </div>
                    {source.status === "FAILED" && source.error && <p className="text-xs text-proof">{source.error}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[source.status]}`} />
                    <span className="font-mono text-xs uppercase tracking-widest text-graphite">{source.status}</span>
                  </div>
                  {(source.status === "PENDING" || source.status === "FAILED") && (
                    <button
                      type="button"
                      disabled={busy[source.id]}
                      onClick={() => void act(source.id, () => api.ingestSource(source.id))}
                      className="rounded-full border border-rule-strong px-3 py-1 text-xs font-medium text-ink hover:border-proof disabled:opacity-50"
                    >
                      {source.status === "FAILED" ? "Retry" : "Process"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${source.filename}`}
                    disabled={busy[source.id] || source.status === "PROCESSING"}
                    onClick={() => window.confirm(`Delete ${source.filename} and its chunks?`) && void act(source.id, () => api.deleteSource(source.id))}
                    className="rounded-lg p-2 text-graphite transition-colors hover:bg-graphite/10 hover:text-ink disabled:opacity-30"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Course structure */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold">Course Topics</h2>
            <p className="text-meta text-graphite">Topics and prerequisites built from all ready sources; every chunk is tagged to one topic.</p>
          </div>
          <button
            onClick={() => void build()}
            disabled={building || ready === 0 || processing}
            className="rounded-full border border-rule-strong bg-surface px-5 py-2 text-sm font-medium hover:bg-graphite/5 disabled:opacity-40"
          >
            {building ? "Building…" : topics.length ? "Rebuild topics" : "Build topics"}
          </button>
        </div>
        {buildNote && <p className="text-meta text-graphite">{buildNote}</p>}
        {topics.length === 0 ? (
          <p className="text-meta text-graphite">{ready ? "Not built yet. Build topics once your sources are ready." : "Add and process sources first."}</p>
        ) : (
          <ol className="space-y-3">
            {topics.map((t) => (
              <li key={t.id} className="rounded-2xl border border-rule bg-surface p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium text-ink">
                    <span className="locator mr-2 text-graphite">T{t.seq}</span>
                    {t.name}
                  </p>
                  <span className="font-mono text-xs text-graphite">{t.chunkCount} chunks</span>
                </div>
                <p className="mt-1 text-meta text-graphite">{t.description}</p>
                {t.prereqIds.length > 0 && (
                  <p className="mt-2 text-xs text-graphite">Requires: {t.prereqIds.map((p) => topicName.get(p) ?? p).join(", ")}</p>
                )}
                {t.concepts.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Concepts in this topic">
                    {t.concepts.map((c) => (
                      <li key={c.label} className="rounded-full border border-rule px-3 py-1 text-xs text-ink" title={`${c.chunkCount} excerpt${c.chunkCount === 1 ? "" : "s"}`}>
                        {c.label}
                        {c.citations[0] && <span className="ml-2 text-graphite"><Locator citation={c.citations[0]} /></span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
