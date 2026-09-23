<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, preloadData } from "$app/navigation";
  import { onMount, type Snippet } from "svelte";
  import type { BeforeNavigate, NavigationTarget } from "@sveltejs/kit";
  import { gsap } from "$lib/motion/gsap";
  import {
    CURTAIN_LEAD,
    MOTION_LIVE_ATTRIBUTE,
    OUTRO_TIMEOUT,
    prefersReducedMotion,
    settleWithin,
    type Arrival,
  } from "$lib/motion/phases";
  import { setRouteTransition, type PageController } from "$lib/motion/route-transition";
  import { mountChromeMotion } from "$lib/motion/chrome";
  import { lenisScroll } from "$lib/motion/lenis-scroll";
  import type { SmoothScroll } from "$lib/motion/scroll-controls";
  import { curtain, type Curtain } from "$lib/motion/page-covers";
  import { captureShared, playShared, type SharedState } from "$lib/motion/layout-flip";
  // The scroller's stylesheet, once, from the shell's global styles.
  import "lenis/dist/lenis.css";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  /*
   * The route transition controller.
   *
   * The root layout mounts once per document and outlives every client-side
   * navigation, so it is the one component that can own page lifecycles, the
   * smooth scroller, the curtain, and a shared element's handoff.
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

  /** How a click travels: an ordinary swap, behind the curtain, or with a shared element. */
  type Transition = { kind: "plain" } | { kind: "curtain" } | { kind: "shared"; element: HTMLElement };
  type CurtainPhase = "idle" | "covering" | "covered" | "revealing";
  /** A shared element captured in the outro, waiting for the page it was clicked toward. */
  type Handoff = { path: string; id: string; state: SharedState };
  /** What the incoming page does once it has registered and the router has arrived. */
  type Plan = { arrival: Arrival; handoff: Handoff | null };

  /** The page currently on screen, or null between unmount and mount. */
  let active: PageController | null = null;
  /** Held from an accepted navigation until the next intro starts. */
  let locked = false;
  /** Consumed by the one navigation this controller re-issues itself. */
  let passThrough = false;
  /** An arrival asked for before the incoming page had registered. */
  let pending: Plan | null = null;
  /** Invalidates a pending outro or intro that a newer navigation has overtaken. */
  let generation = 0;
  /** Covers the route area, and only the route area, during the swap gap. */
  let covered = $state(false);

  /** One scroller per document, owned here and never by a page. */
  let scroller: SmoothScroll | null = null;
  /** The curtain's builders; its root reports the phase for CSS and tests. */
  let cover: Curtain | null = null;
  let curtainRoot: HTMLElement;
  /** The captured shared element, keyed by the destination it was clicked toward. */
  let handoff: Handoff | null = null;
  /**
   * The link behind the navigation `beforeNavigate` is about to see. The
   * navigation object does not expose it, so the shell records the click on
   * its way to the router and matches it by destination.
   */
  let lastLink: { element: HTMLAnchorElement; at: number } | null = null;

  const curtainPhase = (): CurtainPhase =>
    (curtainRoot?.getAttribute("data-curtain-phase") as CurtainPhase | null) ?? "idle";
  // Written straight to the DOM rather than through $state: consecutive phases
  // must each be visible to anything observing the attribute.
  const setCurtainPhase = (phase: CurtainPhase) => curtainRoot?.setAttribute("data-curtain-phase", phase);

  const samePage = (from: NavigationTarget | null, to: NavigationTarget | null) =>
    !!from && !!to && from.url.pathname === to.url.pathname;

  function recordLink(event: MouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    lastLink = anchor instanceof HTMLAnchorElement ? { element: anchor, at: performance.now() } : null;
  }

  /** What a link asks for: the curtain by opt-in, a morph when it carries a shared element. */
  function transitionFor(nav: BeforeNavigate): Transition {
    if (nav.type !== "link" || !lastLink || performance.now() - lastLink.at > 1000) return { kind: "plain" };
    const link = lastLink.element;
    lastLink = null;
    if (link.href !== nav.to?.url.href) return { kind: "plain" };
    if (link.dataset.transition === "curtain") return { kind: "curtain" };
    const element = link.matches("[data-shared]") ? link : link.querySelector<HTMLElement>("[data-shared]");
    return element ? { kind: "shared", element } : { kind: "plain" };
  }

  /** Lowers the curtain from wherever it is; the intro overlaps it. */
  function reveal() {
    if (!cover) return;
    setCurtainPhase("revealing");
    // Reduced motion completes on the next frame and never shows a panel.
    cover.reveal().eventCallback("onComplete", () => setCurtainPhase("idle"));
  }

  /**
   * The outgoing page's outro, with the curtain composed in when the click
   * asked for it and the shared element left lit when one is travelling. The
   * curtain's timeline belongs to the shell: it is never nested in the page's
   * context, whose revert at unmount would sweep it open mid-swap.
   */
  function leave(controller: PageController, transition: Transition, token: number): Promise<void> {
    const waits = [controller.leave({ keep: transition.kind === "shared" ? transition.element : null })];
    if (transition.kind === "curtain" && cover) {
      setCurtainPhase("covering");
      const sweep = cover.cover();
      waits.push(
        new Promise<void>((resolve) => {
          sweep.eventCallback("onComplete", () => {
            if (token === generation) setCurtainPhase("covered");
            resolve();
          });
        }),
      );
      // Closes over the tail of the item exit; at once under reduced motion.
      gsap.timeline().add(sweep, prefersReducedMotion() ? 0 : CURTAIN_LEAD);
    }
    return Promise.all(waits).then(() => {});
  }

  /**
   * The incoming page's intro, with the curtain lowered and the shared element
   * morphed once the page is prepared. Everything here runs in the same task
   * as the router's DOM update, so the first painted frame already shows the
   * hero at the thumbnail's box.
   */
  async function arrive(controller: PageController, plan: Plan) {
    const token = generation;
    await controller.enter(plan.arrival, () => {
      // Settled releases the scroller, unless a newer navigation has stopped it again.
      if (token === generation) scroller?.start();
    });
    if (token !== generation) return;
    // The scroll has landed and the intro is built: re-measure once.
    scroller?.resize();
    if (plan.handoff) {
      // The hero is laid out at its final size and visible; the thumbnail left with the swap.
      const target = controller.root.querySelector<HTMLElement>(
        `[data-shared-hero][data-flip-id="${CSS.escape(plan.handoff.id)}"]`,
      );
      if (target) playShared(plan.handoff.state, target);
    }
    // Start values are written, so the curtain may leave, overlapping the intro.
    // A history move never covers, but it lowers a curtain a cancelled navigation left up.
    if (curtainPhase() !== "idle") reveal();
  }

  setRouteTransition({
    registerPage(controller) {
      active = controller;
      // The incoming tree exists and holds its initial state: safe to uncover.
      covered = false;
      if (pending) {
        const plan = pending;
        pending = null;
        void arrive(controller, plan);
      }
      return () => {
        if (active === controller) active = null;
      };
    },
  });

  beforeNavigate((nav) => {
    // The navigation this controller re-issued itself. Consume the token on
    // the very navigation it was set for, so nothing else slips through.
    if (passThrough) {
      passThrough = false;
      return;
    }

    // History is never cancelled and never outros. Abandon any outro still
    // running so it cannot push a stale destination once it finishes, and
    // hold the page still while the router restores the saved position.
    if (nav.type === "popstate") {
      generation += 1;
      locked = false;
      covered = false;
      handoff = null;
      scroller?.stop();
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

    const transition = transitionFor(nav);
    nav.cancel();
    locked = true;
    covered = false;
    const token = ++generation;
    const href = nav.to.url.href;

    // The page holds still through the outro and the swap; the incoming page's
    // settled state releases it.
    scroller?.stop();

    // A replaced navigation's capture never plays. A shared element is captured
    // while the thumbnail is still laid out, before the outro moves anything.
    handoff =
      transition.kind === "shared"
        ? { path: nav.to.url.pathname, id: transition.element.dataset.flipId ?? "", state: captureShared(transition.element) }
        : null;

    // Overlap `load` with the outro so the destination is ready the moment the
    // end state is reached.
    void preloadData(href).catch(() => {});

    void settleWithin(leave(controller, transition, token), OUTRO_TIMEOUT).then(() => {
      if (token !== generation) return; // history overtook this outro
      // The route cover spans the swap gap for an ordinary swap. The curtain
      // replaces it, except under reduced motion, where no panel ever shows.
      // A morph needs the kept thumbnail in view, so nothing covers it.
      covered = transition.kind === "plain" || (transition.kind === "curtain" && prefersReducedMotion());
      passThrough = true;
      void goto(href).catch(() => {
        // Nothing arrives: release what the outro held.
        passThrough = false;
        locked = false;
        covered = false;
        handoff = null;
        scroller?.start();
        if (curtainPhase() !== "idle") reveal();
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

    // The router has already scrolled: the top for a push, the saved position
    // for history. Sync the engine to it before anything measures.
    if (nav.type !== "enter") scroller?.scrollTo(nav.to?.scroll?.y ?? window.scrollY, { immediate: true });

    // The handoff plays only on the page it was captured for; a history move
    // has no capture and takes the intro-only path, without travel.
    const plan: Plan = {
      arrival: nav.type === "popstate" ? "return" : "fresh",
      handoff: handoff && nav.to && handoff.path === nav.to.url.pathname ? handoff : null,
    };
    handoff = null;

    if (active) void arrive(active, plan);
    else pending = plan;
  });

  onMount(() => {
    // Tells the pre-paint failsafe in app.html that a controller arrived, so it
    // leaves the mark alone and the hiding rule stays under lifecycle control.
    document.documentElement.setAttribute(MOTION_LIVE_ATTRIBUTE, "");
    const unmountChrome = mountChromeMotion();

    // One scroller per document, from the persistent shell, before any page
    // could create a ScrollTrigger. Native controls under reduced motion.
    scroller = lenisScroll({ lerp: 0.1 });
    // The curtain lives in the shell beside the route container, so it
    // survives the swap it hides.
    cover = curtain(curtainRoot.querySelectorAll<HTMLElement>("[data-curtain-panel]"), { from: "bottom" });

    // A document restored from the back-forward cache runs no navigation hook:
    // it comes back scrollable and uncovered.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      locked = false;
      covered = false;
      scroller?.start();
      if (curtainPhase() !== "idle") reveal();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      cover?.revert();
      cover = null;
      setCurtainPhase("idle");
      scroller?.destroy();
      scroller = null;
      unmountChrome();
    };
  });
</script>

<div class="shell" onclickcapture={recordLink}>
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

  <!-- The curtain: in the shell, outside every page, fixed over the viewport.
       It is the one transition that passes over the chrome, and it never
       touches the chrome's nodes. At rest its panels are hidden. -->
  <div class="curtain" data-curtain data-curtain-phase="idle" aria-hidden="true" bind:this={curtainRoot}>
    <div class="curtain-panel" data-curtain-panel></div>
    <div class="curtain-panel" data-curtain-panel></div>
    <div class="curtain-panel" data-curtain-panel></div>
  </div>
</div>
