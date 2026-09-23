import { getContext, setContext } from "svelte";
import type { Arrival } from "./phases";

export type LeaveOptions = {
  /**
   * An element left lit through the outro, such as a shared element about to
   * morph into the next page. Targets around it fade; it and its ancestors stay.
   */
  keep?: Element | null;
};

/**
 * One page's lifecycle, handed to the layout controller so it can drive the
 * page from outside without knowing what the page animates.
 */
export type PageController = {
  /** The route content wrapper this controller owns. */
  root: HTMLElement;
  /**
   * Write initial values and play the intro. Safe to call on reused DOM.
   * Resolves once the start values are written and the phase is `intro`: the
   * page is prepared, so a curtain may reveal it and a shared element may
   * morph onto it. `onSettled` runs once, from the settled state.
   */
  enter: (arrival: Arrival, onSettled?: () => void) => Promise<void>;
  /** Play the outro on live DOM; resolves once the end state is applied. */
  leave: (options?: LeaveOptions) => Promise<void>;
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
