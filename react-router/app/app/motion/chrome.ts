import gsap from "gsap";

/** Owned by the persistent layout, independently of every page lifecycle. */
export function mountChromeMotion() {
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-chrome]"));
  const ctx = gsap.context(() => {
    for (const root of roots) {
      if (root.dataset.chromePhase !== "initial") continue;
      const footer = root.dataset.chrome === "footer";
      const targets = footer ? [root] : Array.from(root.querySelectorAll<HTMLElement>("[data-chrome-intro]"));
      const settle = () => {
        gsap.set(targets, { clearProps: "transform,opacity,visibility,willChange" });
        root.dataset.chromePhase = "settled";
      };
      // Respect both reduced motion and a pre-paint failsafe that already released.
      if (matchMedia("(prefers-reduced-motion: reduce)").matches ||
          document.documentElement.getAttribute("data-motion") !== "js") {
        root.dataset.chromePhase = "intro";
        settle();
        continue;
      }
      gsap.set(targets, footer
        ? { autoAlpha: 0, willChange: "opacity" }
        : { autoAlpha: 0, y: 16, willChange: "transform,opacity" });
      root.dataset.chromePhase = "intro";
      gsap.to(targets, {
        autoAlpha: 1,
        ...(footer ? {} : { y: 0, stagger: { amount: 0.15 } }),
        duration: footer ? 1.4 : 0.45,
        ease: "power2.out",
        onComplete: settle,
      });
    }
  });
  return () => {
    ctx.revert();
    for (const root of roots) root.dataset.chromePhase = "initial";
  };
}
