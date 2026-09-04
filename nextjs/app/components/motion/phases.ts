/*
 * Shared lifecycle vocabulary.
 *
 * Deliberately not a client module: the inline pre-paint script is rendered on
 * the server and needs the attribute name from here. A "use client" module's
 * exports are client references, and reading one during server rendering hands
 * back undefined rather than the value.
 */

/**
 * mount -> initial -> intro -> settled -> outro -> end -> unmount
 *
 * The current phase lives on `data-phase` of the route content wrapper. It is
 * the single source of truth: nothing infers a phase from opacity, DOM
 * presence, or timeline progress.
 */
export type Phase = "initial" | "intro" | "settled" | "outro" | "end";

/** How far intro targets rise, in pixels. */
export const INTRO_RISE = 24;
/** How far outro targets drift, in pixels. */
export const OUTRO_DRIFT = 16;

export const MOTION_ATTRIBUTE = "data-motion";

/**
 * True when the OS asks for reduced motion. Read through one helper so every
 * timeline consults the same answer.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when the pre-paint mark is gone, which means the failsafe in
 * MotionScript released the page because JavaScript arrived too late. The
 * content is already on screen, so hiding it again to play an intro would be
 * worse than skipping the travel.
 */
export function motionReleased(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) !== "js";
}

/**
 * Run `step` in its own microtask.
 *
 * Phase changes must be observable one at a time. Writing two of them in a
 * single task would leave anything watching the attribute — a test, an
 * analytics hook, another controller — with only the last value.
 */
export function nextStep(step: () => void): () => void {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) step();
  });
  return () => {
    cancelled = true;
  };
}
