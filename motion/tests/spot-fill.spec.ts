import { test, expect, style } from "./fixture";

// Recipes: animaxxing/references/recipes/pointer-effects.md (spotlight) and hover-effects.md (directionalFill)

const clip = (page: import("@playwright/test").Page, id: string) => page.$eval(`#${id}`, (el) => (el as HTMLElement).style.clipPath);
const radius = async (page: import("@playwright/test").Page) => {
  const value = await clip(page, "reveal");
  return Number(value.match(/circle\(([\d.]+)px/)?.[1] ?? 0);
};
const center = async (page: import("@playwright/test").Page) => {
  const value = await clip(page, "reveal");
  const m = value.match(/at ([\d.]+)px ([\d.]+)px/);
  return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
};

test("spotlight grows under the mouse, follows it, shrinks on leave, and restores the layer", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => ((window as any).t = (window as any).PE.spotlight(document.getElementById("spot"), document.getElementById("reveal"), { radius: 80, follow: 0.1 })));
  expect(await radius(page)).toBe(0);
  await page.mouse.move(700, 600);
  await page.mouse.move(140, 100);
  await expect.poll(() => radius(page)).toBeGreaterThan(79);
  await page.mouse.move(300, 200, { steps: 4 });
  await expect.poll(async () => (await center(page))[0]).toBeCloseTo(260, -1);
  expect((await center(page))[1]).toBeCloseTo(160, -1);
  await page.mouse.move(700, 600);
  await expect.poll(() => radius(page)).toBe(0);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await style(page, "#reveal")).toBe("color: rgb(0, 0, 0);");
});

test("spotlight opens the whole layer on keyboard focus and closes on blur", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => ((window as any).t = (window as any).PE.spotlight(document.getElementById("spot"), document.getElementById("reveal"))));
  await page.keyboard.press("Tab");
  await expect.poll(() => radius(page)).toBeGreaterThan(Math.hypot(400, 240) / 2);
  expect(await center(page)).toEqual([200, 120]);
  await page.keyboard.press("Tab");
  await expect.poll(() => radius(page)).toBe(0);
  await page.evaluate(() => (window as any).t());
});

test("spotlight opens under a held touch and closes when it lifts or cancels", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => ((window as any).t = (window as any).PE.spotlight(document.getElementById("spot"), document.getElementById("reveal"), { radius: 60 })));
  const fire = (type: string, x: number, y: number) =>
    page.evaluate(([t, cx, cy]) => {
      document.getElementById("spot")!.dispatchEvent(new PointerEvent(t as string, { pointerType: "touch", clientX: cx as number, clientY: cy as number, bubbles: true }));
    }, [type, x, y] as const);
  await fire("pointerdown", 100, 80);
  await expect.poll(() => radius(page)).toBeGreaterThan(59);
  expect(await center(page)).toEqual([60, 40]);
  await fire("pointercancel", 100, 80);
  await expect.poll(() => radius(page)).toBe(0);
  // A touch never opens it through hover events.
  await fire("pointerenter", 100, 80);
  await page.waitForTimeout(300);
  expect(await radius(page)).toBe(0);
  await page.evaluate(() => (window as any).t());
});

test("spotlight under reduced motion jumps to the pointer with no easing", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).t = (window as any).PE.spotlight(document.getElementById("spot"), document.getElementById("reveal"), { radius: 50 });
  });
  await page.mouse.move(700, 600);
  await page.mouse.move(140, 100);
  await page.waitForTimeout(50);
  expect(await radius(page)).toBe(50);
  await page.mouse.move(340, 200);
  await page.waitForTimeout(50);
  expect(await center(page)).toEqual([300, 160]);
  await page.evaluate(() => (window as any).t());
});

const fillEdge = (value: string) => {
  const [t, r, b, l] = (value.match(/inset\(([^)]*)\)/)?.[1] ?? "").split(/\s+/).map(parseFloat);
  return { t, r: r ?? t, b: b ?? t, l: l ?? r ?? t };
};

test("directionalFill enters from the edge the mouse crossed and leaves by the exit edge", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => ((window as any).t = (window as any).HE.directionalFill(document.getElementById("tile"), document.getElementById("fill"), { duration: 2 })));
  // Tile: x 520 to 820, y 40 to 160. Enter through the left edge.
  await page.mouse.move(480, 100);
  await page.mouse.move(530, 100);
  await page.waitForTimeout(120);
  const entering = fillEdge(await clip(page, "fill"));
  expect(entering.r).toBeGreaterThan(5);
  expect(entering.l).toBe(0);
  await expect.poll(() => clip(page, "fill"), { timeout: 4000 }).toMatch(/inset\(0(%|px)?\)/);
  // Leave through the bottom edge: it collapses downward.
  await page.mouse.move(670, 150);
  await page.mouse.move(670, 200);
  await page.waitForTimeout(100);
  // power2.in starts slow: the top inset grows while the other sides stay open.
  await expect.poll(async () => fillEdge(await clip(page, "fill")).t).toBeGreaterThan(1);
  const leaving = fillEdge(await clip(page, "fill"));
  expect(leaving.b).toBe(0);
  expect(leaving.l).toBe(0);
  expect(leaving.r).toBe(0);
  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await style(page, "#fill")).toBe("");
});

test("directionalFill fills from focusFrom on keyboard focus, and a tap clears when lifted", async ({ open }) => {
  const page = await open("spot-fill");
  await page.evaluate(() => ((window as any).t = (window as any).HE.directionalFill(document.getElementById("tile"), document.getElementById("fill"), { duration: 0.2, focusFrom: "left" })));
  await page.focus("#spot");
  await page.keyboard.press("Tab");
  await expect.poll(() => clip(page, "fill")).toMatch(/inset\(0(%|px)?\)/);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(80);
  expect(fillEdge(await clip(page, "fill")).r).toBeGreaterThan(5);
  await expect.poll(async () => fillEdge(await clip(page, "fill")).r).toBe(100);
  const tap = (type: string) =>
    page.evaluate((t) => {
      document.getElementById("tile")!.dispatchEvent(new PointerEvent(t, { pointerType: "touch", clientX: 670, clientY: 45, bubbles: true }));
    }, type);
  await tap("pointerdown");
  await expect.poll(() => clip(page, "fill")).toMatch(/inset\(0(%|px)?\)/);
  await tap("pointerup");
  await expect.poll(async () => fillEdge(await clip(page, "fill")).b).toBe(100);
  await page.evaluate(() => (window as any).t());
});
