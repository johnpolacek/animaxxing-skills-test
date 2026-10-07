import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/print-effects.md

test("brush thresholds are stable, ordered by the stroke, and in range", async ({ open }) => {
  const page = await open("print");
  const result = await page.evaluate(() => {
    const PR = (window as any).PR;
    const a: Uint8Array = PR.brushThresholds(80, 40, "right");
    const b: Uint8Array = PR.brushThresholds(80, 40, "right");
    const avg = (from: number, to: number) => {
      let sum = 0, n = 0;
      for (let y = 0; y < 40; y++) for (let x = from; x < to; x++) { sum += a[y * 80 + x]!; n++; }
      return sum / n;
    };
    return { same: a.every((v, i) => v === b[i]), left: avg(0, 20), right: avg(60, 80), max: Math.max(...a) };
  });
  expect(result.same).toBe(true);
  expect(result.left).toBeLessThan(result.right);
  expect(result.max).toBeLessThanOrEqual(255);
});

test("paintReveal covers the target, wears away to nothing, moves the roller, and leaves no canvas", async ({ open }) => {
  const page = await open("print");
  const before = await style(page, "#roller");
  const covered = await page.evaluate(() => {
    const w = window as any;
    w.paint = w.PR.paintReveal(document.getElementById("card"), { duration: 0.6, roller: document.getElementById("roller") });
    w.paint.timeline.pause(0);
    const canvas = document.querySelector("#card canvas") as HTMLCanvasElement;
    const alpha = (t: number) => {
      w.paint.timeline.seek(t);
      const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 128) opaque++;
      return opaque / (data.length / 4);
    };
    return { aria: canvas.getAttribute("aria-hidden"), start: alpha(0), mid: alpha(0.3), late: alpha(0.58) };
  });
  expect(covered.aria).toBe("true");
  expect(covered.start).toBe(1);
  expect(covered.mid).toBeLessThan(0.9);
  expect(covered.mid).toBeGreaterThan(0.05);
  expect(covered.late).toBeLessThan(covered.mid);
  const end = await page.evaluate(() => {
    const w = window as any;
    w.paint.timeline.progress(1);
    return { canvas: document.querySelectorAll("#card canvas").length, x: Number(w.gsap.getProperty("#roller", "x")) };
  });
  expect(end.canvas).toBe(0);
  expect(end.x).toBeGreaterThan(300);
  await page.evaluate(() => (window as any).paint.revert());
  expect(await style(page, "#roller")).toBe(before);
});

test("inkText masks the live text, inks it in, and removes every mask at rest", async ({ open }) => {
  const page = await open("print");
  const state = await page.evaluate(() => {
    const w = window as any;
    const targets = [document.getElementById("title"), document.getElementById("line")];
    w.ink = w.PR.inkText(targets, { duration: 0.4, stagger: 0.1 });
    w.ink.timeline.pause(0);
    const masked = targets.map((t) => (t as HTMLElement).style.getPropertyValue("mask-image"));
    const ramp = document.querySelector("mask feFuncA")!;
    const first = ramp.getAttribute("intercept");
    w.ink.timeline.seek(0.2);
    const mid = Number(ramp.getAttribute("intercept"));
    w.ink.timeline.progress(1);
    return { masked, first, mid, after: targets.map((t) => (t as HTMLElement).style.getPropertyValue("mask-image")), masks: document.querySelectorAll("mask").length };
  });
  expect(state.masked.every((m) => /ink-text-/.test(m))).toBe(true);
  expect(state.first).toBe("-18");
  expect(state.mid).toBeGreaterThan(-18);
  expect(state.mid).toBeLessThan(1);
  expect(state.after).toEqual(["", ""]);
  expect(state.masks).toBe(0);
  // The text itself was never replaced.
  await expect(page.getByRole("heading", { name: "Hand printed" })).toBeVisible();
});

test("registrationSlip lands an aria-hidden copy out of register, snaps it true, and removes it", async ({ open }) => {
  const page = await open("print");
  const before = await style(page, "#title");
  const run = await page.evaluate(() => {
    const w = window as any;
    w.slip = w.PR.registrationSlip(document.getElementById("title"), { ink: "rgb(165, 72, 36)", duration: 0.4 });
    w.slip.timeline.pause(0);
    const copy = document.querySelector("h1[aria-hidden='true']") as HTMLElement;
    const start = [Number(w.gsap.getProperty(copy, "x")), Number(w.gsap.getProperty(copy, "y"))];
    // A 0.4s slip runs 0.32s: half to drift, three tenths to snap.
    w.slip.timeline.seek(0.31);
    const near = [Number(w.gsap.getProperty(copy, "x")), Number(w.gsap.getProperty(copy, "y"))];
    w.slip.timeline.progress(1);
    return { color: copy.style.color, start, near, copies: document.querySelectorAll("h1").length };
  });
  expect(run.color).toBe("rgb(165, 72, 36)");
  expect(run.start).toEqual([8, 3]);
  expect(Math.abs(run.near[0]!)).toBeLessThan(2);
  expect(run.copies).toBe(1);
  expect(await style(page, "#title")).toBe(before);
});

test("under reduced motion every print effect is an empty timeline and changes nothing", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("print");
  const result = await page.evaluate(() => {
    const PR = (window as any).PR;
    const runs = [
      PR.paintReveal(document.getElementById("card")),
      PR.inkText([document.getElementById("title")]),
      PR.registrationSlip(document.getElementById("title"), { ink: "red" }),
    ];
    return { durations: runs.map((r) => r.timeline.duration()), canvases: document.querySelectorAll("canvas").length, masks: document.querySelectorAll("mask").length, headings: document.querySelectorAll("h1").length };
  });
  expect(result).toEqual({ durations: [0, 0, 0], canvases: 0, masks: 0, headings: 1 });
});
