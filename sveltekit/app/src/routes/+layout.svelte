<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, preloadData } from "$app/navigation";
  import { onMount, type Snippet } from "svelte";
  import type { NavigationTarget } from "@sveltejs/kit";
  import {
    MOTION_LIVE_ATTRIBUTE,
    OUTRO_TIMEOUT,
    settleWithin,
  } from "$lib/motion/phases";
  import { setRouteTransition, type PageController } from "$lib/motion/route-transition";
  import { mountChromeMotion } from "$lib/motion/chrome";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  /*
   * The route transition controller.
   *
   * The root layout mounts once per document and outlives every client-side
   * navigation, so it is the one component that can own page lifecycles.
   *
   * `beforeNavigate` is both the lock and the wait here, rather than the lock
   * with `onNavigate` doing the waiting. Two things in the installed runtime
   * (@sveltejs/kit 2.70.3) rule the `onNavigate` shape out for this brief:
   *
   *   1. `history.pushState` runs before the `onNavigate` callbacks are
   *      awaited, so the URL would already show the destination while the
   *      outgoing page animates. The brief requires the URL to change only
   *      after the outro.
   *   2. `beforeNavigate` callbacks are skipped entirely while a navigation is
   *      in flight (`is_navigating`), so a second click during an `onNavigate`
   *      wait would never reach the lock and both destinations would race.
   *
   * Cancelling in `beforeNavigate` and re-issuing with `goto` avoids both: the
   * outro starts on click, the URL is untouched until the end state, and the
   * cancelled navigation leaves `is_navigating` false so the lock still works.
   * The cost is that the link's own `data-sveltekit-*` intent is not carried
   * into the re-issued navigation, and that `load` runs after the outro, which
   * is what the cover below is for.
   */

  /** The page currently on screen, or null between unmount and mount. */
  let active: PageController | null = null;
  /** Held from an accepted navigation until the next intro starts. */
  let locked = false;
  /** Consumed by the one navigation this controller re-issues itself. */
  let passThrough = false;
  /** An intro asked for before the incoming page had registered. */
  let introPending = false;
  /** Invalidates a pending outro that history has overtaken. */
  let generation = 0;
  /** Covers the route area, and only the route area, during the swap gap. */
  let covered = $state(false);

  setRouteTransition({
    registerPage(controller) {
      active = controller;
      // The incoming tree exists and holds its initial state: safe to uncover.
      covered = false;
      if (introPending) {
        introPending = false;
        controller.enter();
      }
      return () => {
        if (active === controller) active = null;
      };
    },
  });

  const samePage = (from: NavigationTarget | null, to: NavigationTarget | null) =>
    !!from && !!to && from.url.pathname === to.url.pathname;

  beforeNavigate((nav) => {
    // The navigation this controller re-issued itself. Consume the token on
    // the very navigation it was set for, so nothing else slips through.
    if (passThrough) {
      passThrough = false;
      return;
    }

    // History is never cancelled and never outros. Abandon any outro still
    // running so it cannot push a stale destination once it finishes.
    if (nav.type === "popstate") {
      generation += 1;
      locked = false;
      covered = false;
      return;
    }

    // The document is leaving: nothing can be delayed, and cancel() here would
    // only raise the browser's unload dialog.
    if (nav.willUnload || !nav.to) return;

    // One navigation at a time. A second request while one is in flight is
    // swallowed rather than queued: the first accepted destination wins.
    if (locked) {
      nav.cancel();
      return;
    }

    // Same screen, different search params: the page updates in place, so
    // there is no lifecycle to run and nothing to lock.
    if (samePage(nav.from, nav.to)) return;

    // Before hydration there is no controller to outro. Let the router have
    // the click; the destination still runs its own intro.
    const controller = active;
    if (!controller) return;

    nav.cancel();
    locked = true;
    covered = false;
    const token = ++generation;
    const href = nav.to.url.href;

    // Overlap `load` with the outro so the destination is ready the moment the
    // end state is reached.
    void preloadData(href).catch(() => {});

    void settleWithin(controller.leave(), OUTRO_TIMEOUT).then(() => {
      if (token !== generation) return; // history overtook this outro
      covered = true;
      passThrough = true;
      void goto(href).catch(() => {
        passThrough = false;
        locked = false;
        covered = false;
      });
    });
  });

  afterNavigate((nav) => {
    // The lock lifts as the incoming intro begins, not when it ends: a click
    // during the intro must be able to interrupt it.
    locked = false;
    covered = false;

    // A search-param-only change reuses the page and keeps it settled.
    if (nav.type !== "enter" && samePage(nav.from, nav.to)) return;

    if (active) active.enter();
    else introPending = true;
  });

  onMount(() => {
    // Tells the pre-paint failsafe in app.html that a controller arrived, so it
    // leaves the mark alone and the hiding rule stays under lifecycle control.
    document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
    return mountChromeMotion();
  });
</script>

<div class="shell">
  <header class="site-header" data-chrome="header" data-chrome-phase="initial">
    <span class="wordmark" data-chrome-intro="">Lifecycle</span>
    <nav class="site-nav" aria-label="Main">
      <a href="/" data-chrome-intro="" data-testid="nav-home">Home</a>
      <a href="/about" data-chrome-intro="" data-testid="nav-about">About</a>
      <a href="/work" data-chrome-intro="" data-testid="nav-work">Work</a>
    </nav>
  </header>

  <!-- One stable route container: it owns the geometry while the two trees
       exchange, and it is the only thing the cover spans. -->
  <div class="route">
    {@render children()}
    <div class="route-cover" aria-hidden="true" hidden={!covered}></div>
  </div>

  <footer class="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
    <span>Three routes, one lifecycle.</span>
    <a href="/?q=1" data-testid="nav-filtered">Filtered index</a>
  </footer>
</div>
