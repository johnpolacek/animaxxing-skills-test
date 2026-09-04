import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // A multi-page site: every route is its own document.
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        home: page("./index.html"),
        about: page("./about/index.html"),
        work: page("./work/index.html"),
      },
    },
  },
});
