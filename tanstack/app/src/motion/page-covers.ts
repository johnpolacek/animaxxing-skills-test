// Copied from the animaxxing skill: references/recipes/page-covers.md.
// Two changes, both the recipe allows: the reduced-motion helper is this app's own, and
// gsap comes from ./gsap, the app's one client-only registration module.
import { gsap } from "./gsap";
import { prefersReducedMotion } from "./phases";

export type Teardown = () => void;
type Register = (fn: () => void) => void;

/**
 * Runs setup inside a GSAP context. Everything GSAP creates during setup is
 * reverted with the context. `dispose` registers writers to stop before the
 * revert; `after` registers restores to run once it is done. Teardown runs
 * once, attempts every step, and rolls back a setup that threw.
 */
function own(setup: (dispose: Register, after: Register) => void): Teardown {
  const ctx = gsap.context(() => {});
  const disposers: Array<() => void> = [];
  const restores: Array<() => void> = [];
  let done = false;
  const teardown = () => {
    if (done) return;
    done = true;
    let failure: unknown;
    const attempt = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        failure ??= error;
      }
    };
    disposers.splice(0).reverse().forEach(attempt);
    attempt(() => ctx.revert());
    restores.splice(0).reverse().forEach(attempt);
    if (failure) throw failure;
  };
  let failure: { error: unknown } | undefined;
  // Catch inside add: GSAP restores its current context only when add returns.
  ctx.add(() => {
    try {
      setup((fn) => disposers.push(fn), (fn) => restores.push(fn));
    } catch (error) {
      failure = { error };
    }
  });
  if (failure) {
    teardown();
    throw failure.error;
  }
  return teardown;
}

/** Records inline properties and returns a restore that also resets GSAP's cached transform. */
function snapshotStyles(elements: HTMLElement[], props: string[]): () => void {
  const saved = elements.map((element) => props.map((prop) => element.style.getPropertyValue(prop)));
  return () =>
    elements.forEach((element, i) => {
      gsap.set(element, { clearProps: props.join(",") });
      props.forEach((prop, j) => {
        const value = saved[i]?.[j];
        if (value) element.style.setProperty(prop, value);
        else element.style.removeProperty(prop);
      });
    });
}

const COVER_PROPS = ["transform", "translate", "visibility", "opacity", "pointer-events"];

export type CurtainOptions = {
  /** The edge the panels come from. They leave by the opposite edge. */
  from?: "bottom" | "top" | "left" | "right";
  duration?: number;
  stagger?: number;
};

export type Curtain = {
  /** Sweeps the panels in. Swap the route when it completes. */
  cover(): gsap.core.Timeline;
  /** Sweeps the panels out, uncovering the incoming page. */
  reveal(): gsap.core.Timeline;
  /** Stops either sweep and restores the panels. */
  revert: Teardown;
};

export function curtain(
  panels: gsap.DOMTarget,
  { from = "bottom", duration = 0.6, stagger = 0.06 }: CurtainOptions = {},
): Curtain {
  const items = gsap.utils.toArray<HTMLElement>(panels);
  const axis = from === "bottom" || from === "top" ? "yPercent" : "xPercent";
  /** Offstage on the entry side is +100 for bottom and right, -100 for top and left. */
  const entry = from === "bottom" || from === "right" ? 100 : -100;
  let current: gsap.core.Timeline | undefined;
  const sweep = () => {
    current?.kill();
    current = gsap.timeline({ defaults: { overwrite: "auto" } });
    return current;
  };
  const revert = own((dispose, after) => {
    after(snapshotStyles(items, COVER_PROPS));
    dispose(() => current?.kill());
    gsap.set(items, { visibility: "hidden" });
  });
  return {
    cover() {
      const tl = sweep();
      // Reduced motion never flashes a full-screen panel; the framework's swap cover handles the gap.
      if (prefersReducedMotion()) return tl.set(items, { visibility: "hidden", pointerEvents: "none" });
      const resting = items.filter((item) => getComputedStyle(item).visibility === "hidden");
      if (resting.length > 0) tl.set(resting, { [axis]: entry });
      return tl
        .set(items, { visibility: "visible", pointerEvents: "auto" })
        .to(items, { [axis]: 0, duration, ease: "power3.inOut", stagger });
    },
    reveal() {
      const tl = sweep();
      if (prefersReducedMotion()) return tl.set(items, { visibility: "hidden", pointerEvents: "none" });
      return tl
        .to(items, { [axis]: -entry, duration, ease: "power3.inOut", stagger })
        .set(items, { visibility: "hidden", pointerEvents: "none", [axis]: entry });
    },
    revert,
  };
}

export type PreloaderOptions = {
  /** Seconds the count takes to catch up with reported progress. */
  catchUp?: number;
};

export type Preloader = {
  /** Reports readiness from 0 to 1. Lower values than already shown are ignored. */
  progress(ratio: number): void;
  /** Counts to 100, then lifts the preloader. Start the first intro as it completes, or overlap its end. */
  finish(): gsap.core.Timeline;
  revert: Teardown;
};

export function preloader(root: HTMLElement, { catchUp = 0.5 }: PreloaderOptions = {}): Preloader {
  const count = root.querySelector<HTMLElement>("[data-preloader-count]");
  const bar = root.querySelector<HTMLElement>("[data-preloader-bar]");
  const shown = { value: 0 };
  let target = 0;
  let ease: gsap.QuickToFunc | undefined;
  let exit: gsap.core.Timeline | undefined;
  const render = () => {
    const percent = Math.round(shown.value * 100);
    if (count) count.textContent = String(percent);
    if (bar) gsap.set(bar, { scaleX: shown.value });
    root.setAttribute("aria-valuenow", String(percent));
  };
  const revert = own((dispose, after) => {
    const text = count?.textContent ?? "";
    const valueNow = root.getAttribute("aria-valuenow");
    after(snapshotStyles([root], COVER_PROPS));
    if (bar) after(snapshotStyles([bar], ["transform"]));
    after(() => {
      if (count) count.textContent = text;
      if (valueNow === null) root.removeAttribute("aria-valuenow");
      else root.setAttribute("aria-valuenow", valueNow);
    });
    dispose(() => {
      exit?.kill();
      gsap.killTweensOf(shown);
    });
    ease = gsap.quickTo(shown, "value", { duration: catchUp, ease: "power2.out", onUpdate: render });
    render();
  });
  return {
    progress(ratio) {
      const next = gsap.utils.clamp(0, 1, ratio);
      if (next <= target || exit) return;
      target = next;
      if (prefersReducedMotion() || !ease) {
        shown.value = target;
        render();
      } else ease(target);
    },
    finish() {
      exit?.kill();
      gsap.killTweensOf(shown);
      target = 1;
      exit = gsap.timeline({ defaults: { overwrite: "auto" } });
      if (prefersReducedMotion()) {
        shown.value = 1;
        render();
        return exit.set(root, { autoAlpha: 0 });
      }
      return exit
        .to(shown, { value: 1, duration: 0.35, ease: "power2.out", onUpdate: render })
        .to(root, { yPercent: -100, duration: 0.7, ease: "power4.inOut" }, "+=0.1")
        .set(root, { autoAlpha: 0 });
    },
    revert,
  };
}
