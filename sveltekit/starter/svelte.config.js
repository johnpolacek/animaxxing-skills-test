import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // A real Node server, so `preview` serves the same SSR output production
    // would. `vite preview` only serves static assets and cannot render routes.
    adapter: adapter(),
  },
};
