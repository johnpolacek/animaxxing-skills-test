<script setup lang="ts">
import { mountChromeMotion } from "~/motion/chrome";
import { pageTransition } from "~/motion/page-transition";

let cleanup: (() => void) | undefined;
onMounted(() => { cleanup = mountChromeMotion(); });
onBeforeUnmount(() => cleanup?.());

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
    <footer class="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
      <span>Three routes, one lifecycle.</span>
    </footer>
  </div>
</template>
