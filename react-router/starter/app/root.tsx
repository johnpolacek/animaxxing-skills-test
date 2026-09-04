import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LinksFunction,
} from "react-router";
import stylesheet from "./app.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Lifecycle</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
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
    </>
  );
}
