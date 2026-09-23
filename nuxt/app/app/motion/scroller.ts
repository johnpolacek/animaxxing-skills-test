import type { SmoothScroll } from "./scroll-controls";

/*
 * The document's one smooth scroller.
 *
 * Created by `plugins/scroll.client.ts` once per document and never by a page:
 * a page remount would reset the scroll and duplicate ticker callbacks. The
 * transition hooks stop it through an outro and start it at settled; the
 * router's `scrollBehavior` syncs it with the position Nuxt applies. This
 * module only holds the handle, so importing it is safe on the server, where
 * there is no scroller and every caller does nothing.
 */
let scroller: SmoothScroll | null = null;

export function setScroller(next: SmoothScroll | null): void {
  scroller = next;
}

export function getScroller(): SmoothScroll | null {
  return scroller;
}
