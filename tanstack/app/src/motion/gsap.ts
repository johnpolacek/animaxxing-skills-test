import { useGSAP } from "@gsap/react";
import gsap from "gsap";

/*
 * The one place GSAP is imported and registered.
 *
 * Every route file in a TanStack Start app also renders on the server, so the
 * registration is guarded rather than run at module scope unconditionally.
 * Every other module under src/motion imports gsap and useGSAP from here, so
 * registration happens exactly once and nothing reaches for the raw package.
 */
if (typeof document !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export { gsap, useGSAP };
