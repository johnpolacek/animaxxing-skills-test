import { FAILSAFE_MS, LIVE_ATTRIBUTE, MOTION_ATTRIBUTE } from "./phases";

/**
 * Marks the document as JavaScript-animated before anything paints.
 *
 * `ssr: true` means every route arrives as HTML and paints before hydration, so
 * the initial state cannot be written by an effect in time. The pre-paint rule
 * in app.css is scoped to this mark and to a page's `initial` phase, so
 * server-rendered content is fully visible without JavaScript and hides only
 * while a controller is about to take over.
 *
 * Under `prefers-reduced-motion: reduce` the mark is never set: the page paints
 * settled and the controller takes the instant path.
 *
 * The timeout is the failsafe for the case the mark cannot cover: the document
 * arrives, this script runs, and the client bundle then never does. Releasing
 * the mark puts the page back to its no-JavaScript state rather than leaving
 * content hidden behind a lifecycle that will never start. A boundary that does
 * arrive sets `data-motion-live` first and keeps the mark.
 *
 * Rendered first in <body> in the root `Layout`, so it runs before the route
 * content is parsed and covers the app, `HydrateFallback`, and `ErrorBoundary`
 * alike. <html> needs suppressHydrationWarning because the server HTML cannot
 * carry the attribute this adds.
 */
const NAME = JSON.stringify(MOTION_ATTRIBUTE);
const LIVE = JSON.stringify(LIVE_ATTRIBUTE);
const SCRIPT =
  `(function(){var r=document.documentElement;` +
  `if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;` +
  `r.setAttribute(${NAME},"js");` +
  `setTimeout(function(){if(!r.hasAttribute(${LIVE}))r.removeAttribute(${NAME})},${FAILSAFE_MS})})()`;

export function MotionScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
