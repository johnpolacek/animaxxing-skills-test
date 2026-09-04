import { mountChromeMotion } from "./chrome";
import { createPageController, writeInitialState, type PageController } from "./page";
import {
  MOTION_ATTRIBUTE,
  MOTION_LIVE_ATTRIBUTE,
  motionReleased,
  type Arrival,
} from "./phases";

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

let controller: PageController | null = null;
/** The node the current controller owns. The guard is the node, not a boolean. */
let owned: HTMLElement | null = null;
/** How the page that is about to arrive should be introduced. */
let arrival: Arrival = "fresh";

let locked = false;
let lockTimer = 0;
/** True for a page whose intro follows a navigation this document ran. */
let focusPending = false;

// The very first act, before any listener is registered or anything can throw:
// tell the inline script's failsafe that the lifecycle is live, so a bundle
// that merely arrived late keeps its intro instead of being released.
document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
mountChromeMotion();

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

  // Back and forward get an intro-only path. The URL has already changed and
  // the reader expects the page they left, so an outro here would be a lie.
  if (event.navigationType === "traverse") {
    arrival = "return";
    return;
  }
  arrival = "fresh";

  // A form submission and a link to the page already showing get no outro.
  if (event.formData) return;
  if (event.to.pathname === event.from.pathname && event.to.search === event.from.search) return;

  const page = controller;
  if (!page) return;

  const load = event.loader;
  event.loader = async () => {
    await Promise.all([untilOutroDone(page, event.signal), load()]);
  };
});

/**
 * Resolve on the end state, on a newer navigation aborting this one, or on a
 * timeout. GSAP's ticker stops in a hidden tab, so a click from a background
 * tab must still reach the swap.
 */
function untilOutroDone(page: PageController, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, OUTRO_TIMEOUT);
    signal.addEventListener("abort", finish, { once: true });
    page.leave().then(finish);
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
  // `<html>` attributes are replaced wholesale by the new document's, so the
  // pre-paint mark has to be written onto the incoming document or the hiding
  // rule would not apply to the new body's first frame.
  if (!motionReleased()) {
    const root = event.newDocument.documentElement;
    root.setAttribute(MOTION_ATTRIBUTE, "js");
    root.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
  }

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
});

/**
 * The new page's scripts have run. Build the controller for whichever page is
 * present and play its intro.
 */
document.addEventListener("astro:page-load", () => start());

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
  controller.enter(arrival, focusPending);
  focusPending = false;
  unlock();
}

// A history navigation that landed on a fresh document, rather than through the
// router, is still a return.
const entry = performance.getEntriesByType("navigation")[0] as
  | PerformanceNavigationTiming
  | undefined;
arrival = entry?.type === "back_forward" ? "return" : "fresh";

start();
