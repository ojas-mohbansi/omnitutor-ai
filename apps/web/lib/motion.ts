"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

/**
 * The one place motion is configured.
 *
 * `"use client"` is on this module rather than on each consumer because it
 * touches `window` at import time when the plugin registers. Importing it from
 * a server component should fail loudly instead of crashing at render.
 */

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Shared motion constants.
 *
 * `ease` is a decelerating curve rather than a linear or ease-in-out one, and
 * `distance` is small on purpose: this page has exactly one orchestrated
 * reveal, and it should read as the page settling rather than as an entrance
 * animation. Every value animates `transform` and `opacity` only, so nothing
 * here triggers layout or paint of the surrounding content.
 */
export const MOTION = {
  ease: "power2.out",
  duration: 0.7,
  stagger: 0.075,
  distance: 18,
} as const;

/*
 * Reduced motion is deliberately NOT exposed as a React hook here.
 *
 * A visitor's preference is unknowable to the server, so any hook built on
 * useSyncExternalStore has to report `false` while hydrating. That is one render
 * of `false` for every visitor, including those who asked for less motion, and
 * a motion module that arms a timeline on that first render arms it for the
 * wrong people. The consumers read the preference through gsap.matchMedia()
 * inside their effect instead: it answers in the browser at the moment the
 * timeline would be built, and it reverts itself if the preference changes.
 */
