import { useGSAP } from "~/composables/useGSAP";

/** Owned by the persistent layout, independently of every page lifecycle. */
export function mountChromeMotion() {
  const { gsap } = useGSAP();
  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-chrome]"));
  const ctx = gsap.context(() => {
    for (const root of roots) {
      if (root.dataset.chromePhase !== "initial") continue;
      const footer = root.dataset.chrome === "footer";
      const targets = footer
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>("[data-chrome-intro]"));
      const settle = () => {
        gsap.set(targets, {
          clearProps: "transform,transformOrigin,opacity,visibility,willChange",
        });
        root.dataset.chromePhase = "settled";
      };

      // Respect both reduced motion and a pre-paint failsafe that already released.
      if (
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.getAttribute("data-motion") !== "js"
      ) {
        root.dataset.chromePhase = "intro";
        settle();
        continue;
      }

      root.dataset.chromePhase = "intro";
      if (footer) {
        gsap.set(root, { autoAlpha: 0, willChange: "opacity" });
        gsap.to(root, {
          autoAlpha: 1,
          duration: 1.4,
          ease: "power2.out",
          onComplete: settle,
        });
        continue;
      }

      const [brand, ...links] = targets;
      gsap.set(brand, {
        autoAlpha: 0,
        x: -24,
        willChange: "transform,opacity",
      });
      gsap.set(links, {
        autoAlpha: 0,
        scale: 0.5,
        transformOrigin: "center",
        willChange: "transform,opacity",
      });
      gsap
        .timeline({ onComplete: settle })
        .to(brand, {
          autoAlpha: 1,
          x: 0,
          duration: 0.45,
          ease: "power2.out",
        })
        .to(links, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.28,
          stagger: 0.28,
          ease: "back.out(1.4)",
        });
    }
  });
  return () => {
    ctx.revert();
    for (const root of roots) root.dataset.chromePhase = "initial";
  };
}
