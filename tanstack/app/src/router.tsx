import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    // The blocker holds the push until the outro finishes, and the loaders only
    // start after that. Preloading on hover means the destination is usually
    // already in the cache by then, so the end state is not left on screen.
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}
