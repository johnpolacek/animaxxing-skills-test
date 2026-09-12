import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

type Record = {
  valid(): boolean;
  add(dispose: () => void): void;
  start(): boolean;
  settle(): void;
  recover(): void;
  dispose(): void;
};
declare global {
  interface Window { motionBoot: { take(root: HTMLElement, until?: number): Record; deadline: number } }
}

const options = new URLSearchParams(location.search);
const initialized = new WeakSet<HTMLElement>();

async function mount(root: HTMLElement, fresh = false) {
  const owner = window.motionBoot.take(root, fresh ? performance.now() + 900 : undefined);
  if (!owner.valid() || initialized.has(root)) return owner;
  initialized.add(root);
  const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-intro]"));
  // Final restoration is registered before plugin setup or writes can fail.
  const original = targets.map((node) => node.getAttribute("style"));
  owner.add(() => targets.forEach((node, i) => {
    if (original[i] === null) node.removeAttribute("style");
    else node.setAttribute("style", original[i]!);
  }));
  const ctx = gsap.context(() => {}, root);
  owner.add(() => ctx.revert());
  try {
    const fault = root.id === "page" ? options.get("fault") : null;
    if (fault === "before") throw new Error("before initial styles");
    gsap.registerPlugin(SplitText);
    ctx.add(() => gsap.set(targets, { autoAlpha: 0, y: 24 }));
    if (fault) {
      // If cleanup misses delayed work, it will rehide recovered content.
      ctx.add(() => gsap.delayedCall(1.5, () => gsap.set(targets, { autoAlpha: 0 })));
    }
    if (fault === "styles") throw new Error("after initial styles");
    let split: SplitText | undefined;
    const heading = root.querySelector("h1");
    if (heading) {
      split = SplitText.create(heading, { type: "chars", mask: "chars" });
      owner.add(() => split?.revert());
    }
    // A disposer that fails must not prevent other restoration.
    if (fault === "cleanup") owner.add(() => { throw new Error("disposer failed"); });
    if (fault === "split" || fault === "cleanup") throw new Error("after split");
    if (root.id === "page" && options.get("prepare") === "font") await document.fonts.ready;
    if (root.id === "page" && options.get("prepare") === "media") await new Image().decode();
    if (!owner.valid()) return owner;
    const animation = gsap.timeline({ paused: true, onComplete: () => owner.settle() });
    owner.add(() => animation.kill());
    animation.to(targets, { autoAlpha: 1, y: 0, duration: 1.2 }, 0.2);
    if (split) animation.fromTo(split.chars, { yPercent: 110 }, { yPercent: 0, duration: 1.2 }, 0.2);
    if (fault === "running") animation.call(() => {
      if (!owner.valid()) return;
      try { throw new Error("entrance callback failed"); }
      catch { owner.recover(); }
    }, [], 0.35);
    if (owner.start()) animation.play();
  } catch {
    owner.recover();
  }
  return owner;
}

const page = document.querySelector<HTMLElement>("#page")!;
void mount(document.querySelector<HTMLElement>("#shell")!);
void mount(page);
document.querySelector("#repeat")!.addEventListener("click", () => { void mount(page); });
document.querySelector("#navigate")!.addEventListener("click", (event) => {
  event.preventDefault();
  // Retire the old entrance before making another owner current.
  page.dataset.current = "false";
  window.motionBoot.take(page).dispose();
  page.dataset.phase = "end";
  const next = document.createElement("main");
  next.id = "destination";
  next.dataset.owner = "";
  next.dataset.current = "true";
  next.dataset.boot = "pending";
  next.dataset.phase = "initial";
  next.innerHTML = '<h1 data-intro>Destination</h1><a data-intro href="/work/">Work</a>';
  page.after(next);
  history.pushState(null, "", "#destination");
  void mount(next, true);
});
