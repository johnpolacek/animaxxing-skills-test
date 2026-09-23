"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "./gsap";
import {
  INTRO_RISE,
  OUTRO_DRIFT,
  motionReleased,
  nextStep,
  prefersReducedMotion,
  type Phase,
} from "./phases";
import { useRouteTransition, type LeaveOptions, type PageController } from "./RouteTransition";

/** Intro: 0.4s of travel plus two 0.1s steps of stagger is the ~600ms asked for. */
const INTRO_DURATION = 0.4;
const INTRO_STAGGER = 0.1;
/** Outro: 0.34s plus two 0.03s steps is the ~350ms asked for. */
const OUTRO_DURATION = 0.34;
const OUTRO_STAGGER = 0.03;

/**
 * The lifecycle controller for one route's content.
 *
 * mount -> initial -> intro -> settled -> outro -> end -> unmount, with the
 * current phase written to `data-phase` on the wrapper it renders. Pages mark
 * what they animate with `data-intro` and otherwise stay server components.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { registerPage, arrival, pageSettled, claimFocus } = useRouteTransition();

  useGSAP(
    (_context, contextSafe) => {
      const el = root.current;
      if (!el) return;

      const safe = <T extends (...args: never[]) => void>(fn: T): T =>
        contextSafe ? (contextSafe(fn) as T) : fn;
      // The attribute changes exactly when the phase does. Rewriting the same
      // value would still notify observers of a change that did not happen.
      const setPhase = (phase: Phase) => {
        if (el.dataset.phase !== phase) el.dataset.phase = phase;
      };
      const introTargets = Array.from(el.querySelectorAll<HTMLElement>("[data-intro]"));

      let intro: gsap.core.Timeline | null = null;
      let cancelPending: (() => void) | null = null;

      // Under cacheComponents this setup runs again on a re-show, over DOM that
      // already holds settled values, so every start value is written
      // explicitly. A `from` tween that trusts a fresh node would be wrong.
      setPhase("initial");
      // Reduced motion skips the travel. A released mark means the pre-paint
      // failsafe already showed the content, and hiding it again to play an
      // intro would be worse than arriving settled.
      const instant = prefersReducedMotion() || motionReleased();
      // Back and forward show a page the reader has already seen: it fades in
      // where it is, so a shared element is in its own box from its first
      // visible frame. A new visit rises.
      const rise = arrival() === "fresh" ? INTRO_RISE : 0;
      gsap.set(introTargets, instant ? { autoAlpha: 1, y: 0 } : { autoAlpha: 0, y: rise });

      const settle = () => {
        intro = null;
        // Settled is CSS, not a held timeline: drop every temporary style.
        gsap.set(introTargets, { clearProps: "all" });
        setPhase("settled");
        // The shell hands the scroller back and forgets the navigation's handoff.
        pageSettled(controller);
        // Only if the navigation left focus on <body>; never steal it from a
        // control the reader is using.
        if (claimFocus() && document.activeElement === document.body) {
          el.focus({ preventScroll: true });
        }
      };

      // Phases advance one step at a time so anything watching the attribute
      // sees each of them, and so the initial values are on the node before the
      // intro is allowed to move them.
      cancelPending = nextStep(() => {
        cancelPending = null;
        setPhase("intro");
        if (instant) {
          // No travel, but the same completion still runs.
          cancelPending = nextStep(settle);
          return;
        }
        intro = gsap
          .timeline({ defaults: { overwrite: "auto" }, onComplete: settle })
          .set(introTargets, { willChange: "transform, opacity" })
          .to(introTargets, {
            autoAlpha: 1,
            y: 0,
            duration: INTRO_DURATION,
            stagger: INTRO_STAGGER,
            ease: "power2.out",
          });
      });

      // The outro is built from an event handler, long after this setup ran, so
      // it goes through contextSafe to stay inside this component's context and
      // be reverted with it.
      const leave = safe((done: () => void, { keep = null }: LeaveOptions = {}) => {
        // An intro is not the inverse of the outro, so kill it and leave from
        // whatever is on screen rather than reversing.
        cancelPending?.();
        cancelPending = null;
        intro?.kill();
        intro = null;

        // Queried at leave time, so anything that arrived after setup leaves
        // with the page. A kept element, and anything holding it, stays lit
        // through the swap: it is about to morph into the next page.
        const outroTargets = Array.from(el.querySelectorAll<HTMLElement>("[data-intro]")).filter(
          (target) => !keep || !(target.contains(keep) || keep.contains(target)),
        );
        setPhase("outro");

        // Still mounted, still laid out, no longer interactive: CSS keys that
        // off the phase, so no inline style has to be cleaned up later.
        const end = () => {
          setPhase("end");
          done();
        };

        if (prefersReducedMotion()) {
          gsap.set(outroTargets, { autoAlpha: 0 });
          cancelPending = nextStep(end);
          return;
        }
        gsap
          .timeline({ defaults: { overwrite: "auto" }, onComplete: end })
          .set(outroTargets, { willChange: "transform, opacity" })
          .to(outroTargets, {
            autoAlpha: 0,
            y: -OUTRO_DRIFT,
            duration: OUTRO_DURATION,
            stagger: OUTRO_STAGGER,
            ease: "power2.in",
          });
      });

      const controller: PageController = { root: el, leave };
      const unregister = registerPage(controller);
      return () => {
        cancelPending?.();
        unregister();
      };
    },
    { scope: root, dependencies: [registerPage, arrival, pageSettled, claimFocus] },
  );

  return (
    <div ref={root} data-page data-phase="initial" tabIndex={-1} className="page-root">
      {children}
    </div>
  );
}
