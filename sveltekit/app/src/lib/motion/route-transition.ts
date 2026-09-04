import { getContext, setContext } from "svelte";

/**
 * One page's lifecycle, handed to the layout controller so it can drive the
 * page from outside without knowing what the page animates.
 */
export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /** Write initial values and play the intro. Safe to call on reused DOM. */
  enter: () => void;
  /** Play the outro on live DOM; resolves once the end state is applied. */
  leave: () => Promise<void>;
};

export type RouteTransition = {
  /**
   * A page announces itself as it mounts. The returned function unregisters
   * it, and must be called from the page's teardown.
   */
  registerPage: (controller: PageController) => () => void;
};

const KEY = Symbol("animaxx.route-transition");

export function setRouteTransition(api: RouteTransition): void {
  setContext(KEY, api);
}

export function getRouteTransition(): RouteTransition {
  const api = getContext<RouteTransition | undefined>(KEY);
  if (!api) {
    throw new Error("<PageMotion> must be rendered inside the root layout's route area");
  }
  return api;
}
