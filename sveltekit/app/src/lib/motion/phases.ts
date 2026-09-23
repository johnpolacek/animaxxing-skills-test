/*
 * Shared lifecycle vocabulary.
 *
 * mount -> initial -> intro -> settled -> outro -> end -> unmount
 *
 * The current phase lives on `data-phase` of the route content wrapper and is
 * the single source of truth: nothing infers a phase from opacity, DOM
 * presence, or timeline progress.
 */

export type Phase = "initial" | "intro" | "settled" | "outro" | "end";

/**
 * How a page arrives. `fresh` is a requested navigation or the first document:
 * the full staggered rise. `return` is back or forward: intro only, without
 * travel, because the reader is coming back to something already seen.
 */
export type Arrival = "fresh" | "return";

/** Set by the inline pre-paint script in `src/app.html`. */
export const MOTION_ATTRIBUTE = "data-motion";
/** Set by the layout controller so the pre-paint failsafe stands down. */
export const MOTION_LIVE_ATTRIBUTE = "data-motion-live";

/** How far intro targets rise, in pixels. */
export const INTRO_RISE = 24;
/** How far outro targets drift, in pixels. */
export const OUTRO_DRIFT = 16;

/** 0.4s of travel plus two 0.1s steps of stagger is the ~600ms asked for. */
export const INTRO_DURATION = 0.4;
export const INTRO_STAGGER = 0.1;
/** 0.34s plus two 0.03s steps is the ~350ms asked for. */
export const OUTRO_DURATION = 0.34;
export const OUTRO_STAGGER = 0.03;

/**
 * Seconds into the outro at which the curtain starts to close, so the panels
 * arrive as the last item fades rather than after it.
 */
export const CURTAIN_LEAD = 0.25;

/**
 * How long the controller waits for an outro before navigating anyway. GSAP's
 * ticker stops in a hidden tab, so a click from a background tab must not
 * strand the navigation behind a timeline that is not advancing. Long enough
 * for the curtain, which closes over the tail of the item exit.
 */
export const OUTRO_TIMEOUT = 2500;

/**
 * True when the OS asks for reduced motion. Read through one helper so every
 * timeline and the inline script consult the same question.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when the pre-paint mark is gone, which means the failsafe in
 * `src/app.html` released the page because the bundle arrived too late, or the
 * script never set the mark at all. The content is already on screen, so
 * hiding it again to play an intro would be worse than skipping the travel.
 */
export function motionReleased(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) !== "js";
}

/**
 * Resolve when `promise` settles, or when `ms` elapses, whichever is first.
 *
 * A killed timeline never runs its completion, and a paused ticker never
 * advances one, so nothing that gates a navigation may await an outro alone.
 */
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}
