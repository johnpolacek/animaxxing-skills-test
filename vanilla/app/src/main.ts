import { navigationType } from "./motion/env";
import { interceptLinks } from "./motion/links";
import { createPageController, type PageController } from "./motion/page";
import { mountChromeMotion } from "./motion/chrome";

const year = document.querySelector<HTMLElement>("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());

// This module and the shell survive every internal navigation.
document.documentElement.setAttribute("data-motion-live", "");
mountChromeMotion();
let controller: PageController | null = null;
let generation = 0;
let pending: AbortController | null = null;
const root = document.querySelector<HTMLElement>("[data-page]");
if (root) {
  controller = createPageController(root);
  controller.enter(navigationType() === "back_forward" ? "return" : "fresh");
}

function leave(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 1000);
    controller?.leave(() => { clearTimeout(timer); resolve(); });
    if (!controller) { clearTimeout(timer); resolve(); }
  });
}

async function navigate(href: string, historyNavigation = false) {
  const token = ++generation;
  pending?.abort();
  if (historyNavigation) {
    // The URL has already changed. Retire the old lifecycle immediately so it
    // cannot report a settled destination while the history fetch is pending.
    controller?.destroy();
    controller = null;
    document.querySelector<HTMLElement>("[data-page]")?.setAttribute("data-phase", "initial");
  }
  const request = new AbortController();
  pending = request;
  const timeout = window.setTimeout(() => request.abort(), 5000);
  try {
    // Fetch and outro overlap, but the URL and content change only after both.
    const [html] = await Promise.all([
      fetch(href, { signal: request.signal }).then((response) => {
        if (!response.ok) throw new Error("Page unavailable");
        return response.text();
      }),
      historyNavigation ? Promise.resolve() : leave(),
    ]);
    if (token !== generation) return;
    const incoming = new DOMParser().parseFromString(html, "text/html");
    const next = incoming.querySelector<HTMLElement>("[data-page]");
    const current = document.querySelector<HTMLElement>("[data-page]");
    if (!next || !current) throw new Error("Missing page content");
    controller?.destroy();
    if (!historyNavigation) history.pushState(null, "", href);
    document.title = incoming.title;
    current.replaceWith(next);
    // Expose the inserted initial state before a zero-duration intro settles.
    await Promise.resolve();
    document.querySelectorAll<HTMLAnchorElement>(".site-nav a").forEach((link) => {
      const path = (url: string) => new URL(url).pathname.replace(/\/$/, "");
      if (path(link.href) === path(location.href)) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    controller = createPageController(next);
    controller.enter(historyNavigation ? "return" : "fresh");
    document.querySelector("main")?.scrollTo(0, 0);
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

const links = interceptLinks((href) => navigate(href));
window.addEventListener("popstate", () => {
  links.unlock();
  void navigate(location.href, true);
});
window.addEventListener("pagehide", () => {
  generation += 1;
  pending?.abort();
  controller?.restore();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  links.unlock();
  controller?.restore();
});
