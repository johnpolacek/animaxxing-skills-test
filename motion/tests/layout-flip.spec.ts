import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/layout-flip.md

const box = (page: import("@playwright/test").Page, selector: string) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });

test("a filtered grid slides survivors, fades the rest out, and ends with CSS in charge", async ({ open }) => {
  const page = await open("layout-flip");
  const to = await box(page, "#c2");
  const mid = await page.evaluate(async () => {
    const { LF } = window as any;
    const grid = document.getElementById("grid")!;
    (window as any).fired = 0;
    const flip = LF.captureLayout(grid.querySelectorAll(".card"), { duration: 0.4, onComplete: () => (window as any).fired++ });
    grid.dataset.filter = "even";
    flip.play();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const moving = document.getElementById("c4")!.style.transform;
    const leaving = getComputedStyle(document.getElementById("c3")!);
    return { moving, leavingShown: leaving.display !== "none", leavingOpacity: Number(leaving.opacity) };
  });
  // c4 moves from the second row to the first; c3 is still visible while it fades.
  expect(mid.moving).not.toBe("");
  expect(mid.leavingShown).toBe(true);
  expect(mid.leavingOpacity).toBeLessThan(1);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect(await page.$eval("#c3", (el) => getComputedStyle(el).display)).toBe("none");
  for (const id of ["#c2", "#c4", "#c6"]) expect(await style(page, id), id).toBe("");
  // An app's own inline style survives the Flip.
  expect(await style(page, "#c1")).toBe("outline: red solid 1px;");
  expect((await box(page, "#c2")).x).toBeLessThan(to.x);
});

test("a reordered list moves every card to its new place and clears its styles", async ({ open }) => {
  const page = await open("layout-flip");
  const moved = await page.evaluate(async () => {
    const { LF } = window as any;
    const grid = document.getElementById("grid")!;
    const flip = LF.captureLayout(grid.querySelectorAll(".card"), { duration: 0.3 });
    grid.prepend(document.getElementById("c6")!);
    flip.play();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return document.getElementById("c6")!.style.transform;
  });
  expect(moved).not.toBe("");
  await page.waitForTimeout(400);
  for (const id of ["#c1", "#c2", "#c6"]) expect(await page.$eval(id, (el) => (el as HTMLElement).style.transform), id).toBe("");
  expect((await box(page, "#c6")).x).toBeLessThan((await box(page, "#c1")).x);
});

test("a shared element morphs onto its counterpart, not the hidden original", async ({ open }) => {
  const page = await open("layout-flip");
  const result = await page.evaluate(async () => {
    const { LF } = window as any;
    const thumb = document.getElementById("thumb")!;
    const hero = document.getElementById("hero")!;
    const state = LF.captureShared(thumb);
    // The router keeps the old element in the DOM, hidden; the new one renders at its final size.
    thumb.style.visibility = "hidden";
    hero.classList.remove("hidden");
    let fired = 0;
    LF.playShared(state, hero, { duration: 0.4, onComplete: () => fired++ });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const start = hero.getBoundingClientRect();
    const thumbMoved = thumb.style.transform !== "";
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { start: { x: start.left, w: start.width }, thumbMoved, fired };
  });
  // Early in the morph the hero is still near the thumbnail's box.
  expect(result.start.x).toBeLessThan(200);
  expect(result.start.w).toBeLessThan(200);
  expect(result.thumbMoved).toBe(false);
  expect(result.fired).toBe(1);
  expect(await box(page, "#hero")).toEqual({ x: 300, y: 260, w: 240, h: 160 });
  expect(await style(page, "#hero")).toBe("");
});

test("reduced motion shows the new layout at once and still completes", async ({ open }) => {
  const page = await open("layout-flip");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const { LF } = window as any;
    const grid = document.getElementById("grid")!;
    let fired = 0;
    const flip = LF.captureLayout(grid.querySelectorAll(".card"), { onComplete: () => fired++ });
    grid.dataset.filter = "even";
    flip.play();
    const moving = document.getElementById("c4")!.style.transform;
    const hero = document.getElementById("hero")!;
    hero.classList.remove("hidden");
    LF.playShared(LF.captureShared(document.getElementById("thumb")!), hero, { onComplete: () => fired++ });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { moving, fired, hero: getComputedStyle(hero).visibility, heroStyle: hero.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({ moving: "", fired: 2, hero: "visible", heroStyle: "" });
});

test("reverting a Flip mid-way lands the new layout, clears its styles, and completes once", async ({ open }) => {
  const page = await open("layout-flip");
  const result = await page.evaluate(async () => {
    const { LF } = window as any;
    const grid = document.getElementById("grid")!;
    let fired = 0;
    const flip = LF.captureLayout(grid.querySelectorAll(".card"), { duration: 0.6, onComplete: () => fired++ });
    grid.prepend(document.getElementById("c6")!);
    const tl = flip.play();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const moving = document.getElementById("c6")!.style.transform !== "";
    tl.revert();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { moving, fired, styles: Array.from(grid.querySelectorAll(".card")).map((card) => (card as HTMLElement).style.transform) };
  });
  expect(result.moving).toBe(true);
  expect(result.fired).toBe(1);
  expect(result.styles.every((transform) => transform === "")).toBe(true);
});
