import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { LIVE_ATTRIBUTE } from "./phases";

/** How long the cover may stay up if the incoming route never reports ready. */
const COVER_TIMEOUT = 3000;

export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /** Play the outro on live DOM and call back once the end state is applied. */
  leave: (done: () => void) => void;
};

type RouteTransitionApi = {
  /**
   * A page announces itself as it writes its initial state, and the boundary
   * treats that as the incoming route being ready: cover down, lock released.
   */
  registerPage: (controller: PageController) => () => void;
  /** True once, for a page whose intro follows a navigation this boundary held. */
  claimFocus: () => boolean;
  /** Whether the swap gap is currently covered. */
  covered: boolean;
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
 * exactly once and is never deleted by a route unmounting.
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
  const [covered, setCovered] = useState(false);

  const clearTimer = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const finishNavigation = useCallback(() => {
    clearTimer();
    locked.current = false;
    setCovered(false);
  }, [clearTimer]);

  const registerPage = useCallback(
    (controller: PageController) => {
      active.current = controller;
      // The lock lifts as the incoming intro begins, not when it ends. Holding
      // it through the intro would leave every link dead for its duration.
      finishNavigation();
      return () => {
        if (active.current === controller) active.current = null;
      };
    },
    [finishNavigation],
  );

  const blocker = useBlocker(
    useCallback<BlockerFunction>(({ currentLocation, nextLocation, historyAction }) => {
      // Back and forward are never held. Blocking a POP makes the router
      // restore the URL with a reverse history.go, which flashes the
      // destination in the address bar, and the design gives history the
      // intro-only path anyway.
      if (historyAction === "POP") return false;
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
    // blocker where it is; the outro in flight owns the navigation.
    if (locked.current) return;

    const controller = active.current;
    if (!controller) {
      // The page went away between the blocker function and this effect.
      blocker.reset?.();
      return;
    }

    locked.current = true;
    focusPending.current = true;
    // Captured now, while it still belongs to the first destination. A later
    // click hands back a new blocker object whose `proceed` points at the
    // second one; this is the one the end state calls.
    const proceed = blocker.proceed;

    controller.leave(() => {
      // End state: the outgoing page is finished but still mounted. Cover the
      // route area before the swap, then release the router. Loaders run only
      // after this, so the cover spans the whole gap.
      setCovered(true);
      clearTimer();
      timer.current = setTimeout(finishNavigation, COVER_TIMEOUT);
      proceed?.();
    });
  }, [blocker, clearTimer, finishNavigation]);

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute(LIVE_ATTRIBUTE, "");
    return clearTimer;
  }, [clearTimer]);

  const claimFocus = useCallback(() => {
    const claimed = focusPending.current;
    focusPending.current = false;
    return claimed;
  }, []);

  const api = useMemo(
    () => ({ registerPage, claimFocus, covered }),
    [registerPage, claimFocus, covered],
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
