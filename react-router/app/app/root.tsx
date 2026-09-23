import { ChromeMotion } from "./motion/ChromeMotion";
import { Curtain } from "./motion/Curtain";
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LinksFunction,
} from "react-router";
import "./motion/gsap.client";
import { MotionScript } from "./motion/MotionScript";
import { RouteArea, RouteTransition } from "./motion/RouteTransition";
import stylesheet from "./app.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script adds data-motion before hydration; the server HTML
    // cannot carry it, so that difference is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lifecycle</title>
        <Meta />
        <Links />
      </head>
      <body>
        <MotionScript />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The root route mounts once per document and outlives every client-side
 * navigation, so the transition boundary lives here: one blocker, one stable
 * route container around <Outlet />, and the chrome outside it.
 *
 * `prefetch="intent"` matters on the blocker path. Loaders and route modules
 * are only fetched after `proceed()`, so without it the end state would sit
 * under the cover waiting on the network.
 *
 * The boundary also owns the document's one smooth scroller and the curtain,
 * rendered here in the shell after the route area so it survives the swap it
 * hides. The window stays the scroll container: nothing here locks the
 * viewport or scrolls an inner element.
 */
export default function App() {
  return (
    <RouteTransition>
      <ChromeMotion />
      <header className="site-header" data-chrome="header" data-chrome-phase="initial">
        <span className="wordmark" data-chrome-intro="">Lifecycle</span>
        <nav className="site-nav" aria-label="Main">
          <Link to="/" prefetch="intent" data-chrome-intro="" data-testid="nav-home">
            Home
          </Link>
          <Link to="/about" prefetch="intent" data-chrome-intro="" data-testid="nav-about">
            About
          </Link>
          <Link to="/work" prefetch="intent" data-chrome-intro="" data-testid="nav-work">
            Work
          </Link>
        </nav>
      </header>
      <RouteArea>
        <Outlet />
      </RouteArea>
      {/* Persistent shell: the curtain lives beside the route area and survives every swap. */}
      <Curtain />
      <footer className="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
        <span>Three routes, one lifecycle.</span>
      </footer>
    </RouteTransition>
  );
}
