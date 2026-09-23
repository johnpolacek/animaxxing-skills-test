<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { gsap } from "./gsap";
  import {
    INTRO_DURATION,
    INTRO_RISE,
    INTRO_STAGGER,
    OUTRO_DRIFT,
    OUTRO_DURATION,
    OUTRO_STAGGER,
    motionReleased,
    prefersReducedMotion,
    type Arrival,
    type Phase,
  } from "./phases";
  import { getRouteTransition, type LeaveOptions, type PageController } from "./route-transition";

  let { children }: { children: Snippet } = $props();

  // Read during initialization, while the layout's context is in scope.
  const { registerPage } = getRouteTransition();

  let root: HTMLElement;
  /**
   * Server rendering emits `initial`, so the pre-paint rule in app.css applies
   * from the first byte and no settled content is ever painted early.
   */
  let phase = $state<Phase>("initial");

  onMount(() => {
    // Every selector resolves inside this page, and revert() kills the tweens
    // this page created and restores the inline styles they wrote.
    const context = gsap.context(() => {}, root);

    let intro: gsap.core.Timeline | null = null;

    /**
     * Advance one phase, and wait for Svelte to write it to the DOM before the
     * next one is set. Two phases in one flush would leave anything watching
     * the attribute with only the last of them.
     */
    const setPhase = async (next: Phase) => {
      if (phase === next) return;
      phase = next;
      await tick();
    };

    /** Queried per call, so anything rendered since setup is included. */
    const targets = () => gsap.utils.toArray<HTMLElement>("[data-intro]", root);

    const runIntro = async (arrival: Arrival, prepared: () => void, onSettled?: () => void) => {
      // An intro can start on DOM that already holds settled values, so the
      // previous timeline is killed and start values are written explicitly
      // rather than inferred by a `from` tween that trusts a fresh node.
      intro?.kill();
      intro = null;
      await setPhase("initial");

      // No travel when the reader asked for none, and none when the pre-paint
      // failsafe already put the content on screen: hiding it again to play an
      // intro would be worse than arriving settled.
      const instant = prefersReducedMotion() || motionReleased();
      // A history arrival fades in place: the reader has seen this page.
      const rise = arrival === "fresh" ? INTRO_RISE : 0;
      const els = targets();
      context.add(() => {
        gsap.set(els, instant ? { autoAlpha: 1, y: 0 } : { autoAlpha: 0, y: rise });
      });

      await setPhase("intro");
      // Start values are on the DOM and the phase is public: the page is prepared.
      prepared();

      const settle = async () => {
        intro = null;
        // Settled is plain CSS, not a held timeline: drop every temporary
        // transform, visibility, and will-change this page wrote.
        context.add(() => {
          gsap.set(els, { clearProps: "all" });
        });
        await setPhase("settled");
        onSettled?.();
      };

      if (instant) {
        // No travel, but the same phases and the same completion.
        await settle();
        return;
      }

      context.add(() => {
        intro = gsap
          .timeline({ onComplete: settle })
          .set(els, { willChange: "transform, opacity" })
          .to(els, {
            autoAlpha: 1,
            y: 0,
            duration: INTRO_DURATION,
            stagger: arrival === "fresh" ? INTRO_STAGGER : 0,
            ease: "power2.out",
          });
      });
    };

    const runOutro = ({ keep = null }: LeaveOptions = {}) =>
      new Promise<void>((resolve) => {
        // The intro is not the inverse of the outro, so kill it and leave from
        // whatever is on screen rather than reversing it.
        intro?.kill();
        intro = null;

        // Queried at leave time so late-arriving content leaves with the page.
        // A kept element, and anything holding it, stays lit through the swap.
        const els = targets().filter((el) => !keep || !(el.contains(keep) || keep.contains(el)));

        let ended = false;
        const end = () => {
          if (ended) return;
          ended = true;
          // Still mounted and still laid out, just no longer interactive: the
          // `end` phase drives that from CSS, so nothing has to be cleaned up.
          void setPhase("end").then(resolve);
        };

        void setPhase("outro").then(() => {
          if (prefersReducedMotion()) {
            context.add(() => {
              gsap.set(els, { autoAlpha: 0 });
            });
            end();
            return;
          }
          context.add(() => {
            // onInterrupt as well as onComplete: a killed timeline never runs
            // its completion, and the router is waiting on this promise.
            gsap
              .timeline({ onComplete: end, onInterrupt: end })
              .set(els, { willChange: "transform, opacity" })
              .to(els, {
                autoAlpha: 0,
                y: -OUTRO_DRIFT,
                duration: OUTRO_DURATION,
                stagger: OUTRO_STAGGER,
                ease: "power2.in",
              });
          });
        });
      });

    const controller: PageController = {
      root,
      enter: (arrival, onSettled) =>
        new Promise<void>((prepared) => {
          void runIntro(arrival, prepared, onSettled);
        }),
      leave: runOutro,
    };
    const unregister = registerPage(controller);

    return () => {
      unregister();
      context.revert();
    };
  });
</script>

<div class="page-root" data-page data-phase={phase} bind:this={root}>
  {@render children()}
</div>
