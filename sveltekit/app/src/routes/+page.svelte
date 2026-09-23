<script lang="ts">
  import PageMotion from "$lib/motion/PageMotion.svelte";
</script>

<svelte:head>
  <title>Lifecycle</title>
</svelte:head>

<PageMotion>
  <main class="page">
    <h1 data-intro>A studio for small, deliberate things</h1>
    <p data-intro>
      We build sites that load fast, read well, and behave the same on the tenth visit as on the
      first. Nothing here is decorative for its own sake.
    </p>
    <p data-intro>
      Every page is laid out with ordinary CSS before anything moves, so the content is legible the
      moment the document arrives.
    </p>
    <p data-intro>
      Start with the <a data-testid="curtain-link" data-transition="curtain" href="/work">work</a>,
      browse the <a data-testid="home-gallery" href="/gallery">gallery</a>, or read a little about how
      the studio came together.
    </p>
  </main>
</PageMotion>
