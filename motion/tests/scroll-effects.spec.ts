import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/scroll-effects.md

test("reveals items above and in view on a mid-page load, hides the rest", async ({ open }) => {
  const page = await open("scroll-effects");
  await page.evaluate(() => {
    window.scrollTo(0, document.getElementById("stmt")!.offsetTop);
    (window as any).t = (window as any).S.revealOnScroll(".rv");
  });
  await page.waitForTimeout(900);
  const visibility = await page.$$eval(".rv", (items) => items.map((el) => getComputedStyle(el).visibility));
  expect(visibility).toEqual(["visible", "visible", "hidden"]);
  expect(await style(page, "#r1")).toBe("");
  await page.evaluate(() => (window as any).t());
  for (const id of ["#r0", "#r1", "#r2"]) expect(await style(page, id)).toBe("");
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
});

test("scrubbed statement splits and reverts to the original markup", async ({ open }) => {
  const page = await open("scroll-effects");
  const before = await page.$eval("#h", (el) => el.innerHTML);
  await page.evaluate(() => ((window as any).t = (window as any).S.scrubStatement(document.getElementById("h"))));
  expect(await page.$eval("#h", (el) => el.children.length)).toBeGreaterThan(3);
  await page.evaluate(() => (window as any).t());
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(before);
});

test("parallax, velocity skew, and progress restore inline styles", async ({ open }) => {
  const page = await open("scroll-effects");
  await page.evaluate(() => {
    const S = (window as any).S;
    (window as any).t = [S.parallax(document.getElementById("px")), S.velocitySkew("#skew"), S.scrollProgress(document.getElementById("bar"))];
    window.scrollBy(0, 400);
  });
  await page.waitForTimeout(100);
  expect(await page.$eval("#pximg", (el) => (el as HTMLElement).style.transform)).toContain("translate");
  await page.evaluate(() => (window as any).t.forEach((fn: () => void) => fn()));
  expect(await style(page, "#pximg")).toBe("width: 100px; height: 100px; background: red;");
  expect(await page.$eval("#skew", (el) => (el as HTMLElement).style.transform)).toBe("translateX(3px)");
  expect(await page.$eval("#bar", (el) => (el as HTMLElement).style.transform)).toBe("");
});

test("pinned scene tears down mid-pin with no leftover styles or spacing", async ({ open }) => {
  const page = await open("scroll-effects");
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  const h0 = await height();
  await page.evaluate(() => {
    (window as any).t = (window as any).S.pinnedScene(
      document.getElementById("scene"),
      (tl: any, root: HTMLElement) => {
        const steps = Array.from(root.querySelectorAll("[data-step]"));
        steps.slice(1).forEach((step, i) => tl.to(steps[i], { autoAlpha: 0, y: -24 }).from(step, { autoAlpha: 0, y: 24 }, "<"));
      },
      { length: 2 },
    );
  });
  await page.waitForTimeout(100);
  expect(await height()).toBeGreaterThan(h0);
  await page.evaluate(() => window.scrollTo(0, document.getElementById("scene")!.getBoundingClientRect().top + scrollY + 300));
  await page.waitForTimeout(200);
  expect(await page.$(".pin-spacer")).not.toBeNull();
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$(".pin-spacer")).toBeNull();
  expect(await height()).toBe(h0);
  for (const selector of ["#scene", "[data-step]:nth-child(1)", "[data-step]:nth-child(2)", "[data-step]:nth-child(3)"]) {
    expect(await style(page, selector), selector).toBe("");
  }
});

test("a throwing scene build rethrows and leaves no pin behind", async ({ open }) => {
  const page = await open("scroll-effects");
  const result = await page.evaluate(() => {
    try {
      (window as any).S.pinnedScene(document.getElementById("scene"), () => {
        throw new Error("boom");
      });
      return "no throw";
    } catch (error) {
      return `${(error as Error).message}|${(window as any).ST.getAll().length}|${!!document.querySelector(".pin-spacer")}`;
    }
  });
  expect(result).toBe("boom|0|false");
});

test("horizontal run moves keyboard focus into view and restores the section", async ({ open }) => {
  const page = await open("scroll-effects");
  await page.evaluate(() => ((window as any).run = (window as any).S.horizontalRun(document.getElementById("run"), document.getElementById("track"))));
  expect(await page.$eval("#run", (el) => getComputedStyle(el).overflowX)).toBe("hidden");
  await page.evaluate(() => document.getElementById("last")!.focus());
  await page.waitForTimeout(900);
  const box = await page.evaluate(() => {
    const rect = document.getElementById("last")!.getBoundingClientRect();
    return { left: rect.left, right: rect.right, scrollLeft: document.getElementById("run")!.scrollLeft };
  });
  expect(box.scrollLeft).toBe(0);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(1000);
  await page.evaluate(() => (window as any).run.revert());
  expect(await page.$(".pin-spacer")).toBeNull();
  expect(await style(page, "#run")).toBe("");
  expect(await style(page, "#track")).toBe("");
});

test("reduced motion builds nothing except the progress rule", async ({ open }) => {
  const page = await open("scroll-effects");
  const counts = await page.evaluate(() => {
    const { S, ST } = window as any;
    document.documentElement.dataset.motion = "reduced";
    const teardowns = [
      S.revealOnScroll(".rv"),
      S.scrubStatement(document.getElementById("h")),
      S.pinnedScene(document.getElementById("scene"), () => {}),
      S.horizontalRun(document.getElementById("run"), document.getElementById("track")).revert,
    ];
    const before = ST.getAll().length;
    const bar = S.scrollProgress(document.getElementById("bar"));
    const after = ST.getAll().length;
    teardowns.forEach((fn: () => void) => fn());
    bar();
    return [before, after];
  });
  expect(counts).toEqual([0, 1]);
  expect(await style(page, "#r2")).toBe("");
});

