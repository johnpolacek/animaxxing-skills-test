/*
 * Shared lifecycle vocabulary.
 *
 * Plain module, not `.client`: the pre-paint script is rendered on the server
 * and needs the attribute name from here.
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
/** Set by the boundary to tell the pre-paint failsafe that a controller arrived. */
export const LIVE_ATTRIBUTE = "data-motion-live";
/** How long the pre-paint mark may stand before the failsafe releases it. */
export const FAILSAFE_MS = 900;

/**
 * True when the OS asks for reduced motion. Read through one helper so every
 * timeline consults the same answer.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when the pre-paint mark is gone, which means the failsafe released the
 * page because the client bundle arrived too late. The content is already on
 * screen, so hiding it again to play an intro would be worse than skipping the
 * travel.
 */
export function motionReleased(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) !== "js";
}

/**
 * True when this document itself was reached by back or forward. The router
 * reports the first location of any document as a `POP`, so it cannot tell a
 * reload from a return; the navigation timing entry can.
 */
export function documentRestored(): boolean {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === "back_forward";
}

/** `/gallery/` and `/gallery` are the same route. */
export function routeOf(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

/**
 * Run `step` in its own microtask.
 *
 * Phase changes must be observable one at a time. Writing two of them in a
 * single task would leave anything watching the attribute with only the last
 * value. It also puts the intro after `<ScrollRestoration>`, whose layout
 * effect runs in the same commit.
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
