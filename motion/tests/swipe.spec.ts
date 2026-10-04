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
