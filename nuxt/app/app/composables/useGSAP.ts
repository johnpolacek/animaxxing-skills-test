import { gsap } from "gsap";

let registered = false;

/**
 * The one place GSAP is imported and configured.
 *
 * Every other motion module goes through this, so registration happens exactly
 * once however many callers there are. Plugins would be registered here too,
 * and lazy-loaded ones added to the returned object; this app needs none.
 *
 * Importing GSAP is safe on the server, but nothing here may *run* there, so
 * the configuration is client-guarded rather than done at module scope.
 */
export function useGSAP() {
  if (import.meta.client && !registered) {
    registered = true;
    // Every tween in the app replaces conflicting tweens on the same property
    // rather than stacking with them. Interruptions are the normal case here.
    gsap.defaults({ overwrite: "auto" });
  }
  return { gsap };
}
