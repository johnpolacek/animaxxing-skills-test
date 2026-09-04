# Task: GSAP page transitions for a TanStack Start site

The app in this directory is a three-page TanStack Start site: home, about, and work. It uses file-based routes (`src/routes/__root.tsx`, `index.tsx`, `about.tsx`, `work.tsx`), server-side rendering, a persistent header with nav and a footer in the root route, and no animation.

Add GSAP page transitions and a page intro, following the `gsap-tanstack-router` skill. Use GSAP for every effect in this task; do not use `viewTransition` or `defaultViewTransition`.

Requested motion:

- **Intro.** When a route mounts, the heading and each paragraph in the page content rise about 24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the current page content fades out and drifts up about 16px over roughly 350 ms on the live page, and only then does the router load and commit the destination. Cover the route area during the swap so no settled or stale content flashes.
- **History.** Back and forward show the destination with the intro only. Nothing ever outros on the way back.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current values. A second click during an outro is ignored; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and links navigate at once, with every phase and callback still firing — including the one that lets the blocked navigation proceed.
- **Chrome.** On the first document intro, fade and slide the brand/wordmark in from the left. After it finishes, fade and scale the three top nav links from 50% to full size, one at a time. Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Framework requirements:

- Keep TanStack Start with SSR on, so the pre-paint rule is exercised: server HTML paints before hydration.
- Keep file-based routes and the existing route files.
- Hold the navigation with `useBlocker` and a promise-returning `shouldBlockFn` — the skill's default path — resolved from the outro's end callback. Do not intercept `Link`.
- Register GSAP in one client-only module.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the route content wrapper, `data-intro` on animated targets, `html[data-motion="js"]` set before first paint, and the nav `data-testid`s. Server-rendered content must stay readable with JavaScript disabled and must not flash settled content before the intro.

Do not edit anything under `../tests/`. Run `pnpm test:tanstack` from the repo root when done and make it pass.
