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
  // Settled, waited for rather than timed, since a loaded machine steps slower than real time: nothing moves
  // between two looks a third of a second apart.
  const snapshot = () => page.$$eval("#box > *", (els) => els.map((el) => el.getAttribute("style")).join("|"));
  await expect
    .poll(
      async () => {
        const before = await snapshot();
        await page.waitForTimeout(300);
        return before === (await snapshot());
      },
      { timeout: 15000, intervals: [500] },
    )
    .toBe(true);
  // Every piece inside the box, the lowest on the floor, and no two sunk into each other.
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

const sling = async (page: import("@playwright/test").Page) => {
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "range";
    box.style.cssText = "position:absolute;left:0;top:0;width:800px;height:500px;overflow:hidden;color:#000";
    const handle = document.createElement("button");
    handle.id = "handle";
    handle.textContent = "Aim";
    handle.style.cssText = "position:absolute;left:100px;top:380px;width:40px;height:40px";
    box.append(handle);
    document.body.append(box);
    const w = window as any;
    const ball = document.createElement("span");
    ball.style.cssText = "position:absolute;left:0;top:0;width:24px;height:24px;border-radius:50%;background:#c00";
    w.heap = w.PH.pile(box, { pieces: [ball], bounce: 0.6 });
    w.shots = 0;
    w.stopSling = w.PH.slingshot(box, handle, w.heap, { onLaunch: () => w.shots++ });
  });
};
const balls = (page: import("@playwright/test").Page) =>
  page.$$eval("#range > span", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));

test("a slingshot shows the arc while pulled, flings a piece the opposite way, and springs back", async ({ open, page }) => {
  await open("physics-effects");
  await sling(page);
  await page.mouse.move(120, 400);
  await page.mouse.down();
  await page.mouse.move(40, 460, { steps: 6 });
  const dots = await page.$$eval("#range > i", (els) => els.filter((e) => Number(getComputedStyle(e).opacity) > 0).map((e) => new DOMMatrix(getComputedStyle(e).transform).m41));
  // The arc runs forward, up and to the right, opposite the pull.
  expect(dots.length).toBeGreaterThan(5);
  expect(dots[dots.length - 1]!).toBeGreaterThan(dots[0]!);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const [first] = await balls(page);
  await page.waitForTimeout(200);
  const [later] = await balls(page);
  expect(await page.evaluate(() => (window as any).shots)).toBe(1);
  expect(later![0]).toBeGreaterThan(first![0] + 20);
  await expect.poll(() => page.$eval("#handle", (h) => new DOMMatrix(getComputedStyle(h).transform).m41)).toBeCloseTo(0, 0);
});

test("the keyboard aims and fires; a tap without a pull fires nothing; teardown cleans up", async ({ open, page }) => {
  await open("physics-effects");
  await sling(page);
  await page.mouse.click(120, 400);
  expect(await page.evaluate(() => (window as any).shots)).toBe(0);
  await page.focus("#handle");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as any).shots)).toBe(1);
  expect((await balls(page)).length).toBe(1);
  await page.evaluate(() => { (window as any).stopSling(); (window as any).heap.stop(); });
  expect(await page.$$eval("#range > i, #range > span", (e) => e.length)).toBe(0);
  expect(await page.$eval("#handle", (h) => [h.style.transform, h.style.touchAction])).toEqual(["", ""]);
});

test("a pile with a ceiling keeps thrown pieces inside the box", async ({ open, page }) => {
  await open("physics-effects");
  const tops = await page.evaluate(async () => {
    const w = window as any;
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:200px;width:400px;height:300px";
    document.body.append(box);
    const ball = document.createElement("span");
    ball.style.cssText = "position:absolute;left:0;top:0;width:20px;height:20px";
    const heap = w.PH.pile(box, { pieces: [ball], bounce: 0.8, ceiling: true });
    heap.launch(200, 150, 0, -3000);
    const out: number[] = [];
    // The piece spins as it flies, so read its center, not its box.
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 30)); const r = box.querySelector("span")!.getBoundingClientRect(); out.push(r.top + r.height / 2); }
    heap.stop();
    return out;
  });
  // The box's top is at 200 and the piece's radius is 10: its center never rises above 210.
  expect(Math.min(...tops)).toBeGreaterThanOrEqual(209);
});

test("the slingshot keeps its handle inside the box however far it is pulled", async ({ open, page }) => {
  await open("physics-effects");
  await sling(page);
  await page.mouse.move(120, 400);
  await page.mouse.down();
  await page.mouse.move(-200, 700, { steps: 6 });
  const box = await page.$eval("#handle", (h) => h.getBoundingClientRect().toJSON());
  await page.mouse.up();
  expect(box.left).toBeGreaterThanOrEqual(-0.5);
  expect(box.bottom).toBeLessThanOrEqual(500.5);
});

test("pegs turn a falling piece aside, and bin walls keep it in its bin", async ({ open, page }) => {
  await open("physics-effects");
  const result = await page.evaluate(async () => {
    const w = window as any;
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:0;width:300px;height:400px";
    document.body.append(box);
    const ball = document.createElement("span");
    ball.style.cssText = "position:absolute;left:0;top:0;width:16px;height:16px";
    // One peg just right of the drop line, inside a bin whose walls, at 100 and 200, rise above it.
    const heap = w.PH.pile(box, { pieces: [ball], bounce: 0.5, pegs: () => [{ x: 154, y: 150, r: 8 }], walls: () => [100, 200], wallHeight: 330 });
    heap.launch(150, 20, 0, 0);
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 25)); const r = box.querySelector("span")!.getBoundingClientRect(); xs.push(r.left + r.width / 2); }
    heap.stop();
    return { early: xs[2]!, low: Math.min(...xs), last: xs[xs.length - 1]! };
  });
  // Struck on its right, it is turned left into the wall, rebounds, and stays in the middle bin.
  expect(result.low).toBeLessThan(result.early - 20);
  expect(result.last).toBeGreaterThan(100);
  expect(result.last).toBeLessThan(200);
});

test("a swing pushed swings both ways, settles straight, and reverts clean", async ({ open, page }) => {
  await open("physics-effects");
  const result = await page.evaluate(async () => {
    const w = window as any;
    const sign = document.createElement("button");
    sign.id = "sign";
    sign.style.cssText = "position:absolute;left:300px;top:100px;width:120px;height:80px";
    document.body.append(sign);
    const s = w.PH.swing(sign, { damping: 0.05 });
    s.push(200);
    const angles: number[] = [];
    for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 30)); angles.push(Number(w.gsap.getProperty(sign, "rotation"))); }
    const settled = angles[angles.length - 1]!;
    s.revert();
    return { max: Math.max(...angles), min: Math.min(...angles), settled, style: sign.getAttribute("style") };
  });
  expect(result.max).toBeGreaterThan(5);
  expect(result.min).toBeLessThan(-1);
  expect(Math.abs(result.settled)).toBeLessThan(0.5);
  expect(result.style).not.toContain("rotate");
});

test("a swing follows a drag around its hook and swings on from the release", async ({ open, page }) => {
  await open("physics-effects");
  await page.evaluate(() => {
    const sign = document.createElement("button");
    sign.id = "sign";
    sign.style.cssText = "position:absolute;left:300px;top:100px;width:120px;height:80px";
    document.body.append(sign);
    (window as any).s = (window as any).PH.swing(sign);
  });
  // The hook is at (360, 100). Drag the sign's bottom out to the right.
  await page.mouse.move(360, 170);
  await page.mouse.down();
  await page.mouse.move(420, 160, { steps: 8 });
  const held = await page.evaluate(() => Number((window as any).gsap.getProperty("#sign", "rotation")));
  expect(held).toBeLessThan(-20);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Number((window as any).gsap.getProperty("#sign", "rotation"))), { timeout: 2000 }).toBeGreaterThan(5);
  await page.evaluate(() => (window as any).s.revert());
});

const dominoes = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const row = document.createElement("div");
    row.id = "row";
    row.style.cssText = "position:absolute;left:40px;top:300px;width:600px;height:120px;display:flex;align-items:flex-end;gap:34px";
    for (let i = 0; i < 6; i++) {
      const d = document.createElement("i");
      d.style.cssText = "display:block;width:16px;height:100px;background:#000";
      row.append(d);
    }
    document.body.append(row);
    const w = window as any;
    w.row = w.PH.topple(Array.from(row.children) as HTMLElement[]);
  });
const angles = (page: import("@playwright/test").Page) =>
  page.$$eval("#row > i", (els) => els.map((e) => Number((window as any).gsap.getProperty(e, "rotation"))));

test("topple runs a push down the row: each domino leans on the next and the last lies flat", async ({ open, page }) => {
  await open("physics-effects");
  await dominoes(page);
  await page.evaluate(() => (window as any).row.push());
  await expect.poll(async () => (await angles(page))[5]!, { timeout: 6000 }).toBe(90);
  const rest = await angles(page);
  // Every one before the last leans, less and less steeply back along the row: none flat, none upright.
  for (const a of rest.slice(0, 5)) expect(a).toBeGreaterThan(10);
  for (const a of rest.slice(0, 5)) expect(a).toBeLessThan(90);
  // No domino passes through the next: each one's top right corner stays left of its neighbor's face.
  const overlaps = await page.$$eval("#row > i", (els) => els.slice(0, -1).map((e, i) => {
    const a = e.getBoundingClientRect();
    const b = els[i + 1]!.getBoundingClientRect();
    return a.right - b.right;
  }));
  for (const o of overlaps) expect(o).toBeLessThan(1);
  await page.evaluate(() => (window as any).row.reset());
  await expect.poll(async () => (await angles(page)).every((a) => Math.abs(a) < 0.5)).toBe(true);
  await page.evaluate(() => (window as any).row.revert());
  expect(await page.$$eval("#row > i", (els) => els.map((e) => e.style.transform))).toEqual(["", "", "", "", "", ""]);
});

test("topple under reduced motion lays the row down at once", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("physics-effects");
  await dominoes(page);
  await page.evaluate(() => (window as any).row.push());
  const now = await angles(page);
  expect(now[5]).toBe(90);
  expect(now[0]).toBeGreaterThan(10);
});
