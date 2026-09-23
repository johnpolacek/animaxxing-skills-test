import type { Page } from "@playwright/test";
import { test, expect, style, prop } from "./fixture";

// Recipes: particle-field.md and particle-effects.md

const EFFECTS = ["marquee", "reactor", "resolve", "slipstream", "ignite"];

/** Attaches an effect with its canvas offset by the bleed, recording hover changes. */
async function attach(page: Page, effect: string) {
  await page.evaluate((name) => {
    const { A, FX } = window as any;
    const definition = FX[name];
    const canvas = document.getElementById("cv") as HTMLCanvasElement;
    canvas.style.left = canvas.style.top = `${-definition.bleed}px`;
    (window as any).hot = [] as boolean[];
    const spy = {
      ...definition,
      create(field: unknown, target: HTMLElement) {
        const instance = definition.create(field, target);
        return { ...instance, hover: (on: boolean) => ((window as any).hot.push(on), instance.hover(on)) };
      },
    };
    (window as any).fx = A.attachParticleEffect(document.getElementById("wrap"), canvas, document.getElementById("btn"), spy);
  }, effect);
}

/** Count of painted canvas pixels. */
const painted = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById("cv") as HTMLCanvasElement;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
    return count;
  });

for (const effect of EFFECTS) {
  test(`${effect}: enters, idles, blasts, exits, and stops drawing after destroy`, async ({ open }) => {
    const page = await open("particles");
    await attach(page, effect);
    await page.evaluate(() => (window as any).fx.enter(0));
    await page.waitForTimeout(2500);
    expect(await painted(page)).toBeGreaterThan(0);
    expect(await page.$eval("#btn", (el) => getComputedStyle(el).visibility)).toBe("visible");

    await page.evaluate(() => (window as any).fx.blast());
    await page.waitForTimeout(300);
    expect(await painted(page)).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).fx.idle());
    await page.evaluate(() => (window as any).fx.exit());
    await page.waitForTimeout(400);
    expect(await page.$eval("#btn", (el) => getComputedStyle(el).visibility)).toBe("hidden");

    await page.evaluate(() => (window as any).fx.destroy());
    const after = await painted(page);
    await page.waitForTimeout(300);
    expect(await painted(page)).toBe(after);
    // The target's inline styles are back to their state before attachment.
    expect(await style(page, "#btn")).toBe("");
  });

  test(`${effect}: a blast during the entrance leaves no particle alive, and idle lands the target`, async ({ open }) => {
    const page = await open("particles");
    await attach(page, effect);
    await page.evaluate(() => (window as any).fx.enter(0));
    await page.waitForTimeout(250);
    await page.evaluate(() => (window as any).fx.blast());
    await page.waitForTimeout(2000);
    expect(await painted(page)).toBe(0);

    await page.evaluate(() => (window as any).fx.idle());
    expect(await page.$eval("#btn", (el) => [getComputedStyle(el).visibility, getComputedStyle(el).opacity, getComputedStyle(el).clipPath])).toEqual(["visible", "1", "none"]);
    expect(await prop(page, "#btn", "scale")).toBe(1);
    expect(await prop(page, "#btn", "x")).toBe(0);
    await page.evaluate(() => (window as any).fx.destroy());
  });
}

test("an exit during the entrance leaves no particle alive", async ({ open }) => {
  const page = await open("particles");
  await attach(page, "resolve");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(250);
  await page.evaluate(() => (window as any).fx.exit());
  await page.waitForTimeout(1500);
  expect(await painted(page)).toBe(0);
  expect(await page.$eval("#btn", (el) => getComputedStyle(el).visibility)).toBe("hidden");
  await page.evaluate(() => (window as any).fx.destroy());
});

test("destroy is final, even for a blast's delayed echoes", async ({ open }) => {
  const page = await open("particles");
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    (window as any).fx.blast();
    (window as any).fx.destroy();
  });
  await page.waitForTimeout(400);
  expect(await painted(page)).toBe(0);
  expect(await style(page, "#btn")).toBe("");
});

test("pause holds the particles still, and play resumes them", async ({ open }) => {
  const page = await open("particles");
  const frame = () => page.evaluate(() => (document.getElementById("cv") as HTMLCanvasElement).toDataURL());
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as any).fx.pause());
  await page.waitForTimeout(100);
  const held = await frame();
  expect(await painted(page)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  expect(await frame()).toBe(held);
  await page.evaluate(() => (window as any).fx.play());
  await page.waitForTimeout(200);
  expect(await frame()).not.toBe(held);
  await page.evaluate(() => (window as any).fx.destroy());
});

test("theme changes recolor the particles without resizing the canvas", async ({ open }) => {
  const page = await open("particles");
  /** Painted pixels whose colour is mostly `channel`. */
  const tinted = (channel: 0 | 2) =>
    page.evaluate((c) => {
      const canvas = document.getElementById("cv") as HTMLCanvasElement;
      const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 0 && data[i + c]! > 200 && data[i + 1]! < 60) count++;
      return count;
    }, channel);
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(2500);
  const width = await page.$eval("#cv", (el) => (el as HTMLCanvasElement).width);

  await page.evaluate(() => {
    document.body.style.color = "rgb(255, 0, 0)";
    document.documentElement.dataset.theme = "red";
  });
  await page.waitForTimeout(300);
  expect(await tinted(0)).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.head.insertAdjacentHTML("beforeend", "<style>@media (prefers-color-scheme: dark) { body { color: rgb(0, 0, 255) !important } }</style>");
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  expect(await tinted(2)).toBeGreaterThan(0);
  expect(await page.$eval("#cv", (el) => (el as HTMLCanvasElement).width)).toBe(width);
  await page.evaluate(() => (window as any).fx.destroy());
});

test("hover, touch press, and keyboard focus share one hot state", async ({ open }) => {
  const page = await open("particles");
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(2500);
  const hot = () => page.evaluate(() => (window as any).hot as boolean[]);

  await page.mouse.move(300, 244);
  await page.waitForTimeout(50);
  await page.mouse.move(20, 20);
  expect(await hot()).toEqual([true, false]);

  await page.evaluate(() => {
    const btn = document.getElementById("btn")!;
    btn.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true }));
    btn.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true }));
    // A tap focuses the control; that focus stays cold.
    btn.focus();
  });
  expect(await hot()).toEqual([true, false, true, false]);

  // Keyboard input, then focus: the focus ring is keyboard-derived and runs hot.
  await page.evaluate(() => document.getElementById("btn")!.blur());
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.getElementById("btn")!.focus());
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("btn");
  expect(await hot()).toEqual([true, false, true, false, true]);

  // Repeated keys must not repeat bursts.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await hot()).toEqual([true, false, true, false, true]);
  await page.evaluate(() => (window as any).fx.destroy());
});

test("particles stop ticking off screen", async ({ open }) => {
  const page = await open("particles");
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(300);
  const frozen = await page.evaluate(() => (document.getElementById("cv") as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (document.getElementById("cv") as HTMLCanvasElement).toDataURL())).toBe(frozen);
  await page.evaluate(() => (window as any).fx.destroy());
});

test("reduced motion shows the control with no particles and no hot state", async ({ open }) => {
  const page = await open("particles");
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
  await attach(page, "reactor");
  await page.evaluate(() => (window as any).fx.enter(0));
  await page.mouse.move(300, 244);
  await page.waitForTimeout(500);
  expect(await page.$eval("#btn", (el) => getComputedStyle(el).visibility)).toBe("visible");
  expect(await painted(page)).toBe(0);
  expect(await page.evaluate(() => (window as any).hot)).toEqual([]);
  await page.evaluate(() => (window as any).fx.destroy());
});
