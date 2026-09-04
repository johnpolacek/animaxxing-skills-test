import { browser } from "$app/environment";
import gsap from "gsap";

/*
 * The one place GSAP is imported and configured.
 *
 * Importing GSAP on the server is harmless; running it is not, so everything
 * that touches the global instance sits behind the `browser` guard. Every
 * other module in `$lib/motion` imports gsap from here, so this runs once.
 */
if (browser) {
  // One overwrite policy for every tween in the app: a new tween on a property
  // kills the one already animating it instead of fighting it.
  gsap.defaults({ overwrite: "auto" });
}

export { gsap };
