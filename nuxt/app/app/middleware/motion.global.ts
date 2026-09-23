import { planHistoryArrival, runPageOutro, takeHistoryNavigation } from "~/motion/page-transition";

/**
 * Holds a navigation open until the outgoing page has finished its outro.
 *
 * Route middleware runs after `page:loading:start` and before the guards, the
 * chunk load, and the incoming page's setup -- and, decisively, before Vue
 * Router commits. It is the last point in a Nuxt navigation where the URL is
 * still the old one, so an outro that must play "before navigation" plays
 * here. By `onLeave` the URL has already changed and the incoming page has
 * already resolved.
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
  if (import.meta.server) return;
  // First load: hydration is the mount and the page's own `onMounted` owns the
  // intro. There is nothing on screen to take off it yet.
  if (useNuxtApp().isHydrating) return;
  // Same screen, no page change, nothing to play.
  if (to.fullPath === from.fullPath) return;
  // Back and forward are intro-only, and must never be held: refusing or
  // delaying a popstate leaves the URL and the view disagreeing. The hooks
  // still need to know it is a return, so it is planned rather than played.
  if (takeHistoryNavigation(to.fullPath)) {
    planHistoryArrival();
    return;
  }

  await runPageOutro();
});
