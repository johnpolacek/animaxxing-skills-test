/**
 * Shared lifecycle vocabulary.
 *
 * mount -> initial -> intro -> settled -> outro -> end -> unmount
 *
 * The current phase lives on `data-phase` of the page content wrapper and is
 * the single source of truth. Nothing infers a phase from opacity, DOM
 * presence, or timeline progress.
 */
export type Phase = "initial" | "intro" | "settled" | "outro" | "end";

/**
 * `fresh` is a push or a first load: the full staggered rise.
 * `return` is a traverse: intro only, no travel, because the user is coming
 * back to a page they have already read.
 */
export type Arrival = "fresh" | "return";

/** Set on `<html>` by the inline head script while JavaScript motion is live. */
export const MOTION_ATTRIBUTE = "data-motion";
/**
 * Set by this module as its first act. The inline script's failsafe leaves the
 * mark alone once it is present, so a page whose bundle merely arrived late is
 * still animated rather than released.
 */
export const MOTION_LIVE_ATTRIBUTE = "data-motion-live";

/** How far intro targets rise, in pixels. */
export const RISE = 24;
/** How far outro targets drift, in pixels. */
export const DRIFT = 16;

/** The OS preference, read per call so a change mid-session is respected. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when the pre-paint mark is not on the document: either the reader asked
 * for reduced motion, so the inline script never set it, or the failsafe
 * released it because this bundle arrived too late. Either way the content is
 * already on screen and hiding it again to play an intro would be worse than
 * arriving settled.
 */
export function motionReleased(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) !== "js";
}

/**
 * Run `step` in its own microtask, and return a way to cancel it.
 *
 * Phase changes must be observable one at a time. Writing two of them in a
 * single task would leave anything watching the attribute with only the last
 * value.
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
