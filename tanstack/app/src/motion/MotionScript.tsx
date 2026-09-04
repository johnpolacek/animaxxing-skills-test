import { ScriptOnce } from "@tanstack/react-router";
import { FAILSAFE_MS, MOTION_ATTRIBUTE, MOTION_LIVE_ATTRIBUTE } from "./phases";

/**
 * Marks the document as JavaScript-animated before anything paints.
 *
 * Under Start the server HTML paints long before hydration, so this is the only
 * sanctioned way to keep the intro's start state from being skipped. The rule
 * in styles.css is scoped to this mark and to a page's `initial` phase, so
 * server-rendered content is fully visible without JavaScript and hides only
 * while a controller is about to take over.
 *
 * Reduced motion never sets the mark at all: those readers get the settled page
 * on the first paint.
 *
 * The timeout is the failsafe for the case the mark cannot cover: the document
 * arrives, this script runs, and the client bundle then never does. Releasing
 * the mark puts the page back to its no-JavaScript state rather than leaving
 * content hidden behind a lifecycle that will never start. A controller that
 * does arrive sets the live attribute first and keeps the mark.
 *
 * `ScriptOnce` runs during parsing and removes its own node, so hydration never
 * sees it. It is rendered first in <body>, before any route content is parsed.
 * <html> needs `suppressHydrationWarning` because the server markup cannot
 * carry the attribute this adds.
 */
const SCRIPT = [
  "(function(){var r=document.documentElement;",
  'if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;',
  `r.setAttribute(${JSON.stringify(MOTION_ATTRIBUTE)},"js");`,
  "setTimeout(function(){",
  `if(!r.hasAttribute(${JSON.stringify(MOTION_LIVE_ATTRIBUTE)}))`,
  `r.removeAttribute(${JSON.stringify(MOTION_ATTRIBUTE)})`,
  `},${FAILSAFE_MS})})()`,
].join("");

export function MotionScript() {
  return <ScriptOnce>{SCRIPT}</ScriptOnce>;
}
