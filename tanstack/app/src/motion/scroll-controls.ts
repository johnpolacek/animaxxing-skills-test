// Copied from the animaxxing skill: references/recipes/smooth-scroll.md (scroll-controls.ts).
// Two changes, both the recipe allows: the reduced-motion helper is this app's own, and
// ScrollTrigger comes from ./gsap, the app's one client-only registration module, instead
// of being registered at module scope here, in a file Start renders on the server.
import { ScrollTrigger } from "./gsap";
import { prefersReducedMotion } from "./phases";

export { prefersReducedMotion };

export type ScrollTarget = number | string | HTMLElement;
export type ScrollToOptions = {
  /** Jump instead of easing, as after a route swap or a history restore. */
  immediate?: boolean;
  /** Pixels added to the target position; negative clears a fixed header. */
  offset?: number;
};

export type SmoothScroll = {
  /**
   * Holds the page still, as through an outro or under a curtain. A stopped
   * ScrollSmoother pushes a native scroll back on the next scroll event, so
   * sync a router's scroll with `scrollTo` in the same task it lands.
   */
  stop(): void;
  start(): void;
  /** Scrolls to a position, a selector, or an element, even while stopped. */
  scrollTo(target: ScrollTarget, options?: ScrollToOptions): void;
  /** Re-measures after content changes size, then refreshes ScrollTrigger. */
  resize(): void;
  /** Idempotent. Restores native scrolling and removes everything the engine added. */
  destroy(): void;
};

/** A target's document position in px, or undefined when a selector matches nothing. */
export function resolveTarget(target: ScrollTarget): number | undefined {
  if (typeof target === "number") return target;
  const element = typeof target === "string" ? document.querySelector(target) : target;
  return element ? element.getBoundingClientRect().top + window.scrollY : undefined;
}

/**
 * Native scrolling behind the same controls: the reduced-motion path of both
 * engines. Stop and start do nothing, since reduced-motion outros are instant.
 */
export function nativeScroll(): SmoothScroll {
  return {
    stop() {},
    start() {},
    scrollTo(target, { immediate = false, offset = 0 } = {}) {
      const top = resolveTarget(target);
      if (top === undefined) return;
      window.scrollTo({ top: top + offset, behavior: immediate || prefersReducedMotion() ? "instant" : "smooth" });
    },
    resize() {
      ScrollTrigger.refresh();
    },
    destroy() {},
  };
}
