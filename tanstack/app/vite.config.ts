import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3105 },
  plugins: [
    tanstackStart({ srcDirectory: "src" }),
    // React's plugin must come after Start's.
    viteReact(),
    nitro(),
  ],
});
