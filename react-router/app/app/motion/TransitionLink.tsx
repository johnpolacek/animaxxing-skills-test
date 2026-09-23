import type { MouseEvent } from "react";
import { Link, useHref, type LinkProps } from "react-router";
import { useRouteTransition } from "./RouteTransition";

export type TransitionLinkProps = LinkProps & {
  /**
   * `curtain`: the navigation closes the curtain over the whole viewport.
   * `shared`: the `[data-shared]` element inside the link stays lit through the
   * outro and morphs into its counterpart on the next page.
   */
  transition: "curtain" | "shared";
};

/** The clicks the router leaves native, so the request stays out of their way too. */
function navigates(event: MouseEvent<HTMLAnchorElement>, target: string | undefined) {
  return (
    event.button === 0 &&
    (!target || target === "_self") &&
    !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
  );
}

/**
 * A `<Link>` that asks the boundary for a transition. `Link`'s `onClick` runs
 * before the router's own handler, so the request is recorded before the
 * blocker sees the navigation; the `href`, prefetching, and every other Link
 * behavior stay React Router's. The blocker effect applies the request only if
 * the router goes where the link pointed.
 */
export function TransitionLink({ transition, onClick, to, ...props }: TransitionLinkProps) {
  const { requestTransition } = useRouteTransition();
  const href = useHref(to);
  return (
    <Link
      to={to}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !navigates(event, props.target)) return;
        if (transition === "curtain") {
          requestTransition(href, { kind: "curtain" });
          return;
        }
        const element = event.currentTarget.querySelector<HTMLElement>("[data-shared]");
        requestTransition(href, element ? { kind: "shared", element } : { kind: "plain" });
      }}
    />
  );
}
