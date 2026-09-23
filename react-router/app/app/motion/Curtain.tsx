import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouteTransition } from "./RouteTransition";

// The root module is evaluated on the server, where a layout effect has nothing to lay out.
const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The curtain: panels that sweep over the whole viewport, chrome included, to
 * hide a route swap. Rendered by the root route after the route area, so it
 * lives in the persistent shell and survives the swap it hides. The recipe's
 * CSS keeps the panels hidden and out of the way of clicks at rest, so server
 * HTML never paints them and a reader without JavaScript never sees them.
 *
 * `data-curtain-phase` is written by the boundary from the sweeps' completion
 * callbacks, not by React: the prop below never changes, so React never
 * overwrites what the boundary wrote.
 */
export function Curtain() {
  const root = useRef<HTMLDivElement>(null);
  const { mountCurtain } = useRouteTransition();

  useIsomorphicLayoutEffect(() => {
    if (!root.current) return;
    return mountCurtain(root.current);
  }, [mountCurtain]);

  return (
    <div ref={root} className="curtain" data-curtain="" data-curtain-phase="idle" aria-hidden="true">
      <div className="curtain-panel" data-curtain-panel="" />
      <div className="curtain-panel" data-curtain-panel="" />
      <div className="curtain-panel" data-curtain-panel="" />
    </div>
  );
}
