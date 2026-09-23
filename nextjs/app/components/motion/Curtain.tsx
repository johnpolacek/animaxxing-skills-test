"use client";

import { useRouteTransition } from "./RouteTransition";

/**
 * The curtain's panels. Rendered once from the root layout, inside the
 * persistent boundary and outside every route, so they survive the swap they
 * hide. The boundary builds `curtain()` over them and reports the phase on the
 * root: `idle`, `covering`, `covered`, `revealing`. The server HTML carries
 * `idle`, and CSS keeps the panels hidden there, so a reader without
 * JavaScript never sees one.
 */
export function Curtain() {
  const { curtainRef } = useRouteTransition();
  return (
    <div ref={curtainRef} className="curtain" data-curtain data-curtain-phase="idle" aria-hidden="true">
      <div className="curtain-panel" data-curtain-panel />
      <div className="curtain-panel" data-curtain-panel />
      <div className="curtain-panel" data-curtain-panel />
    </div>
  );
}
