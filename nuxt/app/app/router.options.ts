import type { RouterConfig } from "nuxt/schema";
import type { RouteLocationNormalized } from "vue-router";
import { useNuxtApp, useRouter } from "#app";
import { getScroller } from "~/motion/scroller";

/*
 * Nuxt's default `scrollBehavior`, with one addition: the position it resolves
 * is handed to the smooth scroller in the same task, so the engine and the
 * native scroll agree.
 *
 * The wait is Nuxt's own (copied from
 * `node_modules/nuxt/dist/pages/runtime/router.options.js` for 4.5.2): after
 * `page:loading:end`, after the outgoing leave has finished, then one frame.
 * Under `mode: "out-in"` that is after the incoming root has been inserted and
 * `onEnter` has written its initial state, so the window moves onto a page
 * that is laid out but not yet shown. The engine is stopped through all of
 * this; Lenis adopts the jump and the intro's settled state starts it again.
 */
type Position = { left: number; top: number } | { el: string; top?: number; behavior?: ScrollBehavior };

const routeOf = (path: string) => path.replace(/\/$/, "") || "/";

/** Passes the position Nuxt is about to apply to the scroller, and returns it for Vue Router. */
function sync<T extends Position | false>(position: T): T {
  const scroller = getScroller();
  if (!scroller || !position) return position;
  if ("el" in position) scroller.scrollTo(position.el, { immediate: true, offset: -(position.top ?? 0) });
  else scroller.scrollTo(position.top, { immediate: true });
  return position;
}

function hashOffset(selector: string): number {
  try {
    const element = document.querySelector(selector);
    if (element) {
      return (
        (Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0) +
        (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
      );
    }
  } catch {
    /* an invalid selector is no anchor */
  }
  return 0;
}

function landing(to: RouteLocationNormalized, saved: Position | null, behavior: ScrollBehavior): Position {
  if (saved) return saved;
  if (to.hash) return { el: to.hash, top: hashOffset(to.hash), behavior };
  return { left: 0, top: 0 };
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    const nuxtApp = useNuxtApp();
    const router = useRouter();
    const behavior: ScrollBehavior = router.options?.scrollBehaviorType ?? "auto";
    // Nuxt hands the first client navigation `START_LOCATION` as `from`; it has
    // no matched route and says nothing about the page being left.
    const known = from.matched.length > 0;

    // Same page: no transition runs, so nothing to wait for. Only a hash moves.
    if (known && routeOf(to.path) === routeOf(from.path)) {
      if (from.hash && !to.hash) return sync(savedPosition ?? { left: 0, top: 0 });
      if (to.hash) return sync({ el: to.hash, top: hashOffset(to.hash), behavior });
      return false;
    }
    const allowsTop = typeof to.meta.scrollToTop === "function" ? to.meta.scrollToTop(to, from) : to.meta.scrollToTop;
    // No scroll, and so no sync: the engine keeps the position it has.
    if (allowsTop === false) return false;

    return new Promise<Position | false>((resolve) => {
      const scroll = () => {
        requestAnimationFrame(() => {
          // A later navigation took over; leave the position to it.
          if (router.currentRoute.value.fullPath !== to.fullPath) return resolve(false);
          resolve(sync(landing(to, savedPosition, behavior)));
        });
      };
      nuxtApp.hooks.hookOnce("page:loading:end", () => {
        // Set by <NuxtPage> when the transition starts, resolved by its onAfterLeave.
        const leaveFinished = (nuxtApp as unknown as { "~transitionPromise"?: Promise<void> })["~transitionPromise"];
        if (leaveFinished) leaveFinished.then(scroll);
        else scroll();
      });
    });
  },
};
