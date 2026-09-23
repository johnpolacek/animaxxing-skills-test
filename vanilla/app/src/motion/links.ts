/** Routes this site serves as its own documents; anything else stays a native navigation. */
const ROUTES = ["/", "/about", "/work", "/gallery", "/gallery/1", "/gallery/2", "/gallery/3"];

/** The link this click should transition to, or null to leave the click alone. */
function transitionableLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented) return null;
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const anchor = (event.target as Element | null)?.closest?.("a[href]") as
    | HTMLAnchorElement
    | null;
  if (!anchor) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.dataset.transition === "off") return null;
  if (anchor.target && anchor.target !== "_self") return null;

  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null; // mailto:, tel:
  // Hash-only and same-location links: let the browser do its own thing.
  if (url.pathname === location.pathname && url.search === location.search) return null;

  if (!ROUTES.includes(url.pathname.replace(/\/$/, "") || "/")) return null;
  return anchor;
}

/** Intercept only ordinary internal links; native anchor semantics stay intact. */
export function interceptLinks(run: (href: string, link: HTMLAnchorElement) => Promise<void>) {
  let locked = false;
  let generation = 0;
  document.addEventListener("click", (event) => {
    const link = transitionableLink(event);
    if (!link) return;
    event.preventDefault();
    if (locked) return;
    locked = true;
    const token = ++generation;
    void run(link.href, link).finally(() => {
      if (token === generation) locked = false;
    });
  });
  return {
    unlock() {
      generation += 1;
      locked = false;
    },
  };
}
