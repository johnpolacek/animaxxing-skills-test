"use client";

import { useRouter } from "next/navigation";
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

/** How long the cover may stay up if a push never produces a new page. */
const COVER_TIMEOUT = 3000;
/** How long to wait for the cover's frame before pushing anyway. */
const PAINT_TIMEOUT = 120;

export type NavigationOptions = { replace?: boolean; scroll?: boolean };

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
  /** True when the boundary took the navigation over and will push itself. */
  requestNavigation: (href: string, options?: NavigationOptions) => boolean;
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
 * A requested navigation runs the outgoing page's outro on live DOM, raises a
 * cover over the route area only, pushes, and lowers the cover once the
 * incoming page has written its initial state. Unrequested navigation — back,
 * forward, anything that bypasses the helper — never reaches here, so those
 * routes run initial state and intro and nothing else.
 *
 * The cover is React state rather than an inline style: a GSAP context revert
 * during the swap would erase an inline one exactly when it is needed.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
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

  const requestNavigation = useCallback(
    (href: string, options: NavigationOptions = {}) => {
      // One navigation at a time. A second request while one is in flight is
      // swallowed rather than queued: the first accepted destination wins.
      if (locked.current) return true;
      const controller = active.current;
      // Before hydration there is no controller to outro. Let the router have
      // the click; the destination still runs its own intro.
      if (!controller) return false;

      locked.current = true;
      focusPending.current = true;
      controller.leave(() => {
        setCovered(true);
        clearTimer();
        timer.current = setTimeout(finishNavigation, COVER_TIMEOUT);
        afterPaint(() => {
          // Carry the link's own intent through to the router call.
          const navigate = options.replace ? router.replace : router.push;
          navigate(href, { scroll: options.scroll });
        });
      });
      return true;
    },
    [clearTimer, finishNavigation, router],
  );

  const claimFocus = useCallback(() => {
    const claimed = focusPending.current;
    focusPending.current = false;
    return claimed;
  }, []);

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute("data-motion-live", "");
    return clearTimer;
  }, [clearTimer]);

  const api = useMemo(
    () => ({ registerPage, requestNavigation, claimFocus, covered }),
    [registerPage, requestNavigation, claimFocus, covered],
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
