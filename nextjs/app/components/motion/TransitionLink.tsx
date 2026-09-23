"use client";

import NextLink from "next/link";
import { useRef, type ComponentProps } from "react";
import { useRouteTransition, type Transition } from "./RouteTransition";

type TransitionLinkProps = ComponentProps<typeof NextLink> & {
  /**
   * `curtain` takes the full-screen curtain instead of the route-area swap.
   * A link that holds a `[data-shared][data-flip-id]` element takes the
   * shared-element morph without asking. Everything else is the plain swap.
   */
  transition?: "curtain";
};

/**
 * `next/link` with the outro in front of the navigation.
 *
 * `onNavigate` (Next 15.3+) fires only for same-origin client navigation, so
 * modified clicks, non-primary buttons, external URLs, and `download` links are
 * already excluded and keep their native behavior. What is left to exclude here
 * is a new tab, a hash-only link, and a link to the screen already showing.
 *
 * Everything else keeps the Link interface, so prefetching, the real `href`,
 * and keyboard behavior are unchanged: the navigation is cancelled, the page
 * plays its outro, and the boundary pushes once the end state is reached.
 */
export function TransitionLink({ onNavigate, transition, ...props }: TransitionLinkProps) {
  const { requestNavigation } = useRouteTransition();
  const anchor = useRef<HTMLAnchorElement>(null);
  const { href, replace, scroll, target } = props;

  return (
    <NextLink
      {...props}
      ref={anchor}
      data-transition={transition}
      onNavigate={(event) => {
        onNavigate?.(event);
        if (target || typeof href !== "string") return;

        const destination = new URL(href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        // Same screen: a hash or nothing at all. Leave it native.
        if (
          destination.pathname === window.location.pathname &&
          destination.search === window.location.search
        ) {
          return;
        }

        // The element that travels, if this link carries one. Read at click
        // time from the link's own subtree, never from the document: under
        // cacheComponents a hidden route can hold a copy with the same id.
        const shared =
          anchor.current?.querySelector<HTMLElement>("[data-shared][data-flip-id]") ?? null;
        const how: Transition =
          transition === "curtain"
            ? { kind: "curtain" }
            : shared
              ? { kind: "shared", element: shared }
              : { kind: "plain" };

        const to = `${destination.pathname}${destination.search}${destination.hash}`;
        if (!requestNavigation(to, { replace, scroll, transition: how })) return;
        event.preventDefault();
      }}
    />
  );
}
