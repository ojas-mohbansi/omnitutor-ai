import type { Citation } from "@sc/schemas";
import { formatLocator } from "@/lib/format";

/**
 * The locator for a citation: `p. 71`, `s. 14` or `06:42-07:27`.
 *
 * Mono is reserved for locators and machine numbers in this design system, and
 * `proof` is the one accent the palette reserves for provenance. This is the
 * only component that combines them, so the accent cannot creep into
 * decoration by accident: if something is vermilion on this page, it is a
 * citation, and there is a page, a slide or a timestamp behind it.
 *
 * No state, so it stays a server component.
 */
export function Locator({
  citation,
  className,
}: {
  citation: Citation;
  className?: string;
}) {
  return (
    <span className={className ? `locator text-proof ${className}` : "locator text-proof"}>
      {formatLocator(citation)}
    </span>
  );
}
