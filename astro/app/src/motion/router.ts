import { gsap } from "./gsap";
import { mountChromeMotion } from "./chrome";
import { createPageController, writeInitialState, type LeaveOptions, type PageController } from "./page";
import {
  MOTION_ATTRIBUTE,
  MOTION_LIVE_ATTRIBUTE,
  motionReleased,
  prefersReducedMotion,
  type Arrival,
} from "./phases";
import { lenisScroll } from "./lenis-scroll";
import { curtain, type Curtain } from "./page-covers";
import { captureShared, playShared, type SharedState } from "./layout-flip";

/**
 * The layout-level module.
 *
 * Under `<ClientRouter />` the document survives every navigation, so this
 * module runs once per visit and never again. Everything below is therefore
 * registered once, at module scope, and every handler finds the page that is
 * current when it fires rather than closing over the one that was current when
 * it was written.
 */

/** A stalled outro must never trap the reader on a page that no longer answers. */
const OUTRO_TIMEOUT = 1000;
/** How long the one-navigation lock may outlive a navigation that never lands. */
const LOCK_TIMEOUT = 5000;
/**
 * A beat at full cover before the swap, in ms. The router's swap runs inside a
 * view transition, and for its few frames the browser hit-tests the snapshot
 * rather than the DOM, so a covered state that is swapped the instant the
 * panels land is never on screen as something a click can reach. The hold
 * guarantees the closed curtain is painted, and clickable, before the swap.
 */
const COVERED_HOLD = 200;

/** How a click travels: an ordinary swap, behind the curtain, or with a shared element. */
type Transition = { kind: "plain" } | { kind: "curtain" } | { kind: "shared"; element: HTMLElement };
type CurtainPhase = "idle" | "covering" | "covered" | "revealing";
/** A shared element captured in the outro, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: SharedState };

/** `/gallery/` and `/gallery` are one route. */
const routeOf = (pathname: string) => pathname.replace(/\/$/, "") || "/";

let controller: PageController | null = null;
/** The node the current controller owns. The guard is the node, not a boolean. */
let owned: HTMLElement | null = null;
/** How the page that is about to arrive should be introduced. */
let arrival: Arrival = "fresh";
/** Counts intros, so a settled callback from a replaced page cannot release the scroller. */
let visit = 0;

let locked = false;
let lockTimer = 0;
/** True for a page whose intro follows a navigation this document ran. */
let focusPending = false;

/** The captured thumbnail waiting for its hero, keyed by destination. */
let handoff: Handoff | null = null;
/** The morph playing on the current page, killed with the body it moves. */
let morph: gsap.core.Timeline | null = null;

// The very first act, before any listener is registered or anything can throw:
// tell the inline script's failsafe that the lifecycle is live, so a bundle
// that merely arrived late keeps its intro instead of being released.
document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
mountChromeMotion();

// One scroller per document, created here in the persistent shell and never by
// a page. The window survives every swap, so this instance is the one for the
// whole visit. Under reduced motion the recipe hands back native controls.
const scroller = lenisScroll({ lerp: 0.1 });

// The curtain is marked `transition:persist`, so these panel nodes cross every
// swap alive and the one instance stays valid. Its phase is reported on the root.
const curtainRoot = document.querySelector<HTMLElement>("[data-curtain]");
const panels = () => curtainRoot?.querySelectorAll<HTMLElement>("[data-curtain-panel]") ?? [];
let cover: Curtain | null = curtainRoot ? curtain(panels(), { from: "bottom" }) : null;
const curtainPhase = (): CurtainPhase =>
  (curtainRoot?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle";
const setCurtainPhase = (phase: CurtainPhase) => curtainRoot?.setAttribute("data-curtain-phase", phase);

const pageRoot = () => document.querySelector<HTMLElement>("[data-page]");

function lock() {
  locked = true;
  window.clearTimeout(lockTimer);
  lockTimer = window.setTimeout(unlock, LOCK_TIMEOUT);
}

function unlock() {
  locked = false;
  window.clearTimeout(lockTimer);
}

/**
 * One navigation at a time: the first accepted destination wins.
 *
 * The router's own click handler bails on a click whose default is already
 * prevented, so preventing it in the capture phase is how a second click is
 * swallowed. This is not a router beside the router: it starts no navigation,
 * reads no href, and does nothing at all unless a navigation is in flight.
 */
document.addEventListener(
  "click",
  (event) => {
    if (!locked || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    if (new URL(link.href, location.href).origin !== location.origin) return;
    event.preventDefault();
  },
  true,
);

/** What a link asks for: the curtain by opt-in, a morph when it carries a shared element. */
function transitionFor(source: Element | undefined): Transition {
  const link = source?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
  if (!link) return { kind: "plain" };
  if (link.dataset.transition === "curtain") return { kind: "curtain" };
  const element = link.matches("[data-shared]") ? link : link.querySelector<HTMLElement>("[data-shared]");
  return element ? { kind: "shared", element } : { kind: "plain" };
}

/**
 * Outro, on live DOM, before anything is fetched or swapped.
 *
 * The loader is wrapped rather than awaited in sequence: outro and fetch start
 * together, so a slow route spends its latency inside the outro instead of
 * adding to it, and the outro's length is the only budget the network gets.
 */
document.addEventListener("astro:before-preparation", (event) => {
  lock();
  focusPending = true;
  // A newer navigation replaces any capture waiting for a page that will not come.
  handoff = null;
  // The page holds still from here until the incoming page settles.
  scroller.stop();

  // Back and forward get an intro-only path. The URL has already changed and
  // the reader expects the page they left, so an outro here would be a lie.
  // The outgoing page still goes to its end state: it stays readable until the
  // swap, but it is no longer a settled page under an address it does not own.
  if (event.navigationType === "traverse") {
    arrival = "return";
    controller?.finish();
    return;
  }
  arrival = "fresh";

  // A form submission and a link to the page already showing get no outro.
  if (event.formData) return;
  if (event.to.pathname === event.from.pathname && event.to.search === event.from.search) return;

  const page = controller;
  if (!page) return;

  const transition = transitionFor(event.sourceElement);
  const options: LeaveOptions = {};
  let covered: Promise<void> | undefined;
  if (transition.kind === "curtain" && cover) {
    // The shell owns the cover: it is built here, composed into the outro so
    // the end state means covered, and handed back before the page context dies.
    // Phases are written from its completion, never after the call returns.
    setCurtainPhase("covering");
    const sweep = cover.cover();
    const instant = prefersReducedMotion() || motionReleased();
    covered = new Promise<void>((resolve) => {
      sweep.eventCallback("onComplete", () => {
        setCurtainPhase("covered");
        // The instant path never shows a panel, so there is nothing to hold for.
        if (instant) resolve();
        else window.setTimeout(resolve, COVERED_HOLD);
      });
    });
    options.extra = sweep;
  } else if (transition.kind === "shared") {
    // Captured while the thumbnail is still laid out, before the outro moves
    // anything. Keyed by destination; a redirect or a newer click discards it.
    const id = transition.element.dataset.flipId ?? "";
    handoff = { path: routeOf(event.to.pathname), id, state: captureShared(transition.element) };
    options.keep = transition.element;
  }

  const budget = OUTRO_TIMEOUT + (options.extra ? options.extra.totalDuration() * 1000 + COVERED_HOLD : 0);
  const load = event.loader;
  event.loader = async () => {
    await Promise.all([
      untilDone(Promise.all([page.leave(options), covered]).then(() => {}), event.signal, budget),
      load(),
    ]);
  };
});

/**
 * Resolve on the end state, on a newer navigation aborting this one, or on a
 * timeout budgeted from the planned outro. GSAP's ticker stops in a hidden tab,
 * so a click from a background tab must still reach the swap.
 */
function untilDone(done: Promise<void>, signal: AbortSignal, budget: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, budget);
    signal.addEventListener("abort", finish, { once: true });
    done.then(finish);
  });
}

/**
 * The last moment the old body exists, and the only chance to reach the
 * incoming document.
 *
 * The user is watching a snapshot from here until the swap is revealed, so
 * nothing done here is visible and nothing here may animate.
 */
document.addEventListener("astro:before-swap", (event) => {
  const root = event.newDocument.documentElement;
  // `<html>` attributes are replaced wholesale by the new document's, so the
  // pre-paint mark has to be written onto the incoming document or the hiding
  // rule would not apply to the new body's first frame.
  if (!motionReleased()) {
    root.setAttribute(MOTION_ATTRIBUTE, "js");
    root.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
  }
  // Lenis keys `overflow: clip` on its own `<html>` classes, which the swap
  // would drop; carry them over so the stopped page stays still. Lenis rewrites
  // them itself at `start()`.
  for (const name of Array.from(document.documentElement.classList)) {
    if (name === "lenis" || name.startsWith("lenis-")) root.classList.add(name);
  }

  // A morph still moving the old body's hero has nothing left to move.
  morph?.kill();
  morph = null;
  controller?.destroy();
  controller = null;
  owned = null;
});

/**
 * The new body is in the DOM and nothing has painted. Write start values now so
 * the hand-off from the CSS rule to the controller is exact.
 */
document.addEventListener("astro:after-swap", () => {
  // The header DOM persists; only its current-page semantics change.
  document.querySelectorAll<HTMLAnchorElement>(".site-nav a").forEach((link) => {
    if (new URL(link.href).pathname === location.pathname) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const root = pageRoot();
  if (root) writeInitialState(root, arrival);
  // The router has already scrolled: the top for a push, the saved position on
  // a traverse. Sync the engine's target to it before anything is measured.
  scroller.scrollTo(window.scrollY, { immediate: true });
});

/**
 * The new page's scripts have run. Build the controller for whichever page is
 * present and play its intro.
 */
document.addEventListener("astro:page-load", () => start());

/** Lowers the curtain from wherever it is; the intro overlaps it. */
function reveal() {
  if (!cover) return;
  setCurtainPhase("revealing");
  cover.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
}

function start() {
  const root = pageRoot();
  if (!root) return;
  // Setup must be right when it runs twice on the same body: this module's own
  // first run and the `astro:page-load` that follows it both reach the first
  // page, because that event waits for window `load`.
  if (owned === root && controller) return;

  controller?.destroy();
  owned = root;
  controller = createPageController(root);
  const token = ++visit;
  // The page holds still through its intro. After a swap the scroller is already
  // stopped; on a first load this is where it stops. Re-measure the new page
  // before the intro, then let the settled state release it.
  scroller.stop();
  scroller.resize();
  controller.enter(arrival, focusPending, () => {
    if (token === visit) scroller.start();
  });
  focusPending = false;

  // Start values are written, so the curtain may leave, overlapping the intro.
  // A traverse never covers, but it lowers a curtain a cancelled navigation left up.
  if (curtainPhase() !== "idle") reveal();

  // The handoff plays only on the page it was captured for; a traverse has no
  // capture and takes the ordinary intro. The hero is laid out at its final
  // size and visible; the thumbnail left with the old body.
  const arriving = handoff && handoff.path === routeOf(location.pathname) ? handoff : null;
  handoff = null;
  if (arriving) {
    const target = root.querySelector<HTMLElement>(
      `[data-shared-hero][data-flip-id="${CSS.escape(arriving.id)}"]`,
    );
    if (target) {
      morph = playShared(arriving.state, target, {
        onComplete: () => {
          morph = null;
        },
      });
    }
  }

  unlock();
}

// A history navigation that landed on a fresh document, rather than through the
// router, is still a return.
const entry = performance.getEntriesByType("navigation")[0] as
  | PerformanceNavigationTiming
  | undefined;
arrival = entry?.type === "back_forward" ? "return" : "fresh";

start();

// A navigation the loader gives up on becomes a full load, and a link marked
// `data-astro-reload` or an external site ends the document. Leave it readable
// and scrollable, so a bfcache restore does not come back frozen mid-cover.
window.addEventListener("pagehide", () => {
  visit += 1;
  handoff = null;
  morph?.kill();
  morph = null;
  cover?.revert();
  cover = null;
  setCurtainPhase("idle");
  scroller.start();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  if (curtainRoot && !cover) cover = curtain(panels(), { from: "bottom" });
  // The scroller is still alive: adopt the restored position, with no intro.
  scroller.resize();
  scroller.start();
});
