<script setup lang="ts">
import { mountChromeMotion } from "~/motion/chrome";
import { mountCurtain, pageTransition } from "~/motion/page-transition";

const curtainRoot = useTemplateRef<HTMLElement>("curtain");
const cleanups: Array<() => void> = [];
onMounted(() => {
  cleanups.push(mountChromeMotion());
  // The curtain is the shell's: created once here, outside every page, so it
  // survives the swap it hides. The transition module sweeps it.
  if (curtainRoot.value) cleanups.push(mountCurtain(curtainRoot.value));
});
onBeforeUnmount(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
</script>

<template>
  <div class="site">
    <NuxtRouteAnnouncer />
    <header class="site-header" data-chrome="header" data-chrome-phase="initial">
      <span class="wordmark" data-chrome-intro="">Lifecycle</span>
      <nav class="site-nav" aria-label="Main">
        <TransitionLink to="/" data-chrome-intro="" data-testid="nav-home">Home</TransitionLink>
        <TransitionLink to="/about" data-chrome-intro="" data-testid="nav-about">About</TransitionLink>
        <TransitionLink to="/work" data-chrome-intro="" data-testid="nav-work">Work</TransitionLink>
      </nav>
    </header>
    <!--
      The route area owns the geometry while pages exchange. Header and footer
      live outside it, so their once-only intro is independent of page transitions.
    -->
    <div class="route">
      <NuxtPage :transition="pageTransition" />
    </div>
    <!--
      Persistent shell: the curtain sits beside the route area, fixed over the
      viewport, and passes over the chrome without touching it. At rest its
      panels are hidden and it takes no pointer events; its phase is written by
      the transition module, never bound from state, so hydration leaves it be.
    -->
    <div ref="curtain" class="curtain" data-curtain data-curtain-phase="idle" aria-hidden="true">
      <div class="curtain-panel" data-curtain-panel></div>
      <div class="curtain-panel" data-curtain-panel></div>
      <div class="curtain-panel" data-curtain-panel></div>
    </div>
    <footer class="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
      <span>Three routes, one lifecycle.</span>
    </footer>
  </div>
</template>
