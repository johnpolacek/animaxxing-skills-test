import { gsap } from "./gsap";
import {
  DRIFT,
  RISE,
  motionReleased,
  nextStep,
  prefersReducedMotion,
  type Arrival,
  type Phase,
} from "./phases";

/** 0.45s of travel plus 0.15s of spread is the ~600ms the brief asks for. */
const INTRO_DURATION = 0.45;
const INTRO_SPREAD = 0.15;
/** 0.3s plus 0.05s of spread is the ~350ms the brief asks for. */
const OUTRO_DURATION = 0.3;
const OUTRO_SPREAD = 0.05;

/** Seconds before the fade ends that a composed shell timeline, such as a closing curtain, starts. */
const EXTRA_OVERLAP = 0.15;

const targetsIn = (root: HTMLElement) => gsap.utils.toArray<HTMLElement>("[data-intro]", root);

export type LeaveOptions = {
  /**
   * A timeline the shell composes into the outro, such as a curtain closing.
   * It starts just before the fade ends, and the end state waits for it. The
   * shell owns it: `destroy()` hands it back before killing this context.
   */
  extra?: gsap.core.Timeline;
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and its ancestors stay.
   */
  keep?: Element | null;
};

/**
 * The start values, written outside any controller.
 *
 * `astro:after-swap` needs them on the incoming body before it paints, which is
 * before `astro:page-load` builds the controller that owns the body. The
 * pre-paint CSS rule covers the same frame; this makes the hand-off exact
 * rather than relying on the rule alone.
 */
export function writeInitialState(root: HTMLElement, arrival: Arrival) {
  if (prefersReducedMotion() || motionReleased()) return;
  gsap.set(targetsIn(root), { autoAlpha: 0, y: arrival === "fresh" ? RISE : 0 });
}

export type PageController = ReturnType<typeof createPageController>;

/**
 * One controller owns one `[data-page]` element for as long as that body is in
 * the document, and publishes exactly one phase at a time on `data-phase`.
 *
 * Its `gsap.context` is scoped to that element, so selectors cannot reach the
 * header, the footer, or a persisted region, and `revert()` in
 * `astro:before-swap` takes every tween this page created and nothing else.
 */
export function createPageController(root: HTMLElement) {
  const ctx = gsap.context(() => {}, root);
  let active: gsap.core.Timeline | null = null;
  let cancelPending: (() => void) | null = null;
  /** A shell-owned timeline nested in the outro; it must leave before the kill. */
  let held: gsap.core.Timeline | null = null;

  const setPhase = (phase: Phase) => {
    if (root.getAttribute("data-phase") !== phase) root.setAttribute("data-phase", phase);
  };

  /**
   * Hand the targets back to plain CSS: no leftover inline styles at all.
   * `onSettled` runs once, from the settled state, so the shell can release
   * what it held for the intro, such as the scroller.
   */
  const settle = (els: HTMLElement[], focus: boolean, onSettled?: () => void) => {
    active = null;
    gsap.set(els, { clearProps: "all" });
    setPhase("settled");
    // The router leaves focus on <body> unless it was inside a persisted
    // element, so a keyboard reader lands at the top of the site on every
    // navigation. Never take focus from a control someone is using.
    if (focus && document.activeElement === document.body) {
      root.focus({ preventScroll: true });
    }
    onSettled?.();
  };

  const stop = () => {
    cancelPending?.();
    cancelPending = null;
    active?.kill();
    active = null;
  };

  /**
   * initial -> intro -> settled.
   *
   * Correct on a body that already holds settled values, because every start
   * value is written explicitly rather than inferred by a `from` tween.
   */
  function enter(arrival: Arrival, focus = false, onSettled?: () => void) {
    ctx.add(() => {
      stop();
      const els = targetsIn(root);
      setPhase("initial");

      // Reduced motion keeps every phase and every callback and loses only the
      // travel. A released mark means the failsafe already showed the content,
      // so there is nothing to reveal.
      const instant = prefersReducedMotion() || motionReleased();
      if (instant) {
        cancelPending = nextStep(() => {
          cancelPending = null;
          setPhase("intro");
          cancelPending = nextStep(() => {
            cancelPending = null;
            settle(els, focus, onSettled);
          });
        });
        return;
      }

      // Start values land before the phase changes, so releasing the pre-paint
      // rule can never show the settled state for a frame.
      gsap.set(els, {
        autoAlpha: 0,
        y: arrival === "fresh" ? RISE : 0,
        willChange: "transform, opacity",
      });
      cancelPending = nextStep(() => {
        cancelPending = null;
        setPhase("intro");
        active = gsap.timeline({ onComplete: () => settle(els, focus, onSettled) }).to(els, {
          autoAlpha: 1,
          y: 0,
          duration: INTRO_DURATION,
          stagger: { amount: arrival === "fresh" ? INTRO_SPREAD : 0 },
        });
      });
    });
  }

  /**
   * settled -> outro -> end, resolving from the end state.
   *
   * The content stays in the DOM and laid out the whole time; the router waits
   * on this promise, so the swap cannot show the next page early. An intro
   * still running is killed rather than reversed, because the outro is not its
   * inverse: it leaves from whatever is on screen.
   *
   * A composed `extra` timeline plays inside the outro, so the end state means
   * it has completed too. A `keep` element, and anything holding it, stays lit.
   */
  function leave({ extra, keep }: LeaveOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
      ctx.add(() => {
        stop();
        const els = targetsIn(root).filter((el) => !keep || !(el.contains(keep) || keep.contains(el)));
        setPhase("outro");

        let ended = false;
        const end = () => {
          if (ended) return;
          ended = true;
          active = null;
          setPhase("end");
          resolve();
        };

        if (prefersReducedMotion() || motionReleased()) {
          // A composed timeline completes on its own instant path; the shell
          // awaits it separately.
          gsap.set(els, { autoAlpha: 0 });
          cancelPending = nextStep(end);
          return;
        }

        // onInterrupt as well as onComplete: a killed timeline never fires
        // onComplete, and the router would wait for a promise nothing resolves.
        active = gsap
          .timeline({ onComplete: end, onInterrupt: end })
          .set(els, { willChange: "transform, opacity" })
          .to(els, {
            autoAlpha: 0,
            y: -DRIFT,
            duration: OUTRO_DURATION,
            stagger: { amount: OUTRO_SPREAD },
            ease: "power2.in",
          });
        if (extra) {
          held = extra;
          active.add(extra, `-=${EXTRA_OVERLAP}`);
        }
      });
    });
  }

  /**
   * settled -> end, with no outro. A traverse swaps the body without leaving:
   * the URL has already changed, so the outgoing page is done the moment the
   * router accepts the move, and may not report itself as a settled page at
   * the destination's address while the fetch is pending.
   */
  function finish() {
    ctx.add(() => {
      stop();
      setPhase("end");
    });
  }

  /**
   * The body this controller owns is about to be replaced. Kill everything it
   * created before the swap, not after: a tween or trigger left alive is
   * animating nodes that no longer exist.
   *
   * Killed, not reverted. There is nothing to restore on a body that is being
   * thrown away, and reverting the `clearProps` set that settled the page would
   * write the intro's start values back onto the outgoing nodes for the last
   * moment of their life.
   */
  function destroy() {
    // A timeline the shell composed into the outro belongs to the shell. Hand it
    // back before the kill so the curtain it drives is never this page's to end.
    held?.parent?.remove(held);
    held = null;
    stop();
    ctx.kill();
  }

  return { root, enter, leave, finish, destroy };
}
