<template>
  <div class="site">
    <NuxtRouteAnnouncer />
    <header class="site-header">
      <span class="wordmark">Lifecycle</span>
      <nav class="site-nav" aria-label="Main">
        <NuxtLink to="/" data-testid="nav-home">Home</NuxtLink>
        <NuxtLink to="/about" data-testid="nav-about">About</NuxtLink>
        <NuxtLink to="/work" data-testid="nav-work">Work</NuxtLink>
      </nav>
    </header>
    <div class="route">
      <NuxtPage />
    </div>
    <footer class="site-footer">
      <span>Three routes, one lifecycle.</span>
    </footer>
  </div>
</template>
