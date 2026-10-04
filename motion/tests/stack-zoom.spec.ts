import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/scroll-effects.md (stackCards, zoomThrough)

const scrollTo = (page: import("@playwright/test").Page, y: number) => page.evaluate((top) => window.scrollTo(0, top), y);
const top = (page: import("@playwright/test").Page, id: string) => page.$eval(`#${id}`, (el) => el.getBoundingClientRect().top);
const scale = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((s) => Number((window as any).gsap.getProperty(`#${s}`, "scale")), id);

test("stackCards pins each card below the last, shrinks the buried ones, and releases the deck together", async ({ open }) => {
  const page = await open("stack-zoom");
  await page.evaluate(() => ((window as any).t = (window as any).S.stackCards(Array.from(document.querySelectorAll("[data-stack-card]")), { top: 80, offset: 16, scrub: true })));
  const deckTop = await page.$eval("#deck", (el) => el.getBoundingClientRect().top + scrollY);
  // c0 has pinned at 80 and c1 is on its way over it.
  await scrollTo(page, deckTop + 200);
  await expect.poll(() => top(page, "c0")).toBeCloseTo(80, 0);
  // Every card has landed: c0 at 80, c1 at 96, c2 at 112, buried cards smaller.
  await scrollTo(page, deckTop + 2 * 340 - 112 + 5);
  await expect.poll(() => top(page, "c2")).toBeLessThan(115);
  const c0 = await top(page, "c0");
  expect(c0).toBeGreaterThan(70);
  expect(c0).toBeLessThan(81);
  await expect.poll(() => scale(page, "c0")).toBeCloseTo(0.9, 2);
  await expect.poll(() => scale(page, "c1")).toBeCloseTo(0.95, 2);
  // Scrolled well past, all three leave together, keeping their spacing.
  await scrollTo(page, deckTop + 1400);
  const gaps = await page.evaluate(() => ["c0", "c1", "c2"].map((id) => document.getElementById(id)!.getBoundingClientRect().top));
  expect(gaps[1]! - gaps[0]!).toBeGreaterThan(10);
  expect(gaps[2]! - gaps[1]!).toBeGreaterThan(10);
  expect(gaps[0]).toBeLessThan(0);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$(".pin-spacer")).toBeNull();
  expect(await style(page, "#c0")).toBe("");
  expect(await style(page, "#c1")).toBe("color: rgb(1, 2, 3);");
});

test("stackCards and zoomThrough do nothing under reduced motion", async ({ open }) => {
  const page = await open("stack-zoom");
  const result = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const { S } = window as any;
    const a = S.stackCards(Array.from(document.querySelectorAll("[data-stack-card]")));
    const b = S.zoomThrough(document.getElementById("zoom"), document.getElementById("front"));
    const pins = document.querySelectorAll(".pin-spacer").length;
    a();
    b();
    return pins;
  });
  expect(result).toBe(0);
});

test("zoomThrough scale grows the front from its focus, fades it, settles the back, and restores", async ({ open }) => {
  const page = await open("stack-zoom");
  const focusAt = await page.$eval("#focus", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 + scrollY };
  });
  await page.evaluate(() => ((window as any).t = (window as any).S.zoomThrough(document.getElementById("zoom"), document.getElementById("front"), { focus: document.getElementById("focus")!, scale: 20, length: 1, scrub: true })));
  const zoomTop = await page.$eval("#zoom", (el) => el.getBoundingClientRect().top + scrollY);
  await scrollTo(page, zoomTop + 350);
  await expect.poll(() => scale(page, "front")).toBeGreaterThan(2);
  // The focus stays put while everything grows around it.
  const focusNow = await page.$eval("#focus", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  expect(Math.abs(focusNow.x - focusAt.x)).toBeLessThan(4);
  expect(Math.abs(focusNow.y - (focusAt.y - zoomTop))).toBeLessThan(4);
  await scrollTo(page, zoomTop + 700);
  await expect.poll(() => scale(page, "front")).toBeCloseTo(20, 0);
  await expect.poll(() => page.$eval("#front", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  await expect.poll(() => scale(page, "back")).toBeCloseTo(1, 2);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$(".pin-spacer")).toBeNull();
  for (const id of ["front", "back", "zoom"]) expect(await style(page, `#${id}`), id).toBe("");
});

test("zoomThrough clip opens a window to full bleed and restores", async ({ open }) => {
  const page = await open("stack-zoom");
  await page.evaluate(() => ((window as any).t = (window as any).S.zoomThrough(document.getElementById("zoom2"), document.getElementById("clipme"), { mode: "clip", length: 1, scrub: true })));
  const zoomTop = await page.$eval("#zoom2", (el) => el.getBoundingClientRect().top + scrollY);
  const clip = () => page.$eval("#clipme", (el) => (el as HTMLElement).style.clipPath);
  await scrollTo(page, zoomTop - 50);
  await expect.poll(clip).toMatch(/inset\(30%/);
  await scrollTo(page, zoomTop + 800);
  await expect.poll(clip).toMatch(/inset\(0%/);
  await page.evaluate(() => (window as any).t());
  expect(await style(page, "#clipme")).toBe("");
});
