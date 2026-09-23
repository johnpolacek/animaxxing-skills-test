/*
 * Shared lifecycle vocabulary.
 *
 * Imported by the transition hooks, the route middleware, the client plugin,
 * and by `nuxt.config.ts` (for the pre-paint script), so nothing in here may
 * touch Nuxt, Vue, or GSAP.
 */

/**
 * mount -> initial -> intro -> settled -> outro -> end -> unmount
 *
 * The current phase lives on `data-phase` of the page's root element. It is
 * the single source of truth: nothing infers a phase from opacity, DOM
 * presence, or timeline progress. Under `mode: "out-in"` the page component is
 * unmounted the moment the leave starts, so the attribute is written
 * imperatively on `el` rather than bound from component state, which would be
 * gone by the time the outro ends.
 */
export type Phase = "initial" | "intro" | "settled" | "outro" | "end";

/** How far intro targets rise, in pixels. */
export const INTRO_RISE = 24;
/** How far outro targets drift, in pixels. */
export const OUTRO_DRIFT = 16;

/** Intro: 0.4s of travel plus two 0.1s steps of stagger is the ~600ms asked for. */
export const INTRO_DURATION = 0.4;
export const INTRO_STAGGER = 0.1;
/** Outro: 0.34s plus two 0.03s steps is the ~350ms asked for. */
export const OUTRO_DURATION = 0.34;
export const OUTRO_STAGGER = 0.03;
/** Seconds before the outro's fade ends that the curtain starts to close over it. */
export const CURTAIN_OVERLAP = 0.15;

/** The mark the pre-paint script sets, and the CSS hiding rule is scoped to. */
export const MOTION_ATTRIBUTE = "data-motion";
/** Set by the client plugin so the pre-paint failsafe knows a controller arrived. */
export const LIVE_ATTRIBUTE = "data-motion-live";
/**
 * The root-level half of the pre-paint gate.
 *
 * Deliberately not `data-phase`: that attribute is the page's observable
 * lifecycle, one value at a time on one element, and a second copy of it on
 * `<html>` would be read as a page changing phase by anything watching the
 * document.
 */
export const ROOT_PHASE_ATTRIBUTE = "data-motion-phase";

/**
 * How long the pre-paint mark may hide content before the failsafe releases it.
 * Under the contract's 1.5s readability window with room for a slow parse.
 */
export const RELEASE_TIMEOUT = 900;
/**
 * A leave's `done` must fire even if GSAP's ticker is frozen, which is what a
 * hidden tab does to `requestAnimationFrame`. Every hook races its callback
 * against this.
 */
export const HOOK_TIMEOUT = 2000;

/**
 * The inline script that marks the document as JavaScript-animated before
 * anything paints. Rendered through `app.head.script` with
 * `tagPosition: "head"`, so it runs before the body is parsed.
 *
 * Under reduced motion the mark is never set: that path paints settled and the
 * lifecycle runs without travel, so hiding anything first would only be a
 * flicker.
 *
 * The timeout is the failsafe for the case the mark cannot cover: the document
 * arrives, this script runs, and the client bundle then never does. Releasing
 * the mark puts the page back to its no-JavaScript state rather than leaving
 * content hidden behind a lifecycle that will never start. A controller that
 * does arrive sets `data-motion-live` first and keeps the mark.
 *
 * Nuxt hydrates `#__nuxt`, not `<html>`, so these attributes cause no
 * hydration mismatch.
 */
export const PREPAINT_SCRIPT = `(function(){var r=document.documentElement;try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return}catch(e){}r.setAttribute("${MOTION_ATTRIBUTE}","js");r.setAttribute("${ROOT_PHASE_ATTRIBUTE}","initial");setTimeout(function(){if(!r.hasAttribute("${LIVE_ATTRIBUTE}")){r.removeAttribute("${MOTION_ATTRIBUTE}");r.removeAttribute("${ROOT_PHASE_ATTRIBUTE}")}},${RELEASE_TIMEOUT})})()`;

/**
 * Write a phase, but only when it is a change.
 *
 * Rewriting the same value would still notify anything watching the attribute
 * of a change that did not happen.
 */
export function setPhase(el: HTMLElement, phase: Phase): void {
  if (el.dataset.phase !== phase) el.dataset.phase = phase;
}

export function phaseOf(el: HTMLElement): Phase | undefined {
  return el.dataset.phase as Phase | undefined;
}

/** Everything one page animates. Queried live, never cached across phases. */
export function introTargets(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>("[data-intro]"));
}

/**
 * True when the OS asks for reduced motion. Read through one helper so every
 * timeline consults the same answer.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when the pre-paint mark is gone, which means the failsafe released the
 * page because JavaScript arrived too late. The content is already on screen,
 * so hiding it again to play an intro would be worse than skipping the travel.
 * Also true under reduced motion, where the mark is never set at all.
 */
export function motionReleased(): boolean {
  return document.documentElement.getAttribute(MOTION_ATTRIBUTE) !== "js";
}

/** No travel: reduced motion, or content the failsafe already revealed. */
export function shouldSkipTravel(): boolean {
  return prefersReducedMotion() || motionReleased();
}

/**
 * Run `step` in its own microtask.
 *
 * Phase changes must be observable one at a time, and the first one after a
 * node is inserted must not land in the same task as the insertion: anything
 * watching the attribute would then see only the later value. A microtask is
 * still before paint, so nothing is visible in between.
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

/**
 * A Vue transition hook's `done`, called once and never later than `timeout`.
 *
 * `done` is a contract: a leave that never calls it keeps the old root in the
 * DOM forever and, under `out-in`, never inserts the new page. Every builder
 * calls this from `onComplete` and from `onInterrupt`, since a killed timeline
 * never completes, and the timeout covers a tab that was hidden mid-transition
 * with GSAP's ticker frozen.
 */
export function settleOnce(done: () => void, timeout = HOOK_TIMEOUT): () => void {
  let called = false;
  const fire = () => {
    if (called) return;
    called = true;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(fire, timeout);
  return fire;
}
