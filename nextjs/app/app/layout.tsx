import { ChromeMotion } from "@/components/motion/ChromeMotion";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Curtain } from "@/components/motion/Curtain";
import { MotionScript } from "@/components/motion/MotionScript";
import { RouteArea, RouteTransition } from "@/components/motion/RouteTransition";
import { TransitionLink } from "@/components/motion/TransitionLink";
// The smooth scroller's stylesheet, once, from the shell.
import "lenis/dist/lenis.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lifecycle",
  description: "A three page site.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script adds data-motion before hydration; the server HTML
    // cannot carry it, so that difference is expected.
    <html lang="en" suppressHydrationWarning>
      <body>
        <MotionScript />
        <RouteTransition>
          <ChromeMotion />
          <header className="site-header" data-chrome="header" data-chrome-phase="initial">
            <span className="wordmark" data-chrome-intro="">Lifecycle</span>
            <nav className="site-nav" aria-label="Main">
              <TransitionLink href="/" data-chrome-intro="" data-testid="nav-home">
                Home
              </TransitionLink>
              <TransitionLink href="/about" data-chrome-intro="" data-testid="nav-about">
                About
              </TransitionLink>
              <TransitionLink href="/work" data-chrome-intro="" data-testid="nav-work">
                Work
              </TransitionLink>
            </nav>
          </header>
          <RouteArea>{children}</RouteArea>
          <footer className="site-footer" data-chrome="footer" data-chrome-phase="initial" data-chrome-intro="">
            <span>Three routes, one lifecycle.</span>
          </footer>
          {/* Persistent shell: the curtain lives beside the route area and survives every swap. */}
          <Curtain />
        </RouteTransition>
      </body>
    </html>
  );
}
