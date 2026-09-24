# Guidance for AI Agents Working in This Repo

This repo verifies the [Animaxxing skills](https://github.com/johnpolacek/animaxxing-skills). Framework suites (`vanilla/`, `nextjs/`, and the rest) test reference apps against [CONTRACT.md](CONTRACT.md). The `motion/` suite tests the `animaxxing` and `animaxxing-webgl` recipes straight from the skills' Markdown. The default branch is `main`.

## Setup

- Check out the skills repo beside this one as `../animaxxing-skills`, or set `SKILLS_REPO` to another checkout.
- `pnpm install`, then `pnpm exec playwright install chromium`.
- The skills and their tests change together: commit the recipe change in the skills repo and its specs here in the same session.

## How the motion suite builds

`motion/build.mjs` runs before every motion test run, from Playwright's global setup:

1. Extracts each `ts` block from `skills/<skill>/references/recipes/<recipe>.md`. Blocks under `## Wiring` or starting with `// Example` are skipped. A `## name.ts` heading starts a separate module.
2. Type-checks every module under `strict` and `noUnusedLocals`. A type error fails the whole run.
3. Bundles one IIFE per entry into `motion/.build/<entry>.js`, which exposes the recipe module on `window` (for example `window.P` for pointer effects).

## Adding or changing a recipe

1. **Changed builder in an existing recipe:** add specs to that recipe's spec file, and markup to its fixture if needed.
2. **New recipe file:** in `motion/build.mjs`, add its name to `RECIPES`, an `ENTRIES` bundle exposing it on `window`, and an `ENTRY_RECIPES` mapping. A recipe outside `animaxxing` also goes in `SKILL_OF`. Then create `motion/fixtures/<name>.html` loading `../.build/<entry>.js`, and `motion/tests/<name>.spec.ts`.
3. **Type-check only what changed:** `MOTION_ONLY=pointer-effects,scroll-effects node motion/build.mjs`.
4. **Run the new specs repeatedly:** `npx playwright test -c motion/playwright.config.ts motion/tests/<name>.spec.ts --repeat-each=3`.
5. **Run everything:** `pnpm test:motion`. The full suite runs in parallel and exposes timing flakes that isolated runs hide.
6. Commit here and in the skills repo, and update this repo's README coverage list.

## What each recipe spec covers

- Visible behavior driven by real input: `page.mouse`, `page.keyboard`, scrolling, drags.
- Input filtering: mouse-only effects ignore dispatched `pointerType: "touch"` events.
- Reduced motion: set `document.documentElement.dataset.motion = "reduced"` before building; check the settled or no-op state and that completion still fires.
- Teardown: call it twice, then check markup, `style` attributes, ARIA, and `inert` against their state before the build.
- Rollback: a setup that throws leaves no styles behind and no current GSAP context, where the recipe claims it.

## Writing stable tests

- **Poll, don't sleep.** Prefer `expect.poll(...)` over `waitForTimeout` plus one read. Fixed waits pass alone and fail under parallel load.
- **Sample inside the page** for motion in flight: attach `onUpdate` to the returned timeline and record extremes, or await `onComplete`, rather than reading at a guessed moment.
- **`gsap.getProperty` writes inline styles.** Parsing a transform leaves `translate: none; rotate: none; scale: none` on the element. Stop any rAF sampler before asserting teardown.
- **Compare styles by declaration, not by string.** A restore can reserialize `width:40px` as `width: 40px;`. Use `declarations(page, selector)` and `declared(page, css)` from `tests/fixture.ts`; use `style()` only for exact-attribute or empty checks.
- **Keep thresholds loose on physical motion.** Assert that a throw moved (`> 1px`), not how far; pointer velocity varies run to run.
- **Fixtures share one viewport** (1000 × 700). Place new elements where they don't overlap existing ones, and give fixed overlays `pointer-events: none`.
- `tests/fixture.ts`'s `open()` fails a test on any page error, so a thrown recipe error surfaces even when assertions pass.

## Framework suites

Run the matching suite after changing a framework skill: `pnpm test:vanilla`, `pnpm test:nextjs`, `pnpm test:astro`, `pnpm test:sveltekit`, `pnpm test:nuxt`, `pnpm test:react-router`, `pnpm test:tanstack`. `scripts/eval.sh` rebuilds an app from its starter with an agent and runs its specs. See the README for ports and details.
