import { test, expect, style, prop, declarations, declared } from "./fixture";

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

test("momentum hover knocks targets along a fast sweep, spins them, settles, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.t = w.P.momentumHover(document.getElementById("mom"));
    w.peak = 0;
    w.spin = 0;
    w.sampling = true;
    // getProperty parses the transform, which writes inline; stop sampling before teardown.
    const sample = () => {
      if (!w.sampling) return;
      w.peak = Math.max(w.peak, Math.abs(Number(w.gsap.getProperty("#mt1", "x"))));
      w.spin = Math.max(w.spin, Math.abs(Number(w.gsap.getProperty("#mt1", "rotation"))));
      requestAnimationFrame(sample);
    };
    sample();
  });
  await page.mouse.move(60, 610);
  await page.mouse.move(80, 610);
  await page.mouse.move(300, 610, { steps: 4 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).peak)).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as any).spin)).toBeGreaterThan(0.5);
  // The hit area stays put; only its target moves.
  expect(await style(page, "#m1")).toBe("width:60px;height:60px");
  await expect.poll(() => prop(page, "#mt1", "x"), { timeout: 4000 }).toBeCloseTo(0, 0);
  await page.evaluate(() => {
    (window as any).sampling = false;
    (window as any).t();
    (window as any).t();
  });
  expect(await style(page, "#mt1")).toBe("display: block; width: 60px; height: 60px; background: rgb(255, 153, 153);");
});

test("momentum hover ignores a still pointer, touch, and reduced motion", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.momentumHover(document.getElementById("mom"))));
  await page.mouse.move(90, 630);
  await page.mouse.move(95, 630);
  await page.waitForTimeout(300);
  await page.mouse.move(130, 630);
  await page.waitForTimeout(100);
  expect(Math.abs(await prop(page, "#mt1", "x"))).toBeLessThan(0.5);
  await page.evaluate(() => {
    const hit = document.getElementById("m2")!;
    hit.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: 200, clientY: 630, bubbles: true }));
    hit.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch", clientX: 230, clientY: 630 }));
  });
  await page.waitForTimeout(100);
  expect(Math.abs(await prop(page, "#mt2", "x"))).toBeLessThan(0.5);
  await page.evaluate(() => {
    (window as any).t();
    document.documentElement.dataset.motion = "reduced";
    (window as any).t = (window as any).P.momentumHover(document.getElementById("mom"));
  });
  await page.mouse.move(60, 610);
  await page.mouse.move(300, 610, { steps: 4 });
  await page.waitForTimeout(200);
  expect(await style(page, "#mt1")).toBe("display: block; width: 60px; height: 60px; background: rgb(255, 153, 153);");
});

test("image trail spawns hidden images along the path, caps them, removes them, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    const w = window as any;
    const images = [...document.querySelectorAll("#timgs img")];
    w.t = w.P.imageTrail(document.getElementById("trail"), document.getElementById("tlayer"), images, { spacing: 30, max: 3, life: 0.6 });
  });
  await page.mouse.move(660, 280);
  await page.mouse.move(940, 280, { steps: 20 });
  const images = await page.$$eval("#tlayer img", (els) => els.map((el) => [el.getAttribute("alt"), el.getAttribute("aria-hidden"), el.id]));
  expect(images.length).toBeGreaterThan(0);
  expect(images.length).toBeLessThanOrEqual(3);
  expect(images.every(([alt, hidden, id]) => alt === "" && hidden === "true" && id === "")).toBe(true);
  await expect.poll(() => page.$$eval("#tlayer img", (els) => els.length)).toBe(0);
  await page.mouse.move(660, 300, { steps: 20 });
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$$eval("#tlayer img", (els) => els.length)).toBe(0);
  expect(await page.$$eval("#timgs img", (els) => els.length)).toBe(2);
});

test("image trail ignores touch and reduced motion", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.t = w.P.imageTrail(document.getElementById("trail"), document.getElementById("tlayer"), [...document.querySelectorAll("#timgs img")], { spacing: 5 });
    const area = document.getElementById("trail")!;
    for (let x = 660; x < 900; x += 20) area.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: x, clientY: 280, bubbles: true }));
  });
  expect(await page.$$eval("#tlayer img", (els) => els.length)).toBe(0);
  await page.evaluate(() => {
    const w = window as any;
    w.t();
    document.documentElement.dataset.motion = "reduced";
    w.t = w.P.imageTrail(document.getElementById("trail"), document.getElementById("tlayer"), [...document.querySelectorAll("#timgs img")], { spacing: 5 });
  });
  await page.mouse.move(660, 280);
  await page.mouse.move(900, 280, { steps: 10 });
  expect(await page.$$eval("#tlayer img", (els) => els.length)).toBe(0);
});

test("cursor label scrolls the hovered text in place of the dot, hides on leave, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.t = w.P.cursorFollower(document.getElementById("cur"), { label: document.getElementById("clabel") });
  });
  await page.mouse.move(300, 350, { steps: 3 });
  await page.mouse.move(850, 40, { steps: 5 });
  await page.waitForTimeout(400);
  expect(await page.$eval("#cur", (el) => (el as HTMLElement).dataset.cursorState)).toBe("label");
  expect(await page.$eval("#clabel", (el) => getComputedStyle(el).visibility)).toBe("visible");
  expect(await page.$$eval("#ctrack span", (els) => els.map((el) => el.textContent!.startsWith("View project")))).toEqual([true, true]);
  const x1 = await prop(page, "#ctrack", "x");
  await page.waitForTimeout(300);
  expect(await prop(page, "#ctrack", "x")).toBeLessThan(x1);
  await page.mouse.move(300, 350, { steps: 5 });
  await page.waitForTimeout(400);
  expect(await page.$eval("#clabel", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$eval("#ctrack", (el) => el.childNodes.length)).toBe(0);
  expect(await style(page, "#ctrack")).toBe("");
  expect(await declarations(page, "#clabel")).toEqual(
    await declared(page, "position:fixed;left:0;top:0;width:9em;overflow:hidden;white-space:nowrap;visibility:hidden;pointer-events:none"),
  );
});

// Proximity row: #p1..#p4 hit areas centered at x 420, 480, 540, 600 and y 640; #pt1..#pt4 scale inside them.
const PT = "display: block; width: 40px; height: 40px; background: rgb(153, 153, 255); transform-origin: 50% 100%;";

test("proximity swells items by distance, lifts them, settles away, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.proximity(document.getElementById("prox"), { radius: 100, lift: 10 })));
  await page.mouse.move(300, 640);
  await page.mouse.move(420, 640, { steps: 4 });
  await expect.poll(() => prop(page, "#pt1", "scale")).toBeGreaterThan(1.55);
  const near = await prop(page, "#pt2", "scale");
  // 60px away: part of the peak. 180px away: outside the radius.
  expect(near).toBeGreaterThan(1.05);
  expect(near).toBeLessThan(1.5);
  expect(await prop(page, "#pt4", "scale")).toBe(1);
  await expect.poll(() => prop(page, "#pt1", "y")).toBeLessThan(-9);
  // Hit areas stay put.
  expect(await style(page, "#p1")).toBe("display:block;width:40px;height:40px");

  await page.mouse.move(420, 300, { steps: 4 });
  await expect.poll(() => prop(page, "#pt1", "scale")).toBeCloseTo(1, 2);
  await expect.poll(() => prop(page, "#pt1", "y")).toBeCloseTo(0, 1);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await style(page, "#pt1")).toBe(PT);
  expect(await style(page, "#pt2")).toBe(PT);
});

test("proximity along one axis ignores the other, and scales an item without a target child", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => {
    const w = window as any;
    w.row = w.P.proximity(document.getElementById("prox"), { radius: 100, axis: "x" });
    w.self = w.P.proximity(document.getElementById("proxself"), { radius: 100 });
  });
  // 60px below the row's centers: full size along x only.
  await page.mouse.move(420, 690, { steps: 4 });
  await expect.poll(() => prop(page, "#pt1", "scale")).toBeGreaterThan(1.55);
  await page.mouse.move(720, 640, { steps: 4 });
  await expect.poll(() => prop(page, "#ps1", "scale")).toBeGreaterThan(1.55);
  await page.evaluate(() => {
    (window as any).row();
    (window as any).self();
  });
  expect(await style(page, "#ps1")).toBe("display: block; width: 40px; height: 40px; background: rgb(255, 204, 153); opacity: 0.9;");
  expect(await style(page, "#pt1")).toBe(PT);
});

test("proximity rests when the mouse leaves the window, and ignores touch and reduced motion", async ({ open }) => {
  const page = await open("pointer-effects");
  await page.evaluate(() => ((window as any).t = (window as any).P.proximity(document.getElementById("prox"), { radius: 100 })));
  await page.mouse.move(300, 640);
  await page.mouse.move(420, 640, { steps: 4 });
  await expect.poll(() => prop(page, "#pt1", "scale")).toBeGreaterThan(1.55);
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerout", { pointerType: "mouse", bubbles: true })));
  await expect.poll(() => prop(page, "#pt1", "scale")).toBeCloseTo(1, 2);

  await page.evaluate(() => {
    const w = window as any;
    w.t();
    w.t = w.P.proximity(document.getElementById("prox"), { radius: 100 });
    document.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", clientX: 480, clientY: 640 }));
  });
  await page.waitForTimeout(400);
  expect(await style(page, "#pt2")).toBe(PT);

  await page.evaluate(() => {
    const w = window as any;
    w.t();
    document.documentElement.dataset.motion = "reduced";
    w.t = w.P.proximity(document.getElementById("prox"), { radius: 100 });
  });
  await page.mouse.move(540, 640, { steps: 4 });
  await page.waitForTimeout(400);
  expect(await style(page, "#pt3")).toBe(PT);
});

test("a proximity setup that throws rolls back and rethrows", async ({ open }) => {
  const page = await open("pointer-effects");
  const result = await page.evaluate(() => {
    const w = window as any;
    try {
      w.P.proximity(document.getElementById("prox"), { items: "a[[" });
      return "no throw";
    } catch (error) {
      return `${(error as Error).name}|${!!w.gsap.context()}`;
    }
  });
  expect(result).toBe("SyntaxError|false");
  expect(await declarations(page, "#pt1")).toEqual(await declared(page, PT));
});
