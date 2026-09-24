import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/endless-drag.md (flickCards)

type Page = import("@playwright/test").Page;

const build = (page: Page, options = "{}") =>
  page.evaluate((o) => {
    const w = window as any;
    w.changes = [];
    w.deck = w.ED.flickCards(document.getElementById("root"), document.getElementById("stack"), {
      onChange: (i: number) => w.changes.push(i),
      ...eval(`(${o})`),
    });
  }, options);
const x = (page: Page, id: string) => page.evaluate((i) => Number((window as any).gsap.getProperty(`#${i}`, "xPercent")), id);
const index = (page: Page) => page.evaluate(() => (window as any).deck.index());
const inert = (page: Page) => page.$$eval("#stack > li", (els) => els.map((el) => (el as HTMLElement).inert));
const drag = async (page: Page, from: [number, number], dx: number, steps = 10, pause = 30) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + (dx * i) / steps, from[1]);
    await page.waitForTimeout(pause);
  }
  await page.mouse.up();
};
// The deck is centered at x 500; the front card spans 350–650 horizontally and 60–260 vertically.
const CENTER: [number, number] = [520, 200];

test("fans the deck: front card on top, neighbors mirrored, far cards hidden and inert", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  expect(await page.$eval("#root", (el) => el.hasAttribute("data-flick"))).toBe(true);
  expect(await x(page, "c0")).toBe(0);
  expect(await x(page, "c1")).toBe(25);
  expect(await x(page, "c6")).toBe(-25);
  expect(await page.$eval("#c3", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  expect(await inert(page)).toEqual([false, true, true, true, true, true, true]);
});

test("a drag past the threshold deals the next card; a short slow drag springs back", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  await drag(page, CENTER, -40, 10, 40);
  await page.waitForTimeout(150);
  expect(await index(page)).toBe(0);
  await drag(page, CENTER, -150);
  expect(await index(page)).toBe(1);
  await expect.poll(() => x(page, "c1")).toBeCloseTo(0, 0);
  expect(await inert(page)).toEqual([true, false, true, true, true, true, true]);
  expect(await page.evaluate(() => (window as any).changes)).toEqual([1]);
});

test("a fast flick deals however short the drag", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  await drag(page, CENTER, 50, 3, 10);
  expect(await index(page)).toBe(6);
});

test("arrow keys, next, prev, and toIndex take the shortest way round", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  await page.focus("#root");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await index(page)).toBe(2);
  await page.keyboard.press("ArrowLeft");
  expect(await index(page)).toBe(1);
  await page.evaluate(() => (window as any).deck.toIndex(6));
  expect(await index(page)).toBe(6);
  // 1 → 6 is two steps back, so the deck position goes negative rather than five steps forward.
  await expect.poll(() => page.evaluate(() => (window as any).gsap.getProperty((window as any).deck.draggable.target, "x"))).toBe(0);
  await expect.poll(() => x(page, "c6")).toBeCloseTo(0, 0);
  await page.evaluate(() => (window as any).deck.next());
  expect(await index(page)).toBe(0);
});

test("focus inside a card that leaves the front moves to the deck", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  await page.focus("#l0");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("root");
});

test("a click on a leaning card deals it; a click on the front link follows; a drag never does", async ({ open }) => {
  const page = await open("flick-cards");
  await build(page);
  const box = (await page.locator("#l0").boundingBox())!;
  await drag(page, [box.x + 20, box.y + 20], -150);
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(await index(page)).toBe(1);
  await page.waitForTimeout(1000);
  // Card 2 leans out to the right past the front card's edge.
  await page.mouse.click(700, 200);
  expect(await index(page)).toBe(2);
  await page.evaluate(() => (window as any).deck.toIndex(0));
  await page.waitForTimeout(1000);
  const link = (await page.locator("#l0").boundingBox())!;
  await page.mouse.click(link.x + 20, link.y + 20);
  expect(await page.evaluate(() => location.hash)).toBe("#l0");
});

test("revert mid-deal restores markup, styles, and inert exactly", async ({ open }) => {
  const page = await open("flick-cards");
  const before = await page.$eval("#root", (el) => el.outerHTML);
  await build(page);
  await page.evaluate(() => (window as any).deck.next());
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    (window as any).deck.revert();
    (window as any).deck.revert();
  });
  expect(await page.$eval("#root", (el) => el.outerHTML)).toBe(before);
  expect(await inert(page)).toEqual([false, false, false, false, false, false, false]);
  expect(await style(page, "#c0")).toBe("color: rgb(1, 2, 3);");
});

test("reduced motion deals at once", async ({ open }) => {
  const page = await open("flick-cards");
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
  await build(page);
  await page.evaluate(() => (window as any).deck.next());
  expect(await x(page, "c1")).toBe(0);
  expect(await x(page, "c0")).toBe(-25);
});
