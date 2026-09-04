<script setup lang="ts">
import { isNavigationLocked, lockNavigation } from "~/motion/page-transition";

/*
 * `<NuxtLink>` with one navigation at a time.
 *
 * There is no outro to start here: Vue keeps the outgoing page through
 * `onLeave`, and the global middleware holds the navigation while it plays, so
 * this is not a Next.js style transition link. The only thing it adds is the
 * lock, and the lock lives here rather than in a router guard because a guard
 * that refuses the second navigation also loses the first: Vue Router has
 * already replaced its pending location by then and cancels the navigation
 * that is waiting on our middleware. A click that never reaches the router
 * costs nothing.
 */
defineOptions({ inheritAttrs: false });
defineProps<{ to: string }>();

function onClick(event: MouseEvent, navigate: () => void) {
  // Modified and non-primary clicks, and anything already handled, keep the
  // native anchor behaviour: new tab, new window, download, context menu.
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  // The first accepted destination wins. A second click during an outro is
  // swallowed rather than queued.
  if (isNavigationLocked()) return;
  lockNavigation();
  navigate();
}
</script>

<template>
  <NuxtLink :to="to" custom>
    <template #default="{ href, navigate }">
      <a :href="href" v-bind="$attrs" @click="onClick($event, navigate)"><slot /></a>
    </template>
  </NuxtLink>
</template>
