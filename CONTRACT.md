# Lifecycle contract

Every implementation under test exposes the same observable surface. The Playwright specs assert against this surface only. They never reach into GSAP, framework internals, or test-only globals, so a passing run means the visible behavior is right, not that a particular library call happened.

## Pages

Three routes: `/` (home), `/about`, `/work`. Each has a heading, a paragraph or two, and a nav with a link to each of the other two pages. Persistent chrome (header with nav, footer) is outside the page content.

## Attributes

- `[data-page]` on the element that wraps one page's content. Exactly one is visible at a time. A framework that keeps hidden routes in the DOM may leave others present but hidden.
- `data-phase` on that element, always one of `initial`, `intro`, `settled`, `outro`, `end`. It changes exactly when the lifecycle changes phase. Tests infer nothing from opacity or DOM presence.
- `[data-intro]` on every element the intro animates. At `settled` each one is visible (computed `visibility: visible`, `opacity: 1`) and carries no inline `transform`, `opacity`, `visibility`, or `will-change`.
- `html[data-motion="js"]` set before first paint whenever JavaScript motion is active. A CSS rule scoped to that mark and to `data-phase="initial"` hides `[data-intro]` targets until the controller takes over. Without JavaScript the mark is absent and everything is visible.
- Nav links: `data-testid="nav-home"`, `data-testid="nav-about"`, `data-testid="nav-work"`. They are real anchors with real `href`s.

## Timing

- Intro: at least 400 ms from `intro` to `settled` under normal motion.
- Outro: at least 300 ms from `outro` to `end` under normal motion.
- Reduced motion: every phase still occurs and every completion callback still fires, but `intro` to `settled` and `outro` to `end` each take under 50 ms. (`initial` is stamped by server HTML long before any script runs, so it is not a timing anchor.)

## Behavior

1. **No flash.** With scripts delayed, the page stays at `initial` with intro targets hidden. With scripts blocked entirely, the page becomes readable within 1.5 seconds because a failsafe releases the mark. Without JavaScript, everything is visible.
2. **Clean settle.** The intro ends in `settled` with clean targets, and layout shift during the intro is negligible.
3. **Outro before navigation.** Clicking a nav link moves the current page to `outro` while the URL is unchanged, then to `end`, and only then does the URL change. The destination reaches `settled`.
4. **History is intro-only.** Back and forward never put any page into `outro`. The returning page reaches `settled` with clean targets.
5. **One navigation at a time.** Two nav links clicked in quick succession end on exactly one settled page. The first accepted destination wins.
6. **Interruptible intro.** A link clicked during `intro` still results in the destination reaching `settled`.
7. **Reduced motion.** Under `prefers-reduced-motion: reduce`, load and navigation complete through the same phases without travel, within the timing above.
8. **Cleanup.** After navigating away and back, the returning page has clean targets and no stale inline styles, and the DOM holds no duplicated split or wrapper markup.

9. **Once-only chrome.** On the first document intro, the brand/wordmark fades and slides in from the left. After it finishes, the three top nav links fade and scale from 50% to full size, one at a time. The footer fades as one unit over roughly 1.4 seconds with no travel. Header, nav links, and footer keep the same DOM nodes and layout positions through client navigation and history. Page transitions neither cover nor animate chrome. Navigation during the first fade lets it finish without restarting. Reduced motion and bundle-failure/no-JavaScript readability apply to chrome too.

Chrome uses `data-chrome="header|footer"` with its own `data-chrome-phase="initial|intro|settled"` so it does not interfere with page phases. `data-chrome-intro` marks the brand/wordmark, each nav link, and the footer itself, with no animated footer children. Chrome settles with the same clean inline-style requirements as page targets. A full reload starts a new document intro.

Framework specs may add cases for behavior only that framework has, such as a hidden route being shown again, but every implementation passes the nine above.
