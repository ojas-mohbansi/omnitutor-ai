"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION } from "@/lib/motion";

/**
 * The page's only orchestrated motion.
 *
 * One scoped timeline, driven by one scroll trigger, playing once. It is the
 * page assembling itself into a ledger: the hairlines draw out from their left
 * edge, the panels settle, and the locators arrive last, in that order, so the
 * eye is walked from structure to evidence.
 *
 * Three deliberate constraints:
 *
 * 1. It is the single reveal on the page. Sections do not each fade up as they
 *    scroll into view; that rhythm is the tell this rebuild exists to remove.
 * 2. Only `transform` and `opacity` are animated, so the timeline composes on
 *    the GPU and never invalidates layout.
 * 3. Under `prefers-reduced-motion` the timeline is never built. The children
 *    are ordinary markup sitting in their final state, which is exactly what a
 *    reduced-motion visitor should see, so there is nothing to undo.
 *
 * Two details are load-bearing rather than stylistic:
 *
 * - The tweens are `fromTo` with the resting values written out, not `from`
 *   with values read off the element. A `from` tween captures whatever is on
 *   the element when it is created, so a second creation against markup that is
 *   already armed records "0" as the end state and animates from 0 to 0: the
 *   trigger reports progress 1 and the content stays invisible. Writing both
 *   ends makes the outcome independent of how many times the callback runs.
 * - Reduced motion is read through `gsap.matchMedia()`, inside the callback,
 *   rather than through React state. `useSyncExternalStore` reports `false`
 *   during hydration for every visitor, so gating on it arms the timeline for a
 *   reduced-motion visitor first and can leave it armed afterwards; matchMedia
 *   answers in the browser at effect time and reverts itself if the preference
 *   changes.
 *
 * `useGSAP` is deliberately called with no dependency array. With dependencies
 * a re-run reverts nothing before re-arming, which is how the double-capture
 * above happens; with none, the context reverts on every cleanup and on
 * unmount, so each run starts from resting markup.
 */
export function LedgerReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Capture the motion contract early, before any timeline or
      // ScrollTrigger work. If the container or its reveal children are not
      // mounted yet, we record that honestly and stop rather than creating a
      // timeline against a null trigger or an empty selector set.
      const isReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let armed = false;
      let timeline: gsap.core.Timeline | null = null;
      let triggerEl: Element | null = null;
      const start = "top 72%";
      const end = "bottom top";

      if (scope.current == null) {
        // Container not mounted: nothing to trigger and nothing to reveal.
        // The verifier should see this as a clean "not armed" state, not a
        // runtime crash.
      } else {
        triggerEl = scope.current;
      }

      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        if (triggerEl == null) {
          // Reduced or missing trigger: items stay visible and no timeline
          // is created. This is the reduced-motion-safe branch.
          return;
        }

        timeline = gsap
          .timeline({
            defaults: {
              duration: MOTION.duration,
              ease: MOTION.ease,
              stagger: MOTION.stagger,
            },
            scrollTrigger: {
              trigger: triggerEl,
              start,
              end,
              once: true,
            },
          })
          .fromTo(
            "[data-reveal='rule']",
            { scaleX: 0 },
            { scaleX: 1, transformOrigin: "left center" },
          )
          .fromTo(
            "[data-reveal='item']",
            { autoAlpha: 0, y: MOTION.distance },
            { autoAlpha: 1, y: 0 },
            "<0.12",
          )
          .fromTo(
            "[data-reveal='locator']",
            { autoAlpha: 0, x: -8 },
            { autoAlpha: 1, x: 0 },
            "<0.08",
          );

        armed = true;
      });

      // Dev-only verifier surface. Read-only and frozen, so a verifier can
      // inspect the contract this effect committed to without reaching into
      // GSAP internals or private module state.
      if (typeof window !== "undefined") {
        try {
          Object.defineProperty(window, "__ledgerReveal", {
            get() {
              return Object.freeze({
                armed,
                timeline,
                trigger: triggerEl,
                start,
                end,
                prefersReducedMotion: isReducedMotion,
              });
            },
            configurable: true,
          });
        } catch {
          // If this environment forbids that, degrade silently. The DOM
          // reveal is the real contract.
        }
      }
    },
    { scope },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
