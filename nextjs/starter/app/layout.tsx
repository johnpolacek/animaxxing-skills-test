import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lifecycle",
  description: "A three page site.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <span className="wordmark">Lifecycle</span>
          <nav className="site-nav" aria-label="Main">
            <Link href="/" data-testid="nav-home">
              Home
            </Link>
            <Link href="/about" data-testid="nav-about">
              About
            </Link>
            <Link href="/work" data-testid="nav-work">
              Work
            </Link>
          </nav>
        </header>
        <div className="route">{children}</div>
        <footer className="site-footer">
          <span>Three routes, one lifecycle.</span>
        </footer>
      </body>
    </html>
  );
}
