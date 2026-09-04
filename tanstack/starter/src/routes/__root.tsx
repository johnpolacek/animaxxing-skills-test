import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
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

function RootComponent() {
  return (
    <RootDocument>
      <header className="site-header">
        <span className="wordmark">Lifecycle</span>
        <nav className="site-nav" aria-label="Main">
          <Link to="/" data-testid="nav-home">
            Home
          </Link>
          <Link to="/about" data-testid="nav-about">
            About
          </Link>
          <Link to="/work" data-testid="nav-work">
            Work
          </Link>
        </nav>
      </header>
      <div className="route">
        <Outlet />
      </div>
      <footer className="site-footer">
        <span>Three routes, one lifecycle.</span>
      </footer>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
