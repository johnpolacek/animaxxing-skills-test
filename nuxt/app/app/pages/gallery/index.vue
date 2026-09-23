<script setup lang="ts">
import { galleryItems } from "~/utils/gallery";

useHead({ title: "Gallery" });
</script>

<template>
  <PageRoot class="page--wide">
    <h1 data-intro>Gallery</h1>
    <p data-intro>
      Three studies in reserved space. Each opens into its own page, and the picture you choose
      travels there.
    </p>
    <!--
      Each link is an intro target; the thumbnail inside it is not. The shared
      element carries `data-shared` for the site and `data-flip-id` for Flip, so
      it is never hidden before paint or moved by the stagger, and Flip alone
      owns it during a morph.
    -->
    <ul class="gallery" role="list">
      <li v-for="item in galleryItems" :key="item.n">
        <TransitionLink :to="`/gallery/${item.n}`" class="gallery-item" data-intro :data-testid="`gallery-item-${item.n}`">
          <span :class="`swatch swatch--${item.n}`" :data-shared="`item-${item.n}`" :data-flip-id="`item-${item.n}`"></span>
          <span class="gallery-caption">Item {{ item.n }} — {{ item.title }}</span>
        </TransitionLink>
      </li>
    </ul>
    <section class="notes notes--gallery" data-intro aria-labelledby="gallery-notes">
      <h2 id="gallery-notes">Notes on reserved space</h2>
      <p>
        Every picture on this page has its box before it has its pixels. The grid is laid out from
        plain CSS, so a slow image never moves a caption, and a thumbnail that travels to its own
        page leaves from exactly where it sat.
      </p>
      <p>
        The scroll you are using now is eased by a scroller the shell owns. Pages never create or
        stop it; the transition holds it still while a page leaves and hands it back once the next
        one has settled.
      </p>
      <p>
        Back and forward return to the position you left, not to the top and not to where the other
        page was. The next turn of the wheel continues from there.
      </p>
      <p>Nothing below this line animates on arrival. It is here so the page has somewhere to go.</p>
    </section>
  </PageRoot>
</template>
