"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { captureShared, playShared, type SharedState } from "./layout-flip";
import { lenisScroll } from "./lenis-scroll";
import { curtain as buildCurtain, type Curtain } from "./page-covers";
import { prefersReducedMotion } from "./phases";
import type { SmoothScroll } from "./scroll-controls";

/** How long the cover may stay up if a push never produces a new page. */
const COVER_TIMEOUT = 3000;
/** How long to wait for the cover's frame before pushing anyway. */
const PAINT_TIMEOUT = 120;
/** The key in `history.state` under which this boundary names a history entry. */
const ENTRY_KEY = "__motionEntry";

/** How a click travels: the route-area swap, behind the curtain, or with a shared element. */
export type Transition =
  | { kind: "plain" }
  | { kind: "curtain" }
  | { kind: "shared"; element: HTMLElement };

export type NavigationOptions = { replace?: boolean; scroll?: boolean; transition?: Transition };

/**
 * `fresh` is a new visit: the full rising intro. `return` is back or forward
 * to a page the reader has already seen: intro only, no travel, so a shared
 * element sits in its own box from its first visible frame.
 */
export type Arrival = "fresh" | "return";

export type LeaveOptions = {
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and its ancestors stay.
   */
  keep?: HTMLElement | null;
};

export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /** Play the outro on live DOM and call back once the end state is applied. */
  leave: (done: () => void, options?: LeaveOptions) => void;
};

type CurtainPhase = "idle" | "covering" | "covered" | "revealing";

/** A shared element captured in the outro, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: SharedState };

/** A navigation this boundary accepted and has not yet seen a page for. */
type Pending = { href: string; transition: Transition };

type RouteTransitionApi = {
  /**
   * A page announces itself as it writes its initial state. In the microtask
   * after that, once the router's own scroll has landed, the boundary treats
   * the route as ready: scroller synced, curtain revealed, morph played, cover
   * down, lock released.
   */
  registerPage: (controller: PageController) => () => void;
  /** How the page registering right now arrived. Read before writing initial values. */
  arrival: () => Arrival;
  /** A page reports its settled state so the shell can hand the scroller back. */
  pageSettled: (controller: PageController) => void;
  /** True when the boundary took the navigation over and will push itself. */
  requestNavigation: (href: string, options?: NavigationOptions) => boolean;
  /** True once, for a page whose intro follows a navigation this boundary ran. */
  claimFocus: () => boolean;
  /** Whether the swap gap is currently covered by the route-area cover. */
  covered: boolean;
  /** The curtain's root, rendered by <Curtain /> inside this boundary. */
  curtainRef: RefObject<HTMLDivElement | null>;
};

const RouteTransitionContext = createContext<RouteTransitionApi | null>(null);

export function useRouteTransition(): RouteTransitionApi {
  const api = useContext(RouteTransitionContext);
  if (!api) throw new Error("useRouteTransition must be used inside <RouteTransition>");
  return api;
}

/** `/gallery/` and `/gallery` are one route. */
const routeOf = (href: string) =>
  new URL(href, window.location.href).pathname.replace(/\/$/, "") || "/";

/**
 * Wait for the cover to reach the screen, then run.
 *
 * A frame is the honest signal, but requestAnimationFrame never fires in a
 * hidden tab, so it races a short timeout. Losing the race costs one uncovered
 * frame in a tab nobody is looking at.
 */
function afterPaint(run: () => void): void {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    run();
  };
  requestAnimationFrame(() => requestAnimationFrame(fire));
  setTimeout(fire, PAINT_TIMEOUT);
}

/**
 * The key `history.state` gives the current entry, or null when this boundary
 * has not named it yet. The App Router creates a fresh state on every push and
 * keeps custom keys on back and forward, so a key is exactly one visit's entry.
 */
function readEntryKey(): string | null {
  const state = window.history.state as Record<string, unknown> | null;
  const key = state?.[ENTRY_KEY];
  return typeof key === "string" ? key : null;
}

/** Names the current entry if it has no name yet. Safe to call at any point of a visit. */
function entryKey(): string {
  const existing = readEntryKey();
  if (existing) return existing;
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    // No URL, so the App Router's patched replaceState leaves routing alone.
    window.history.replaceState({ ...(window.history.state as object | null), [ENTRY_KEY]: key }, "");
  } catch {
    /* history unavailable: positions simply are not restored */
  }
  return key;
}

/**
 * Owns page lifecycles for the route area, and the two things that must
 * outlive every page: the smooth scroller and the curtain.
 *
 * A requested navigation stops the scroller, runs the outgoing page's outro on
 * live DOM, covers the swap (with the route-area cover, or the curtain, or
 * nothing at all when a shared element must stay visible), pushes, and then,
 * in the microtask after the incoming page has written its initial state and
 * the router has scrolled, syncs the scroller, reveals the curtain, plays the
 * shared-element morph, and lowers the cover. Unrequested navigation — back,
 * forward, anything that bypasses the helper — is recognised only when its
 * page registers, so those routes run initial state and intro and nothing
 * else, at the scroll position they were left at.
 *
 * The cover is React state rather than an inline style: a GSAP context revert
 * during the swap would erase an inline one exactly when it is needed.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const active = useRef<PageController | null>(null);
  const locked = useRef(false);
  const pending = useRef<Pending | null>(null);
  /** Bumped at every accepted request and every ready, so stale callbacks recognise themselves. */
  const generation = useRef(0);
  const focusPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [covered, setCovered] = useState(false);

  const scroller = useRef<SmoothScroll | null>(null);
  const curtainRef = useRef<HTMLDivElement | null>(null);
  const cover = useRef<Curtain | null>(null);
  const handoff = useRef<Handoff | null>(null);
  /** Where each history entry was left, by its key, for back and forward. */
  const positions = useRef(new Map<string, number>());
  /** The entry the visible page belongs to, tracked at each ready. */
  const currentEntry = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const curtainPhase = useCallback(
    (): CurtainPhase =>
      (curtainRef.current?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle",
    [],
  );
  const setCurtainPhase = useCallback((phase: CurtainPhase) => {
    const root = curtainRef.current;
    if (root && root.getAttribute("data-curtain-phase") !== phase) {
      root.setAttribute("data-curtain-phase", phase);
    }
  }, []);

  /** Lowers the curtain from wherever it is; the incoming intro overlaps it. */
  const reveal = useCallback(() => {
    const curtain = cover.current;
    if (!curtain) return;
    setCurtainPhase("revealing");
    // Under reduced motion the recipe's timeline completes on the next tick
    // and never shows a panel, so the phase still comes from the callback.
    curtain.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
  }, [setCurtainPhase]);

  /**
   * Every way a navigation stops being in flight ends here: the incoming page
   * is ready, or nothing arrived in time. Whatever was held for the swap is
   * released, so a timed-out page is never left covered or frozen.
   */
  const release = useCallback(() => {
    clearTimer();
    locked.current = false;
    pending.current = null;
    setCovered(false);
  }, [clearTimer]);

  const ready = useCallback(
    (controller: PageController) => {
      // Replaced before its microtask ran: a development double setup, or a
      // history move that landed on another page first.
      if (active.current !== controller) return;
      generation.current += 1;
      const requested = pending.current;
      const engine = scroller.current;
      const key = entryKey();
      currentEntry.current = key;

      if (!requested) {
        // Back, forward, or a route change that bypassed the helper. The router
        // did not scroll and the browser was told not to; put the page where
        // the reader left it, now that it has its full height again.
        const left = positions.current.get(key);
        if (left !== undefined) window.scrollTo(0, left);
        // A history move carries no captured state. Whatever an abandoned
        // navigation left behind must not play on this page.
        handoff.current = null;
      }
      // The router's scroll has landed: the engine adopts it, whatever it was,
      // and re-measures for the page that is now laid out.
      engine?.scrollTo(window.scrollY, { immediate: true });
      engine?.resize();

      // A curtain navigation reveals here. So does a history move that arrives
      // under a curtain a cancelled navigation left closed.
      if (curtainPhase() !== "idle") reveal();

      // The morph plays only on the page it was captured for, onto the target
      // the new tree rendered. The explicit target matters under
      // cacheComponents: the old thumbnail is still in the DOM, hidden.
      const arriving = handoff.current;
      if (arriving && arriving.path === routeOf(window.location.href)) {
        const target = controller.root.querySelector<HTMLElement>(
          `[data-shared-hero][data-flip-id="${CSS.escape(arriving.id)}"]`,
        );
        if (target) playShared(arriving.state, target);
      }

      // The lock lifts as the incoming intro begins, not when it ends. Holding
      // it through the intro would leave every link dead for its duration.
      release();
    },
    [curtainPhase, release, reveal],
  );

  const registerPage = useCallback(
    (controller: PageController) => {
      active.current = controller;
      // Not yet: the page's own layout effect runs before the router's scroll
      // handler in the same commit. A microtask runs after the whole commit,
      // still before paint, so the sync below sees where the router put us.
      queueMicrotask(() => ready(controller));
      return () => {
        if (active.current === controller) active.current = null;
      };
    },
    [ready],
  );

  const arrival = useCallback((): Arrival => {
    if (pending.current) return "fresh";
    // An entry this boundary was left from is one the reader is coming back to.
    const key = readEntryKey();
    return key && positions.current.has(key) ? "return" : "fresh";
  }, []);

  const pageSettled = useCallback((controller: PageController) => {
    if (active.current !== controller) return;
    // The navigation that carried the morph is over; nothing may replay it.
    handoff.current = null;
    scroller.current?.start();
  }, []);

  const requestNavigation = useCallback(
    (href: string, { replace, scroll, transition = { kind: "plain" } }: NavigationOptions = {}) => {
      // One navigation at a time. A second request while one is in flight is
      // swallowed rather than queued: the first accepted destination wins.
      if (locked.current) return true;
      const controller = active.current;
      // Before hydration there is no controller to outro. Let the router have
      // the click; the destination still runs its own intro.
      if (!controller) return false;

      locked.current = true;
      focusPending.current = true;
      const token = ++generation.current;
      pending.current = { href, transition };

      // The page holds still from here through the swap; the incoming page's
      // settled state hands the scroller back.
      scroller.current?.stop();
      // Remember where this entry is left so back and forward can put it back.
      positions.current.set(entryKey(), window.scrollY);

      // A shared element is captured while the thumbnail is still laid out,
      // before the outro moves anything, and stays lit through the outro.
      handoff.current = null;
      let keep: HTMLElement | null = null;
      if (transition.kind === "shared") {
        const id = transition.element.dataset.flipId;
        if (id) {
          handoff.current = { path: routeOf(href), id, state: captureShared(transition.element) };
          keep = transition.element;
        }
      }

      const curtain = transition.kind === "curtain" ? cover.current : null;
      let outroDone = false;
      let curtainDone = curtain === null;
      const proceed = () => {
        if (!outroDone || !curtainDone || token !== generation.current) return;
        // The route-area cover spans the swap gap, except where the curtain
        // already covers it or a shared element must stay visible through it.
        // Under reduced motion the curtain never shows, so the cover steps in.
        const needsCover =
          transition.kind !== "shared" && (curtain === null || prefersReducedMotion());
        setCovered(needsCover);
        clearTimer();
        timer.current = setTimeout(() => {
          release();
          if (curtainPhase() !== "idle") reveal();
          scroller.current?.start();
        }, COVER_TIMEOUT);
        afterPaint(() => {
          if (token !== generation.current) return;
          // Carry the link's own intent through to the router call.
          const navigate = replace ? router.replace : router.push;
          navigate(href, { scroll });
        });
      };

      if (curtain) {
        // The curtain belongs to the shell: built here, never inside the
        // outgoing page's context, whose revert at hide would pull it open.
        setCurtainPhase("covering");
        curtain.cover().eventCallback("onComplete", () => {
          if (token !== generation.current) return;
          setCurtainPhase("covered");
          curtainDone = true;
          proceed();
        });
      }
      controller.leave(
        () => {
          if (token !== generation.current) return;
          outroDone = true;
          proceed();
        },
        { keep },
      );
      return true;
    },
    [clearTimer, curtainPhase, release, reveal, router, setCurtainPhase],
  );

  const claimFocus = useCallback(() => {
    const claimed = focusPending.current;
    focusPending.current = false;
    return claimed;
  }, []);

  // One scroller and one curtain per document, owned by the shell and never
  // by a page. A layout effect, so both exist before the first page's ready
  // microtask; StrictMode and Fast Refresh run the cleanup before the second
  // setup, which leaves exactly one of each.
  useLayoutEffect(() => {
    // The browser has already restored this document's position by now, so a
    // reload still lands where it was. From here on this boundary restores:
    // with routes kept hidden, the browser would restore against the outgoing
    // page's height and clamp, and it would jump the old page before the swap.
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const engine = lenisScroll({ lerp: 0.1 });
    scroller.current = engine;

    const root = curtainRef.current;
    const curtain = root ? buildCurtain(root.querySelectorAll("[data-curtain-panel]"), { from: "bottom" }) : null;
    cover.current = curtain;

    // On back or forward the entry has already changed but the page has not,
    // so this is the last moment the leaving entry's position can be read.
    const leaveEntry = () => {
      if (currentEntry.current) positions.current.set(currentEntry.current, window.scrollY);
    };
    window.addEventListener("popstate", leaveEntry);

    return () => {
      window.removeEventListener("popstate", leaveEntry);
      curtain?.revert();
      cover.current = null;
      setCurtainPhase("idle");
      engine.destroy();
      scroller.current = null;
      window.history.scrollRestoration = restoration;
    };
  }, [setCurtainPhase]);

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute("data-motion-live", "");
    return clearTimer;
  }, [clearTimer]);

  const api = useMemo(
    () => ({
      registerPage,
      arrival,
      pageSettled,
      requestNavigation,
      claimFocus,
      covered,
      curtainRef,
    }),
    [registerPage, arrival, pageSettled, requestNavigation, claimFocus, covered],
  );

  return <RouteTransitionContext.Provider value={api}>{children}</RouteTransitionContext.Provider>;
}

/**
 * The route area: the one element that owns geometry while trees exchange, and
 * the only thing the cover spans. Persistent header and footer stay outside it,
 * so they never flash or disappear during a navigation.
 */
export function RouteArea({ children }: { children: ReactNode }) {
  const { covered } = useRouteTransition();
  return (
    <div className="route">
      {children}
      <div className="route-cover" aria-hidden="true" hidden={!covered} />
    </div>
  );
}
