import type { Page } from "@playwright/test";
import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/hover-effects.md

const box = (page: Page, selector: string) =>
  page.$eval(selector, (el) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

const activeTweens = (page: Page, selector: string) =>
  page.evaluate(
    (s) => (window as any).gsap.getTweensOf(document.querySelector(s)).filter((tween: any) => tween.isActive()).length,
    selector,
  );

/** Horizontal transform origin of the underline, in px: 0 at the left edge, the link's width at the right. */
const origin = (page: Page) => page.$eval("#link [data-underline]", (el) => parseFloat(getComputedStyle(el).transformOrigin));

/** An empty corner of the page, away from every control. */
const leave = (page: Page) => page.mouse.move(50, 650);

test("textRoll rolls the label on hover, keeps the name and box, and restores the markup", async ({ open }) => {
  const page = await open("hover-effects");
  const before = { roll: await box(page, "#roll"), roll2: await box(page, "#roll2"), html: await page.$eval("#roll", (el) => el.innerHTML) };
  await page.evaluate(() => {
    const { HE } = window as any;
    (window as any).t = [HE.textRoll(document.getElementById("roll")), HE.textRoll(document.getElementById("roll2"))];
  });
  expect(await box(page, "#roll")).toEqual(before.roll);
  expect(await box(page, "#roll2")).toEqual(before.roll2);
  await expect(page.locator("#roll")).toHaveAccessibleName("Start now");
  await expect(page.locator("#roll2")).toHaveAccessibleName("Play");
  expect(await page.$eval("#roll [data-roll-copy]", (el) => el.getAttribute("aria-hidden"))).toBe("true");
  expect(await page.$$eval("[id='em']", (els) => els.length)).toBe(1);
  // A marked label keeps the icon out of the roll.
  expect(await page.$$eval("#roll2 svg", (els) => els.length)).toBe(1);
  expect(await page.$$eval("#roll2 [data-roll-copy] svg", (els) => els.length)).toBe(0);
  // line-height: 1 sits inside the font's ascent and descent; the mask pads by the difference and gives it back as margin.
  const mask = await page.$eval("#roll [data-roll-mask]", (el) => {
    const computed = getComputedStyle(el);
    return { pad: parseFloat(computed.paddingTop), margin: parseFloat(computed.marginTop) };
  });
  expect(mask.pad).toBeGreaterThan(0);
  expect(mask.margin).toBeCloseTo(-mask.pad, 2);

  await page.hover("#roll");
  await page.waitForTimeout(600);
  expect(await prop(page, "#roll [data-roll-line]", "yPercent")).toBeLessThan(-100);
  expect(Math.abs(await prop(page, "#roll [data-roll-copy]", "yPercent"))).toBeLessThan(0.5);
  expect(await box(page, "#roll")).toEqual(before.roll);

  await leave(page);
  await page.waitForTimeout(600);
  expect(Math.abs(await prop(page, "#roll [data-roll-line]", "yPercent"))).toBeLessThan(0.5);
  expect(await prop(page, "#roll [data-roll-copy]", "yPercent")).toBeGreaterThan(100);

  await page.evaluate(() =>
    (window as any).t.forEach((fn: () => void) => {
      fn();
      fn();
    }),
  );
  expect(await page.$eval("#roll", (el) => el.innerHTML)).toBe(before.html);
  expect(await page.$$eval("[data-roll-mask]", (els) => els.length)).toBe(0);
  expect(await style(page, "#roll")).toBe("");
  expect(await style(page, "#lbl")).toBe("");
});

test("textRoll: rapid enter and leave never stack tweens", async ({ open }) => {
  const page = await open("hover-effects");
  await page.evaluate(() => ((window as any).t = (window as any).HE.textRoll(document.getElementById("roll"))));
  for (let i = 0; i < 3; i++) {
    await page.hover("#roll");
    await page.waitForTimeout(60);
    await leave(page);
    await page.waitForTimeout(60);
  }
  await page.hover("#roll");
  await page.waitForTimeout(60);
  expect(await activeTweens(page, "#roll [data-roll-line]")).toBe(1);
  expect(await activeTweens(page, "#roll [data-roll-copy]")).toBe(1);
  await page.waitForTimeout(600);
  expect(await prop(page, "#roll [data-roll-line]", "yPercent")).toBeLessThan(-100);
  expect(Math.abs(await prop(page, "#roll [data-roll-copy]", "yPercent"))).toBeLessThan(0.5);
  await page.evaluate(() => (window as any).t());
});

test("textRoll answers keyboard focus, not the focus a click leaves behind", async ({ open }) => {
  const page = await open("hover-effects");
  await page.evaluate(() => ((window as any).t = (window as any).HE.textRoll(document.getElementById("roll"))));
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("roll");
  await page.waitForTimeout(600);
  expect(await prop(page, "#roll [data-roll-line]", "yPercent")).toBeLessThan(-100);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);
  expect(Math.abs(await prop(page, "#roll [data-roll-line]", "yPercent"))).toBeLessThan(0.5);

  await page.click("#roll");
  await leave(page);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => [document.activeElement?.id, document.activeElement?.matches(":focus-visible")])).toEqual(["roll", false]);
  expect(Math.abs(await prop(page, "#roll [data-roll-line]", "yPercent"))).toBeLessThan(0.5);
  await page.evaluate(() => (window as any).t());
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("touch and pen never trigger the treatments, and nothing sticks after a tap", async ({ open }) => {
    const page = await open("hover-effects");
    await page.evaluate(() => {
      const { HE } = window as any;
      (window as any).t = [
        HE.textRoll(document.getElementById("roll")),
        HE.underlineSweep(document.getElementById("link")),
        HE.imageZoom(document.getElementById("card")),
      ];
      for (const [id, pointerType] of [["roll", "pen"], ["link", "pen"], ["card", "pen"]]) {
        document.getElementById(id)!.dispatchEvent(new PointerEvent("pointerenter", { pointerType }));
      }
    });
    for (const id of ["#roll", "#link", "#card"]) {
      const rect = await page.$eval(id, (el) => el.getBoundingClientRect().toJSON());
      await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    await page.waitForTimeout(500);
    expect(await prop(page, "#roll [data-roll-line]", "yPercent")).toBe(0);
    expect(await prop(page, "#link [data-underline]", "scaleX")).toBe(0);
    expect(await prop(page, "#img", "scale")).toBe(1);
    await page.evaluate(() => (window as any).t.forEach((fn: () => void) => fn()));
  });
});

test("underlineSweep draws from the left, clears to the right, and restores", async ({ open }) => {
  const page = await open("hover-effects");
  const decoration = await page.$eval("#link", (el) => getComputedStyle(el).textDecorationLine);
  await page.evaluate(() => ((window as any).t = (window as any).HE.underlineSweep(document.getElementById("link"))));
  await expect(page.locator("#link")).toHaveAccessibleName("Work");
  expect(await page.$eval("#link [data-underline]", (el) => el.getAttribute("aria-hidden"))).toBe("true");
  // The app's own underline is left alone unless the app removes it, and a positioned link keeps its position.
  expect(await page.$eval("#link", (el) => getComputedStyle(el).textDecorationLine)).toBe(decoration);
  expect(await style(page, "#link")).toBe("");
  // A static inline link is made relative for the line's lifetime only.
  await page.evaluate(() => ((window as any).t2 = (window as any).HE.underlineSweep(document.getElementById("link2"))));
  expect(await page.$eval("#link2", (el) => getComputedStyle(el).position)).toBe("relative");
  await page.evaluate(() => (window as any).t2());
  expect(await style(page, "#link2")).toBe("");
  expect(await page.$$eval("#link2 [data-underline]", (els) => els.length)).toBe(0);

  await page.hover("#link");
  await page.waitForTimeout(500);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBeCloseTo(1, 3);
  expect(await origin(page)).toBe(0);

  // Re-entering mid-exit grows the line back from where it is; the origin swaps only at rest.
  await leave(page);
  await page.waitForTimeout(120);
  const mid = await prop(page, "#link [data-underline]", "scaleX");
  expect(mid).toBeGreaterThan(0.05);
  expect(mid).toBeLessThan(0.95);
  expect(await origin(page)).toBeGreaterThan(0);
  await page.hover("#link");
  await page.waitForTimeout(60);
  expect(await activeTweens(page, "#link [data-underline]")).toBe(1);
  await page.waitForTimeout(500);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBeCloseTo(1, 3);

  await leave(page);
  await page.waitForTimeout(500);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBeCloseTo(0, 3);
  expect(await origin(page)).toBeGreaterThan(0);

  await page.evaluate(() => document.getElementById("link")!.focus({ focusVisible: true } as FocusOptions));
  await page.waitForTimeout(500);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBeCloseTo(1, 3);
  expect(await origin(page)).toBe(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.waitForTimeout(500);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBeCloseTo(0, 3);

  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$$eval("[data-underline]", (els) => els.length)).toBe(0);
  expect(await style(page, "#link")).toBe("");
});

test("imageZoom scales the image inside its frame on hover and focus, and restores", async ({ open }) => {
  const page = await open("hover-effects");
  await page.evaluate(() => {
    const { HE } = window as any;
    (window as any).t = [HE.imageZoom(document.getElementById("card")), HE.imageZoom(document.getElementById("card2"))];
  });
  // The app's clipped frame is left alone; a frame it left open gets clipping for the effect's lifetime.
  expect(await style(page, "#frame")).toBe("");
  expect(await page.$eval("#frame2", (el) => getComputedStyle(el).overflow)).toBe("clip");

  await page.hover("#card");
  await page.waitForTimeout(800);
  expect(await prop(page, "#img", "scale")).toBeGreaterThan(1.04);
  expect(await box(page, "#frame")).toEqual({ width: 240, height: 160 });
  await leave(page);
  await page.waitForTimeout(800);
  expect(await prop(page, "#img", "scale")).toBeCloseTo(1, 3);

  await page.evaluate(() => document.getElementById("cardlink")!.focus({ focusVisible: true } as FocusOptions));
  await page.waitForTimeout(800);
  expect(await prop(page, "#img", "scale")).toBeGreaterThan(1.04);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.waitForTimeout(800);
  expect(await prop(page, "#img", "scale")).toBeCloseTo(1, 3);

  // Teardown mid-zoom stops the tween and restores.
  await page.hover("#card2");
  await page.waitForTimeout(200);
  expect(await prop(page, "#img2", "scale")).toBeGreaterThan(1.01);
  await page.evaluate(() =>
    (window as any).t.forEach((fn: () => void) => {
      fn();
      fn();
    }),
  );
  expect(await style(page, "#img")).toBe("");
  expect(await style(page, "#img2")).toBe("");
  expect(await style(page, "#frame2")).toBe("");
});

test("reduced motion: no roll or zoom; the underline appears and clears without moving", async ({ open }) => {
  const page = await open("hover-effects");
  const html = await page.$eval("#roll", (el) => el.innerHTML);
  await page.evaluate(() => {
    const { HE } = window as any;
    document.documentElement.dataset.motion = "reduced";
    (window as any).t = [
      HE.textRoll(document.getElementById("roll")),
      HE.imageZoom(document.getElementById("card")),
      HE.underlineSweep(document.getElementById("link")),
    ];
  });
  expect(await page.$eval("#roll", (el) => el.innerHTML)).toBe(html);
  await page.hover("#roll");
  await page.hover("#card");
  await page.waitForTimeout(300);
  expect(await style(page, "#img")).toBe("");

  await page.hover("#link");
  await page.waitForTimeout(50);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBe(1);
  expect(await activeTweens(page, "#link [data-underline]")).toBe(0);
  await leave(page);
  await page.waitForTimeout(50);
  expect(await prop(page, "#link [data-underline]", "scaleX")).toBe(0);
  await page.evaluate(() => (window as any).t.forEach((fn: () => void) => fn()));
  expect(await page.$$eval("[data-underline]", (els) => els.length)).toBe(0);
});

test("a textRoll setup that throws restores the label and rethrows", async ({ open }) => {
  const page = await open("hover-effects");
  const original = await page.$eval("#roll", (el) => el.innerHTML);
  const result = await page.evaluate(() => {
    const control = document.getElementById("roll")!;
    const measure = Element.prototype.getBoundingClientRect;
    // Measuring the injected line fails, so the mask and copy already exist.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this !== control && control.contains(this)) throw new Error("boom");
      return measure.call(this);
    };
    try {
      (window as any).HE.textRoll(control);
      return "no throw";
    } catch (error) {
      // The failed setup must not stay GSAP's current context.
      return `${(error as Error).message}|${!!(window as any).gsap.context()}`;
    } finally {
      Element.prototype.getBoundingClientRect = measure;
    }
  });
  expect(result).toBe("boom|false");
  expect(await page.$eval("#roll", (el) => el.innerHTML)).toBe(original);
  expect(await style(page, "#roll")).toBe("");
  // A clean build follows.
  await page.evaluate(() => (window as any).HE.textRoll(document.getElementById("roll"))());
  expect(await page.$eval("#roll", (el) => el.innerHTML)).toBe(original);
});
