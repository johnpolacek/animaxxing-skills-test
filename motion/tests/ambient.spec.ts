import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/ambient.md

test("ping spreads rings from the dot for its beats, rests, beats again, and reverts", async ({ open }) => {
  const page = await open("ambient");
  const before = await style(page, "#dot");
  const result = await page.evaluate(() => {
    const w = window as any;
    w.p = w.AM.ping(document.getElementById("dot"), { beats: 3, every: 1 });
    const rings = [...document.querySelectorAll("#dot span")] as HTMLElement[];
    w.p.timeline.pause(0.5);
    const mid = rings.map((r) => Number(w.gsap.getProperty(r, "scale")));
    const length = w.p.timeline.duration();
    w.p.timeline.progress(1);
    const rest = rings.map((r) => getComputedStyle(r).opacity);
    w.p.again();
    return { count: rings.length, aria: rings.map((r) => r.getAttribute("aria-hidden")), mid, length, rest, again: w.p.timeline.isActive() || w.p.timeline.progress() < 1 };
  });
  expect(result.count).toBe(2);
  expect(result.aria).toEqual(["true", "true"]);
  expect(result.mid[0]).toBeGreaterThan(1);
  // Three beats a second apart: it rests after a little over two seconds.
  expect(result.length).toBeGreaterThan(2);
  expect(result.length).toBeLessThan(3.6);
  expect(result.rest).toEqual(["0", "0"]);
  expect(result.again).toBe(true);
  await page.evaluate(() => (window as any).p.revert());
  expect(await page.$$eval("#dot span", (e) => e.length)).toBe(0);
  expect(await style(page, "#dot")).toBe(before);
});

test("heartbeat thumps twice and rests at its own scale; bump pops and settles", async ({ open }) => {
  const page = await open("ambient");
  const result = await page.evaluate(() => {
    const w = window as any;
    const h = w.AM.heartbeat(document.getElementById("like"));
    h.timeline.pause(0.11);
    const peak = Number(w.gsap.getProperty("#like", "scale"));
    h.timeline.progress(1);
    const b = w.AM.bump(document.getElementById("badge"));
    b.timeline.pause(0.14);
    const pop = Number(w.gsap.getProperty("#badge", "scale"));
    b.timeline.progress(1);
    return { peak, pop, beats: h.timeline.duration() };
  });
  expect(result.peak).toBeCloseTo(1.14, 2);
  expect(result.pop).toBeCloseTo(1.35, 2);
  expect(result.beats).toBeGreaterThan(1.5);
  expect(await style(page, "#like")).toBe("");
  expect(await style(page, "#badge")).toBe("");
});

test("ambient loops start paused, move when played, end cycles where they began, and revert clean", async ({ open }) => {
  const page = await open("ambient");
  const result = await page.evaluate(async () => {
    const w = window as any;
    const shapes = [...document.querySelectorAll<HTMLElement>("#shapes .shape")];
    const marks = [...document.querySelectorAll<HTMLElement>("#orbit b")];
    const f = w.AM.float(shapes, { duration: 0.4 });
    const o = w.AM.orbit(marks, { radius: 100, duration: 1 });
    const pos = () => marks.map((m) => [Math.round(Number(w.gsap.getProperty(m, "x"))), Math.round(Number(w.gsap.getProperty(m, "y")))]);
    const start = pos();
    const y0 = Number(w.gsap.getProperty(shapes[0], "y"));
    await new Promise((r) => setTimeout(r, 300));
    const stillPaused = pos();
    f.play(); o.play();
    await new Promise((r) => setTimeout(r, 300));
    const moved = pos();
    const y1 = Number(w.gsap.getProperty(shapes[0], "y"));
    f.revert(); o.revert();
    return { start, stillPaused, moved, y0, y1, styles: [...shapes, ...marks].map((e) => e.getAttribute("style") ?? "") };
  });
  // Evenly spaced on the circle: the first at the right, the third at the left.
  expect(result.start[0]).toEqual([100, 0]);
  expect(result.start[2]).toEqual([-100, 0]);
  expect(result.stillPaused).toEqual(result.start);
  expect(result.moved).not.toEqual(result.start);
  expect(result.y1).not.toBe(result.y0);
  expect(result.styles.every((s) => s === "")).toBe(true);
});

test("drift keeps every item inside its field", async ({ open }) => {
  const page = await open("ambient");
  const boxes = await page.evaluate(async () => {
    const w = window as any;
    const field = document.getElementById("field")!;
    const items = [...field.querySelectorAll<HTMLElement>("i")];
    const d = w.AM.drift(field, items, { speed: 600 });
    d.play();
    const out: number[][] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const f = field.getBoundingClientRect();
      for (const item of items) {
        const b = item.getBoundingClientRect();
        out.push([b.left - f.left, b.top - f.top, f.right - b.right, f.bottom - b.bottom]);
      }
    }
    d.revert();
    return out;
  });
  for (const edges of boxes) for (const gap of edges) expect(gap).toBeGreaterThanOrEqual(-0.5);
});

test("watch plays loops on screen, pauses them off screen and by the button, and reverts them", async ({ open, page }) => {
  await open("ambient");
  await page.evaluate(() => {
    const w = window as any;
    w.played = [] as string[];
    const spy = (name: string) => ({ play: () => w.played.push(name + ":play"), pause: () => w.played.push(name + ":pause"), revert: () => w.played.push(name + ":revert") });
    w.stopNear = w.AM.watch(document.getElementById("shapes"), [spy("near")], { button: document.getElementById("pause") });
    w.stopFar = w.AM.watch(document.getElementById("below"), [spy("far")]);
  });
  await page.waitForTimeout(200);
  let played: string[] = await page.evaluate(() => (window as any).played);
  expect(played.filter((p) => p.startsWith("near")).pop()).toBe("near:play");
  expect(played.filter((p) => p.startsWith("far")).pop()).toBe("far:pause");
  await page.click("#pause");
  played = await page.evaluate(() => (window as any).played);
  expect(played.pop()).toBe("near:pause");
  expect(await page.$eval("#pause", (b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual(["Play", "true"]);
  await page.evaluate(() => { (window as any).stopNear(); (window as any).stopFar(); });
  played = await page.evaluate(() => (window as any).played);
  expect(played.slice(-2).sort()).toEqual(["far:revert", "near:revert"]);
  expect(await page.$eval("#pause", (b) => b.getAttribute("aria-pressed"))).toBe(null);
});

test("reduced motion: pulses add nothing, loops never play, and the pause button hides", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("ambient");
  const result = await page.evaluate(async () => {
    const w = window as any;
    const p = w.AM.ping(document.getElementById("dot"));
    const h = w.AM.heartbeat(document.getElementById("like"));
    let plays = 0;
    const stop = w.AM.watch(document.getElementById("shapes"), [{ play: () => plays++, pause() {}, revert() {} }], { button: document.getElementById("pause") });
    await new Promise((r) => setTimeout(r, 200));
    const out = { rings: document.querySelectorAll("#dot span").length, durations: p.timeline.duration() + h.timeline.duration(), plays, hidden: (document.getElementById("pause") as HTMLButtonElement).hidden };
    stop();
    return out;
  });
  expect(result).toEqual({ rings: 0, durations: 0, plays: 0, hidden: true });
});
