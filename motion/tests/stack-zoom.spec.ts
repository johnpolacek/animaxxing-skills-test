import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/scroll-effects.md (stackCards, zoomThrough)

const innerHeightOf = () => 700;
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

for (const mode of ["push", "pull"] as const) {
  test(`zoomThrough ${mode} flies the grid so one tile fills the section, evenly, and restores it`, async ({ open }) => {
    const page = await open("stack-zoom");
    const before = await style(page, "#wall");
    await page.evaluate((m) => ((window as any).z = (window as any).S.zoomThrough(document.getElementById("zoom3"), document.getElementById("tile"), { mode: m, scrub: true, length: 1 })), mode);
    const sectionTop = await page.$eval("#zoom3", (el) => el.getBoundingClientRect().top + scrollY);
    const tile = () => page.$eval("#tile", (el) => { const r = el.getBoundingClientRect(); return [r.width, r.height, r.left + r.width / 2, r.top + r.height / 2]; });
    const wallScale = () => page.evaluate(() => [Number((window as any).gsap.getProperty("#wall", "scaleX")), Number((window as any).gsap.getProperty("#wall", "scaleY"))]);
    // Filled: at the end of a push, at the start of a pull.
    await scrollTo(page, mode === "push" ? sectionTop + innerHeightOf() : sectionTop + 1);
    await expect.poll(async () => (await tile())[1]).toBeGreaterThan(690);
    const [w, h, cx, cy] = await tile();
    expect(w).toBeGreaterThanOrEqual(990);
    expect(h).toBeGreaterThanOrEqual(690);
    expect(Math.abs(cx! - 500)).toBeLessThan(4);
    expect(Math.abs(cy! - 350)).toBeLessThan(4);
    // Halfway, the two axes scale together.
    await scrollTo(page, sectionTop + 350);
    await page.waitForTimeout(100);
    const [sx, sy] = await wallScale();
    expect(sx).toBeCloseTo(sy!, 5);
    await page.evaluate(() => (window as any).z());
    expect(await style(page, "#wall")).toBe(before);
  });
}

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
  // Midway, every side has moved in step: the window stays centered.
  await scrollTo(page, zoomTop + 300);
  await page.waitForTimeout(100);
  // The browser shortens equal sides, as in "inset(15% 17% round 6px)": expand it like CSS does.
  const values = (await clip()).match(/inset\(([^r)]*)/)![1]!.trim().split(/\s+/).map(parseFloat);
  const [a, b = a, c = a, d = b] = values as [number, number?, number?, number?];
  const sides = [a, b, c, d];
  expect(sides[0]).toBeCloseTo(sides[2]!, 1);
  expect(sides[1]).toBeCloseTo(sides[3]!, 1);
  expect(sides[1]).toBeGreaterThan(0);
  expect(sides[1]).toBeLessThan(34);
  await scrollTo(page, zoomTop + 800);
  await expect.poll(clip).toMatch(/inset\(0%/);
  await page.evaluate(() => (window as any).t());
  expect(await style(page, "#clipme")).toBe("");
});

test("zoomThrough measures its focus again after a layout change and refresh", async ({ open }) => {
  const page = await open("stack-zoom");
  await page.evaluate(() => ((window as any).t = (window as any).S.zoomThrough(document.getElementById("zoom"), document.getElementById("front"), { focus: document.getElementById("focus")!, scale: 20, length: 1, scrub: true })));
  // A late font or layout change moves the focus inside the target.
  await page.evaluate(() => {
    document.getElementById("front")!.style.fontSize = "120px";
    document.getElementById("front")!.style.paddingLeft = "200px";
    (window as any).ST.refresh();
  });
  const zoomTop = await page.$eval("#zoom", (el) => el.getBoundingClientRect().top + scrollY);
  await scrollTo(page, zoomTop);
  await page.waitForTimeout(100);
  const at1 = await page.$eval("#focus", (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await scrollTo(page, zoomTop + 300);
  await expect.poll(() => scale(page, "front")).toBeGreaterThan(2);
  const at2 = await page.$eval("#focus", (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  expect(Math.abs(at2[0]! - at1[0]!)).toBeLessThan(4);
  expect(Math.abs(at2[1]! - at1[1]!)).toBeLessThan(4);
  await page.evaluate(() => (window as any).t());
});
