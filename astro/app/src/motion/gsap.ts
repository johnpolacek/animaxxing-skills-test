// The one place GSAP is imported and configured. Every other motion module
// imports it from here, so plugin registration can never be forgotten or done
// twice, and Astro bundles GSAP once however many components pull it in.
// This site needs no plugins; add `gsap.registerPlugin(...)` here when it does.
import { gsap } from "gsap";

gsap.defaults({ ease: "power2.out" });

export { gsap };
