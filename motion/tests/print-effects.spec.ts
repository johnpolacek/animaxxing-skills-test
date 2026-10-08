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

test("writeOn masks live text with one stroke per line, writes them in order, and removes the mask", async ({ open }) => {
  const page = await open("print");
  const run = await page.evaluate(() => {
    const w = window as any;
    const title = document.getElementById("title")!;
    title.style.width = "260px";
    w.write = w.PR.writeOn(title, { duration: 0.6 });
    w.write.timeline.pause(0);
    const paths = Array.from(document.querySelectorAll("mask path"));
    const offsets = () => paths.map((p) => Number(p.getAttribute("stroke-dashoffset")));
    const start = offsets();
    w.write.timeline.seek(0.25);
    const mid = offsets();
    const masked = title.style.getPropertyValue("mask");
    w.write.timeline.progress(1);
    return { lines: paths.length, start, mid, masked, after: title.style.getPropertyValue("mask"), masks: document.querySelectorAll("mask").length };
  });
  expect(run.lines).toBeGreaterThan(1);
  // Every stroke parked past its line's end, so nothing shows yet.
  expect(run.start.every((o) => o > 1 && o === run.start[0])).toBe(true);
  // The first line is being written before the last has begun.
  expect(run.mid[0]).toBeLessThan(1);
  expect(run.mid[run.mid.length - 1]).toBe(run.start[0]);
  expect(run.masked).toMatch(/write-on-/);
  expect(run.after).toBe("");
  expect(run.masks).toBe(0);
});

test("pullCorner clips the sheet to what lies flat, folds a flap over, peels it off, and restores", async ({ open }) => {
  const page = await open("print");
  const before = await style(page, "#card");
  const shapes = await page.evaluate(() => {
    const w = window as any;
    w.pull = w.PR.pullCorner(document.getElementById("card"));
    const card = document.getElementById("card")!;
    const flap = document.querySelector("#card + div i") as HTMLElement;
    w.pull.set(0.2);
    const quarter = [card.style.clipPath, flap.style.clipPath];
    w.pull.set(1);
    const gone = card.style.clipPath;
    return { quarter, gone, hidden: flap.parentElement!.getAttribute("aria-hidden") };
  });
  // A rectangle with its corner cut is a pentagon; the folded corner is a triangle.
  expect((shapes.quarter[0]!.match(/px/g) ?? []).length).toBe(10);
  expect((shapes.quarter[1]!.match(/px/g) ?? []).length).toBe(6);
  expect(shapes.gone).toBe("polygon(0px 0px)");
  expect(shapes.hidden).toBe("true");
  await page.evaluate(() => (window as any).pull.revert());
  expect(await style(page, "#card")).toBe(before);
  expect(await page.$("#card + div")).toBeNull();
});

test("dragPull follows the drag, springs back short of the threshold, and peels off past it or on Enter", async ({ open }) => {
  const page = await open("print");
  await page.evaluate(() => {
    const w = window as any;
    const card = document.getElementById("card")!;
    card.tabIndex = 0;
    w.pulled = 0;
    w.pull = w.PR.pullCorner(card);
    w.off = w.PR.dragPull(card, w.pull, { onPulled: () => w.pulled++ });
  });
  const progress = () => page.evaluate(() => (window as any).pull.progress() as number);
  // The card is 400 by 250 at (40, 40); grab near its bottom right.
  await page.mouse.move(430, 280);
  await page.mouse.down();
  await page.mouse.move(400, 250, { steps: 3 });
  expect(await progress()).toBeGreaterThan(0.05);
  await page.mouse.up();
  await expect.poll(progress).toBe(0);
  await page.mouse.move(430, 280);
  await page.mouse.down();
  await page.mouse.move(250, 120, { steps: 5 });
  await page.mouse.up();
  await expect.poll(progress).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).pulled)).toBe(1);
  await page.evaluate(() => (window as any).pull.set(0));
  await page.focus("#card");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).pulled)).toBe(2);
  await page.evaluate(() => {
    (window as any).off();
    (window as any).pull.revert();
  });
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
      PR.writeOn(document.getElementById("line")),
    ];
    return { durations: runs.map((r) => r.timeline.duration()), canvases: document.querySelectorAll("canvas").length, masks: document.querySelectorAll("mask").length, headings: document.querySelectorAll("h1").length };
  });
  expect(result).toEqual({ durations: [0, 0, 0, 0], canvases: 0, masks: 0, headings: 1 });
});

const leaf = (page: import("@playwright/test").Page, id: string) => page.evaluate((s) => Number((window as any).gsap.getProperty(`#${s}`, "rotationY")), id);

test("pageTurn turns a leaf with the buttons and the keys, reports the spread, and turns back", async ({ open }) => {
  const page = await open("print");
  const before = await page.$eval("#leaf1", (e) => e.getAttribute("style"));
  await page.evaluate(() => {
    const w = window as any;
    w.spreads = [];
    w.book = w.PR.pageTurn(document.getElementById("book"), { duration: 0.3, onTurn: (s: number) => w.spreads.push(s) });
  });
  await page.evaluate(() => (window as any).book.next());
  await expect.poll(() => leaf(page, "leaf1")).toBe(-180);
  await page.focus("#book");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => leaf(page, "leaf2")).toBe(-180);
  // Past the last leaf, nothing turns.
  expect(await page.evaluate(() => (window as any).book.next())).toBe(null);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => leaf(page, "leaf2")).toBe(0);
  expect(await page.evaluate(() => (window as any).spreads)).toEqual([1, 2, 1]);
  await page.evaluate(() => (window as any).book.revert());
  expect(await page.$eval("#leaf1", (e) => e.getAttribute("style"))).toBe(before);
  expect(await page.$$eval("#book i", (e) => e.length)).toBe(0);
});

test("dragging the right page across the spine turns it; a short drag lets it fall back", async ({ open, page }) => {
  await open("print");
  await page.evaluate(() => ((window as any).book = (window as any).PR.pageTurn(document.getElementById("book"), { duration: 0.3 })));
  // The book: x 40 to 640, the spine at 340, y 400 to 600.
  await page.mouse.move(620, 500);
  await page.mouse.down();
  await page.mouse.move(400, 500, { steps: 8 });
  const mid = await leaf(page, "leaf1");
  expect(mid).toBeLessThan(-30);
  expect(mid).toBeGreaterThan(-90);
  await page.mouse.up();
  await expect.poll(() => leaf(page, "leaf1")).toBe(0);
  await page.mouse.move(620, 500);
  await page.mouse.down();
  await page.mouse.move(200, 500, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => leaf(page, "leaf1")).toBe(-180);
});

test("writeOn paused at its start shows nothing of the text, not even the line ends", async ({ open }) => {
  const page = await open("print");
  // Narrow, so its lines run to the box's right edge, where a parked stroke's cap would sit.
  await page.evaluate(() => Object.assign(document.getElementById("line")!.style, { width: "150px", textAlign: "justify", fontSize: "24px" }));
  const clip = (await page.locator("#line").boundingBox())!;
  const shot = () => page.screenshot({ clip });
  // The same box with the text hidden: what "nothing yet" looks like.
  await page.evaluate(() => (document.getElementById("line")!.style.visibility = "hidden"));
  const blank = await shot();
  await page.evaluate(() => {
    const el = document.getElementById("line")!;
    el.style.visibility = "";
    const w = window as any;
    w.write = w.PR.writeOn(el, { duration: 0.6 });
    w.write.timeline.pause(0);
  });
  await page.waitForTimeout(50);
  expect((await shot()).equals(blank)).toBe(true);
  await page.evaluate(() => (window as any).write.revert());
});
