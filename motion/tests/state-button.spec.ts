import { test, expect, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/component-motion.md (stateButton)

const vis = (page: import("@playwright/test").Page, sel: string) => page.$eval(sel, (el) => getComputedStyle(el).visibility);

test("loading lifts the label, spins, and holds the button's size", async ({ open }) => {
  const page = await open("component-motion");
  const before = await page.$eval("#send", (el) => el.getBoundingClientRect().width);
  await page.evaluate(() => ((window as any).sb = (window as any).CM.stateButton(document.getElementById("send"))));
  await page.evaluate(() => {
    (window as any).sb.loading();
  });
  await expect.poll(() => vis(page, "#slabel")).toBe("hidden");
  expect(await page.$eval("#send", (el) => el.getAttribute("aria-busy"))).toBe("true");
  const turning = await page.evaluate(async () => {
    const spinner = document.querySelectorAll<HTMLElement>("#send > span[aria-hidden]")[0]!;
    const a = Number((window as any).gsap.getProperty(spinner, "rotation"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    return Number((window as any).gsap.getProperty(spinner, "rotation")) !== a;
  });
  expect(turning).toBe(true);
  expect(await page.$eval("#send", (el) => el.getBoundingClientRect().width)).toBe(before);
  await page.evaluate(() => (window as any).sb.revert());
});

test("success finishes the turn, draws the check, announces, and returns to the label", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    const { CM, gsap } = window as any;
    const button = document.getElementById("send")!;
    const sb = CM.stateButton(button, { hold: 0.2, turn: 0.4 });
    sb.loading();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const [spinner, check] = Array.from(button.querySelectorAll<HTMLElement>(":scope > span[aria-hidden]"));
    const tl = sb.success("Sent");
    const status = button.nextElementSibling as HTMLElement;
    // Sample the run: the spinner only ever turns forward to 360, and the check draws.
    let backward = false;
    let last = Number(gsap.getProperty(spinner, "rotation"));
    let drawn = false;
    tl.eventCallback("onUpdate", () => {
      const r = Number(gsap.getProperty(spinner, "rotation"));
      if (r < last - 0.01) backward = true;
      last = r;
      const offset = Number(check!.querySelector("polyline")!.getAttribute("stroke-dashoffset"));
      if (getComputedStyle(check!).visibility === "visible" && offset === 0) drawn = true;
    });
    await new Promise((resolve) => tl.eventCallback("onComplete", resolve));
    const out = { backward, end: last, drawn, role: status.getAttribute("role"), message: status.textContent, busy: button.getAttribute("aria-busy"), label: getComputedStyle(document.getElementById("slabel")!).visibility };
    sb.revert();
    return out;
  });
  expect(result.backward).toBe(false);
  expect(result.end).toBe(360);
  expect(result.drawn).toBe(true);
  expect(result.role).toBe("status");
  expect(result.message).toBe("Sent");
  expect(result.busy).toBeNull();
  expect(result.label).toBe("visible");
});

test("error shakes the button, announces, returns to the label, and ends still", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    const { CM, gsap } = window as any;
    const button = document.getElementById("send")!;
    const sb = CM.stateButton(button);
    sb.loading();
    const tl = sb.error();
    let peak = 0;
    tl.eventCallback("onUpdate", () => (peak = Math.max(peak, Math.abs(Number(gsap.getProperty(button, "x"))))));
    await new Promise((resolve) => tl.eventCallback("onComplete", resolve));
    const out = { peak, x: Number(gsap.getProperty(button, "x")), message: (button.nextElementSibling as HTMLElement).textContent, label: getComputedStyle(document.getElementById("slabel")!).visibility };
    sb.revert();
    return out;
  });
  expect(result.peak).toBeGreaterThan(5);
  expect(result.x).toBe(0);
  expect(result.message).toBe("That didn't work. Try again.");
  expect(result.label).toBe("visible");
});

test("revert removes the icons and status and restores the button exactly", async ({ open }) => {
  const page = await open("component-motion");
  await page.evaluate(() => {
    const sb = (window as any).CM.stateButton(document.getElementById("send"));
    sb.loading();
    sb.revert();
    sb.revert();
  });
  expect(await page.$eval("#send", (el) => el.nextElementSibling?.getAttribute("role") ?? null)).toBeNull();
  expect(await page.$eval("#send", (el) => el.querySelectorAll("svg").length)).toBe(0);
  expect(await page.$eval("#send", (el) => el.hasAttribute("aria-busy"))).toBe(false);
  expect(await declarations(page, "#send")).toEqual(await declared(page, "position:absolute;left:700px;top:600px;width:140px;height:44px;outline:1px solid red"));
  expect(await page.$eval("#slabel", (el) => el.getAttribute("style") ?? "")).toBe("");
  expect(await page.$eval("#send", (el) => el.innerHTML)).toBe('<span data-state-label="" id="slabel">Send</span>');
});

test("under reduced motion nothing spins or shakes and the status still announces", async ({ open }) => {
  const page = await open("component-motion");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const { CM, gsap } = window as any;
    const button = document.getElementById("send")!;
    const sb = CM.stateButton(button, { hold: 0 });
    sb.loading();
    const spinner = button.querySelector<HTMLElement>(":scope > span[aria-hidden]")!;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rotation = Number(gsap.getProperty(spinner, "rotation"));
    const tl = sb.error("Nope");
    await new Promise((resolve) => tl.eventCallback("onComplete", resolve));
    const out = { rotation, x: Number(gsap.getProperty(button, "x")), message: (button.nextElementSibling as HTMLElement).textContent };
    sb.revert();
    return out;
  });
  expect(result).toEqual({ rotation: 0, x: 0, message: "Nope" });
});
