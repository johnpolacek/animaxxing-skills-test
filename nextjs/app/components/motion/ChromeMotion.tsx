"use client";

import { useGSAP } from "./gsap";
import { mountChromeMotion } from "./chrome";

/** Mounts once in the root layout, outside the changing route area. */
export function ChromeMotion() {
  useGSAP(() => mountChromeMotion(), []);
  return null;
}
