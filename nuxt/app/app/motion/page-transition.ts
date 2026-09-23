import type { TransitionProps } from "vue";
import { useGSAP } from "~/composables/useGSAP";
import { captureShared, playShared, type SharedState } from "./layout-flip";
import { curtain, type Curtain } from "./page-covers";
import {
  CURTAIN_OVERLAP,
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
import { getScroller } from "./scroller";

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
 *
 * The shell's archetypes ride on the same phases. The smooth scroller is
 * stopped when an outro starts and started at settled. The curtain, created
 * once by `app.vue`, closes inside the outro and opens with the intro. A
 * shared element is captured on the outgoing root in `onBeforeLeave`, handed
 * off keyed by destination, and played onto its counterpart in `onEnter`.
 */

/** How a click asked to travel: an ordinary swap, behind the curtain, or with a shared element. */
export type TransitionRequest = { kind: "plain" } | { kind: "curtain" } | { kind: "shared"; element: HTMLElement };

type CurtainPhase = "idle" | "covering" | "covered" | "revealing";

/** A shared element captured on the outgoing page, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: SharedState };

/** What the incoming page's hooks need to know about the navigation that brought it. */
type Arrival = { history: boolean; curtain: boolean; handoff: Handoff | null };

const PLAIN: TransitionRequest = { kind: "plain" };
const ordinaryArrival = (): Arrival => ({ history: false, curtain: false, handoff: null });

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

/** What the accepted link asked for; the outro consumes it. */
let requested: TransitionRequest = PLAIN;
/** The element the outro left lit for a morph, captured once the leave begins. */
let keptElement: HTMLElement | null = null;
/** Written by the middleware for the page about to enter; `onBeforeEnter` takes it. */
let planned: Arrival = ordinaryArrival();
/** The arrival the live page is playing, until it settles or is cancelled. */
let arrival: Arrival = ordinaryArrival();

/** The curtain, owned by the shell and reported on its root for CSS and tests. */
let curtainRoot: HTMLElement | null = null;
let cover: Curtain | null = null;

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

/** What a link asks for: the curtain by opt-in, a morph when the link carries a shared element. */
export function transitionFor(anchor: HTMLElement, kind?: "curtain"): TransitionRequest {
  if (kind === "curtain") return { kind: "curtain" };
  const element = anchor.matches("[data-shared]") ? anchor : anchor.querySelector<HTMLElement>("[data-shared]");
  return element ? { kind: "shared", element } : PLAIN;
}

/** Called by the link just before it navigates; the outro reads it once. */
export function requestTransition(request: TransitionRequest): void {
  requested = request;
}

/**
 * The curtain lives in `app.vue`, outside every page, so it survives the swap
 * it hides. Created once from the shell; its phase is written on its root.
 */
export function mountCurtain(root: HTMLElement): () => void {
  curtainRoot = root;
  cover = curtain(root.querySelectorAll<HTMLElement>("[data-curtain-panel]"), { from: "bottom" });
  setCurtainPhase("idle");
  return () => {
    cover?.revert();
    cover = null;
    curtainRoot = null;
    root.setAttribute("data-curtain-phase", "idle");
  };
}

function curtainPhase(): CurtainPhase {
  return (curtainRoot?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle";
}

function setCurtainPhase(phase: CurtainPhase): void {
  if (curtainRoot && curtainRoot.getAttribute("data-curtain-phase") !== phase) {
    curtainRoot.setAttribute("data-curtain-phase", phase);
  }
}

/**
 * Lowers the curtain from wherever it is. The phase follows the sweep's
 * completion, so `idle` is written when the panels are at rest, not when the
 * call returns; under reduced motion that is the next frame.
 */
function revealCurtain(): void {
  if (!cover) return;
  setCurtainPhase("revealing");
  cover.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
}

/** The committed route, which the hooks see after the URL has changed. */
function currentPath(): string {
  return useRouter().currentRoute.value.path.replace(/\/$/, "") || "/";
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
 * the layout box, so revealing the content shifts nothing. A history arrival
 * takes the quieter path: it fades in without the rise.
 */
function applyInitial(el: HTMLElement, skipTravel: boolean, travel: boolean): void {
  const { gsap } = useGSAP();
  setPhase(el, "initial");
  if (skipTravel) return;
  gsap.set(introTargets(el), travel ? { autoAlpha: 0, y: INTRO_RISE } : { autoAlpha: 0 });
}

/** Settled is CSS, not a held timeline: drop every temporary style. */
function settle(el: HTMLElement): void {
  const { gsap } = useGSAP();
  introTimeline = null;
  gsap.set(introTargets(el), { clearProps: "all" });
  setPhase(el, "settled");
}

type IntroOptions = {
  /** Rise as well as fade. Off for history arrivals, which the user has already seen. */
  travel: boolean;
  /** Open the curtain as the intro starts. */
  reveal: boolean;
};

/**
 * Intro: one timeline from the initial values to settled.
 *
 * The phase flip is deferred by a microtask so `initial` is observable on its
 * own, and so nothing starts moving in the same task the root was inserted in.
 * A microtask is still before paint. The curtain, when it is up, starts to
 * open in the same step, overlapping the intro; the page is prepared by then.
 */
function playIntro(el: HTMLElement, done: () => void, skipTravel: boolean, { travel, reveal }: IntroOptions): void {
  const { gsap } = useGSAP();
  const finish = settleOnce(done);

  pendingStep = nextStep(() => {
    pendingStep = null;
    setPhase(el, "intro");
    if (reveal) revealCurtain();

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
        stagger: travel ? INTRO_STAGGER : 0,
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
  applyInitial(el, skipTravel, true);
  document.documentElement.removeAttribute(ROOT_PHASE_ATTRIBUTE);
  playIntro(el, () => {}, skipTravel, { travel: true, reveal: false });
}

/**
 * Back and forward take the intro-only path. The middleware calls this instead
 * of the outro: nothing leaves, nothing covers, nothing is captured, and the
 * page holds still until the returning page settles.
 */
export function planHistoryArrival(): void {
  requested = PLAIN;
  keptElement = null;
  planned = { history: true, curtain: false, handoff: null };
  getScroller()?.stop();
}

/**
 * A navigation ended without a page: cancelled, failed, or a same-page change.
 * Nothing will enter, so release what the outro held. Called from the
 * `page:loading:end` handler that also releases the lock.
 */
export function abandonNavigation(): void {
  requested = PLAIN;
  keptElement = null;
  planned = ordinaryArrival();
  getScroller()?.start();
  if (curtainPhase() !== "idle") revealCurtain();
}

/**
 * Outro: the current page fades out and drifts up, still in the DOM and still
 * laid out, and reaches its end state before anything else happens.
 *
 * Awaited by the route middleware, which runs before Vue Router commits, so
 * the URL is still the old one for the whole outro. That is the only place a
 * Nuxt navigation can be held: by `onLeave` the URL has already changed.
 *
 * A curtain link composes the cover into this timeline, so the viewport is
 * covered before the URL changes. A shared-element link leaves its element,
 * and whatever holds it, lit: that is what the user sees through the swap.
 */
export function runPageOutro(): Promise<void> {
  if (outroInFlight) return outroInFlight;
  const request = requested;
  requested = PLAIN;
  const el = livePage;
  if (!el || phaseOf(el) === "end" || phaseOf(el) === "outro") return Promise.resolve();

  const { gsap } = useGSAP();
  const skipTravel = shouldSkipTravel();
  // The page cannot be scrolled from here until the incoming page settles.
  getScroller()?.stop();
  const keep = request.kind === "shared" && el.contains(request.element) ? request.element : null;
  keptElement = keep;
  // Reduced motion never shows a panel: the navigation falls back to the plain swap.
  const useCurtain = request.kind === "curtain" && cover !== null && !skipTravel;
  planned = { history: false, curtain: useCurtain, handoff: null };

  outroInFlight = new Promise<void>((resolve) => {
    // An intro is not the inverse of the outro, so kill it and leave from
    // whatever is on screen rather than reversing.
    pendingStep?.();
    pendingStep = null;
    introTimeline?.kill();
    introTimeline = null;

    // Queried at leave time, so anything that arrived after the intro leaves
    // with the page. A kept element, and anything holding it, stays lit.
    const targets = introTargets(el).filter((target) => !keep || !(target.contains(keep) || keep.contains(target)));
    setPhase(el, "outro");

    // End state: still in the DOM, final values applied, safe to remove. CSS
    // keys pointer-events off the phase, so no inline style is left to clean.
    const end = settleOnce(() => {
      setPhase(el, "end");
      resolve();
    });

    if (skipTravel) {
      gsap.set(targets, { autoAlpha: 0 });
      pendingStep = nextStep(end);
      return;
    }

    const outro = gsap
      .timeline({ onComplete: end, onInterrupt: end })
      .set(targets, { willChange: "transform, opacity" })
      .to(targets, {
        autoAlpha: 0,
        y: -OUTRO_DRIFT,
        duration: OUTRO_DURATION,
        stagger: OUTRO_STAGGER,
        ease: "power2.in",
      });

    if (useCurtain && cover) {
      // The cover belongs to the shell's timeline, never to a page context,
      // and the end state waits for it: the swap happens covered.
      setCurtainPhase("covering");
      const sweep = cover.cover();
      sweep.eventCallback("onComplete", () => setCurtainPhase("covered"));
      outro.add(sweep, `-=${CURTAIN_OVERLAP}`);
    }
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
    arrival = planned;
    planned = ordinaryArrival();
    applyInitial(root, shouldSkipTravel(), !arrival.history);
  },

  onEnter(el, done) {
    const root = el as HTMLElement;
    // The morph first, in the same task as insertion, so the first painted
    // frame shows the hero at the thumbnail's box. Read, never consumed: it
    // is dropped at settled or on cancellation.
    const handoff = arrival.handoff;
    if (handoff && handoff.path === currentPath()) {
      // Nuxt's own scroll lands a frame after the leave's `done`, which would be
      // mid-morph. Land it now, where the router will put it, so the later
      // scrollBehavior finds the page already there; playShared corrects for
      // the scroll change since capture.
      const target = root.querySelector<HTMLElement>(`[data-shared-hero][data-flip-id="${CSS.escape(handoff.id)}"]`);
      if (target) {
        const scroller = getScroller();
        if (scroller) scroller.scrollTo(location.hash || 0, { immediate: true });
        else window.scrollTo(0, 0);
        playShared(handoff.state, target);
      }
    }
    playIntro(root, done, shouldSkipTravel(), {
      travel: !arrival.history,
      // A history move never covers, but it lowers a curtain a cancelled navigation left up.
      reveal: arrival.curtain || curtainPhase() !== "idle",
    });
  },

  onAfterEnter(el) {
    const root = el as HTMLElement;
    // Only when the intro actually reached settled: this also fires after an
    // intro that was killed by an outro, and that page is on its way out.
    if (phaseOf(root) !== "settled") return;
    arrival = ordinaryArrival();
    // The page has its settled layout: re-measure, then hand the scroll back.
    const scroller = getScroller();
    scroller?.resize();
    scroller?.start();
    // Never steal focus from a control the reader is using.
    if (document.activeElement === document.body) root.focus({ preventScroll: true });
  },

  onEnterCancelled(el) {
    const { gsap } = useGSAP();
    arrival = ordinaryArrival();
    pendingStep?.();
    pendingStep = null;
    introTimeline?.kill();
    introTimeline = null;
    gsap.killTweensOf(introTargets(el as HTMLElement));
  },

  onBeforeLeave(el) {
    // The old root is laid out and the new one is not yet inserted, in either
    // mode. The element the outro left lit is captured here, keyed by the
    // destination, which the router has already committed. A history move
    // captures nothing: it has no outro and takes the ordinary intro.
    const root = el as HTMLElement;
    const kept = keptElement;
    keptElement = null;
    if (!kept || planned.history || !root.contains(kept)) return;
    planned.handoff = { path: currentPath(), id: kept.dataset.flipId ?? "", state: captureShared(kept) };
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
