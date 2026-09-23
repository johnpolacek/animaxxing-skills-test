<script lang="ts">
  import PageMotion from "$lib/motion/PageMotion.svelte";
  import { ITEMS } from "./items";
</script>

<svelte:head>
  <title>Gallery</title>
</svelte:head>

<PageMotion>
  <main class="page page--wide">
    <h1 data-intro>Gallery</h1>
    <p data-intro>
      Three studies in reserved space. Each opens into its own page, and the picture you choose travels
      there.
    </p>
    <!-- The thumbnail carries `data-shared` for the site and `data-flip-id` for Flip. It is
         never an intro target: the link around it is, so the clicked one can stay lit. -->
    <ul class="gallery" role="list">
      {#each ITEMS as item (item.n)}
        <li>
          <a class="gallery-item" data-intro data-testid="gallery-item-{item.n}" href="/gallery/{item.n}">
            <span class="swatch swatch--{item.n}" data-shared="item-{item.n}" data-flip-id="item-{item.n}"></span>
            <span class="gallery-caption">Item {item.n} — {item.title}</span>
          </a>
        </li>
      {/each}
    </ul>
    <section class="notes notes--gallery" data-intro aria-labelledby="notes-heading">
      <h2 id="notes-heading">Notes on reserved space</h2>
      <p>
        Every picture on this page has its box before it has its pixels. The grid is laid out from
        plain CSS, so a slow image never moves a caption, and a thumbnail that travels to its own page
        leaves from exactly where it sat.
      </p>
      <p>
        The scroll you are using now is eased by a scroller the root layout owns. Pages never create
        or stop it; the controller holds it still while a page leaves and hands it back once the next
        one has settled.
      </p>
      <p>
        Back and forward return to the position you left, not to the top and not to where the other
        page was. The next turn of the wheel continues from there.
      </p>
      <p>Nothing below this line animates on arrival. It is here so the page has somewhere to go.</p>
    </section>
  </main>
</PageMotion>
