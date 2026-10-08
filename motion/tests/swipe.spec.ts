import { test, expect, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/pointer-effects.md (swipeDismiss)

const x = (page: import("@playwright/test").Page, id: string) => page.evaluate((s) => Number((window as any).gsap.getProperty(`#${s}`, "x")), id);
const top = (page: import("@playwright/test").Page, id: string) => page.$eval(`#${id}`, (el) => el.getBoundingClientRect().top);

test("a short drag springs back; a long one dismisses, closes the gap, and reports the item", async ({ open }) => {
  const page = await open("swipe");
  await page.evaluate(() => {
    (window as any).gone = [];
    (window as any).s = (window as any).P.swipeDismiss(document.getElementById("n1"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
  });
  // n1: x 40 to 460, y 40 to 90.
  await page.mouse.move(100, 65);
  await page.mouse.down();
  await page.mouse.move(160, 65, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect.poll(() => x(page, "n1")).toBeCloseTo(0, 0);
  expect(await page.evaluate(() => (window as any).gone)).toEqual([]);
  const below = await top(page, "n2");
  await page.mouse.move(100, 65);
  await page.mouse.down();
  await page.mouse.move(330, 65, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).gone)).toEqual(["n1"]);
  expect(await page.$eval("#n1", (el) => getComputedStyle(el).display)).toBe("none");
  // n2 slides up into n1's place.
  await expect.poll(() => top(page, "n2")).toBeCloseTo(below - 60, 0);
  await page.evaluate(() => {
    (window as any).s.revert();
    (window as any).s.revert();
  });
  expect(await declarations(page, "#n1")).toEqual(await declared(page, "color: rgb(1, 2, 3)"));
  expect(await page.$eval("#n2", (el) => el.getAttribute("style"))).toBeNull();
});

test("a fast drag that stops before release springs back instead of flicking", async ({ open }) => {
  const page = await open("swipe");
  await page.evaluate(() => {
    (window as any).gone = [];
    (window as any).s = (window as any).P.swipeDismiss(document.getElementById("n2"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
  });
  await page.mouse.move(100, 125);
  await page.mouse.down();
  await page.mouse.move(180, 125, { steps: 2 });
  // Held still well past the flick window, then released short of the threshold.
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect.poll(() => x(page, "n2")).toBeCloseTo(0, 0);
  expect(await page.evaluate(() => (window as any).gone)).toEqual([]);
  await page.evaluate(() => (window as any).s.revert());
});

test("a quick flick dismisses even when short", async ({ open }) => {
  const page = await open("swipe");
  await page.evaluate(() => {
    (window as any).gone = [];
    (window as any).s = (window as any).P.swipeDismiss(document.getElementById("n2"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
  });
  await page.mouse.move(100, 125);
  await page.mouse.down();
  await page.mouse.move(110, 125);
  await page.mouse.move(200, 125, { steps: 2 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).gone)).toEqual(["n2"]);
  await page.evaluate(() => (window as any).s.revert());
});

test("the dismiss button and the Delete key dismiss from the keyboard", async ({ open }) => {
  const page = await open("swipe");
  await page.evaluate(() => {
    (window as any).gone = [];
    const P = (window as any).P;
    (window as any).a = P.swipeDismiss(document.getElementById("n2"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
    (window as any).b = P.swipeDismiss(document.getElementById("n3"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
  });
  await page.focus("#n2 button");
  await page.keyboard.press("Enter");
  await page.focus("#n3");
  await page.keyboard.press("Delete");
  await expect.poll(() => page.evaluate(() => (window as any).gone)).toEqual(["n2", "n3"]);
  await page.evaluate(() => ((window as any).a.revert(), (window as any).b.revert()));
});

test("a vertical touch swipe is left to the page, and reduced motion dismisses at once", async ({ open }) => {
  const page = await open("swipe");
  const touchAction = await page.evaluate(() => {
    const s = (window as any).P.swipeDismiss(document.getElementById("n1"));
    const value = getComputedStyle(document.getElementById("n1")!).touchAction;
    s.revert();
    return value;
  });
  expect(touchAction).toContain("pan-y");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).gone = [];
    (window as any).s = (window as any).P.swipeDismiss(document.getElementById("n1"), { onDismiss: (el: HTMLElement) => (window as any).gone.push(el.id) });
    (window as any).s.dismiss(-1);
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => (window as any).gone)).toEqual(["n1"]);
  await page.evaluate(() => (window as any).s.revert());
  expect(await page.$eval("#n1", (el) => getComputedStyle(el).display)).toBe("flex");
});

test("tilt leans with the drag, shows the label for that side, flings off turning, and reverts", async ({ open }) => {
  const page = await open("swipe");
  const before = await declarations(page, "#n3");
  await page.evaluate(() => ((window as any).s = (window as any).P.swipeDismiss(document.getElementById("n3"), { look: "tilt" })));
  // n3: y 160 to 210.
  await page.mouse.move(100, 185);
  await page.mouse.down();
  await page.mouse.move(200, 185, { steps: 10 });
  const mid = await page.evaluate(() => ({
    rotation: Number((window as any).gsap.getProperty("#n3", "rotation")),
    keep: Number(getComputedStyle(document.getElementById("keep")!).opacity),
    toss: Number(getComputedStyle(document.getElementById("toss")!).opacity),
  }));
  expect(mid.rotation).toBeGreaterThan(1);
  expect(mid.keep).toBeGreaterThan(0.3);
  expect(mid.toss).toBe(0);
  await page.mouse.move(330, 185, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect.poll(() => page.$eval("#n3", (el) => getComputedStyle(el).display)).toBe("none");
  await page.evaluate(() => (window as any).s.revert());
  expect(await declarations(page, "#n3")).toEqual(before);
  expect(await page.$$eval("[data-swipe-label]", (els) => els.map((e) => e.getAttribute("style") ?? ""))).toEqual(["", ""]);
});

test("fold folds the item away from its top edge, then closes the gap", async ({ open }) => {
  const page = await open("swipe");
  const result = await page.evaluate(() => new Promise<{ mid: number; gone: string[] }>((done) => {
    const w = window as any;
    const gone: string[] = [];
    const s = w.P.swipeDismiss(document.getElementById("n1"), { look: "fold", onDismiss: (el: HTMLElement) => gone.push(el.id) });
    s.dismiss(1);
    setTimeout(() => {
      const mid = Number(w.gsap.getProperty("#n1", "rotationX"));
      setTimeout(() => done({ mid, gone }), 500);
    }, 150);
  }));
  expect(result.mid).toBeLessThan(-10);
  expect(result.gone).toEqual(["n1"]);
});
