import { useBlocker, useRouter } from "@tanstack/react-router";
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
import { MOTION_LIVE_ATTRIBUTE } from "./phases";

/** How long the cover may stay up if a navigation never produces a new page. */
const COVER_TIMEOUT = 3000;
/** How long to wait for the cover's frame before letting the push through. */
const PAINT_TIMEOUT = 120;

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
  /** True once, for a page whose intro follows a navigation this boundary ran. */
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
 * Owns page lifecycles for the route area.
 *
 * It lives in the root route component, the one component that outlives every
 * navigation, and holds the three pieces the lifecycle needs: one `useBlocker`
 * that keeps a requested navigation waiting while the outgoing page plays its
 * outro on live DOM, one history subscription that recognises back and forward,
 * and one cover over the route container for the gap between end state and the
 * incoming page's initial state.
 *
 * Nothing here cancels or re-issues a navigation: the original push continues
 * once the blocker's promise resolves, so `replace`, `resetScroll`, and the
 * Link's own intent all survive.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const active = useRef<PageController | null>(null);
  const locked = useRef(false);
  /** Resolver of the blocker promise for the navigation currently in flight. */
  const allow = useRef<((blocked: boolean) => void) | null>(null);
  /** Identity of the navigation in flight, so an abandoned outro stays quiet. */
  const token = useRef<object | null>(null);
  /** The last history action, so back and forward take the intro-only path. */
  const lastAction = useRef<string>("PUSH");
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
    token.current = null;
    setCovered(false);
  }, [clearTimer]);

  const registerPage = useCallback(
    (controller: PageController) => {
      active.current = controller;
      // The lock lifts as the incoming page writes its initial state, not when
      // its intro ends. Holding it through the intro would leave every link
      // dead for the intro's duration.
      finishNavigation();
      return () => {
        if (active.current === controller) active.current = null;
      };
    },
    [finishNavigation],
  );

  // One blocker for the whole router, mounted once. It is the only hook that
  // runs before the URL changes, which is why the outro lives in it.
  useBlocker({
    // Motion only. The browser's unload dialog on reload and tab close is not
    // this controller's business.
    enableBeforeUnload: false,
    shouldBlockFn: useCallback(
      ({
        current,
        next,
        action,
      }: {
        current: { pathname: string };
        next: { pathname: string };
        action: string;
      }) => {
        // BACK, FORWARD and GO reach here from popstate, with the new entry
        // already in the address bar. Blocking one reverses history and the
        // reader sees a bounce, so they always take the intro-only path.
        if (action !== "PUSH" && action !== "REPLACE") return false;
        // The screen already showing: a hash-only or search-only change.
        if (next.pathname === current.pathname) return false;
        // One navigation at a time. A second request while one is in flight is
        // cancelled outright rather than queued, so the first accepted
        // destination wins and exactly one outro ever runs.
        if (locked.current) return true;
        const controller = active.current;
        // Before hydration there is no page controller to outro. Let the router
        // have it; the destination still runs its own intro.
        if (!controller) return false;

        locked.current = true;
        focusPending.current = true;
        const mine = {};
        token.current = mine;

        return new Promise<boolean>((resolve) => {
          allow.current = resolve;
          controller.leave(() => {
            // A history move landed while the outro was playing and took this
            // navigation over. Stay quiet; that path already resolved us.
            if (token.current !== mine) return;
            // The old page is at its end state. Cover the route container for
            // the loaders-and-commit gap, then let the push through.
            setCovered(true);
            clearTimer();
            timer.current = setTimeout(finishNavigation, COVER_TIMEOUT);
            afterPaint(() => {
              if (token.current !== mine) return;
              allow.current = null;
              resolve(false);
            });
          });
        });
      },
      [clearTimer, finishNavigation],
    ),
  });

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");

    // Fires on every history change, before any router event, because the
    // history change is what starts the load.
    const unsubscribe = router.history.subscribe(({ action }) => {
      lastAction.current = action.type;
      if (action.type === "PUSH" || action.type === "REPLACE") return;
      // Back or forward during an outro. The requested push must never commit
      // over the entry the browser just restored, so resolve its promise with
      // `true` to cancel it rather than leaving it pending forever.
      token.current = null;
      const pending = allow.current;
      allow.current = null;
      pending?.(true);
      focusPending.current = false;
      finishNavigation();
    });

    return () => {
      unsubscribe();
      clearTimer();
      // Never strand a blocker: a controller that goes away lets its
      // navigation through.
      allow.current?.(false);
      allow.current = null;
    };
  }, [router, finishNavigation, clearTimer]);

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
 * The route area: the one stable element that owns geometry while route trees
 * exchange, and the only thing the cover spans. Persistent header and footer
 * stay outside it, so they never flash or disappear during a navigation.
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
