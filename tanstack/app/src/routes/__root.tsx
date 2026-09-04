import { ChromeMotion } from "../motion/ChromeMotion";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MotionScript } from "../motion/MotionScript";
import { RouteArea, RouteTransition } from "../motion/RouteTransition";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lifecycle" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

/**
 * The root route component mounts once per document and outlives every client
 * navigation, so it is where the route transition controller lives. Persistent
 * chrome sits outside the route container the controller covers.
 */
function RootComponent() {
  return (
    <RootDocument>
      <RouteTransition>
        <ChromeMotion />
        <header className="site-header" data-chrome="header" data-chrome-phase="initial">
          <span className="wordmark" data-chrome-intro="">Lifecycle</span>
          <nav className="site-nav" aria-label="Main">
            <Link to="/" data-chrome-intro="" data-testid="nav-home">
              Home
            </Link>
            <Link to="/about" data-chrome-intro="" data-testid="nav-about">
              About
            </Link>
            <Link to="/work" data-chrome-intro="" data-testid="nav-work">
              Work
            </Link>
          </nav>
        </header>
        <RouteArea>
          <Outlet />
        </RouteArea>
        <footer className="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
          <span>Three routes, one lifecycle.</span>
        </footer>
      </RouteTransition>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The inline script adds data-motion before hydration; the server HTML
    // cannot carry it, so that difference is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <MotionScript />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
