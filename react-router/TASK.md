# Task: GSAP page transitions for a React Router v7 site

The app in this directory is a three-page React Router v7 site in framework mode with server rendering on: home, about, and work. It has a persistent header with nav and a footer in the root route, `<Outlet />` for route content, and no animation.

Add GSAP page transitions and a page intro, following the `gsap-react-router` skill. Use GSAP for every effect in this task; do not use `viewTransition` on links or navigations.

Requested motion:

- **Intro.** When a route mounts or is shown again, the heading and each paragraph in the page content rise about 24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the current page content fades out and drifts up about 16px over roughly 350 ms on the live page, and only then does the router load and commit the next route. Hold the navigation with `useBlocker` — the skill's default hold — and call `proceed()` from the end-state callback. Cover the route area during the swap so no settled or stale content flashes.
- **History.** Back and forward show the destination with the intro only. Nothing ever outros on the way back, and a `POP` is never blocked.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current values. A second click during an outro does not start a second outro or retarget the navigation; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and links navigate at once, with every phase and callback still firing — including the one that calls `proceed()`.
- **Chrome.** On the first document intro, fade and slide the brand/wordmark in from the left. After it finishes, fade and scale the three top nav links from 50% to full size, one at a time. Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the route content wrapper, `data-intro` on animated targets, `html[data-motion="js"]` set before first paint, and the nav `data-testid`s. Server-rendered content must stay readable with JavaScript disabled and must not flash settled content before the intro.

Do not edit anything under `../tests/`. Run `pnpm test:react-router` from the repo root when done and make it pass.

## Initially hidden content

Keep the successful invisible intro. The early marker must recover without the bundle; keep its deadline through setup and required font/media preparation. Register rollback before writes/splits. On failure, invalidate stale work, cancel animation, restore modified content, and settle the current owner once. Late initialization cannot hide the recovered visit. Preserve outgoing/intentional hidden states, independent chrome, reduced motion, and native links. Use the installed framework skill's `references/initialization.md` and the repository's initialization failure contract. Test the rendering mode actually produced; client-only content cannot appear without JavaScript.
