import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Like a static host: a directory URL without its trailing slash redirects to
 * it, so `/gallery` reaches `gallery/index.html` in dev and preview alike.
 */
function directoryRedirects(): Plugin {
  const handler =
    (root: () => string): Connect.NextHandleFunction =>
    (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname;
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        !pathname.endsWith("/") &&
        !path.extname(pathname) &&
        fs.existsSync(path.join(root(), pathname, "index.html"))
      ) {
        res.statusCode = 301;
        res.setHeader("Location", `${pathname}/${url.search}`);
        res.end();
        return;
      }
      next();
    };
  return {
    name: "directory-redirects",
    configureServer(server) {
      server.middlewares.use(handler(() => server.config.root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(() => path.resolve(server.config.root, server.config.build.outDir)));
    },
  };
}

export default defineConfig({
  // A multi-page site: every route is its own document.
  appType: "mpa",
  plugins: [directoryRedirects()],
  build: {
    rollupOptions: {
      input: {
        home: page("./index.html"),
        about: page("./about/index.html"),
        work: page("./work/index.html"),
        gallery: page("./gallery/index.html"),
        "gallery-1": page("./gallery/1/index.html"),
        "gallery-2": page("./gallery/2/index.html"),
        "gallery-3": page("./gallery/3/index.html"),
        recovery: page("./recovery/index.html"),
      },
    },
  },
});
