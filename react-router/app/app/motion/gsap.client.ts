import { useGSAP } from "@gsap/react";
import gsap from "gsap";

/*
 * The one place GSAP is registered.
 *
 * `.client.ts` means the Vite plugin replaces this module with an empty one in
 * the server build, so `registerPlugin` never runs during server rendering.
 * That is also why nothing is exported: a `.client` module's exports are
 * `undefined` on the server, and `motion/PageMotion.tsx` is server-rendered, so
 * it has to take `gsap` and `useGSAP` from the packages themselves. Importing
 * GSAP on the server is harmless; calling it is not, and every call there lives
 * inside `useGSAP` or an event handler.
 *
 * Imported for its side effect by `root.tsx`, which loads before any route.
 */
gsap.registerPlugin(useGSAP);
