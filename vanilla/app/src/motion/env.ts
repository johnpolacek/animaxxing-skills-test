/** The OS preference. Read it per call so a change mid-session is respected. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type NavigationType = "navigate" | "reload" | "back_forward" | "prerender";

/** How this document was reached. Back and forward report `back_forward`. */
export function navigationType(): NavigationType {
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return (entry?.type as NavigationType) ?? "navigate";
}
