import "lenis/dist/lenis.css";
import { gsap } from "./motion/gsap";
import { navigationType, prefersReducedMotion } from "./motion/env";
import { interceptLinks } from "./motion/links";
import { createPageController, type PageController } from "./motion/page";
import { mountChromeMotion } from "./motion/chrome";
import { lenisScroll } from "./motion/lenis-scroll";
import { curtain, type Curtain } from "./motion/page-covers";
import { captureShared, playShared, type SharedState } from "./motion/layout-flip";

/** How a click travels: an ordinary swap, behind the curtain, or with a shared element. */
type Transition = { kind: "plain" } | { kind: "curtain" } | { kind: "shared"; element: HTMLElement };
type CurtainPhase = "idle" | "covering" | "covered" | "revealing";
/** A shared element captured in the outro, waiting for the page it was clicked toward. */
type Handoff = { path: string; id: string; state: SharedState };

const route = (href: string) => new URL(href, location.href).pathname.replace(/\/$/, "") || "/";
/** The scroll position this history entry was left at, saved before leaving it. */
const savedScroll = () => Number((history.state as { scrollY?: number } | null)?.scrollY) || 0;

const year = document.querySelector<HTMLElement>("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());

// This module and the shell survive every internal navigation.
document.documentElement.setAttribute("data-motion-live", "");
mountChromeMotion();

// One scroller per document, owned here and never by a page. This controller
// holds it through an outro and moves it after every swap. Scroll restoration
// is owned here too, so the browser cannot fight the swap on history moves.
history.scrollRestoration = "manual";
const scroller = lenisScroll({ lerp: 0.1 });

// The curtain lives in the shell beside the route container, so it survives the
// swap it hides. Its phase is reported on the root for CSS and tests.
const curtainRoot = document.querySelector<HTMLElement>("[data-curtain]");
const panels = () => curtainRoot?.querySelectorAll<HTMLElement>("[data-curtain-panel]") ?? [];
let cover: Curtain | null = curtainRoot ? curtain(panels(), { from: "bottom" }) : null;
const curtainPhase = (): CurtainPhase =>
  (curtainRoot?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle";
const setCurtainPhase = (phase: CurtainPhase) => curtainRoot?.setAttribute("data-curtain-phase", phase);

let controller: PageController | null = null;
let generation = 0;
let pending: AbortController | null = null;
let handoff: Handoff | null = null;

const root = document.querySelector<HTMLElement>("[data-page]");
if (root) {
  // A reload or a history load of a fresh document lands where the entry was
  // left; the engine then adopts wherever the document is. The page holds still
  // through its intro and the intro's completion releases it.
  const returning = navigationType() === "back_forward";
  if (navigationType() !== "navigate") window.scrollTo(0, savedScroll());
  scroller.scrollTo(window.scrollY, { immediate: true });
  scroller.stop();
  controller = createPageController(root);
  controller.enter(returning ? "return" : "fresh", () => scroller.start());
}

/** Lowers the curtain from wherever it is; the intro overlaps it. */
function reveal() {
  if (!cover) return;
  setCurtainPhase("revealing");
  const sweep = cover.reveal();
  // Reduced motion completes at once and never shows a panel.
  if (prefersReducedMotion()) setCurtainPhase("idle");
  else sweep.eventCallback("onComplete", () => setCurtainPhase("idle"));
}

/**
 * The outgoing page's outro, with the curtain composed in when the click asked
 * for it and the shared element left lit when one is travelling. Resolves from
 * the end state, or from a watchdog budgeted on the planned duration so a
 * stalled timeline or a hidden tab's frozen ticker never traps the user.
 */
function leave(transition: Transition): Promise<void> {
  return new Promise((resolve) => {
    if (!controller) return resolve();
    let extra: gsap.core.Timeline | undefined;
    if (transition.kind === "curtain" && cover) {
      setCurtainPhase("covering");
      extra = cover.cover();
      if (prefersReducedMotion()) setCurtainPhase("covered");
      else extra.eventCallback("onComplete", () => setCurtainPhase("covered"));
    }
    let settled = false;
    let timer = 0;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timeline = controller.leave(done, {
      extra,
      keep: transition.kind === "shared" ? transition.element : null,
    });
    if (!settled) timer = window.setTimeout(done, 1000 + (timeline?.totalDuration() ?? 0) * 1000);
  });
}

async function navigate(href: string, transition: Transition = { kind: "plain" }, historyNavigation = false) {
  const token = ++generation;
  pending?.abort();
  // A replaced navigation's capture never plays.
  handoff = null;
  // The page holds still through the outro and the swap; the incoming page's
  // settled state releases it.
  scroller.stop();
  if (historyNavigation) {
    // The URL has already changed. Retire the old lifecycle immediately so it
    // cannot report a settled destination while the history fetch is pending.
    controller?.destroy();
    controller = null;
    document.querySelector<HTMLElement>("[data-page]")?.setAttribute("data-phase", "initial");
  } else {
    // Remember where this entry is left so back and forward can put it back.
    history.replaceState({ ...(history.state as object | null), scrollY: window.scrollY }, "");
    if (transition.kind === "shared") {
      // Captured while the thumbnail is still laid out, before the outro moves anything.
      const id = transition.element.dataset.flipId ?? "";
      handoff = { path: route(href), id, state: captureShared(transition.element) };
    }
  }
  const request = new AbortController();
  pending = request;
  const timeout = window.setTimeout(() => request.abort(), 5000);
  try {
    // Fetch and outro overlap, but the URL and content change only after both.
    const [html] = await Promise.all([
      fetch(href, { signal: request.signal, headers: { Accept: "text/html" } }).then((response) => {
        if (!response.ok) throw new Error("Page unavailable");
        return response.text();
      }),
      historyNavigation ? Promise.resolve() : leave(transition),
    ]);
    if (token !== generation) return;
    const incoming = new DOMParser().parseFromString(html, "text/html");
    const next = incoming.querySelector<HTMLElement>("[data-page]");
    const current = document.querySelector<HTMLElement>("[data-page]");
    if (!next || !current) throw new Error("Missing page content");
    controller?.destroy();
    if (!historyNavigation) history.pushState({ scrollY: 0 }, "", href);
    document.title = incoming.title;
    current.replaceWith(next);
    // Scroll lands before anything is measured: the top for a push, the saved
    // position for history. The engine re-measures first, since it clamps a
    // jump to the height it last saw and its own resize is debounced.
    const landing = historyNavigation ? savedScroll() : 0;
    window.scrollTo(0, landing);
    scroller.resize();
    scroller.scrollTo(landing, { immediate: true });
    // Expose the inserted initial state before a zero-duration intro settles.
    await Promise.resolve();
    document.querySelectorAll<HTMLAnchorElement>(".site-nav a").forEach((link) => {
      if (route(link.href) === route(location.href)) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    // The handoff plays only on the page it was captured for; a history move
    // has no capture and takes the ordinary intro.
    const arriving = handoff && handoff.path === route(location.href) ? handoff : null;
    handoff = null;
    controller = createPageController(next);
    controller.enter(historyNavigation ? "return" : "fresh", () => {
      if (token === generation) scroller.start();
    });
    // Start values are written, so the curtain may leave, overlapping the intro.
    // A history move never covers, but it lowers a curtain a cancelled navigation left up.
    if (historyNavigation ? curtainPhase() !== "idle" : transition.kind === "curtain") reveal();
    if (arriving) {
      // The hero is laid out at its final size and visible; the thumbnail left with the swap.
      const target = next.querySelector<HTMLElement>(`[data-shared-hero][data-flip-id="${CSS.escape(arriving.id)}"]`);
      if (target) playShared(arriving.state, target);
    }
    next.setAttribute("tabindex", "-1");
    next.focus({ preventScroll: true });
  } catch {
    // A failed fetch still leaves a working, real navigation path.
    if (token === generation) location.assign(href);
  } finally {
    clearTimeout(timeout);
    if (pending === request) pending = null;
  }
}

/** What a link asks for: the curtain by opt-in, a morph when it carries a shared element. */
function transitionFor(link: HTMLAnchorElement): Transition {
  if (link.dataset.transition === "curtain") return { kind: "curtain" };
  const element = link.matches("[data-shared]") ? link : link.querySelector<HTMLElement>("[data-shared]");
  return element ? { kind: "shared", element } : { kind: "plain" };
}

const links = interceptLinks((href, link) => navigate(href, transitionFor(link)));
window.addEventListener("popstate", () => {
  links.unlock();
  void navigate(location.href, { kind: "plain" }, true);
});
window.addEventListener("pagehide", () => {
  generation += 1;
  pending?.abort();
  handoff = null;
  controller?.restore();
  // A document frozen in the back-forward cache comes back uncovered and scrollable.
  cover?.revert();
  cover = null;
  setCurtainPhase("idle");
  scroller.start();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  links.unlock();
  controller?.restore();
  if (curtainRoot && !cover) cover = curtain(panels(), { from: "bottom" });
  // The scroller is still alive: adopt the restored position, with no intro.
  scroller.resize();
  scroller.start();
});
