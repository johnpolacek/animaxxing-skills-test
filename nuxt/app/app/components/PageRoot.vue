<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import { startFirstLoadIntro } from "~/motion/page-transition";

/*
 * The page's single root element, and the one node the lifecycle owns.
 *
 * `<NuxtPage>` needs a single root element per page or no transition runs at
 * all, and under `mode: "out-in"` this element outlives the component that
 * rendered it: it stays in the DOM, driven by the transition hooks, until the
 * outro's `done`. So `data-phase` is written on the element by those hooks,
 * never bound from component state.
 */
const root = useTemplateRef<HTMLElement>("root");

// The hooks own every navigation. The one lifecycle they never see is the
// first load: without `appear` -- which on server-rendered output would ship
// the page inside a <template> and leave it blank without JavaScript -- no
// enter hook fires for the page that came down in the HTML. Hydration is that
// page's mount, so its intro starts here.
const isFirstLoad = useNuxtApp().isHydrating;

onMounted(() => {
  if (isFirstLoad && root.value) startFirstLoadIntro(root.value);
});
</script>

<template>
  <main ref="root" class="page" data-page data-phase="initial" tabindex="-1">
    <slot />
  </main>
</template>
