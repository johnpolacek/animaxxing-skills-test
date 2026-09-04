import { gsap } from "./gsap";
import { prefersReducedMotion } from "./env";

/**
 * One controller owns the page content wrapper from mount to unmount and
 * publishes exactly one phase at a time on `data-phase`. CSS and tests read
 * that attribute; nothing infers the phase from opacity or DOM presence.
 */
export type Phase = "initial" | "intro" | "settled" | "outro" | "end";

/**
 * `fresh` is a new navigation or a reload: the full staggered rise.
 * `return` is a history navigation to a fresh document: intro only, no travel,
 * because the user is coming back to something they have already seen.
 */
export type Arrival = "fresh" | "return";

const RISE = 24; // px the intro travels
const DRIFT = -16; // px the outro drifts
const INTRO_DURATION = 0.45;
const INTRO_SPREAD = 0.15; // total stagger, so the intro is ~600ms whatever the count
const OUTRO_DURATION = 0.35;

export type PageController = ReturnType<typeof createPageController>;

export function createPageController(root: HTMLElement) {
  // Scopes selectors to this page and gives every tween one owner to revert.
  const ctx = gsap.context(() => {}, root);
  let active: gsap.core.Timeline | null = null;

  const targets = () => gsap.utils.toArray<HTMLElement>("[data-intro]", root);

  const setPhase = (phase: Phase) => root.setAttribute("data-phase", phase);

  /** Hand the targets back to plain CSS: no leftover inline styles. */
  const settle = (els: HTMLElement[]) => {
    active = null;
    gsap.set(els, { clearProps: "all" });
    setPhase("settled");
  };

  /** initial -> intro -> settled. Safe to call on a node that is already settled. */
  function enter(arrival: Arrival) {
    ctx.add(() => {
      active?.kill();
      const els = targets();
      // Reduced motion keeps every phase and every callback, and loses only the
      // travel and the time.
      const reduced = prefersReducedMotion() || document.documentElement.getAttribute("data-motion") !== "js";

      if (reduced) {
        setPhase("intro");
        settle(els);
        return;
      }

      // Write the start values before releasing the pre-paint rule, so the
      // settled state is never on screen for a frame.
      gsap.set(els, {
        y: arrival === "fresh" ? RISE : 0,
        autoAlpha: 0,
        willChange: "transform, opacity",
      });
      setPhase("intro");

      active = gsap.timeline({ onComplete: () => settle(els) }).to(els, {
        y: 0,
        autoAlpha: 1,
        duration: INTRO_DURATION,
        stagger: { amount: arrival === "return" ? 0 : INTRO_SPREAD },
      });
    });
  }

  /**
   * settled -> outro -> end. The content stays in the DOM and laid out the
   * whole time; `done` runs once, from the end state, and commits the
   * navigation. An intro still running is killed so the outro starts from the
   * values currently on screen rather than snapping first.
   */
  function leave(done: () => void) {
    ctx.add(() => {
      active?.kill();
      const els = targets();
      const reduced = prefersReducedMotion() || document.documentElement.getAttribute("data-motion") !== "js";

      // The content can no longer support clicks, but it keeps its layout box.
      gsap.set(root, { pointerEvents: "none" });
      setPhase("outro");

      const end = () => {
        active = null;
        setPhase("end");
        done();
      };

      if (reduced) {
        // No travel and no wait: the end state runs at once, so the link is
        // followed as directly as an unanimated one.
        gsap.set(els, { autoAlpha: 0 });
        end();
        return;
      }

      active = gsap.timeline({ onComplete: end }).to(els, {
        y: DRIFT,
        autoAlpha: 0,
        duration: OUTRO_DURATION,
        ease: "power2.in",
      });
    });
  }

  /**
   * Put the page back in its readable settled state at once, with no intro.
   * Used on `pagehide`, so a document frozen in the back-forward cache is not
   * restored mid-outro, and on a `pageshow` restore, where replaying the intro
   * would animate a page the user never left.
   */
  function restore() {
    ctx.add(() => {
      active?.kill();
      active = null;
      gsap.set(root, { clearProps: "pointerEvents" });
      gsap.set(targets(), { clearProps: "all" });
      setPhase("settled");
    });
  }

  /**
   * Kills every tween the context created and restores inline styles. Called before replacing the page
   * content, while the persistent shell keeps its own independent controller.
   */
  function destroy() {
    ctx.revert();
  }

  return { enter, leave, restore, destroy };
}
