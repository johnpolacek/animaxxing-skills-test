import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type ReactNode } from "react";
import { useLocation } from "react-router";
import {
  INTRO_RISE,
  OUTRO_DRIFT,
  motionReleased,
  nextStep,
  prefersReducedMotion,
  type Phase,
} from "./phases";
import { useRouteTransition, type PageController } from "./RouteTransition";

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
 * current phase written to `data-phase` on the wrapper it renders. Routes mark
 * what they animate with `data-intro` and otherwise stay plain modules.
 *
 * The setup depends on `pathname` with `revertOnUpdate`, the skill's default, so
 * a route the router reuses with new params runs its lifecycle again over DOM
 * that already holds settled values. That is also why every start value is an
 * explicit `set` rather than a `from` tween trusting a fresh node.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const { registerPage, claimFocus } = useRouteTransition();

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

      setPhase("initial");
      // Reduced motion skips the travel. A released mark means the pre-paint
      // failsafe already showed the content, and hiding it again to play an
      // intro would be worse than arriving settled.
      const instant = prefersReducedMotion() || motionReleased();
      gsap.set(introTargets, instant ? { autoAlpha: 1, y: 0 } : { autoAlpha: 0, y: INTRO_RISE });

      const settle = () => {
        intro = null;
        // Settled is CSS, not a held timeline: drop every temporary style.
        gsap.set(introTargets, { clearProps: "all" });
        setPhase("settled");
        // Only if the navigation left focus on <body>; never steal it from a
        // control the reader is using. React Router moves no focus itself.
        if (claimFocus() && document.activeElement === document.body) {
          el.focus({ preventScroll: true });
        }
      };

      // Phases advance one step at a time so anything watching the attribute
      // sees each of them, so the initial values are on the node before the
      // intro is allowed to move them, and so the intro starts after
      // <ScrollRestoration> has applied its position in the same commit.
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

      // Built here but called from the boundary's blocker effect, long after
      // this setup ran, so it goes through contextSafe to stay inside this
      // component's context and be reverted with it.
      const leave = safe((done: () => void) => {
        // An intro is not the inverse of the outro, so kill it and leave from
        // whatever is on screen rather than reversing.
        cancelPending?.();
        cancelPending = null;
        intro?.kill();
        intro = null;

        // Queried at leave time, so anything that arrived after setup — a
        // streamed region, say — leaves with the page.
        const outroTargets = Array.from(el.querySelectorAll<HTMLElement>("[data-intro]"));
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
    { scope: root, dependencies: [pathname, registerPage, claimFocus], revertOnUpdate: true },
  );

  return (
    <div ref={root} data-page data-phase="initial" tabIndex={-1} className="page-root">
      {children}
    </div>
  );
}
