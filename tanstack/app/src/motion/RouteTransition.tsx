import { useBlocker, useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { gsap, useGSAP } from "./gsap";
import { captureShared, playShared } from "./layout-flip";
import { lenisScroll } from "./lenis-scroll";
import { curtain, type Curtain as CurtainControls } from "./page-covers";
import { MOTION_LIVE_ATTRIBUTE, prefersReducedMotion } from "./phases";
import type { SmoothScroll } from "./scroll-controls";

/** How long the cover may stay up if a navigation never produces a new page. */
const COVER_TIMEOUT = 3000;
/** How long to wait for the cover's frame before letting the push through. */
const PAINT_TIMEOUT = 120;
/** Seconds after the outro starts that the curtain begins its sweep, overlapping the item exit. */
const CURTAIN_DELAY = 0.15;

/** `fresh` is a requested navigation or a new document; `return` is back or forward. */
export type Arrival = "fresh" | "return";
export type CurtainPhase = "idle" | "covering" | "covered" | "revealing";

/** What a link asks for beyond the ordinary swap: the curtain, or a shared element that morphs. */
export type TransitionIntent = { kind: "curtain" } | { kind: "shared"; element: HTMLElement };
type Transition = { kind: "plain" } | TransitionIntent;

export type LeaveOptions = {
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and its ancestors stay.
   */
  keep?: Element | null;
};

export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /** The presented route's pathname, so a shared-element handoff plays only on the page it was captured for. */
  path: string;
  /** Play the outro on live DOM and call back once the end state is applied. */
  leave: (done: () => void, options?: LeaveOptions) => void;
};

type FlipState = ReturnType<typeof captureShared>;
/** A shared element captured in the outro, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: FlipState };
/** A handoff matched to its mounted target, waiting for the router to land the scroll. */
type Morph = { controller: PageController; state: FlipState; target: HTMLElement };

type RouteTransitionApi = {
  /**
   * A page announces itself as it writes its initial state, and the boundary
   * treats that as the incoming route being ready: cover down, lock released.
   */
  registerPage: (controller: PageController) => () => void;
  /** A page reports its settled state, which releases what the shell held for its intro. */
  pageSettled: (controller: PageController) => void;
  /** True once, for a page whose intro follows a navigation this boundary ran. */
  claimFocus: () => boolean;
  /** How the page about to run its lifecycle was reached. Read before writing the initial state. */
  arrival: () => Arrival;
  /** A link records, from its own click, which transition the coming navigation takes. */
  requestTransition: (event: ReactMouseEvent, to: string, intent: TransitionIntent) => void;
  /** The curtain's root, from the persistent shell. Builds the recipe once; the cleanup reverts it. */
  registerCurtain: (root: HTMLElement) => () => void;
  /** Whether the swap gap is currently covered. */
  covered: boolean;
};

const RouteTransitionContext = createContext<RouteTransitionApi | null>(null);

export function useRouteTransition(): RouteTransitionApi {
  const api = useContext(RouteTransitionContext);
  if (!api) throw new Error("useRouteTransition must be used inside <RouteTransition>");
  return api;
}

/** `/gallery/` and `/gallery` are one route; the index match spells it with the slash. */
const routeOf = (pathname: string) => pathname.replace(/\/$/, "") || "/";

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
 * navigation, and holds the pieces the lifecycle needs: one `useBlocker` that
 * keeps a requested navigation waiting while the outgoing page plays its outro
 * on live DOM, one history subscription that recognises back and forward, one
 * cover over the route container for the gap between end state and the
 * incoming page's initial state, one smooth scroller for the document, the
 * curtain, and the handoff for a shared element travelling between pages.
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
  /** One scroller per document, owned here and never by a page. */
  const scroller = useRef<SmoothScroll | null>(null);
  /** The curtain's root and its recipe controls, once the shell has rendered it. */
  const curtainRoot = useRef<HTMLElement | null>(null);
  const cover = useRef<CurtainControls | null>(null);
  /** What the last clicked link asked for, until the blocker it was meant for reads it. */
  const intent = useRef<{ to: string; intent: TransitionIntent } | null>(null);
  /** Keyed by destination; reading never consumes it, so a double-run setup reads the same state. */
  const handoff = useRef<Handoff | null>(null);
  const pendingMorph = useRef<Morph | null>(null);
  const morph = useRef<{ controller: PageController; timeline: gsap.core.Timeline } | null>(null);

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

  const curtainPhase = useCallback(
    (): CurtainPhase => (curtainRoot.current?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle",
    [],
  );
  const setCurtainPhase = useCallback((phase: CurtainPhase) => {
    curtainRoot.current?.setAttribute("data-curtain-phase", phase);
  }, []);

  /** Lowers the curtain from wherever it is; the incoming intro overlaps it. */
  const reveal = useCallback(() => {
    const controls = cover.current;
    if (!controls) return;
    setCurtainPhase("revealing");
    // Under reduced motion the recipe shows nothing and completes on the next
    // tick; the phase follows the completion callback either way.
    controls.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
  }, [setCurtainPhase]);

  /**
   * A navigation ended without an incoming settled page: the ready timeout.
   * The scroller runs again, a curtain left closed opens onto whatever is
   * there, and a captured shared element is forgotten.
   */
  const release = useCallback(() => {
    finishNavigation();
    handoff.current = null;
    pendingMorph.current = null;
    scroller.current?.start();
    if (curtainPhase() !== "idle") reveal();
  }, [finishNavigation, curtainPhase, reveal]);

  const registerPage = useCallback(
    (controller: PageController) => {
      active.current = controller;
      // The lock lifts as the incoming page writes its initial state, not when
      // its intro ends. Holding it through the intro would leave every link
      // dead for the intro's duration.
      finishNavigation();
      // A captured shared element plays on the page it was captured for, and
      // only once the router has landed the scroll in `onRendered`: Flip
      // measures in viewport coordinates, so a morph played before the top
      // reset would end up wherever the old page's scroll left it.
      const arriving = handoff.current;
      pendingMorph.current = null;
      if (arriving && arriving.path === routeOf(controller.path)) {
        const target = controller.root.querySelector<HTMLElement>(
          `[data-shared-hero][data-flip-id="${CSS.escape(arriving.id)}"]`,
        );
        if (target) pendingMorph.current = { controller, state: arriving.state, target };
      }
      // This runs inside the page's own GSAP context. A timeline built here
      // would become that context's child and die with the page's revert, so
      // the curtain is handed off through a microtask.
      queueMicrotask(() => {
        if (active.current !== controller) return;
        // A curtain navigation reveals onto the prepared page; a history move
        // that landed while covered lowers the curtain the same way.
        if (curtainPhase() !== "idle") reveal();
      });
      return () => {
        if (active.current === controller) active.current = null;
        if (pendingMorph.current?.controller === controller) pendingMorph.current = null;
        // A morph still running belongs to a page on its way out: revert jumps
        // it to the end and clears its inline styles, where kill would not.
        if (morph.current?.controller === controller) {
          if (morph.current.timeline.isActive()) morph.current.timeline.revert();
          morph.current = null;
        }
      };
    },
    [finishNavigation, curtainPhase, reveal],
  );

  const pageSettled = useCallback((controller: PageController) => {
    if (active.current !== controller) return;
    handoff.current = null;
    if (pendingMorph.current?.controller === controller) pendingMorph.current = null;
    // Settled is where the shell hands the page back to the reader.
    scroller.current?.start();
  }, []);

  const registerCurtain = useCallback((root: HTMLElement) => {
    const controls = curtain(root.querySelectorAll<HTMLElement>("[data-curtain-panel]"), { from: "bottom" });
    curtainRoot.current = root;
    cover.current = controls;
    return () => {
      if (cover.current === controls) {
        cover.current = null;
        curtainRoot.current = null;
      }
      controls.revert();
      root.setAttribute("data-curtain-phase", "idle");
    };
  }, []);

  const requestTransition = useCallback((event: ReactMouseEvent, to: string, wanted: TransitionIntent) => {
    // The router's click handler ignores these clicks, so this does too; a
    // modifier click must not leave a request behind for the next navigation.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    intent.current = { to: routeOf(to), intent: wanted };
  }, []);

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
        // Whatever happens next, this call is the click the last request was
        // made for: read it once and let nothing stale survive.
        const requested = intent.current;
        intent.current = null;
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
        const transition: Transition =
          requested && requested.to === routeOf(next.pathname) ? requested.intent : { kind: "plain" };
        const reduced = prefersReducedMotion();

        // The page holds still from here through the swap; the incoming
        // page's settled state releases it.
        scroller.current?.stop();
        // A replaced navigation's capture never plays. A new one is captured
        // while the thumbnail is still laid out, before the outro moves anything.
        handoff.current =
          transition.kind === "shared"
            ? {
                path: routeOf(next.pathname),
                id: transition.element.dataset.flipId ?? "",
                state: captureShared(transition.element),
              }
            : null;

        // The curtain is the shell's own timeline, built here outside the
        // page's GSAP context, so the page's revert at unmount cannot pull it
        // open mid-swap. It overlaps the item exit and the URL waits for it.
        let covering: Promise<void> | null = null;
        if (transition.kind === "curtain" && cover.current) {
          setCurtainPhase("covering");
          const sweep = cover.current.cover();
          if (!reduced) sweep.delay(CURTAIN_DELAY);
          covering = new Promise((done) => {
            sweep.eventCallback("onComplete", () => {
              setCurtainPhase("covered");
              done();
            });
          });
        }
        // The route-area cover spans the swap gap of an ordinary navigation.
        // The curtain replaces it, except under reduced motion, where the
        // recipe never shows a panel and the ordinary cover takes over. A
        // morph is never covered: the cover would hide the element it needs.
        const routeCover = transition.kind === "plain" || (transition.kind === "curtain" && reduced);

        return new Promise<boolean>((resolve) => {
          allow.current = resolve;
          const proceed = () => {
            if (token.current !== mine) return;
            clearTimer();
            timer.current = setTimeout(release, COVER_TIMEOUT);
            const go = () => {
              if (token.current !== mine) return;
              allow.current = null;
              resolve(false);
            };
            if (!routeCover) return go();
            // Cover the route container for the loaders-and-commit gap, then
            // let the push through once the cover has painted.
            setCovered(true);
            afterPaint(go);
          };
          controller.leave(
            () => {
              // A history move landed while the outro was playing and took this
              // navigation over. Stay quiet; that path already resolved us.
              if (token.current !== mine) return;
              // The old page is at its end state. The URL moves once the
              // curtain, when there is one, is closed as well.
              if (covering) void covering.then(proceed);
              else proceed();
            },
            { keep: transition.kind === "shared" ? transition.element : null },
          );
        });
      },
      [clearTimer, release, setCurtainPhase],
    ),
  });

  // One scroller per document, created from the root that outlives every
  // navigation and destroyed with it. StrictMode and Fast Refresh rerun this
  // pair; destroy runs before the second create, so one scroller remains.
  useGSAP(() => {
    const controls = lenisScroll({ lerp: 0.1 });
    scroller.current = controls;
    // A position restored before hydration survives: the engine adopts
    // wherever the document is.
    controls.scrollTo(window.scrollY, { immediate: true });
    // A page still entering holds still until it settles and starts the
    // scroller itself. Under reduced motion these are native no-ops.
    const page = active.current;
    if (page && page.root.getAttribute("data-phase") !== "settled") controls.stop();
    return () => {
      if (scroller.current === controls) scroller.current = null;
      controls.destroy();
    };
  }, []);

  useEffect(() => {
    // Tells the pre-paint failsafe that a controller arrived, so it leaves the
    // mark alone and the hiding rule stays under the lifecycle's control.
    document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");

    // Fires on every history change, before any router event, because the
    // history change is what starts the load.
    const unsubscribeHistory = router.history.subscribe(({ action }) => {
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
      // The lock released without an intro: the scroller runs again, the
      // capture is stale, and a curtain left closed opens once the popped
      // page has registered, from there rather than onto the old page.
      handoff.current = null;
      pendingMorph.current = null;
      scroller.current?.start();
    });

    // The router has just scrolled, in its own `onRendered` subscriber that
    // was registered before this one: the top for a push, the saved position
    // for back and forward. The engine adopts it and re-measures the new page,
    // and a shared element waiting for that scroll can now morph.
    const unsubscribeRendered = router.subscribe("onRendered", () => {
      const controls = scroller.current;
      if (controls) {
        controls.scrollTo(window.scrollY, { immediate: true });
        controls.resize();
      }
      const next = pendingMorph.current;
      pendingMorph.current = null;
      if (!next || active.current !== next.controller) return;
      // The hero is laid out at its final size and visible; the thumbnail left
      // with the swap. The target is explicit so Flip never finds a stale copy.
      const timeline = playShared(next.state, next.target, {
        onComplete: () => {
          if (morph.current?.timeline === timeline) morph.current = null;
        },
      });
      morph.current = { controller: next.controller, timeline };
    });

    return () => {
      unsubscribeHistory();
      unsubscribeRendered();
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

  const arrival = useCallback(
    (): Arrival => (lastAction.current === "PUSH" || lastAction.current === "REPLACE" ? "fresh" : "return"),
    [],
  );

  const api = useMemo(
    () => ({ registerPage, pageSettled, claimFocus, arrival, requestTransition, registerCurtain, covered }),
    [registerPage, pageSettled, claimFocus, arrival, requestTransition, registerCurtain, covered],
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
