import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/pointer-effects.md

test("magnetic follows the mouse, settles, ignores touch, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.magnetic(document.getElementById("mag"))));
  await page.mouse.move(50, 50);
  await page.mouse.move(150, 110, { steps: 5 });
  await page.waitForTimeout(700);
  expect(await prop(page, "#mag", "x")).toBeLessThan(-10);
  expect(await prop(page, "#inner", "x")).toBeLessThan(0);

  await page.mouse.move(50, 50, { steps: 3 });
  await page.waitForTimeout(900);
  expect(Math.abs(await prop(page, "#mag", "x"))).toBeLessThan(0.5);

  await page.evaluate(() => {
    const target = document.getElementById("mag")!;
    target.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch", clientX: 110, clientY: 110 }));
    target.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: 110, clientY: 110, bubbles: true }));
  });
  await page.waitForTimeout(600);
  expect(Math.abs(await prop(page, "#mag", "x"))).toBeLessThan(0.5);

  await page.mouse.move(150, 110, { steps: 3 });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await style(page, "#mag")).toBe("");
  expect(await style(page, "#inner")).toBe("");
});

test("tilt leans toward the mouse, exposes pointer position, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.tilt(document.getElementById("card"))));
  await page.mouse.move(420, 120, { steps: 4 });
  await page.waitForTimeout(700);
  expect(await prop(page, "#card", "rotationY")).toBeLessThan(-4);
  expect(await prop(page, "#card", "rotationX")).toBeGreaterThan(4);
  expect(await page.$eval("#card", (el) => (el as HTMLElement).style.getPropertyValue("--pointer-x"))).toMatch(/%$/);
  await page.evaluate(() => (window as any).t());
  expect(await style(page, "#card")).toBe("transform: translateZ(0px);");
});

test("a throwing tilt setup rolls back and rethrows", async ({ open }) => {
  const page = await open("pointer-effects");
  const result = await page.evaluate(() => {
    const card = document.getElementById("card")!;
    const measure = card.getBoundingClientRect;
    card.getBoundingClientRect = () => {
      throw new Error("boom");
    };
    try {
      (window as any).P.tilt(card);
      return "no throw";
    } catch (error) {
      card.getBoundingClientRect = measure;
      // The failed setup must not stay GSAP's current context.
      return `${(error as Error).message}|${card.getAttribute("style")}|${!!(window as any).gsap.context()}`;
    }
  });
  expect(result).toBe("boom|transform: translateZ(0px);|false");
});

test("cursor follower trails the mouse, grows over targets, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.cursorFollower(document.getElementById("cur"))));
  await page.mouse.move(300, 300, { steps: 3 });
  await page.waitForTimeout(500);
  expect(Math.abs((await prop(page, "#cur", "x")) - 300)).toBeLessThan(3);
  expect(await page.$eval("#cur", (el) => getComputedStyle(el).visibility)).toBe("visible");

  await page.mouse.move(720, 120, { steps: 3 });
  await page.waitForTimeout(500);
  expect(await prop(page, "#cur", "scaleX")).toBeGreaterThan(2.9);
  expect(await page.$eval("#cur", (el) => (el as HTMLElement).dataset.cursorState)).toBe("grow");

  await page.evaluate(() => (window as any).t());
  expect(await style(page, "#cur")).toBe("");
  expect(await page.$eval("#cur", (el) => "cursorState" in (el as HTMLElement).dataset)).toBe(false);
});

test("drag track drags links without following them, snaps, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    (window as any).dt = (window as any).P.dragTrack(document.getElementById("vp"), document.getElementById("tr"));
  });
  await page.mouse.move(500, 470);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(500 - 30 * i, 470);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const x = await prop(page, "#tr", "x");
  // Item offsets are multiples of 310px, clamped to the track's end at -740.
  expect([0, -310, -620, -740].some((stop) => Math.abs(stop - x) < 1), `snapped x ${x}`).toBe(true);
  expect(x).toBeLessThan(-100);
  expect(await page.evaluate(() => location.hash)).toBe("");

  await page.mouse.click(750, 470);
  expect(await page.evaluate(() => location.hash)).toMatch(/^#a/);
  expect(await page.$eval("#tr", (el) => getComputedStyle(el).touchAction)).toContain("pan-y");

  await page.evaluate(() => {
    (window as any).dt.revert();
    (window as any).dt.revert();
  });
  expect(await style(page, "#tr")).toBe("");
  expect(await style(page, "#vp")).toBe("");
  expect(await page.evaluate(() => (window as any).dt.draggable.enabled())).toBe(false);
});

test("drag track slides keyboard focus into view", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    (window as any).dt = (window as any).P.dragTrack(document.getElementById("vp"), document.getElementById("tr"));
  });
  await page.keyboard.press("Tab");
  await page.evaluate(() => document.getElementById("a5")!.focus({ focusVisible: true } as FocusOptions));
  await page.waitForTimeout(700);
  const box = await page.evaluate(() => {
    const rect = document.getElementById("a5")!.getBoundingClientRect();
    return { left: rect.left, right: rect.right, scrollLeft: document.getElementById("vp")!.scrollLeft };
  });
  expect(box.scrollLeft).toBe(0);
  expect(box.left).toBeGreaterThan(0);
  expect(box.right).toBeLessThanOrEqual(801);
});

test("reduced motion skips decoration and keeps a drag without the throw", async ({ open }) => {
  const page = await open("pointer-effects");
  const result = await page.evaluate(() => {
    const { P } = window as any;
    document.documentElement.dataset.motion = "reduced";
    const teardowns = [P.magnetic(document.getElementById("mag")), P.tilt(document.getElementById("card")), P.cursorFollower(document.getElementById("cur"))];
    const drag = P.dragTrack(document.getElementById("vp"), document.getElementById("tr"));
    const snapshot = {
      inertia: !!drag.draggable.vars.inertia,
      mag: document.getElementById("mag")!.getAttribute("style") ?? "",
      cur: document.getElementById("cur")!.getAttribute("style") ?? "",
    };
    teardowns.forEach((fn: () => void) => fn());
    drag.revert();
    return snapshot;
  });
  expect(result).toEqual({ inertia: false, mag: "", cur: "" });
});

test("reduced motion: a drag without the throw still lands on the nearest item", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).dt = (window as any).P.dragTrack(document.getElementById("vp"), document.getElementById("tr"));
  });
  await page.mouse.move(500, 470);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(500 - 17 * i, 470);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const x = await prop(page, "#tr", "x");
  // Released near -170; the nearest stop is -310 (stops: 0, -310, -620, -740).
  expect(Math.abs(x + 310), `landed x ${x}`).toBeLessThan(1);
  await page.evaluate(() => (window as any).dt.revert());
  expect(await style(page, "#tr")).toBe("");
});
