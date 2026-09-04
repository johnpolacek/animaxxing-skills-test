import { useGSAP } from "~/composables/useGSAP";
import { markHistoryNavigation, unlockNavigation } from "~/motion/page-transition";
import { LIVE_ATTRIBUTE } from "~/motion/phases";

/**
 * Boots the motion layer: GSAP registration, the pre-paint handover, and the
 * two pieces of navigation state the transition hooks cannot see for
 * themselves.
 */
export default defineNuxtPlugin((nuxtApp) => {
  // Tells the pre-paint failsafe that a controller arrived, so it leaves the
  // mark alone and the hiding rule stays under the lifecycle's control.
  document.documentElement.setAttribute(LIVE_ATTRIBUTE, "");
  useGSAP();

  // Vue Router does not tell a guard how a navigation started. This fires for
  // popstate navigations only, in the same dispatch and before the router runs
  // its guards, so the flag is set by the time the middleware reads it.
  // Vue Router marks `history.listen` alpha; re-check after an upgrade.
  useRouter().options.history.listen?.((to) => markHistoryNavigation(to));

  // However a navigation ends -- landed, failed, redirected -- the
  // one-at-a-time lock is released here.
  nuxtApp.hook("page:loading:end", unlockNavigation);
});
