"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

/*
 * The one place GSAP is imported and registered.
 *
 * Client-only: nothing here may run during server rendering. Every other
 * module in components/motion imports gsap and useGSAP from here, so
 * registration happens exactly once and no component reaches for the raw
 * package on the server.
 */
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
