# Task: GSAP page transitions for an Astro site

The site in this directory is a three-page Astro 5 site: home, about, and work. A shared layout
holds the header with nav, the footer, and a `<slot />` for page content. There are no framework
integrations and no islands, the output is static, and there is no animation.

Add GSAP page transitions and a page intro, following the `gsap-astro` skill. Use GSAP for every
effect in this task.

Requested motion:

- **Intro.** When a page arrives, the heading and each paragraph in the page content rise about
  24px and fade in, staggered, over roughly 600 ms total.
- **Outro.** When the user clicks an internal nav link, the page content fades out and drifts up
  about 16px over roughly 350 ms on the live page, and only then does the router swap.
- **History.** Back and forward show the destination with the intro only. Nothing ever outros on
  the way back.
- **Interruptions.** A click during the intro kills the intro and starts the outro from current
  values. A second click during an outro is ignored; the first destination wins.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, pages appear settled at once and
  links navigate at once, with every phase and callback still firing.
- **Chrome.** On the first document intro, fade and slide the brand/wordmark in from the left. After it finishes, fade and scale the three top nav links from 50% to full size, one at a time. Slowly fade the entire footer as one unit (~1.4 seconds, no travel). Keep header, nav links, and footer DOM in place across client navigation and history; never cover them, replay their intro, or reset an in-flight footer fade during a page transition. Reduced motion settles them immediately. Expose `data-chrome="header"` and `data-chrome="footer"`, each with `data-chrome-phase="initial|intro|settled"`; mark the brand and each nav link with `data-chrome-intro`, and mark the footer itself (not its children). Use the pre-paint mark and failsafe for chrome as well as page content.

Framework requirements:

- Add `<ClientRouter />` from `astro:transitions` to the shared layout's `<head>`, so the three
  pages navigate in place rather than as full document loads.
- GSAP owns the page transition, so Astro's own crossfade must not run alongside it. Put
  `transition:animate="none"` on the root element.
- A module script runs once per visit, not once per page: it runs the first time a page carrying it
  is reached and never again, however many times the user comes back to that page. The lifecycle
  must survive that. Register the router listeners once, and have every handler find the page that
  is current when it fires.

Expose the observable surface described in `../CONTRACT.md`: `data-page` and `data-phase` on the
page content wrapper, `data-intro` on animated targets, `html[data-motion="js"]` set before first
paint, and the nav `data-testid`s. The page must stay readable with JavaScript disabled and must
not flash settled content before the intro, on a full load and after a swap alike.

Do not edit anything under `../tests/`. Run `pnpm test:astro` from the repo root when done and make it pass.

## Initially hidden content

Keep the successful invisible intro. The early marker must recover without the bundle; keep its deadline through setup and required font/media preparation. Register rollback before writes/splits. On failure, invalidate stale work, cancel animation, restore modified content, and settle the current owner once. Late initialization cannot hide the recovered visit. Preserve outgoing/intentional hidden states, independent chrome, reduced motion, and native links. Use the installed framework skill's `references/initialization.md` and the repository's initialization failure contract. Test the rendering mode actually produced; client-only content cannot appear without JavaScript.
