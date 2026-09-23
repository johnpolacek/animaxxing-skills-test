import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/page-covers.md

const panelStates = (page: import("@playwright/test").Page) =>
  page.$$eval(".curtain-panel", (panels) =>
    panels.map((panel) => ({
      visibility: getComputedStyle(panel).visibility,
      y: Number((window as any).gsap.getProperty(panel, "yPercent")),
    })),
  );

test("curtain rests hidden, covers and blocks clicks, then reveals and restores", async ({ open }) => {
  const page = await open("page-covers");
  await page.evaluate(() => {
    // The preloader shares this fixture; take it out of the way.
    document.getElementById("pre")!.style.display = "none";
    (window as any).c = (window as any).PC.curtain(".curtain-panel", { duration: 0.2, stagger: 0.03 });
  });
  expect((await panelStates(page)).map((p) => p.visibility)).toEqual(["hidden", "hidden", "hidden"]);
  // At rest the page is clickable through the curtain.
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.id)).toBe("page-button");

  const covered = await page.evaluate(async () => {
    let fired = 0;
    (window as any).c.cover().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fired;
  });
  expect(covered).toBe(1);
  expect(await panelStates(page)).toEqual([
    { visibility: "visible", y: 0 },
    { visibility: "visible", y: 0 },
    { visibility: "visible", y: 0 },
  ]);
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.className)).toBe("curtain-panel");

  await page.evaluate(async () => {
    (window as any).c.reveal();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  expect((await panelStates(page)).map((p) => p.visibility)).toEqual(["hidden", "hidden", "hidden"]);
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.id)).toBe("page-button");

  await page.evaluate(() => {
    (window as any).c.revert();
    (window as any).c.revert();
  });
  for (const style_ of await page.$$eval(".curtain-panel", (panels) => panels.map((p) => p.getAttribute("style") ?? ""))) expect(style_).toBe("");
});

test("a cover requested mid-reveal turns the panels back from where they are", async ({ open }) => {
  const page = await open("page-covers");
  const turned = await page.evaluate(async () => {
    const { PC, gsap } = window as any;
    const c = PC.curtain(".curtain-panel", { duration: 0.4, stagger: 0 });
    c.cover().progress(1);
    c.reveal();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const panel = document.querySelector(".curtain-panel")!;
    const leaving = Number(gsap.getProperty(panel, "yPercent"));
    c.cover();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { leaving, turning: Number(gsap.getProperty(panel, "yPercent")) };
  });
  // Moving out upward, then back down toward 0: never reset to the bottom edge.
  expect(turned.leaving).toBeLessThan(0);
  expect(turned.turning).toBeLessThan(0);
  expect(turned.turning).toBeGreaterThanOrEqual(turned.leaving);
  await page.waitForTimeout(600);
  expect((await panelStates(page)).every((p) => p.visibility === "visible" && Math.abs(p.y) < 0.5)).toBe(true);
});

test("curtain under reduced motion completes without ever showing a panel", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const c = (window as any).PC.curtain(".curtain-panel");
    let fired = 0;
    let shown = false;
    const watch = () => document.querySelectorAll(".curtain-panel").forEach((p) => (shown ||= getComputedStyle(p).visibility === "visible"));
    c.cover().eventCallback("onComplete", () => fired++);
    for (let i = 0; i < 5; i++) {
      watch();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    c.reveal().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { fired, shown };
  });
  expect(result).toEqual({ fired: 2, shown: false });
});

test("preloader follows reported progress forward only, finishes hidden, and restores", async ({ open }) => {
  const page = await open("page-covers");
  await page.evaluate(() => ((window as any).p = (window as any).PC.preloader(document.getElementById("pre"), { catchUp: 0.1 })));
  await page.evaluate(() => (window as any).p.progress(0.5));
  await page.waitForTimeout(300);
  const half = await page.$eval("#pre", (el) => [el.querySelector("[data-preloader-count]")!.textContent, el.getAttribute("aria-valuenow")]);
  expect(half).toEqual(["50", "50"]);
  expect(await prop(page, "[data-preloader-bar]", "scaleX")).toBeCloseTo(0.5, 2);

  await page.evaluate(() => (window as any).p.progress(0.3));
  await page.waitForTimeout(200);
  expect(await page.$eval("[data-preloader-count]", (el) => el.textContent)).toBe("50");

  const fired = await page.evaluate(async () => {
    let done = 0;
    (window as any).p.finish().eventCallback("onComplete", () => done++);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return done;
  });
  expect(fired).toBe(1);
  expect(await page.$eval("#pre", (el) => [getComputedStyle(el).visibility, el.getAttribute("aria-valuenow")])).toEqual(["hidden", "100"]);

  await page.evaluate(() => {
    (window as any).p.revert();
    (window as any).p.revert();
  });
  expect(await style(page, "#pre")).toBe("");
  expect(await style(page, "[data-preloader-bar]")).toBe("");
  expect(await page.$eval("#pre", (el) => [el.querySelector("[data-preloader-count]")!.textContent, el.getAttribute("aria-valuenow")])).toEqual(["0", "0"]);
});

test("preloader under reduced motion jumps to progress and hides at once", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const p = (window as any).PC.preloader(document.getElementById("pre"));
    p.progress(0.4);
    const count = document.querySelector("[data-preloader-count]")!.textContent;
    let fired = 0;
    p.finish().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { count, fired, visibility: getComputedStyle(document.getElementById("pre")!).visibility };
  });
  expect(result).toEqual({ count: "40", fired: 1, visibility: "hidden" });
});
