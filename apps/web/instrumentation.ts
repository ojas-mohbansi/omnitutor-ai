// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    // A server restart kills in-flight ingestion jobs: mark them FAILED so they can be re-run.
    const { recoverInterruptedSources } = await import("@sc/core");
    const n = await recoverInterruptedSources();
    if (n) console.warn(`[ingest] marked ${n} interrupted source(s) as FAILED`);
  } catch (e) {
    console.error("[ingest] startup recovery skipped:", e instanceof Error ? e.message : e);
  }
}
