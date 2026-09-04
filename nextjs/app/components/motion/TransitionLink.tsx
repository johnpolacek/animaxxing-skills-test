"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useRouteTransition } from "./RouteTransition";

type TransitionLinkProps = ComponentProps<typeof NextLink>;

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
export function TransitionLink({ onNavigate, ...props }: TransitionLinkProps) {
  const { requestNavigation } = useRouteTransition();
  const { href, replace, scroll, target } = props;

  return (
    <NextLink
      {...props}
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

        const to = `${destination.pathname}${destination.search}${destination.hash}`;
        if (!requestNavigation(to, { replace, scroll })) return;
        event.preventDefault();
      }}
    />
  );
}
