import { useGSAP } from "@gsap/react";
import core from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/*
 * The one place GSAP is imported and registered.
 *
 * Every route file in a TanStack Start app also renders on the server, so the
 * registration is guarded rather than run unconditionally. Every other module
 * under src/motion imports gsap, its plugins, and useGSAP from here, so
 * registration happens exactly once and nothing reaches for the raw package.
 * The copied recipes (scroll-controls, layout-flip) register their plugins at
 * module scope in the skill; that registration lives here instead, so a module
 * the server evaluates never runs it.
 *
 * The registration is the initializer of the `gsap` export rather than a bare
 * statement: this package declares `sideEffects: false`, so the production
 * bundler is free to drop a top-level call whose result nothing uses, and did.
 * A value every importer needs cannot be dropped, and it is computed once when
 * this module is evaluated, before any importer runs.
 */
function registered(): typeof core {
  if (typeof document !== "undefined") core.registerPlugin(useGSAP, ScrollTrigger, Flip);
  return core;
}

export const gsap = registered();
export { useGSAP, Flip, ScrollTrigger };
