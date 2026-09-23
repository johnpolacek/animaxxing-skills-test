import gsap from "gsap";
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
} from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { captureShared, playShared, type SharedState } from "./layout-flip";
import { lenisScroll } from "./lenis-scroll";
import { curtain, type Curtain } from "./page-covers";
import { LIVE_ATTRIBUTE, prefersReducedMotion, routeOf } from "./phases";
import type { SmoothScroll } from "./scroll-controls";

/** How long the cover may stay up if the incoming route never reports ready. */
const COVER_TIMEOUT = 3000;
/**
 * How long an outro may run before the navigation is released anyway. The
 * longest planned exit is the curtain: 0.2s into a 0.55s outro, then a 0.72s
 * sweep. GSAP's ticker stops in a hidden tab, so a click from a background tab
 * still has to navigate.
 */
const OUTRO_TIMEOUT = 4000;
/** Seconds into the outro before the curtain's panels start to rise; the items exit first. */
const CURTAIN_DELAY = 0.2;
/** Lenis's easing: the fraction of the remaining distance covered per frame. */
const SCROLL_LERP = 0.1;

/**
 * `fresh` is a requested navigation or a new document: the full rise.
 * `return` is a history move: intro only, without travel, because the user is
 * coming back to something they have already seen.
 */
export type Arrival = "fresh" | "return";

export type LeaveOptions = {
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and whatever holds it stay.
   */
  keep?: Element | null;
  /**
   * A shell-owned timeline the end state waits for, such as the curtain
   * closing. It is awaited, never nested: the page's context is reverted at
   * unmount, and a nested curtain would sweep open mid-swap.
   */
  until?: gsap.core.Timeline | null;
};

export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /** Play the outro on live DOM and call back once the end state is applied. */
  leave: (done: () => void, options?: LeaveOptions) => void;
};

/** How a requested navigation travels: an ordinary swap, behind the curtain, or with a shared element. */
export type Transition = { kind: "plain" } | { kind: "curtain" } | { kind: "shared"; element: HTMLElement };

type CurtainPhase = "idle" | "covering" | "covered" | "revealing";
/** A shared element captured in the outro, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: SharedState };
/** What a link asked for, applied to the next navigation the blocker sees if it goes there. */
type Request = { to: string; transition: Transition; at: number };
/**
 * The router navigates in the same click that records a request, and the
 * blocker effect follows within a frame. A request older than this belongs to
 * a click the router declined, and must not attach to a later navigation.
 */
const REQUEST_TTL = 1000;

type RouteTransitionApi = {
  /**
   * A page announces itself as it writes its initial state, and the boundary
   * treats that as the incoming route being ready: cover down, lock released,
   * scroller synced, curtain lowered, shared element played.
   */
  registerPage: (controller: PageController, arrival: Arrival) => () => void;
  /** A page reports its settled state, which releases the scroller. */
  pageSettled: (controller: PageController) => void;
  /** True once, for a page whose intro follows a navigation this boundary held. */
  claimFocus: () => boolean;
  /** Whether the swap gap is currently covered by the route-area cover. */
  covered: boolean;
  /** A link records the transition it wants before the router navigates. */
  requestTransition: (to: string, transition: Transition) => void;
  /** The curtain's root, rendered by the root route in the persistent shell. */
  mountCurtain: (root: HTMLElement) => () => void;
};

const RouteTransitionContext = createContext<RouteTransitionApi | null>(null);

export function useRouteTransition(): RouteTransitionApi {
  const api = useContext(RouteTransitionContext);
  if (!api) throw new Error("useRouteTransition must be used inside <RouteTransition>");
  return api;
}

/**
 * Owns page lifecycles for the route area.
 *
 * React Router has no leave hook, so `useBlocker` is the hold: the router
 * checks it before it touches history or runs a loader, which means the URL is
 * unchanged and the outgoing route is live and interactive while the outro
 * plays. The end-state callback calls `proceed()`.
 *
 * Rendered by the root route, which mounts once per document and outlives every
 * client-side navigation, so the one blocker a router supports is registered
 * exactly once and is never deleted by a route unmounting. The same lifetime
 * makes it the home of everything that must survive a swap: the one smooth
 * scroller per document, the curtain, and the shared-element handoff.
 *
 * Unrequested navigation — back, forward, a redirect, anything the blocker
 * declines — never reaches the outro at all: those routes run initial state and
 * intro and nothing else.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const active = useRef<PageController | null>(null);
  const locked = useRef(false);
  const focusPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outroTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [covered, setCovered] = useState(false);

  // The persistent shell's instruments, created once per document.
  const scroller = useRef<SmoothScroll | null>(null);
  const curtainRoot = useRef<HTMLElement | null>(null);
  const cover = useRef<Curtain | null>(null);
  // Set by a link before the router navigates; read by the blocker effect.
  const request = useRef<Request | null>(null);
  // Written in the outro, read by the page it was captured for, cleared at settle.
  const handoff = useRef<Handoff | null>(null);
  // The navigation an outro belongs to. A pop mid-outro moves it on, so the
  // end state finds nothing to proceed.
  const leaving = useRef(0);
  // The page currently registered, so a stale microtask does nothing.
  const visit = useRef(0);

  const clearTimers = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (outroTimer.current !== null) clearTimeout(outroTimer.current);
    timer.current = outroTimer.current = null;
  }, []);

  const curtainPhase = (): CurtainPhase =>
    (curtainRoot.current?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle";
  const setCurtainPhase = (phase: CurtainPhase) => curtainRoot.current?.setAttribute("data-curtain-phase", phase);

  /** Raises the panels over the outgoing page. The timeline completes covered. */
  const lower = (): gsap.core.Timeline => {
    setCurtainPhase("covering");
    const sweep = cover.current!.cover();
    // The items exit first; the panels overlap the end of their fade.
    sweep.delay(CURTAIN_DELAY);
    sweep.eventCallback("onComplete", () => setCurtainPhase("covered"));
    return sweep;
  };

  /** Lowers the curtain from wherever it is, onto a page at its initial state. */
  const reveal = () => {
    if (!cover.current) return;
    setCurtainPhase("revealing");
    cover.current.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
  };

  const finishNavigation = useCallback(() => {
    clearTimers();
    locked.current = false;
    setCovered(false);
  }, [clearTimers]);

  /**
   * Every path that ends a navigation without an incoming page reaching
   * settled: the ready timeout. A stopped scroller or a closed curtain left
   * behind would freeze the page.
   */
  const release = useCallback(() => {
    finishNavigation();
    handoff.current = null;
    scroller.current?.start();
    if (curtainPhase() !== "idle") reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishNavigation]);

  const registerPage = useCallback(
    (controller: PageController, arrival: Arrival) => {
      active.current = controller;
      const token = ++visit.current;
      // The lock lifts as the incoming intro begins, not when it ends. Holding
      // it through the intro would leave every link dead for its duration.
      finishNavigation();
      // A history move has no outro and therefore no capture; never replay a stale one.
      if (arrival === "return") handoff.current = null;
      // The page's layout effect shares the commit with <ScrollRestoration>,
      // which runs after it. A microtask later the router's scroll has landed,
      // the page holds its initial state, and the intro is about to step.
      queueMicrotask(() => {
        if (visit.current !== token || active.current !== controller) return;
        // The engine adopts what the router chose: the top for a push, the
        // saved position for a pop. It re-measures first, since it clamps a
        // jump to the height it last saw.
        scroller.current?.scrollTo(window.scrollY, { immediate: true });
        scroller.current?.resize();
        // Start values are written, so the curtain may leave, overlapping the
        // intro. A history move never covers, but it lowers a curtain a
        // cancelled navigation left up.
        if (curtainPhase() !== "idle") reveal();
        // The handoff plays only on the page it was captured for. Reading does
        // not consume it: development runs the page setup twice.
        const arriving = handoff.current;
        if (arriving && arriving.path === routeOf(location.pathname)) {
          const target = controller.root.querySelector<HTMLElement>(
            `[data-shared-hero][data-flip-id="${CSS.escape(arriving.id)}"]`,
          );
          // The hero is laid out at its final size and visible; the thumbnail left with the swap.
          if (target) playShared(arriving.state, target);
        }
      });
      return () => {
        if (active.current === controller) active.current = null;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finishNavigation],
  );

  const pageSettled = useCallback((controller: PageController) => {
    if (active.current !== controller) return;
    handoff.current = null;
    scroller.current?.start();
  }, []);

  const requestTransition = useCallback((to: string, transition: Transition) => {
    request.current = { to: routeOf(to), transition, at: performance.now() };
  }, []);

  const mountCurtain = useCallback((root: HTMLElement) => {
    curtainRoot.current = root;
    // Built here, in the shell, so no page's context revert can touch it.
    cover.current = curtain(root.querySelectorAll<HTMLElement>("[data-curtain-panel]"), { from: "bottom" });
    return () => {
      cover.current?.revert();
      cover.current = null;
      if (curtainRoot.current === root) {
        root.setAttribute("data-curtain-phase", "idle");
        curtainRoot.current = null;
      }
    };
  }, []);

  const blocker = useBlocker(
    useCallback<BlockerFunction>(({ currentLocation, nextLocation, historyAction }) => {
      // Back and forward are never held. Blocking a POP makes the router
      // restore the URL with a reverse history.go, which flashes the
      // destination in the address bar, and the design gives history the
      // intro-only path anyway. This is also the first the boundary hears of a
      // pop: one that lands mid-outro abandons that navigation, so its end
      // state proceeds nowhere and the popped page takes over. The router
      // resets the blocker itself when the pop completes.
      if (historyAction === "POP") {
        leaving.current += 1;
        request.current = null;
        handoff.current = null;
        return false;
      }
      // The same screen is not a transition. A hash or search-only change stays
      // on the page that is already showing.
      if (currentLocation.pathname === nextLocation.pathname) return false;
      // Nothing to play an outro on: before hydration finishes, or after the
      // page unregistered. Let the router have it; the destination still runs
      // its own intro.
      if (!active.current) return false;
      // One navigation at a time. A second click while an outro is running is
      // still blocked, so the router retargets rather than navigating out from
      // under the outro. The effect below ignores the retarget and the end
      // state proceeds with the destination it captured, so the first click
      // wins and no second outro is ever started.
      return true;
    }, []),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    // Already outroing: this is the retarget from a second click. Leave the
    // blocker where it is; the outro in flight owns the navigation, and the
    // later click's request never applies.
    if (locked.current) {
      request.current = null;
      return;
    }

    const controller = active.current;
    if (!controller) {
      // The page went away between the blocker function and this effect.
      blocker.reset?.();
      return;
    }

    locked.current = true;
    focusPending.current = true;
    const token = ++leaving.current;
    // Captured now, while it still belongs to the first destination. A later
    // click hands back a new blocker object whose `proceed` points at the
    // second one; this is the one the end state calls.
    const proceed = blocker.proceed;
    const destination = routeOf(blocker.location.pathname);

    // The transition the clicked link asked for, if the router is going where it pointed.
    const asked = request.current;
    request.current = null;
    const applies = asked && asked.to === destination && performance.now() - asked.at < REQUEST_TTL;
    let transition: Transition = applies ? asked.transition : { kind: "plain" };

    // The page holds still through the outro and the swap; the incoming page's
    // settled state releases it.
    scroller.current?.stop();
    // A replaced navigation's capture never plays.
    handoff.current = null;

    let until: gsap.core.Timeline | null = null;
    if (transition.kind === "curtain") {
      // Reduced motion never shows a panel; the ordinary route-area cover spans that swap instead.
      if (cover.current && !prefersReducedMotion()) until = lower();
      else transition = { kind: "plain" };
    }
    if (transition.kind === "shared") {
      // Captured while the thumbnail is still laid out, before the outro moves anything.
      handoff.current = {
        path: destination,
        id: transition.element.dataset.flipId ?? "",
        state: captureShared(transition.element),
      };
    }
    const kind = transition.kind;
    const keep = transition.kind === "shared" ? transition.element : null;

    let ended = false;
    const end = () => {
      // Once, and only for the navigation this outro was started for.
      if (ended || leaving.current !== token) return;
      ended = true;
      clearTimers();
      // End state: the outgoing page is finished but still mounted. The route
      // area is covered for the swap unless the curtain already is, or a
      // shared element must stay in view. Then release the router. Loaders run
      // only after this, so the cover spans the whole gap.
      if (kind === "plain") setCovered(true);
      timer.current = setTimeout(release, COVER_TIMEOUT);
      proceed?.();
    };

    controller.leave(end, { keep, until });
    // A stalled timeline or a hidden tab's frozen ticker never traps the user
    // on a dead link.
    outroTimer.current = setTimeout(end, OUTRO_TIMEOUT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, clearTimers, release]);

  useLayoutEffect(() => {
    // One scroller per document, owned here and never by a page. It is held
    // still until the first page settles, through every outro and swap, and
    // handed back at each settled state. <ScrollRestoration> keeps restoring
    // the native position; the ready microtask syncs the engine to it.
    const engine = lenisScroll({ lerp: SCROLL_LERP });
    engine.stop();
    scroller.current = engine;
    return () => {
      // Development reruns this effect; the second create follows this destroy.
      engine.destroy();
      if (scroller.current === engine) scroller.current = null;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute(LIVE_ATTRIBUTE, "");
  }, []);

  const claimFocus = useCallback(() => {
    const claimed = focusPending.current;
    focusPending.current = false;
    return claimed;
  }, []);

  const api = useMemo(
    () => ({ registerPage, pageSettled, claimFocus, covered, requestTransition, mountCurtain }),
    [registerPage, pageSettled, claimFocus, covered, requestTransition, mountCurtain],
  );

  return <RouteTransitionContext.Provider value={api}>{children}</RouteTransitionContext.Provider>;
}

/**
 * The route container: one stable element around `<Outlet />` that owns geometry
 * while the two trees exchange, and the only thing the cover spans. The
 * persistent header and footer stay outside it, so they never flash or
 * disappear during a navigation.
 *
 * The cover is React state rather than an inline style, because a GSAP context
 * revert during the swap would erase an inline one exactly when it is needed.
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
