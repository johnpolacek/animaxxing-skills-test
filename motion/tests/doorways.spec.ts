import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/doorways.md

/** The clip's left, top, right, and bottom from a path() or polygon() string, in pixels. */
const bounds = (clip: string) => {
  let n: (readonly [number, number])[];
  if (clip.startsWith("path(")) {
    // M x y L x y A rx ry rotation large sweep x y L x y Z: only the end of each command is a point.
    // The arc's apex is no command's end: it sits one radius above where the arc starts, halfway across.
    n = [];
    for (const [, command, args] of clip.matchAll(/([MLA])([^MLAZ]+)/g)) {
      const v = args!.trim().split(/\s+/).map(Number);
      const [px, py] = n[n.length - 1] ?? [0, 0];
      if (command === "A") n.push([px + v[0]!, py - v[1]!]);
      n.push([v[v.length - 2]!, v[v.length - 1]!]);
    }
  } else n = [...clip.matchAll(/(-?[\d.]+)(?:px)? (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  const xs = n.map(([x]) => x), ys = n.map(([, y]) => y);
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
};

test("archAt runs from a point at the door's foot, through the door, to past every edge", async ({ open }) => {
  const page = await open("doorways");
  const boxes = await page.evaluate(() => {
    const { DW } = window as any;
    const frame = document.getElementById("frame")!;
    const door = { left: 0.25, top: 0.2, right: 0.75, bottom: 0.9 };
    return [0, DW.DOOR_SHARE, 1].map((q: number) => DW.archAt(frame, door, q));
  });
  const [seed, door, cover] = boxes;
  expect(seed.r - seed.l).toBe(0);
  expect(seed.t).toBe(seed.b);
  expect(door).toEqual({ l: 100, t: 60, r: 300, b: 270 });
  expect(cover.l).toBeLessThan(0);
  expect(cover.r).toBeGreaterThan(400);
  expect(cover.b).toBeGreaterThan(300);
  // The round top sits wholly above the frame: its springing line is above 0.
  expect(cover.t + (cover.r - cover.l) / 2).toBeLessThan(0);
});

test("archReveal starts closed, holds as a door, opens to nothing inline, and reverts", async ({ open }) => {
  const page = await open("doorways");
  const before = await style(page, "#frame");
  const clips = await page.evaluate(() => {
    const w = window as any;
    w.arch = w.DW.archReveal(document.getElementById("frame"), { duration: 1, door: { left: 0.25, top: 0.2, right: 0.75, bottom: 0.9 } });
    w.arch.timeline.pause(0);
    const at = (t: number) => (w.arch.timeline.seek(t), document.getElementById("frame")!.style.clipPath);
    return { start: at(0), door: at(0.41), mid: at(0.75), scale: Number(w.gsap.getProperty("#frame img", "scale")), end: (w.arch.timeline.progress(1), document.getElementById("frame")!.style.clipPath) };
  });
  const start = bounds(clips.start);
  expect(start.r - start.l).toBe(0);
  expect(bounds(clips.door)).toEqual({ l: 100, t: 60, r: 300, b: 270 });
  expect(bounds(clips.mid).r - bounds(clips.mid).l).toBeGreaterThan(200);
  expect(clips.scale).toBeGreaterThan(1);
  expect(clips.end).toBe("");
  await page.evaluate(() => (window as any).arch.revert());
  expect(await style(page, "#frame")).toBe(before);
});

test("archReveal out closes to a point and stays closed until reverted", async ({ open }) => {
  const page = await open("doorways");
  const end = await page.evaluate(() => {
    const w = window as any;
    w.arch = w.DW.archReveal(document.getElementById("frame"), { out: true, duration: 0.5 });
    w.arch.timeline.progress(1);
    return document.getElementById("frame")!.style.clipPath;
  });
  const b = bounds(end);
  expect(b.r - b.l).toBe(0);
  await page.evaluate(() => (window as any).arch.revert());
  expect(await style(page, "#frame")).toBe("");
});

test("doorwayPassage grows the door's mask over the stage as the page scrolls, and reverts", async ({ open, page }) => {
  await open("doorways");
  await page.evaluate(() => {
    const w = window as any;
    w.passage = w.DW.doorwayPassage(document.getElementById("stage"), document.getElementById("next"), {
      door: { left: 0.4, top: 0.3, right: 0.6, bottom: 0.8 },
      glow: document.getElementById("glow"),
      trigger: document.getElementById("track"),
    });
  });
  const read = () => page.evaluate(() => {
    const next = document.getElementById("next")!;
    return { clip: next.style.clipPath, opacity: Number(getComputedStyle(next).opacity), glow: document.getElementById("glow")!.style.width };
  });
  const track = await page.$eval("#track", (el) => ({ top: el.getBoundingClientRect().top + scrollY, height: el.offsetHeight }));
  const span = track.height - (await page.evaluate(() => innerHeight));
  const at = async (progress: number) => {
    await page.evaluate((y) => scrollTo(0, y), track.top + span * progress);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return read();
  };
  const start = await at(0);
  expect(start.opacity).toBe(0);
  expect(start.glow).toBe("80px");
  expect(bounds(start.clip)).toEqual({ l: 160, t: 90, r: 240, b: 240 });
  const middle = await at(0.5);
  expect(middle.opacity).toBe(1);
  const mid = bounds(middle.clip);
  expect(mid.r - mid.l).toBeGreaterThan(80);
  expect(mid.r - mid.l).toBeLessThan(404);
  const end = bounds((await at(1)).clip);
  expect(end.l).toBeLessThan(0);
  expect(end.r).toBeGreaterThan(400);
  // Scrolling back retraces it.
  expect(bounds((await at(0.5)).clip)).toEqual(mid);
  await page.evaluate(() => (window as any).passage.revert());
  expect(await style(page, "#next")).toBe("");
  expect(await style(page, "#glow")).toBe("");
});

test("archPolygon has a fixed number of points and a half-circle top; pressToEdges keeps the count", async ({ open }) => {
  const page = await open("doorways");
  const result = await page.evaluate(() => {
    const { DW } = window as any;
    const tall: string = DW.archPolygon(0.5);
    const points = [...tall.matchAll(/(-?[\d.]+)% (-?[\d.]+)%/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const pressed = DW.pressToEdges(points);
    return { count: points.length, wide: [...DW.archPolygon(2).matchAll(/%/g)].length / 2, top: points[14], pressed, ends: [points[0], points[28]] };
  });
  expect(result.count).toBe(31);
  expect(result.wide).toBe(31);
  // A frame half as wide as it is tall: the round top reaches 25% down.
  expect(result.ends).toEqual([[0, 25], [100, 25]]);
  expect(result.top).toEqual([50, 0]);
  for (const [x, y] of result.pressed) expect(x === 0 || x === 100 || y === 0 || y === 100).toBe(true);
});

test("shapeFlight flies a copy from card to arch, hides both frames while it flies, and lands clean", async ({ open }) => {
  const page = await open("doorways");
  const states = await page.evaluate(() => {
    const w = window as any;
    const arch = document.getElementById("arch")!;
    arch.style.clipPath = w.DW.archPolygon(arch.offsetWidth / arch.offsetHeight);
    w.flight = w.DW.shapeFlight(document.getElementById("card"), arch, { duration: 1 });
    w.flight.timeline.pause(0);
    const copy = document.querySelector<HTMLElement>("body > div[aria-hidden]")!;
    const picture = copy.querySelector("img")!;
    const at = (t: number) => (w.flight.timeline.seek(t), {
      clip: copy.style.clipPath,
      scale: Number(w.gsap.getProperty(picture, "scale")),
      x: Number(w.gsap.getProperty(picture, "x")),
    });
    return {
      hidden: [document.getElementById("card")!.style.visibility, arch.style.visibility],
      start: at(0), end: at(0.999),
      after: (w.flight.timeline.progress(1), { copies: document.querySelectorAll("body > div[aria-hidden]").length, shown: [document.getElementById("card")!.style.visibility, arch.style.visibility] }),
      card: document.getElementById("card")!.getBoundingClientRect().toJSON(),
      archBox: arch.getBoundingClientRect().toJSON(),
    };
  });
  expect(states.hidden).toEqual(["hidden", "hidden"]);
  const count = (clip: string) => clip.split(",").length;
  expect(count(states.start.clip)).toBe(31);
  expect(count(states.end.clip)).toBe(31);
  // It leaves as the card's rectangle and lands as the arch.
  const start = bounds(states.start.clip);
  expect(start.r - start.l).toBeCloseTo(states.card.width, 0);
  expect(start.b - start.t).toBeCloseTo(states.card.height, 0);
  const end = bounds(states.end.clip);
  expect(end.r - end.l).toBeCloseTo(states.archBox.width, 0);
  expect(states.start.scale).toBeLessThan(1);
  expect(states.start.x).toBeLessThan(0);
  expect(states.after).toEqual({ copies: 0, shown: ["", ""] });
});

test("shapeFlight back to the card presses the arch onto the card's edges", async ({ open }) => {
  const page = await open("doorways");
  const clips = await page.evaluate(() => {
    const w = window as any;
    const arch = document.getElementById("arch")!;
    arch.style.clipPath = w.DW.archPolygon(arch.offsetWidth / arch.offsetHeight);
    w.flight = w.DW.shapeFlight(arch, document.getElementById("card"), { duration: 1 });
    w.flight.timeline.pause(0);
    const copy = document.querySelector<HTMLElement>("body > div[aria-hidden]")!;
    const start = copy.style.clipPath;
    w.flight.timeline.seek(0.999);
    const end = copy.style.clipPath;
    w.flight.revert();
    return { start, end, copies: document.querySelectorAll("body > div[aria-hidden]").length };
  });
  // Every point of the landing rectangle lies on one of the card's edges.
  const b = bounds(clips.end);
  for (const m of clips.end.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    expect(Math.min(Math.abs(x - b.l), Math.abs(x - b.r), Math.abs(y - b.t), Math.abs(y - b.b))).toBeLessThan(1);
  }
  expect(bounds(clips.start).r - bounds(clips.start).l).toBeGreaterThan(200);
  expect(clips.copies).toBe(0);
});

test("reduced motion: archReveal and shapeFlight add nothing, and the passage only fades", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("doorways");
  const result = await page.evaluate(() => {
    const w = window as any;
    const a = w.DW.archReveal(document.getElementById("frame"));
    const f = w.DW.shapeFlight(document.getElementById("card"), document.getElementById("arch"));
    const p = w.DW.doorwayPassage(document.getElementById("stage"), document.getElementById("next"), { door: { left: 0.4, top: 0.3, right: 0.6, bottom: 0.8 }, trigger: document.getElementById("track") });
    const out = { frame: document.getElementById("frame")!.style.clipPath, copies: document.querySelectorAll("body > div[aria-hidden]").length, card: document.getElementById("card")!.style.visibility, next: document.getElementById("next")!.style.clipPath, duration: a.timeline.duration() + f.timeline.duration() };
    a.revert(); f.revert(); p.revert();
    return out;
  });
  expect(result).toEqual({ frame: "", copies: 0, card: "", next: "", duration: 0 });
});
