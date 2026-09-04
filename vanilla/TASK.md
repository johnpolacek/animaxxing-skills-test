# Task: GSAP page transitions for a plain HTML site

The site in this directory is a three-page static site built with Vite and no UI framework: home, about, and work. It has a header with nav, a footer, and page content. It has no animation.

Add GSAP page transitions and a page intro, following the `gsap-vanilla` skill. Use lightweight client-side fetching and page-content swapping for internal navigation so the header and footer DOM persist; keep real anchors and native full-document navigation as the no-JavaScript/error fallback and use GSAP for every effect in this task; do not add View Transitions.

Requested motion:

- **Intro.** When a page loads, the heading and each paragraph in the page content rise about 24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the page content fades out and drifts up about 16px over roughly 350 ms, and only then does the URL and page content change.
- **History.** Back and forward show the page with the intro only. Nothing ever outros on the way back.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current values. A second click during an outro is ignored; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and links navigate at once, with every phase and callback still firing.
- **Chrome.** On the first document intro, animate the brand/wordmark and each top nav link individually with a staggered rise and fade (~600 ms total). Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the page content wrapper, `data-intro` on animated targets, `html[data-motion="js"]` set before first paint, and the nav `data-testid`s. The page must stay readable with JavaScript disabled and must not flash settled content before the intro.

Do not edit anything under `../tests/`. Run `pnpm test:vanilla` from the repo root when done and make it pass.
