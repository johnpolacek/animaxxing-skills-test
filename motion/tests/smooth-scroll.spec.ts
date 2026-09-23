import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/smooth-scroll.md

const scrollY = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollY);

test("Lenis eases the wheel, stops and starts, jumps while stopped, and destroys clean", async ({ open }) => {
  const page = await open("smooth-scroll");
  await page.evaluate(() => ((window as any).s = (window as any).L.lenisScroll()));
  expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(true);

  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(60);
  const early = await scrollY(page);
  await page.waitForTimeout(1200);
  const settled = await scrollY(page);
  // Eased: part of the way after a few frames, all of it once settled.
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(settled);
  expect(Math.abs(settled - 600)).toBeLessThan(2);

  await page.evaluate(() => (window as any).s.stop());
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(500);
  expect(Math.abs((await scrollY(page)) - settled)).toBeLessThan(2);

  // A stopped scroller still takes the controller's jump, as after a route swap.
  const target = await page.evaluate(() => {
    (window as any).s.scrollTo("#low", { immediate: true, offset: -50 });
    return document.getElementById("low")!.offsetTop - 50;
  });
  await page.waitForTimeout(100);
  expect(Math.abs((await scrollY(page)) - target)).toBeLessThan(2);

  await page.evaluate(() => (window as any).s.start());
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(1200);
  expect(Math.abs((await scrollY(page)) - (target - 300))).toBeLessThan(2);

  await page.evaluate(() => {
    (window as any).s.resize();
    (window as any).s.destroy();
    (window as any).s.destroy();
  });
  expect(await page.evaluate(() => document.documentElement.className.includes("lenis"))).toBe(false);
});

test("Lenis keeps ScrollTrigger in step with the eased scroll", async ({ open }) => {
  const page = await open("smooth-scroll");
  await page.evaluate(() => {
    const { L, ST } = window as any;
    (window as any).s = L.lenisScroll();
    (window as any).trigger = ST.create({ trigger: "#mid", start: "top center", end: "bottom center" });
  });
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as any).trigger.isActive)).toBe(true);
  expect(await page.evaluate(() => (window as any).trigger.progress)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).s.destroy());
});

test("reduced motion returns native controls and creates nothing", async ({ open }) => {
  const page = await open("smooth-scroll");
  const result = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const s = (window as any).L.lenisScroll();
    s.stop();
    s.scrollTo("#mid");
    const y = window.scrollY;
    s.start();
    s.resize();
    s.destroy();
    return { y, top: document.getElementById("mid")!.offsetTop, lenis: document.documentElement.className.includes("lenis") };
  });
  // Even an eased request lands at once under reduced motion.
  expect(result).toEqual({ y: result.top, top: result.top, lenis: false });
});

test("ScrollSmoother moves the content, pauses, jumps, and restores its markup", async ({ open }) => {
  const page = await open("smoother");
  const before = { wrapper: await style(page, "#smooth-wrapper"), content: await style(page, "#smooth-content") };
  await page.evaluate(() => {
    const { SM } = window as any;
    (window as any).s = SM.smootherScroll(document.getElementById("smooth-wrapper"), document.getElementById("smooth-content"), { smooth: 0.5 });
  });
  expect(await page.$eval("#smooth-wrapper", (el) => getComputedStyle(el).position)).toBe("fixed");

  await page.evaluate(() => (window as any).s.scrollTo("#low", { immediate: true }));
  await page.waitForTimeout(200);
  const low = await page.$eval("#low", (el) => el.getBoundingClientRect().top);
  expect(Math.abs(low)).toBeLessThan(2);

  await page.evaluate(() => (window as any).s.stop());
  const held = await scrollY(page);
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(500);
  expect(Math.abs((await scrollY(page)) - held)).toBeLessThan(2);

  await page.evaluate(() => {
    (window as any).s.start();
    (window as any).s.destroy();
    (window as any).s.destroy();
  });
  expect(await style(page, "#smooth-wrapper")).toBe(before.wrapper);
  expect(await style(page, "#smooth-content")).toBe(before.content);
});

test("the app's full-motion setting wins over the OS preference for Lenis", async ({ open }) => {
  const page = await open("smooth-scroll");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "full";
    (window as any).s = (window as any).L.lenisScroll();
  });
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(60);
  const early = await scrollY(page);
  await page.waitForTimeout(1200);
  // Still eased: Lenis must not fall back to its own OS-only reduced mode.
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(450);
  expect(Math.abs((await scrollY(page)) - 600)).toBeLessThan(2);
  await page.evaluate(() => (window as any).s.destroy());
});

test("a stopped Lenis adopts a router's native scroll and continues from it", async ({ open }) => {
  const page = await open("smooth-scroll");
  await page.evaluate(() => {
    const s = ((window as any).s = (window as any).L.lenisScroll());
    s.stop();
    window.scrollTo(0, 1500);
  });
  await page.waitForTimeout(200);
  expect(Math.abs((await scrollY(page)) - 1500)).toBeLessThan(2);
  await page.evaluate(() => (window as any).s.start());
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(1200);
  expect(Math.abs((await scrollY(page)) - 1700)).toBeLessThan(2);
  await page.evaluate(() => (window as any).s.destroy());
});

test("a stopped ScrollSmoother keeps a router's scroll when synced in the same task", async ({ open }) => {
  const page = await open("smoother");
  await page.evaluate(() => {
    const { SM } = window as any;
    const s = ((window as any).s = SM.smootherScroll(document.getElementById("smooth-wrapper"), document.getElementById("smooth-content")));
    s.scrollTo(1000, { immediate: true });
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const s = (window as any).s;
    s.stop();
    // The router resets to the top; the controller syncs in a microtask after its commit.
    window.scrollTo(0, 0);
    queueMicrotask(() => s.scrollTo(window.scrollY, { immediate: true }));
  });
  await page.waitForTimeout(300);
  expect(await scrollY(page)).toBe(0);
  expect(Math.abs(await page.$eval("#top", (el) => el.getBoundingClientRect().top))).toBeLessThan(2);
  await page.evaluate(() => (window as any).s.destroy());
});

test("ScrollSmoother ignores a stale hash and restores scroll-behavior on destroy", async ({ open }) => {
  const page = await open("smoother");
  const result = await page.evaluate(() => {
    const { SM } = window as any;
    const s = SM.smootherScroll(document.getElementById("smooth-wrapper"), document.getElementById("smooth-content"));
    let threw = false;
    try {
      s.scrollTo("#missing");
    } catch {
      threw = true;
    }
    s.destroy();
    return { threw, html: document.documentElement.getAttribute("style") ?? "", body: document.body.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({ threw: false, html: "", body: "" });
});

test("a jump into a page taller than Lenis last measured still lands", async ({ open }) => {
  const page = await open("smooth-scroll");
  const result = await page.evaluate(async () => {
    const s = (window as any).L.lenisScroll();
    s.stop();
    // A route swap brings in a much taller page; Lenis has not re-measured yet.
    const tall = document.createElement("section");
    tall.style.height = "6000px";
    document.body.append(tall);
    const target = document.documentElement.scrollHeight - innerHeight - 10;
    s.scrollTo(target, { immediate: true });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const y = window.scrollY;
    s.destroy();
    return { y, target };
  });
  expect(Math.abs(result.y - result.target)).toBeLessThanOrEqual(2);
});
