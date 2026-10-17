import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnerGate, LearnerProvider } from "@/components/learner";
import { SiteHeader } from "@/components/site-header";
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

        <Suspense fallback={<div className="h-16 border-b border-rule bg-paper" aria-hidden="true" />}>
          <SiteHeader />
        </Suspense>

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
