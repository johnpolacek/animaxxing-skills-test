<script setup lang="ts">
import { galleryItems } from "~/utils/gallery";

definePageMeta({
  validate: (route) => /^[123]$/.test(String(route.params.n)),
});

const route = useRoute();
const n = Number(route.params.n);
const item = galleryItems.find((candidate) => candidate.n === n) ?? galleryItems[0];

useHead({ title: `Item ${n}` });
</script>

<template>
  <PageRoot class="page--wide">
    <h1 data-intro>Item {{ n }}</h1>
    <!--
      The hero reserves its size in CSS and is visible at that size before the
      intro starts: not an intro target, not hidden before paint. When a
      thumbnail was clicked to get here, Flip morphs it from that box.
    -->
    <figure class="hero-figure">
      <div :class="`swatch swatch--${n}`" :data-shared="`item-${n}`" :data-flip-id="`item-${n}`" data-shared-hero></div>
      <figcaption data-intro>{{ item.title }}</figcaption>
    </figure>
    <p data-intro>{{ item.summary }}</p>
    <p data-intro><TransitionLink to="/gallery" data-testid="gallery-back">Back to the gallery</TransitionLink></p>
    <section class="notes notes--item" data-intro aria-labelledby="item-notes">
      <h2 id="item-notes">Notes on reserved space</h2>
      <p>
        The picture arrived as a thumbnail and grew into this box without a cut: the same element,
        captured before it left the gallery and played once this page had its layout.
      </p>
      <p>
        The hero reserves its size in CSS, so it is visible at full size before the heading and text
        rise in. Under reduced motion it is simply there.
      </p>
      <p>
        The rest of the page scrolls, so a wheel here has somewhere to go, and the back link takes
        the ordinary transition.
      </p>
    </section>
  </PageRoot>
</template>
