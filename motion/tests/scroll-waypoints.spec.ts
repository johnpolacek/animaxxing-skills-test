import { test, expect, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/scroll-effects.md (scrollWaypoints)
// Fixture: 700px sections; #trav rests at 40,40 (100×100); #w1 at 600,900 (200×200); #w2 at 100,1700 (50×50).

const box = (page: import("@playwright/test").Page, selector: string) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  });

/** Scrolls so an element's middle sits at the viewport's middle, then lets ScrollTrigger update. */
const center = async (page: import("@playwright/test").Page, selector: string) => {
  await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const build = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.t = w.S.scrollWaypoints(document.getElementById("trav"), [document.getElementById("w1"), document.getElementById("w2")], { scrub: true });
  });

test("scroll waypoints land the traveller on each marker as it reaches the middle, and restore", async ({ open }) => {
  const page = await open("scroll-waypoints");
  await build(page);
  // A hero traveller above the middle waits at the top of the page.
  expect(await box(page, "#trav")).toEqual({ x: 40, y: 40, w: 100, h: 100 });
  await center(page, "#w1");
  await expect.poll(() => box(page, "#trav")).toEqual(await box(page, "#w1"));
  await center(page, "#w2");
  await expect.poll(() => box(page, "#trav")).toEqual(await box(page, "#w2"));
  // Halfway between: somewhere between the two markers, not on either.
  await page.evaluate(() => window.scrollTo(0, (1000 - 350 + 1725 - 350) / 2));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mid = await box(page, "#trav");
  expect(mid.w).toBeLessThan(200);
  expect(mid.w).toBeGreaterThan(50);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => box(page, "#trav")).toEqual({ x: 40, y: 40, w: 100, h: 100 });

  await center(page, "#w1");
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await declarations(page, "#trav")).toEqual(await declared(page, "opacity:0.8"));
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
});

test("scroll waypoints re-measure on refresh after the layout moves", async ({ open }) => {
  const page = await open("scroll-waypoints");
  await build(page);
  await page.evaluate(() => {
    const marker = document.getElementById("w1")!;
    marker.style.left = "300px";
    marker.style.top = "100px";
    (window as any).ST.refresh();
  });
  await center(page, "#w1");
  await expect.poll(() => box(page, "#trav")).toEqual(await box(page, "#w1"));
  await page.setViewportSize({ width: 800, height: 600 });
  await page.evaluate(() => (window as any).ST.refresh());
  await center(page, "#w2");
  await expect.poll(() => box(page, "#trav")).toEqual(await box(page, "#w2"));
  await page.evaluate(() => (window as any).t());
  expect(await declarations(page, "#trav")).toEqual(await declared(page, "opacity:0.8"));
});

test("scroll waypoints do nothing under reduced motion, and a throwing setup rolls back", async ({ open }) => {
  const page = await open("scroll-waypoints");
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
  await build(page);
  await center(page, "#w1");
  expect(await box(page, "#trav")).toEqual({ x: 40, y: 40, w: 100, h: 100 });
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  await page.evaluate(() => (window as any).t());

  const result = await page.evaluate(() => {
    const w = window as any;
    document.documentElement.dataset.motion = "full";
    try {
      w.S.scrollWaypoints(document.getElementById("trav"), [document.getElementById("w1"), {} as HTMLElement]);
      return "no throw";
    } catch (error) {
      return `${(error as Error).name}|${w.ST.getAll().length}|${!!w.gsap.context()}`;
    }
  });
  expect(result).toBe("TypeError|0|false");
  expect(await declarations(page, "#trav")).toEqual(await declared(page, "opacity:0.8"));
});
