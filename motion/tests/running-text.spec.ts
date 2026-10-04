import { test, expect, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/hover-effects.md (fontAxisHover), and the running text checks in verification.md.

type Page = import("@playwright/test").Page;
const boxes = (page: Page) =>
  page.$$eval("#names a", (els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top + scrollY, r.width]; }));
const build = (page: Page, opts = "{ weight: 800 }") =>
  page.evaluate((o) => {
    const w = window as any;
    w.stops = Array.from(document.querySelectorAll<HTMLElement>("#names a")).map((a) => w.HE.fontAxisHover(a, eval(`(${o})`)));
  }, opts);

for (const width of [600, 573, 541, 487]) {
  test(`hovering any word moves no other word, at a ${width}px measure`, async ({ open }) => {
    const page = await open("running-text");
    await page.$eval("#names", (el, w) => ((el as HTMLElement).style.width = `${w}px`), width);
    await build(page);
    const rest = await boxes(page);
    const moved: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      await page.hover(`#w${i}`);
      await page.waitForTimeout(320);
      const now = await boxes(page);
      now.forEach((b, j) => {
        if (j !== i && (Math.abs(b[0]! - rest[j]![0]!) > 0.5 || Math.abs(b[1]! - rest[j]![1]!) > 0.5)) moved.push(`${i}->${j}`);
      });
      // The hovered word keeps its box while its type grows.
      expect(Math.abs(now[i]![2]! - rest[i]![2]!)).toBeLessThan(0.05);
      await page.hover("#away");
      await page.waitForTimeout(420);
    }
    expect(moved).toEqual([]);
    // Every word is back at rest, with its held width released.
    expect(await page.$$eval("#names a", (els) => els.filter((el) => (el as HTMLElement).style.width).length)).toBe(0);
  });
}

test("a word grows while hot, keeps its box, and teardown restores its style exactly", async ({ open }) => {
  const page = await open("running-text");
  await build(page);
  expect(await page.$eval("#w0", (el) => getComputedStyle(el).display)).toBe("inline-block");
  await page.hover("#w3");
  await expect.poll(() => page.$eval("#w3", (el) => getComputedStyle(el).fontWeight)).toBe("800");
  expect(await page.$eval("#w3", (el) => (el as HTMLElement).style.width)).toMatch(/px$/);
  await page.hover("#away");
  await expect.poll(() => page.$eval("#w3", (el) => (el as HTMLElement).style.width)).toBe("");
  await page.evaluate(() => {
    for (const stop of (window as any).stops) {
      stop();
      stop();
    }
  });
  expect(await declarations(page, "#w3")).toEqual(await declared(page, "color: rgb(1, 2, 3)"));
  expect(await page.$eval("#w0", (el) => el.getAttribute("style"))).toBeNull();
});

test("keyboard focus grows a word and touch never does", async ({ open }) => {
  const page = await open("running-text");
  await build(page);
  await page.keyboard.press("Tab");
  await expect.poll(() => page.$eval("#w0", (el) => getComputedStyle(el).fontWeight)).toBe("800");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.$eval("#w0", (el) => getComputedStyle(el).fontWeight)).toBe("400");
  await page.$eval("#w5", (el) => el.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" })));
  await page.waitForTimeout(300);
  expect(await page.$eval("#w5", (el) => getComputedStyle(el).fontWeight)).toBe("400");
});

test("under reduced motion the change is instant and nothing moves", async ({ open }) => {
  const page = await open("running-text");
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
  await build(page);
  const rest = await boxes(page);
  await page.hover("#w7");
  await page.waitForTimeout(40);
  expect(await page.$eval("#w7", (el) => getComputedStyle(el).fontWeight)).toBe("800");
  const now = await boxes(page);
  expect(now.filter((b, j) => j !== 7 && (Math.abs(b[0]! - rest[j]![0]!) > 0.5 || Math.abs(b[1]! - rest[j]![1]!) > 0.5))).toEqual([]);
});

test("no separator starts a line", async ({ open }) => {
  const page = await open("running-text");
  await build(page);
  for (const width of [600, 541, 487, 420]) {
    await page.$eval("#names", (el, w) => ((el as HTMLElement).style.width = `${w}px`), width);
    const orphans = await page.$$eval("#names .item", (items) =>
      items.filter((it) => { const sep = it.querySelector(".sep"); const a = it.querySelector("a")!; return sep && Math.abs(sep.getBoundingClientRect().top - a.getBoundingClientRect().top) > 4; }).length);
    expect(orphans, `${width}px`).toBe(0);
  }
});
