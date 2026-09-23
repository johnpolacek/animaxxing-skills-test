import { lenisScroll } from "~/motion/lenis-scroll";
import { setScroller } from "~/motion/scroller";

/**
 * One smooth scroller per document, owned by the shell.
 *
 * A client plugin runs before hydration, on a document that already holds the
 * server HTML, and before any page's `onMounted`, so Lenis is stepping before
 * a page could measure. Under reduced motion the recipe returns native
 * controls and creates nothing: no `lenis` class, no frame loop.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const scroller = lenisScroll({ lerp: 0.1 });
  setScroller(scroller);
  // The shell unmounting is the only teardown a document has.
  nuxtApp.vueApp.onUnmount(() => {
    scroller.destroy();
    setScroller(null);
  });
});
