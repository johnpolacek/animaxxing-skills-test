import { test, expect } from "./fixture";

// Recipe: animaxxing/references/recipes/physics-effects.md

const count = (page: import("@playwright/test").Page) => page.$eval("#layer", (el) => el.children.length);

test("burst throws hidden pieces up and away, then removes them all", async ({ open }) => {
  const page = await open("physics-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.run = w.PH.burstFrom(document.getElementById("layer"), document.getElementById("btn"), { pieces: ["🎉", "✨"], count: 12, duration: 0.8 });
    w.done = false;
    w.run.finished.then(() => (w.done = true));
  });
  expect(await count(page)).toBe(12);
  expect(await page.$$eval("#layer > *", (els) => els.every((el) => el.getAttribute("aria-hidden") === "true"))).toBe(true);
  await page.waitForTimeout(250);
  // Launched upward from the button's center (y 520).
  const ys = await page.$$eval("#layer > *", (els) => els.map((el) => Number((window as any).gsap.getProperty(el, "y"))));
  expect(Math.min(...ys)).toBeLessThan(500);
  await expect.poll(() => count(page), { timeout: 6000 }).toBe(0);
  expect(await page.evaluate(() => (window as any).done)).toBe(true);
});

test("stop removes every piece at once and is safe twice", async ({ open }) => {
  const page = await open("physics-effects");
  const left = await page.evaluate(async () => {
    const w = window as any;
    const run = w.PH.burst(document.getElementById("layer"), 300, 300, { pieces: ["*"], count: 20 });
    run.stop();
    run.stop();
    await run.finished;
    return document.getElementById("layer")!.children.length;
  });
  expect(left).toBe(0);
});

test("the shared budget caps live pieces and frees them when runs end", async ({ open }) => {
  const page = await open("physics-effects");
  const result = await page.evaluate(() => {
    const w = window as any;
    const layer = document.getElementById("layer");
    const a = w.PH.burst(layer, 300, 300, { pieces: ["*"], count: 200 });
    const first = layer!.children.length;
    const b = w.PH.burst(layer, 300, 300, { pieces: ["*"], count: 10 });
    const second = layer!.children.length;
    a.stop();
    b.stop();
    const c = w.PH.burst(layer, 300, 300, { pieces: ["*"], count: 10 });
    const third = layer!.children.length;
    c.stop();
    return [first, second, third];
  });
  expect(result).toEqual([120, 120, 10]);
});

test("rain copies elements without ids, falls out the bottom, and removes them", async ({ open }) => {
  const page = await open("physics-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.PH.rain(document.getElementById("layer"), { pieces: [document.getElementById("star")], count: 8, period: 0.2, velocity: [600, 800], gravity: 3000 });
  });
  expect(await count(page)).toBe(8);
  expect(await page.$$eval("#layer [id]", (els) => els.length)).toBe(0);
  expect(await page.$$eval("#layer .star", (els) => els.length)).toBe(8);
  // Falling: some piece has crossed from above the top edge into the layer.
  await expect
    .poll(() => page.$$eval("#layer > *", (els) => Math.max(-1, ...els.map((el) => Number((window as any).gsap.getProperty(el, "y"))))))
    .toBeGreaterThan(0);
  await expect.poll(() => count(page), { timeout: 6000 }).toBe(0);
  expect(await page.$$eval("#star, #inner", (els) => els.length)).toBe(2);
});

test("reduced motion spawns nothing and resolves at once", async ({ open }) => {
  const page = await open("physics-effects");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const w = window as any;
    const layer = document.getElementById("layer");
    const a = w.PH.burst(layer, 300, 300, { pieces: ["*"] });
    const b = w.PH.rain(layer, { pieces: ["*"] });
    await Promise.all([a.finished, b.finished]);
    return layer!.children.length;
  });
  expect(result).toBe(0);
});

test("pile drops pieces that collide, come to rest on the floor inside the box, and stop removes them", async ({ open }) => {
  const page = await open("physics-effects");
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "box";
    box.style.cssText = "position:relative;overflow:hidden;width:400px;height:300px";
    document.body.append(box);
    const style = document.createElement("style");
    style.textContent = "#box>*{position:absolute;left:0;top:0;display:block;width:30px;height:30px;border-radius:50%;background:#000;font-size:0}";
    document.head.append(style);
    const w = window as any;
    w.pile = w.PH.pile(box, { pieces: ["•"] });
    w.pile.drop(24);
  });
  expect(await page.$eval("#box", (el) => el.children.length)).toBe(24);
  // Settled: every piece inside the box, the lowest on the floor, and no two sunk into each other.
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => {
    const box = document.getElementById("box")!.getBoundingClientRect();
    const c = Array.from(document.querySelectorAll("#box > *")).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    });
    let worst = 0;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) worst = Math.max(worst, 30 - Math.hypot(c[i]!.x - c[j]!.x, c[i]!.y - c[j]!.y));
    return { inside: c.every((p) => p.x >= 14 && p.x <= 386 && p.y >= -400 && p.y <= 286), floor: Math.max(...c.map((p) => p.y)), worst };
  });
  expect(state.inside).toBe(true);
  expect(state.floor).toBeGreaterThan(283);
  expect(state.worst).toBeLessThan(4);
  // At rest, nothing drifts.
  const before = await page.$$eval("#box > *", (els) => els.map((el) => el.getAttribute("style")));
  await page.waitForTimeout(300);
  const after = await page.$$eval("#box > *", (els) => els.map((el) => el.getAttribute("style")));
  const moved = before.filter((s, i) => s !== after[i]).length;
  expect(moved).toBeLessThan(6);
  await page.evaluate(() => {
    (window as any).pile.stop();
    (window as any).pile.stop();
  });
  expect(await page.$eval("#box", (el) => el.children.length)).toBe(0);
});

test("pile under reduced motion drops nothing", async ({ open }) => {
  const page = await open("physics-effects");
  const n = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const box = document.createElement("div");
    document.body.append(box);
    const p = (window as any).PH.pile(box, { pieces: ["•"] });
    p.drop(10);
    p.stop();
    return box.children.length;
  });
  expect(n).toBe(0);
});
