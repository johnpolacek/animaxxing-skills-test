import { MOTION_ATTRIBUTE } from "./phases";

/**
 * Marks the document as JavaScript-animated before anything paints.
 *
 * The pre-paint rule in globals.css is scoped to this mark and to a page's
 * `initial` phase, so server-rendered content is fully visible without
 * JavaScript and hides only while a controller is about to take over.
 *
 * The timeout is the failsafe for the case the mark cannot cover: the document
 * arrives, this script runs, and the client bundle then never does. Releasing
 * the mark puts the page back to its no-JavaScript state rather than leaving
 * the content hidden behind a lifecycle that will never start. A controller
 * that does arrive sets `data-motion-live` first and keeps the mark.
 *
 * Rendered first in <body> so it runs before the route content is parsed.
 * <html> needs suppressHydrationWarning because the server HTML cannot carry
 * the attribute this adds.
 */
const SCRIPT = `(function(){var r=document.documentElement;r.setAttribute(${JSON.stringify(
  MOTION_ATTRIBUTE,
)},"js");setTimeout(function(){if(!r.hasAttribute("data-motion-live"))r.removeAttribute(${JSON.stringify(
  MOTION_ATTRIBUTE,
)})},900)})()`;

export function MotionScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
