import type { TransitionProps } from "vue";
import { useGSAP } from "~/composables/useGSAP";
import {
  INTRO_DURATION,
  INTRO_RISE,
  INTRO_STAGGER,
  OUTRO_DRIFT,
  OUTRO_DURATION,
  OUTRO_STAGGER,
  ROOT_PHASE_ATTRIBUTE,
  introTargets,
  nextStep,
  phaseOf,
  setPhase,
  settleOnce,
  shouldSkipTravel,
} from "./phases";

/*
 * The page lifecycle for `<NuxtPage :transition="pageTransition">`.
 *
 * `mode: "out-in"` means Vue unmounts the outgoing page component before the
 * outro plays: no template refs, no component state, no reactivity. `el` is the
 * only handle any of this gets, so every phase is written on `el` and every
 * timeline is owned by this module rather than by a page.
 *
 * Where each phase actually runs:
 *
 * - First load. The hooks do not fire (no `appear`, which on server-rendered
 *   output would ship the page inside a <template> and leave it blank without
 *   JavaScript). The page's own `onMounted` calls `startFirstLoadIntro`.
 * - Outro. `runPageOutro`, awaited by the global route middleware, so the
 *   outro finishes *before* the router commits and the URL changes. By the
 *   time `onLeave` runs, the outgoing page is already at its end state and the
 *   hook only hands `done` over.
 * - Intro on navigation. `onBeforeEnter` writes the initial values before the
 *   root is inserted; `onEnter` plays; `onAfterEnter` settles focus.
 */

/** The page root that currently owns the screen. */
let livePage: HTMLElement | null = null;
/** The intro timeline for `livePage`, so an outro can interrupt it. */
let introTimeline: gsap.core.Timeline | null = null;
/** Cancels a queued phase step that has not run yet. */
let pendingStep: (() => void) | null = null;
/** An outro in flight, so a leave hook can wait for the one already running. */
let outroInFlight: Promise<void> | null = null;

/**
 * One navigation at a time.
 *
 * Set when a link is accepted, cleared when the destination arrives or the
 * navigation ends without one. The lock is checked in the link rather than in
 * a router guard on purpose: a guard that refuses the second navigation still
 * loses the first, because Vue Router has already replaced its pending
 * location and cancels the navigation that was waiting on our middleware. A
 * click that never reaches the router costs nothing.
 */
let locked = false;

/** Set by the client plugin from `history.listen`, consumed by the middleware. */
let historyTarget: string | null = null;

export function isNavigationLocked(): boolean {
  return locked;
}

export function lockNavigation(): void {
  locked = true;
}

export function unlockNavigation(): void {
  locked = false;
}

/** A popstate navigation is about to run the router. */
export function markHistoryNavigation(to: string): void {
  historyTarget = to;
}

/**
 * True when this navigation is the back or forward one the history listener
 * saw. Consumed either way, so a popstate that produced no page change (a hash
 * on the same route) cannot mislabel the next click.
 */
export function takeHistoryNavigation(fullPath: string): boolean {
  if (historyTarget === null) return false;
  const isHistory = historyTarget === fullPath;
  historyTarget = null;
  return isHistory;
}

function claim(el: HTMLElement): void {
  livePage = el;
  introTimeline = null;
  pendingStep?.();
  pendingStep = null;
}

/**
 * Initial state: in the DOM, laid out, start values applied, not yet shown.
 *
 * Written with `set`, never with a `from` tween, so it is correct on a node
 * that already holds settled values. `visibility` (through `autoAlpha`) keeps
 * the layout box, so revealing the content shifts nothing.
 */
function applyInitial(el: HTMLElement, skipTravel: boolean): void {
  const { gsap } = useGSAP();
  setPhase(el, "initial");
  if (skipTravel) return;
  gsap.set(introTargets(el), { autoAlpha: 0, y: INTRO_RISE });
}

/** Settled is CSS, not a held timeline: drop every temporary style. */
function settle(el: HTMLElement): void {
  const { gsap } = useGSAP();
  introTimeline = null;
  gsap.set(introTargets(el), { clearProps: "all" });
  setPhase(el, "settled");
}

/**
 * Intro: one timeline from the initial values to settled.
 *
 * The phase flip is deferred by a microtask so `initial` is observable on its
 * own, and so nothing starts moving in the same task the root was inserted in.
 * A microtask is still before paint.
 */
function playIntro(el: HTMLElement, done: () => void, skipTravel: boolean): void {
  const { gsap } = useGSAP();
  const finish = settleOnce(done);

  pendingStep = nextStep(() => {
    pendingStep = null;
    setPhase(el, "intro");

    if (skipTravel) {
      // No travel, but every phase still happens and every callback still runs.
      settle(el);
      finish();
      return;
    }

    introTimeline = gsap
      .timeline({
        onComplete: () => {
          settle(el);
          finish();
        },
        // A killed timeline never completes. The outro that killed it owns the
        // phases from here, so this only releases Vue's enter.
        onInterrupt: finish,
      })
      .set(introTargets(el), { willChange: "transform, opacity" })
      .to(introTargets(el), {
        autoAlpha: 1,
        y: 0,
        duration: INTRO_DURATION,
        stagger: INTRO_STAGGER,
        ease: "power2.out",
      });
  });
}

/**
 * First load is its own entry point to the same intro.
 *
 * Hydration is the mount, and it happens after the server HTML has painted, so
 * the initial state came from the pre-paint script and its CSS rule rather
 * than from GSAP. This writes the same start values as an inline style, then
 * releases the pre-paint gate before playing, so the handover is invisible.
 */
export function startFirstLoadIntro(el: HTMLElement): void {
  claim(el);
  const skipTravel = shouldSkipTravel();
  applyInitial(el, skipTravel);
  document.documentElement.removeAttribute(ROOT_PHASE_ATTRIBUTE);
  playIntro(el, () => {}, skipTravel);
}

/**
 * Outro: the current page fades out and drifts up, still in the DOM and still
 * laid out, and reaches its end state before anything else happens.
 *
 * Awaited by the route middleware, which runs before Vue Router commits, so
 * the URL is still the old one for the whole outro. That is the only place a
 * Nuxt navigation can be held: by `onLeave` the URL has already changed.
 */
export function runPageOutro(): Promise<void> {
  if (outroInFlight) return outroInFlight;
  const el = livePage;
  if (!el || phaseOf(el) === "end" || phaseOf(el) === "outro") return Promise.resolve();

  const { gsap } = useGSAP();
  outroInFlight = new Promise<void>((resolve) => {
    // An intro is not the inverse of the outro, so kill it and leave from
    // whatever is on screen rather than reversing.
    pendingStep?.();
    pendingStep = null;
    introTimeline?.kill();
    introTimeline = null;

    // Queried at leave time, so anything that arrived after the intro leaves
    // with the page.
    const targets = introTargets(el);
    setPhase(el, "outro");

    // End state: still in the DOM, final values applied, safe to remove. CSS
    // keys pointer-events off the phase, so no inline style is left to clean.
    const end = settleOnce(() => {
      setPhase(el, "end");
      resolve();
    });

    if (shouldSkipTravel()) {
      gsap.set(targets, { autoAlpha: 0 });
      pendingStep = nextStep(end);
      return;
    }

    gsap
      .timeline({ onComplete: end, onInterrupt: end })
      .set(targets, { willChange: "transform, opacity" })
      .to(targets, {
        autoAlpha: 0,
        y: -OUTRO_DRIFT,
        duration: OUTRO_DURATION,
        stagger: OUTRO_STAGGER,
        ease: "power2.in",
      });
  }).finally(() => {
    outroInFlight = null;
  });

  return outroInFlight;
}

/**
 * The hook set, with `css: false` so Vue adds no `*-enter-*` or `*-leave-*`
 * classes and waits for `done` instead of for `transitionend`. Without it a
 * leftover class rule would run a CSS transition on the property GSAP is
 * tweening.
 */
export const pageTransition: TransitionProps = {
  css: false,
  mode: "out-in",
  name: "page",

  onBeforeEnter(el) {
    // The incoming root exists with its children but is not in the document:
    // selectors work, measurement does not. Only values that need no layout.
    const root = el as HTMLElement;
    unlockNavigation();
    claim(root);
    applyInitial(root, shouldSkipTravel());
  },

  onEnter(el, done) {
    playIntro(el as HTMLElement, done, shouldSkipTravel());
  },

  onAfterEnter(el) {
    const root = el as HTMLElement;
    // Only when the intro actually reached settled: this also fires after an
    // intro that was killed by an outro, and that page is on its way out.
    if (phaseOf(root) !== "settled") return;
    // Never steal focus from a control the reader is using.
    if (document.activeElement === document.body) root.focus({ preventScroll: true });
  },

  onEnterCancelled(el) {
    const { gsap } = useGSAP();
    pendingStep?.();
    pendingStep = null;
    introTimeline?.kill();
    introTimeline = null;
    gsap.killTweensOf(introTargets(el as HTMLElement));
  },

  onLeave(el, done) {
    const root = el as HTMLElement;
    const finish = settleOnce(done);
    // The outro already ran, in the middleware, while the URL was still the
    // old one, so this normally resolves at once. It waits when something
    // reached the router another way and left an outro in flight, and it
    // leaves immediately for back and forward, which get the intro only.
    const outro = phaseOf(root) === "end" ? null : outroInFlight;
    if (!outro) {
      finish();
      return;
    }
    outro.then(finish, finish);
  },

  onAfterLeave(el) {
    const { gsap } = useGSAP();
    const root = el as HTMLElement;
    // `el` is out of the document. Nothing here may hold a reference to it.
    gsap.killTweensOf(introTargets(root));
    if (livePage === root) livePage = null;
  },
};
