import type { Citation } from "@sc/schemas";

/**
 * Presentation helpers for values that come out of the contract.
 *
 * Everything here is pure and deterministic: no `Date.now()`, no locale from
 * the host, no rounding that depends on the runtime. The landing page renders
 * on the server first, so a value that formats differently on the client would
 * be a hydration mismatch rather than a cosmetic difference.
 */

/** Seconds into a lecture as `mm:ss`. Used for video locators only. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/**
 * The locator for a citation, in the shape that source type uses.
 *
 * `Citation` is a union discriminated by `sourceType`, and each member carries
 * exactly its own (required) locator, so switching on `sourceType` is total:
 * TypeScript proves every branch has its field, with no non-null assertions.
 */
export function formatLocator(citation: Citation): string {
  switch (citation.sourceType) {
    case "PDF":
      return `p. ${citation.page}`;
    case "PPTX":
      return `s. ${citation.slide}`;
    case "VIDEO":
      return `${formatClock(citation.tStart)}-${formatClock(citation.tEnd)}`;
  }
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** A file size in the largest unit that keeps it above one. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${FILE_SIZE_UNITS[unit]}`;
}

/* Fixed locale and time zone so the server and the client agree on the string. */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** An ISO timestamp as `11 Oct 2026`. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
