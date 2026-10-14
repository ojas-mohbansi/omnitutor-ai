import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountControl, LearnerGate, LearnerProvider } from "@/components/learner";
import "./globals.css";

/* Three voices, one job each:
   - Fraunces carries the display voice (folio headlines, section rules, the
     large numerals on the report). Its variable `opsz` axis holds up at display
     sizes.
   - Instrument Sans is the interface and body face.
   - JetBrains Mono is the locator voice: pages, slides and timestamps only.

   All three are self-hosted: the WOFF2 files live in `public/fonts` and are
   wired up by the `@font-face` rules in globals.css, with their OFL licenses in
   `public/fonts/licenses`. No font CDN is contacted at build time or at
   runtime, so the family variables those utilities need are declared in CSS
   rather than injected here. */

/* Preload the two faces above the fold so the display and body type are ready
   before first paint. `crossOrigin` is required for font preloads. */
const PRELOADED_FONTS = [
  "/fonts/fraunces-latin.woff2",
  "/fonts/instrument-sans-latin.woff2",
] as const;

export const metadata: Metadata = {
  title: "Omnitutor: tutoring grounded in your own course material",
  description:
    "Upload a lecture video, a textbook chapter and a slide deck. Ask questions and get answers that cite the exact page, slide or timestamp, with verified adaptive quizzes and a per-topic mastery model.",
};

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tutor", label: "Tutor" },
  { href: "/quiz", label: "Quiz" },
  { href: "/sources", label: "Sources" },
] as const;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className="h-full"
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <LearnerProvider>
        {PRELOADED_FONTS.map((href) => (
          <link
            key={href}
            rel="preload"
            as="font"
            type="font/woff2"
            href={href}
            crossOrigin="anonymous"
          />
        ))}

        {/* Keyboard users reach the content without tabbing the whole header
            (WCAG 2.4.1). Hidden until focused. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:border focus:border-rule-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-meta focus:text-ink"
        >
          Skip to content
        </a>

        {/* Fixed, pointer-events-none: the substrate never repaints with scroll
            content, so it costs no compositing work while scrolling. */}
        <div className="substrate" aria-hidden="true" />

        <header className="sticky top-0 z-30 border-b border-rule bg-paper">
          <div className="mx-auto flex h-14 w-full max-w-[68rem] items-center justify-between px-4 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              {/* The pilcrow: the typographic mark for an annotated passage. */}
              <span
                aria-hidden="true"
                className="locator flex h-6 w-6 items-center justify-center rounded-card bg-ink text-paper"
              >
                ¶
              </span>
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
                Omnitutor
              </span>
            </Link>

            <nav aria-label="Main" className="flex items-center gap-3">
              <ul className="flex items-center gap-1 sm:gap-2">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-6 items-center rounded-card px-2.5 py-1.5 text-meta text-graphite transition-colors duration-200 ease-ledger hover:bg-surface hover:text-ink sm:px-3"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Suspense fallback={<span className="h-8 w-20" aria-hidden="true" />}>
                <AccountControl />
              </Suspense>
            </nav>
          </div>
        </header>

        <div id="content" className="relative z-10 flex flex-1 flex-col">
          <Suspense fallback={<main className="mx-auto w-full max-w-3xl p-8 text-graphite">Loading…</main>}>
            <LearnerGate>{children}</LearnerGate>
          </Suspense>
        </div>
        </LearnerProvider>
      </body>
    </html>
  );
}
