import type { Page } from "@playwright/test";
import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/pointer-effects.md, the `touch` option.
// Real touch input through the DevTools protocol, so the browser's own implicit capture and
// touch-action apply, as they do on a phone.
test.use({ hasTouch: true });

async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, x?: number, y?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y: y! }] } as never);
  return {
    down: (x: number, y: number) => send("touchStart", x, y),
    move: async (x: number, y: number, steps = 6) => {
      for (let i = 1; i <= steps; i++) await send("touchMove", x, y);
    },
    up: () => send("touchEnd"),
    path: async (points: Array<[number, number]>) => {
      for (const [x, y] of points) {
        await send("touchMove", x, y);
        await page.waitForTimeout(16);
      }
    },
  };
}

test("magnetic with touch follows a held finger, settles on lift, claims the touch, and restores", async ({ open }) => {
  const page = await open("pointer-effects");
  const box = (await page.locator("#mag").boundingBox())!;
  await page.evaluate(() => ((window as any).t = (window as any).P.magnetic(document.getElementById("mag"), { touch: true })));
  expect(await page.$eval("#mag", (el) => (el as HTMLElement).style.touchAction)).toBe("none");
  const f = await finger(page);
  await f.down(box.x + box.width / 2, box.y + box.height / 2);
  await f.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  expect(await prop(page, "#mag", "x")).toBeGreaterThan(2);
  await f.up();
  await page.waitForTimeout(900);
  expect(Math.abs(await prop(page, "#mag", "x"))).toBeLessThan(0.5);
  await page.evaluate(() => (window as any).t());
  expect(await style(page, "#mag")).toBe("");
});

test("tilt with touch leans under a dragged finger and rests on lift", async ({ open }) => {
  const page = await open("pointer-effects");
  const box = (await page.locator("#card").boundingBox())!;
  await page.evaluate(() => ((window as any).t = (window as any).P.tilt(document.getElementById("card"), { touch: true })));
  const f = await finger(page);
  await f.down(box.x + box.width / 2, box.y + box.height / 2);
  await f.move(box.x + box.width - 1, box.y + 1);
  await page.waitForTimeout(600);
  expect(Math.abs(await prop(page, "#card", "rotationY"))).toBeGreaterThan(2);
  await f.up();
  await page.waitForTimeout(900);
  expect(Math.abs(await prop(page, "#card", "rotationY"))).toBeLessThan(0.3);
  await page.evaluate(() => (window as any).t());
});

test("proximity with touch swells items under a sliding finger and rests every item on lift", async ({ open }) => {
  const page = await open("pointer-effects");
  const p2 = (await page.locator("#p2").boundingBox())!;
  await page.evaluate(() => ((window as any).t = (window as any).P.proximity(document.getElementById("prox"), { touch: true })));
  const f = await finger(page);
  await f.down(p2.x + 20, p2.y + 20);
  await f.path([[p2.x + 22, p2.y + 20], [p2.x + 24, p2.y + 20]]);
  await page.waitForTimeout(500);
  expect(await prop(page, "#pt2", "scaleX")).toBeGreaterThan(1.3);
  await f.up();
  await page.waitForTimeout(600);
  expect(await prop(page, "#pt2", "scaleX")).toBeCloseTo(1, 1);
  await page.evaluate(() => (window as any).t());
  expect(await page.$eval("#prox", (el) => (el as HTMLElement).style.touchAction)).toBe("");
});

test("image trail with touch leaves images along a dragged finger", async ({ open }) => {
  const page = await open("pointer-effects");
  const box = (await page.locator("#trail").boundingBox())!;
  await page.evaluate(() => {
    const w = window as any;
    w.t = w.P.imageTrail(document.getElementById("trail"), document.getElementById("tlayer"), Array.from(document.querySelectorAll("#timgs img")), { spacing: 30, touch: true });
  });
  const f = await finger(page);
  await f.down(box.x + 10, box.y + 100);
  await f.path(Array.from({ length: 12 }, (_, i) => [box.x + 10 + i * 20, box.y + 100] as [number, number]));
  expect(await page.$eval("#tlayer", (el) => el.children.length)).toBeGreaterThan(2);
  await f.up();
  await page.evaluate(() => (window as any).t());
  expect(await page.$eval("#tlayer", (el) => el.children.length)).toBe(0);
});

test("cursor follower with a touch area shows under a held finger and hides on lift", async ({ open }) => {
  const page = await open("pointer-effects");
  const box = (await page.locator("#trail").boundingBox())!;
  await page.evaluate(() => ((window as any).t = (window as any).P.cursorFollower(document.getElementById("cur"), { touch: document.getElementById("trail") })));
  const f = await finger(page);
  await f.down(box.x + 50, box.y + 50);
  await f.path([[box.x + 80, box.y + 60], [box.x + 120, box.y + 70]]);
  await page.waitForTimeout(400);
  expect(await page.$eval("#cur", (el) => getComputedStyle(el).visibility)).toBe("visible");
  expect(await prop(page, "#cur", "x")).toBeGreaterThan(box.x + 60);
  await f.up();
  await page.waitForTimeout(100);
  expect(await page.$eval("#cur", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  await page.evaluate(() => (window as any).t());
});
