import { useRef } from "react";
import { useGSAP } from "./gsap";
import { useRouteTransition } from "./RouteTransition";

/**
 * The curtain: panels fixed over the viewport, rendered in the persistent
 * shell after the route area so they survive the swap they hide. The recipe's
 * CSS keeps them hidden, so server HTML never paints them and a reader without
 * JavaScript never sees one. The root controller sweeps them in over an outro
 * and out over the intro that follows, and reports the phase on
 * `data-curtain-phase`. It is the one cover allowed to pass over the chrome.
 */
export function Curtain() {
  const root = useRef<HTMLDivElement>(null);
  const { registerCurtain } = useRouteTransition();

  // Builds the recipe once, from this shell node; the cleanup reverts it.
  useGSAP(() => (root.current ? registerCurtain(root.current) : undefined), {
    scope: root,
    dependencies: [registerCurtain],
  });

  return (
    <div ref={root} className="curtain" data-curtain="" data-curtain-phase="idle" aria-hidden="true">
      <div className="curtain-panel" data-curtain-panel="" />
      <div className="curtain-panel" data-curtain-panel="" />
      <div className="curtain-panel" data-curtain-panel="" />
    </div>
  );
}
