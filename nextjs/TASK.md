# Task: GSAP page transitions for a Next.js App Router site

The app in this directory is a three-page Next.js App Router site: home, about, and work. It has a persistent header with nav and a footer in the root layout, `cacheComponents` enabled, and no animation.

Add GSAP page transitions and a page intro, following the `gsap-nextjs` skill. Use GSAP for every effect in this task; do not use `<ViewTransition>`.

Requested motion:

- **Intro.** When a route mounts or is shown again, the heading and each paragraph in the page content rise about 24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the current page content fades out and drifts up about 16px over roughly 350 ms on the live page, and only then does the router navigate. Cover the route area during the swap so no settled or stale content flashes.
- **History.** Back and forward show the destination with the intro only. Nothing ever outros on the way back. A route the router kept hidden re-runs initial state and intro on its preserved DOM with no doubled tweens.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current values. A second click during an outro is ignored; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and links navigate at once, with every phase and callback still firing.
- **Chrome.** On the first document intro, animate the brand/wordmark and each top nav link individually with a staggered rise and fade (~600 ms total). Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the route content wrapper, `data-intro` on animated targets, `html[data-motion="js"]` set before first paint, and the nav `data-testid`s. Server-rendered content must stay readable with JavaScript disabled and must not flash settled content before the intro.

Do not edit anything under `../tests/`. Run `pnpm test:nextjs` from the repo root when done and make it pass.
