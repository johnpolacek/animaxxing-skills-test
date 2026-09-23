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

export type LeaveOptions = {
  /**
   * A timeline the shell composes into the outro, such as a curtain closing.
   * It starts just before the fade ends, and the end state waits for it.
   */
  extra?: gsap.core.Timeline;
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and its ancestors stay.
   */
  keep?: Element | null;
};

const RISE = 24; // px the intro travels
const DRIFT = -16; // px the outro drifts
const INTRO_DURATION = 0.45;
const INTRO_SPREAD = 0.15; // total stagger, so the intro is ~600ms whatever the count
const OUTRO_DURATION = 0.35;
const EXTRA_OVERLAP = 0.15; // s before the fade ends that a composed timeline starts

export type PageController = ReturnType<typeof createPageController>;

export function createPageController(root: HTMLElement) {
  // Scopes selectors to this page and gives every tween one owner to revert.
  const ctx = gsap.context(() => {}, root);
  let active: gsap.core.Timeline | null = null;
  // A shell-owned timeline nested in the outro; it must leave before the revert.
  let held: gsap.core.Timeline | null = null;

  const targets = () => gsap.utils.toArray<HTMLElement>("[data-intro]", root);

  const setPhase = (phase: Phase) => root.setAttribute("data-phase", phase);

  /** Hand the targets back to plain CSS: no leftover inline styles. */
  const settle = (els: HTMLElement[], onSettled?: () => void) => {
    active = null;
    gsap.set(els, { clearProps: "all" });
    setPhase("settled");
    onSettled?.();
  };

  /**
   * initial -> intro -> settled. Safe to call on a node that is already settled.
   * `onSettled` runs once, from the settled state, so the shell can release
   * what it held for the intro, such as the scroller.
   */
  function enter(arrival: Arrival, onSettled?: () => void) {
    ctx.add(() => {
      active?.kill();
      const els = targets();
      // Reduced motion keeps every phase and every callback, and loses only the
      // travel and the time.
      const reduced = prefersReducedMotion() || document.documentElement.getAttribute("data-motion") !== "js";

      if (reduced) {
        setPhase("intro");
        settle(els, onSettled);
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

      active = gsap.timeline({ onComplete: () => settle(els, onSettled) }).to(els, {
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
   * values currently on screen rather than snapping first. Returns the outro
   * timeline so the caller can budget a watchdog from its planned length.
   */
  function leave(done: () => void, { extra, keep }: LeaveOptions = {}): gsap.core.Timeline | null {
    let timeline: gsap.core.Timeline | null = null;
    ctx.add(() => {
      active?.kill();
      // A kept element, and anything holding it, stays lit through the swap.
      const els = targets().filter((el) => !keep || !(el.contains(keep) || keep.contains(el)));
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
        // followed as directly as an unanimated one. A composed timeline
        // completes on its own instant path.
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
      if (extra) {
        held = extra;
        active.add(extra, `-=${EXTRA_OVERLAP}`);
      }
      timeline = active;
    });
    return timeline;
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
    // A timeline the shell composed into the outro belongs to the shell. Reverting
    // this context would render it back to its start too, and a curtain would
    // sweep away at the very moment it is meant to hide the swap.
    held?.parent?.remove(held);
    held = null;
    ctx.revert();
  }

  return { enter, leave, restore, destroy };
}
