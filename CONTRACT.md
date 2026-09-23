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

## Initialization failure contract

An early marker alone is insufficient. Its independent deadline stays active through required preparation and timeline construction. Controller registration must not disarm it. Successful animation duration can exceed that deadline after a valid handoff.

Recovery invalidates the current owner's work, cancels writers, restores partial styles and split DOM, then settles once. Late preparation and repeated setup cannot hide that visit again. Outgoing pages, closed panels, and persistent shell owners stay independent. Reduced motion preserves essential completion and link behavior.

The common first-load suite asserts actual route HTML and native links with JavaScript disabled, and proves the early marker ran before blocking the bundle. Current references all send route HTML: vanilla and Astro are static; Next.js, Nuxt, SvelteKit, React Router framework mode, and TanStack Start use server rendering. Client-only variants require separate tests for their actual static fallback; do not claim they render missing route content without JavaScript.

`vanilla/app/recovery/` is an isolated, production-built fault fixture using GSAP and SplitText. Its specs cover setup throws before/after styles and splits, a throwing disposer, an entrance callback failure, cancelled delayed writes, stalled/rejected font and media preparation, late bundles, no-flash success longer than the initialization budget, reduced motion, duplicate setup, and navigation during preparation. Faults are controlled inputs; font/media promises are stubbed. These tests validate the recovery contract, not every framework adapter or every motion recipe.

Remaining adapter coverage: partial-setup recovery and stale promises in each framework's actual controller; hydration replay, streamed/cached routes, persisted Astro islands, Vue hook cancellation, and Svelte reused pages. Keep the existing lifecycle/history/chrome suites. Production indexing, field LCP, bfcache, and suspended-tab behavior need separate verification.

## Transition archetypes

The reference implementations also exercise the archetypes in each skill's `references/smooth-scroll.md` and `references/transition-archetypes.md`: one smooth scroller per document, a curtain navigation, and a shared-element morph. `shared/archetypes.ts` asserts them. They are not part of `TASK.md`, so the archetype specs skip when `APP_DIR` points at an agent-built app. The specs compare routes without a trailing slash, so `/gallery/` and `/gallery` are the same route.

### Pages

- `/gallery`: a page like the others (`[data-page]`, `data-phase`, `[data-intro]`) with the heading "Gallery". It holds three links, `data-testid="gallery-item-1"` to `gallery-item-3`, pointing at `/gallery/1` to `/gallery/3`. Each link contains a thumbnail `[data-shared="item-N"]` about 160 × 100 px, which is not an intro target. Below the grid, enough content to scroll at least 2000 px past the viewport.
- `/gallery/N` for N = 1, 2, 3: heading "Item N", a hero `[data-shared="item-N"][data-shared-hero]` about 480 × 300 px, clearly away from where the thumbnail sat, and a link `data-testid="gallery-back"` to `/gallery`. The hero is visible at its final size before the intro starts; it is neither an intro target nor hidden before paint. Below it, enough content to scroll at least 1000 px past the viewport, so a push from here to `/gallery` lands at the top by decision rather than because the destination cannot scroll.
- On `/`: keep the page within a 720 px viewport, since the chrome spec compares footer positions across pages. A link `data-testid="home-gallery"` to `/gallery` (ordinary transition) and a link `data-testid="curtain-link"` to `/work` that takes the curtain transition. Neither is a top nav link; the header keeps its three.

The window must be the document's scroll container: Lenis eases `window.scrollY`, and the specs read it. A shell that locks the viewport and scrolls an inner `main` does not meet this section.

### Smooth scroller

- Lenis scrolls the window, created once per document from the persistent shell. `html` carries Lenis's `lenis` class while it runs. Under reduced motion, and without JavaScript, there is no scroller and no `lenis` class.
- Wheel input eases: part of the way after a few frames, all of it once settled.
- The page cannot be scrolled from `outro` through `end`, until the swap replaces it.
- A new page (push) settles at the top, and the next wheel scrolls from there.
- Back and forward land on the position the page had when it was left, and the next wheel continues from there.

### Curtain

- `[data-curtain]` in the persistent shell, outside every `[data-page]`, fixed over the viewport, `aria-hidden="true"`, holding one or more `[data-curtain-panel]`. It reports `data-curtain-phase`: `idle`, `covering`, `covered`, `revealing`. At `idle` every panel computes `visibility: hidden`.
- The curtain link: the current page goes to `outro` and the curtain to `covering`, then `covered`, with the viewport's center covered by a panel, all before the URL changes. The incoming page mounts under the curtain and is not `settled` before the curtain reaches `revealing`. The curtain returns to `idle` and the incoming page reaches `settled`.
- While `covered` or `revealing`, a click at the viewport's center reaches no page or chrome element: it lands on a panel, or on the document root while a view transition's frames run. `covered` may last a single frame when the fetch is already back, so the specs watch it per frame and through a `MutationObserver`, never on an assertion's polling schedule.
- Header and footer keep their DOM nodes. The curtain is the one transition that passes over the chrome; it never animates, restyles, or replaces the chrome's nodes.
- Back and forward never leave `idle`.
- Reduced motion: no panel is ever visible, and the navigation completes.

### Shared element

- The specs observe `data-shared`; GSAP Flip matches counterparts by `data-flip-id`, so the thumbnail and its hero carry both, with the same value.
- Clicking `gallery-item-N` on a settled `/gallery`: the page goes to `outro`, the other intro targets leave, and the clicked thumbnail stays visible through `end`. No curtain.
- On `/gallery/N`, the hero's first visible box is near the thumbnail's box, then it moves to its own. At `settled` it sits in its CSS box with no inline `transform`, `opacity`, or `visibility`.
- Back to `/gallery` morphs nothing: every thumbnail's first visible box is its own.
- Reduced motion: the hero's first visible box is its final box.
