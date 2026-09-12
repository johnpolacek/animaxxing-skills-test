# Task: GSAP page transitions for a Nuxt site

The app in this directory is a three-page Nuxt 4 site with SSR on: home, about, and work. It has a persistent header with nav and a footer in `app.vue` around `<NuxtPage />`, and no animation.

Add GSAP page transitions and a page intro, following the `gsap-nuxt` skill. Use GSAP for every effect in this task; do not turn on `experimental.viewTransition`.

Requested motion:

- **Intro.** When a route mounts, the heading and each paragraph in the page content rise about 24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the current page content fades out and drifts up about 16px over roughly 350 ms on the live page, and only then does the URL change and the router navigate.
- **History.** Back and forward show the destination with the intro only. Nothing ever outros on the way back.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current values. A second click during an outro is ignored; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and links navigate at once, with every phase and callback still firing.
- **Chrome.** On the first document intro, fade and slide the brand/wordmark in from the left. After it finishes, fade and scale the three top nav links from 50% to full size, one at a time. Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Framework requirements:

- Nuxt 4 with `ssr: true`. Keep it on.
- Drive the transition with GSAP through the `pageTransition` JavaScript hooks (`onBeforeEnter`, `onEnter`, `onAfterEnter`, `onEnterCancelled`, `onBeforeLeave`, `onLeave`, `onAfterLeave`) with `css: false` and `mode: "out-in"`. No Vue CSS transition classes, no `experimental.viewTransition`.
- With `out-in` the page component is unmounted the moment the leave starts, so template refs, component state, and the page's own context are gone before the outro plays a frame. `data-page` and `data-phase` must live on the page's root element, and the hooks must own the phases through the `el` they are handed.
- Pages and layouts need a single root element or the transition does not run.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the page's root element, `data-intro` on animated targets, `html[data-motion="js"]` set before first paint, and the nav `data-testid`s. Server-rendered content must stay readable with JavaScript disabled and must not flash settled content before the intro.

Do not edit anything under `../tests/`. Run `pnpm test:nuxt` from the repo root when done and make it pass.

## Initially hidden content

Keep the successful invisible intro. The early marker must recover without the bundle; keep its deadline through setup and required font/media preparation. Register rollback before writes/splits. On failure, invalidate stale work, cancel animation, restore modified content, and settle the current owner once. Late initialization cannot hide the recovered visit. Preserve outgoing/intentional hidden states, independent chrome, reduced motion, and native links. Use the installed framework skill's `references/initialization.md` and the repository's initialization failure contract. Test the rendering mode actually produced; client-only content cannot appear without JavaScript.
