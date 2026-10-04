import { test, expect, style, declarations, declared } from "./fixture";

// Recipes: animaxxing/references/recipes/press-feedback.md and motion-vocabulary.md (shake)

const scale = (page: import("@playwright/test").Page, id: string) => page.evaluate((s) => Number((window as any).gsap.getProperty(`#${s}`, "scale")), id);

test("a press squashes, spreads a ripple from the press point, and springs back on release", async ({ open }) => {
  const page = await open("press-feedback");
  await page.evaluate(() => ((window as any).t = (window as any).PF.pressFeedback(document.getElementById("btn"))));
  await page.mouse.move(80, 60);
  await page.mouse.down();
  const ripple = await page.$eval("#btn [data-ripple]", (el) => {
    const s = (el as HTMLElement).style;
    // Its center, relative to the button.
    return { cx: parseFloat(s.left) + parseFloat(s.width) / 2, cy: parseFloat(s.top) + parseFloat(s.height) / 2, hidden: el.getAttribute("aria-hidden") };
  });
  expect(ripple.cx).toBeCloseTo(40, 2);
  expect(ripple.cy).toBeCloseTo(20, 2);
  expect(ripple.hidden).toBe("true");
  await expect.poll(() => scale(page, "btn")).toBeCloseTo(0.94, 2);
  await page.mouse.up();
  await expect.poll(() => scale(page, "btn")).toBeCloseTo(1, 2);
  await expect.poll(() => page.locator("#btn [data-ripple]").count()).toBe(0);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await declarations(page, "#btn")).toEqual(await declared(page, "outline: 1px solid red"));
});

test("Enter presses from the center and a held touch that scrolls springs back", async ({ open }) => {
  const page = await open("press-feedback");
  await page.evaluate(() => ((window as any).t = (window as any).PF.pressFeedback(document.getElementById("btn"))));
  await page.focus("#btn");
  await page.keyboard.down("Enter");
  const center = await page.$eval("#btn [data-ripple]", (el) => {
    const s = (el as HTMLElement).style;
    return [parseFloat(s.left) + parseFloat(s.width) / 2, parseFloat(s.top) + parseFloat(s.height) / 2];
  });
  expect(center[0]).toBeCloseTo(100, 2);
  expect(center[1]).toBeCloseTo(30, 2);
  await expect.poll(() => scale(page, "btn")).toBeLessThan(0.97);
  await page.keyboard.up("Enter");
  await expect.poll(() => scale(page, "btn")).toBeCloseTo(1, 2);
  await page.evaluate(() => {
    const b = document.getElementById("btn")!;
    b.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", button: 0, clientX: 60, clientY: 50, bubbles: true }));
    b.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "touch", bubbles: true }));
  });
  await expect.poll(() => scale(page, "btn")).toBeCloseTo(1, 2);
  await page.evaluate(() => (window as any).t());
});

test("pressFeedback keeps a positioned, clipped control's own styles and removes ripples in flight", async ({ open }) => {
  const page = await open("press-feedback");
  await page.evaluate(() => ((window as any).t = (window as any).PF.pressFeedback(document.getElementById("rel"))));
  expect(await style(page, "#rel")).toBe("");
  await page.mouse.move(400, 70);
  await page.mouse.down();
  expect(await page.locator("#rel [data-ripple]").count()).toBe(1);
  await page.evaluate(() => (window as any).t());
  expect(await page.locator("#rel [data-ripple]").count()).toBe(0);
  expect(await style(page, "#rel")).toBe("");
  await page.mouse.up();
});

test("pressFeedback does nothing under reduced motion", async ({ open }) => {
  const page = await open("press-feedback");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).t = (window as any).PF.pressFeedback(document.getElementById("btn"));
  });
  await page.mouse.move(80, 60);
  await page.mouse.down();
  expect(await page.locator("#btn [data-ripple]").count()).toBe(0);
  await page.mouse.up();
  expect(await declarations(page, "#btn")).toEqual(await declared(page, "outline: 1px solid red"));
});

test("shake swings narrower each time, ends still, and hands back the element's own transform", async ({ open }) => {
  const page = await open("press-feedback");
  const result = await page.evaluate(async () => {
    const { MV, gsap } = window as any;
    const el = document.getElementById("field")!;
    let fired = 0;
    const tl = MV.shake(el, { distance: 10, duration: 0.3, onComplete: () => fired++ });
    tl.pause(0);
    const peaks: number[] = [];
    let last = 0;
    let rising = true;
    for (let t = 0; t <= tl.duration(); t += 1 / 240) {
      tl.seek(t);
      const x = Number(gsap.getProperty(el, "x"));
      const growing = Math.abs(x) >= Math.abs(last);
      if (rising && !growing) peaks.push(Math.abs(last));
      rising = growing;
      last = x;
    }
    tl.play(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { peaks, fired, transform: el.style.transform };
  });
  expect(result.peaks.length).toBeGreaterThanOrEqual(4);
  expect(result.peaks[0]).toBeCloseTo(10, 0);
  for (let i = 1; i < result.peaks.length; i++) expect(result.peaks[i]!).toBeLessThan(result.peaks[i - 1]!);
  expect(result.fired).toBe(1);
  expect(result.transform).toBe("rotate(1deg)");
});

test("shake under reduced motion stays still and still completes; killed mid-swing it restores", async ({ open }) => {
  const page = await open("press-feedback");
  const result = await page.evaluate(async () => {
    const { MV } = window as any;
    const el = document.getElementById("field")!;
    const tl = MV.shake(el, { duration: 2 });
    tl.progress(0.3);
    tl.kill();
    const killed = el.style.transform;
    document.documentElement.dataset.motion = "reduced";
    let fired = 0;
    MV.shake(el, { onComplete: () => fired++ });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { killed, fired, after: el.style.transform };
  });
  expect(result).toEqual({ killed: "rotate(1deg)", fired: 1, after: "rotate(1deg)" });
});
