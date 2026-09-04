// The one place GSAP is imported and configured. Everything else imports it
// from here, so plugin registration can never be forgotten or done twice.
// This site needs no plugins; add `gsap.registerPlugin(...)` here when it does.
import { gsap } from "gsap";

gsap.defaults({ ease: "power2.out" });

export { gsap };
