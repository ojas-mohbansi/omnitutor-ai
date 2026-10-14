"use client";
// Opens a citation at its exact origin: PDF at the page (browser viewer, #page=N), the lecture
// video seeked to the timestamp (served with HTTP Range), or a reconstructed slide card.
import { citationHref, paths, type Citation } from "@sc/schemas";
import { useEffect, useRef } from "react";
import { Locator } from "@/components/locator";

function VideoAt({ sourceId, tStart }: { sourceId: string; tStart: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seek = () => {
      v.currentTime = tStart;
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [tStart]);
  return <video ref={ref} src={paths.file(sourceId)} controls preload="metadata" className="w-full rounded-panel border border-rule bg-workspace" />;
}

export function CitationViewer({ citation }: { citation: Citation }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-meta text-graphite">{citation.filename}</span>
        <Locator citation={citation} />
      </div>

      {citation.sourceType === "PDF" && (
        <iframe
          key={citation.chunkId}
          src={citationHref(citation)}
          title={`${citation.filename}, page ${citation.page}`}
          className="aspect-[3/4] w-full rounded-panel border border-rule bg-paper"
        />
      )}
      {citation.sourceType === "VIDEO" && <VideoAt key={citation.sourceId} sourceId={citation.sourceId} tStart={citation.tStart} />}
      {citation.sourceType === "PPTX" && (
        <div className="flex aspect-video w-full flex-col justify-center gap-3 rounded-panel border border-rule-strong bg-surface p-6">
          <span className="locator text-graphite">Slide {citation.slide}</span>
          {citation.title && <p className="font-display text-title text-ink">{citation.title}</p>}
          <p className="text-meta text-graphite line-clamp-6">{citation.excerpt}</p>
        </div>
      )}

      <blockquote className="border-l-4 border-proof bg-paper p-4 text-meta leading-relaxed text-ink">
        {citation.title && <span className="mb-1 block font-medium">{citation.title}</span>}
        &ldquo;{citation.excerpt}&rdquo;
      </blockquote>
      {citation.sourceType !== "PPTX" && (
        <a href={citationHref(citation)} target="_blank" rel="noreferrer" className="inline-block text-meta text-proof underline-offset-2 hover:underline">
          Open in a new tab
        </a>
      )}
    </div>
  );
}
