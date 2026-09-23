<script lang="ts">
  import PageMotion from "$lib/motion/PageMotion.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const item = $derived(data.item);
</script>

<svelte:head>
  <title>Item {item.n}</title>
</svelte:head>

<PageMotion>
  <main class="page page--wide">
    <h1 data-intro>Item {item.n}</h1>
    <!-- The hero reserves its size in CSS and is neither an intro target nor hidden before
         paint, so it is visible at full size the moment the page mounts. Flip alone owns it
         during a morph. -->
    <figure class="hero-figure">
      <div class="swatch swatch--{item.n}" data-shared="item-{item.n}" data-flip-id="item-{item.n}" data-shared-hero></div>
      <figcaption data-intro>{item.title}</figcaption>
    </figure>
    <p data-intro>{item.blurb}</p>
    <p data-intro><a data-testid="gallery-back" href="/gallery">Back to the gallery</a></p>
    <section class="notes notes--item" data-intro aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes on reserved space</h2>
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
  </main>
</PageMotion>
