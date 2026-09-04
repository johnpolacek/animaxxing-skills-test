<script lang="ts">
  import type { Snippet } from "svelte";
  import "../app.css";

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
  <header class="site-header">
    <span class="wordmark">Lifecycle</span>
    <nav class="site-nav" aria-label="Main">
      <a href="/" data-testid="nav-home">Home</a>
      <a href="/about" data-testid="nav-about">About</a>
      <a href="/work" data-testid="nav-work">Work</a>
    </nav>
  </header>

  <div class="route">
    {@render children()}
  </div>

  <footer class="site-footer">
    <span>Three routes, one lifecycle.</span>
    <a href="/?q=1" data-testid="nav-filtered">Filtered index</a>
  </footer>
</div>
