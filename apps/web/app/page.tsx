import Link from "next/link";
import { LedgerReveal } from "@/components/ledger-reveal";
import { HeroCta, LiveGrounding, LiveSources, LiveStats, StudyHub } from "@/components/live-course";

/**
 * The landing surface.
 *
 * The evidence sections are live (components/live-course.tsx): the real sources,
 * topics and the selected learner's latest grounded answer. There is no local mock data and no shape
 * declared here: the specimen, the ledger rows and the grounding comparison
 * are all projections of the contract, so a change to the contract shows up on
 * the first screen rather than in a stale copy of it.
 *
 * A server component. The single client leaf is `LedgerReveal`, which owns the
 * page's one timeline and wraps only the sections that need it.
 */

/* The route is the seed for the whole page, so the lookups live here rather
   than inside the components below. */

const NEXT_STEPS = [
  {
    href: "/tutor",
    title: "Tutor",
    body: "Ask a question and read the answer beside the page, slide or timestamp it came from.",
  },
  {
    href: "/quiz",
    title: "Quiz",
    body: "Sit the diagnostic, then a quiz scoped to the topics you choose.",
  },
  {
    href: "/dashboard",
    title: "Dashboard",
    body: "Follow mastery per topic, the prerequisite chain, and what moved since last time.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* ------------------------------------------------------------------ */}
      {/* Opening spread: type against one piece of evidence, with a bare      */}
      {/* column between them. The empty gutter is the asymmetry.             */}
      {/* ------------------------------------------------------------------ */}
      {/* Signed in: where to go next comes first. */}
      <StudyHub />

      <section
        aria-labelledby="landing-hero"
        className="flex items-center px-4 py-14 sm:px-6 lg:py-24"
      >
        <div className="mx-auto grid w-full max-w-[68rem] grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h1
              id="landing-hero"
              className="font-display text-4xl leading-[1.04] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl"
            >
              Every answer shows its source.
            </h1>
            <p className="measure mt-6 text-body text-graphite">
              Upload a lecture, a textbook and a deck. Ask anything and get
              answers citing the exact page, slide or timestamp.
            </p>
            <HeroCta />
          </div>

          <LiveStats />
        </div>
      </section>

      <LedgerReveal>
        {/* ---------------------------------------------------------------- */}
        {/* The rule the tutor answers by: a claim either cites the material  */}
        {/* or it is labelled as coming from somewhere else.                  */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="landing-grounding"
          className="px-4 py-20 sm:px-6 lg:py-28"
        >
          <div
            data-reveal="rule"
            className="mx-auto h-px w-full max-w-[68rem] bg-rule"
          />
          <div className="mx-auto mt-12 w-full max-w-[68rem]">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-9 lg:col-start-3">
                <h2
                  id="landing-grounding"
                  data-reveal="item"
                  className="font-display text-display tracking-[-0.02em] text-ink"
                >
                  Where each answer comes from.
                </h2>
                <p
                  data-reveal="item"
                  className="measure mt-5 text-body text-graphite"
                >
                  Every block the tutor returns is labelled before it reaches
                  you. Material that cites your sources, or outside knowledge
                  with no citation at all. When nothing in the material covers
                  the question, the tutor declines instead of guessing.
                </p>
              </div>
            </div>

            <LiveGrounding />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* The ledger: one ruled row per source, locator held in its own      */}
        {/* mono gutter so the eye can run down the evidence.                  */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="landing-ledger"
          className="px-4 py-20 sm:px-6 lg:py-28"
        >
          <div
            data-reveal="rule"
            className="mx-auto h-px w-full max-w-[68rem] bg-rule"
          />
          <div className="mx-auto mt-12 w-full max-w-[68rem]">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-9 lg:col-start-3">
                <h2
                  id="landing-ledger"
                  data-reveal="item"
                  className="font-display text-display tracking-[-0.02em] text-ink"
                >
                  What each source can prove.
                </h2>
                <p
                  data-reveal="item"
                  className="measure mt-5 text-body text-graphite"
                >
                  Every source you add is cut into units that keep their origin:
                  a page, a slide or a timestamp. That locator is what each
                  citation opens.
                </p>
              </div>
            </div>

            <LiveSources />
          </div>
        </section>
      </LedgerReveal>

      {/* ------------------------------------------------------------------ */}
      {/* The three surfaces the loop continues into. Unequal columns rather   */}
      {/* than three cards of the same size.                                   */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="landing-next"
        className="px-4 py-20 sm:px-6 lg:py-24"
      >
        <div className="mx-auto h-px w-full max-w-[68rem] bg-rule" />
        <div className="mx-auto mt-12 w-full max-w-[68rem]">
          <h2
            id="landing-next"
            className="font-display text-display tracking-[-0.02em] text-ink"
          >
            Tutor, quiz, dashboard.
          </h2>
          <ul className="mt-10 grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:gap-x-8">
            {NEXT_STEPS.map((step, index) => (
              <li
                key={step.href}
                className={[
                  "border-t border-rule pt-6",
                  index === 0 ? "lg:col-span-5" : "",
                  index === 1 ? "lg:col-span-4" : "",
                  index === 2 ? "lg:col-span-3" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Link
                  href={step.href}
                  className="group inline-flex items-baseline gap-2"
                >
                  <span className="font-display text-title text-ink transition-colors duration-200 ease-ledger group-hover:text-proof">
                    {step.title}
                  </span>
                </Link>
                <p className="measure mt-3 text-body text-graphite">{step.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* A colophon, not a footer bar. */}
      <footer className="border-t border-rule px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-[68rem] flex-wrap items-baseline gap-x-6 gap-y-2 text-meta text-graphite">
          <p>Set in Fraunces, Instrument Sans and JetBrains Mono.</p>
          <p>
            Everything on this page is read live from your course. Manage it in{" "}
            <Link href="/sources" className="text-ink underline-offset-2 hover:underline">Sources</Link>.
          </p>
        </div>
      </footer>
    </main>
  );
}
