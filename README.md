# Animaxxing Skills Test

Verification suite for the [Animaxxing skills](https://github.com/johnpolacek/animaxxing-skills). Each framework directory holds a small site, the task prompt an agent is given, a reference implementation built by following the skill, and Playwright specs that assert the lifecycle behavior the skill promises.

```text
animaxxing-skills-test/
  CONTRACT.md            Observable surface every implementation exposes; what the specs assert
  shared/lifecycle.ts    Playwright fixture: phase recorder, layout-shift meter, settled checks
  scripts/eval.sh        Rebuild a framework's app from its starter with an agent, then run its specs
  vanilla/
    TASK.md              Prompt given to the agent
    starter/             The unanimated site
    app/                 Reference implementation produced by following gsap-vanilla
    tests/               Playwright specs
    playwright.config.ts
  nextjs/                Same shape, for gsap-nextjs
  astro/                 gsap-astro
  sveltekit/             gsap-sveltekit
  nuxt/                  gsap-nuxt
  react-router/          gsap-react-router
  tanstack/              gsap-tanstack-router
```

Each framework's preview server has its own port so suites can run side by side: vanilla 4173, nextjs 3100, astro 3101, sveltekit 3102, nuxt 3103, react-router 3104, tanstack 3105.

## Run the specs against the reference implementations

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test
```

Or one framework: `pnpm test:vanilla`, `pnpm test:nextjs`, `pnpm test:astro`, `pnpm test:sveltekit`, `pnpm test:nuxt`, `pnpm test:react-router`, `pnpm test:tanstack`.

## Verify a skill end to end

`scripts/eval.sh <framework>` copies the starter to `<framework>/app-eval`, installs the skill there, runs Claude Code non-interactively on `TASK.md`, and then runs the framework's specs against the result. A green run means an agent following the skill produced an implementation that meets the contract.

```bash
pnpm eval vanilla
pnpm eval nextjs
```

## What the specs check

See [CONTRACT.md](CONTRACT.md). In short: no flash of settled content and no blank page without JavaScript, a clean settled state, an outro that finishes before navigation, intro-only history navigation, one navigation at a time, interruptible intros, reduced motion that still completes every phase, cleanup after navigating away and back, and a once-only nav intro and whole-footer fade that preserve their DOM across navigation.

The vanilla reference now fetches and swaps only page content to preserve the shell, with real anchors and full-document navigation as the no-JavaScript/error fallback. Astro persists the header and footer through its client router; the other frameworks keep them in their root layouts. Reloading starts a new intro.
