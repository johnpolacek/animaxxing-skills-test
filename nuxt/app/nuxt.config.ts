import { PREPAINT_SCRIPT } from "./app/motion/phases";

export default defineNuxtConfig({
  compatibilityDate: "2025-11-01",
  ssr: true,
  // Lenis needs its stylesheet once, from the shell's global styles.
  css: ["~/assets/css/main.css", "lenis/dist/lenis.css"],
  devtools: { enabled: false },
  telemetry: false,
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Lifecycle",
      meta: [{ name: "description", content: "A three page site." }],
      // Inline, in the head, so it runs before the body is parsed and marks the
      // document as JavaScript-animated before anything paints. The matching
      // CSS rule in main.css is scoped to that mark, so without JavaScript
      // nothing is ever hidden.
      script: [{ innerHTML: PREPAINT_SCRIPT, tagPosition: "head" }],
    },
    // The transition is configured on <NuxtPage> instead: hooks are functions
    // and this config has to be JSON-serializable.
    pageTransition: false,
    layoutTransition: false,
  },
});
