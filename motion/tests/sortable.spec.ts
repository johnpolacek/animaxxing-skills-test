import { test, expect, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/sortable.md

const order = (page: import("@playwright/test").Page) => page.$$eval("#list > li", (els) => els.map((el) => el.id).join(""));
const status = (page: import("@playwright/test").Page) => page.$eval("#list + [role=status]", (el) => el.textContent);

test("dragging a handle opens a slot, drops into it, reports the order, and clears every transform", async ({ open }) => {
  const page = await open("sortable");
  await page.evaluate(() => {
    (window as any).calls = [];
    (window as any).s = (window as any).SR.sortable(document.getElementById("list"), { onReorder: (items: HTMLElement[], from: number, to: number) => (window as any).calls.push([items.map((i) => i.id).join(""), from, to]) });
  });
  // Handle a sits at y 40 to 80; items are 50px apart.
  await page.mouse.move(60, 60);
  await page.mouse.down();
  await page.mouse.move(60, 90, { steps: 4 });
  await page.mouse.move(60, 175, { steps: 8 });
  // Mid-drag: b and c have slid up a slot to make room.
  await expect.poll(() => page.evaluate(() => Number((window as any).gsap.getProperty("#b", "y")))).toBeCloseTo(-50, 0);
  await expect.poll(() => page.evaluate(() => Number((window as any).gsap.getProperty("#c", "y")))).toBeCloseTo(-50, 0);
  expect(await page.evaluate(() => Number((window as any).gsap.getProperty("#d", "y")))).toBe(0);
  await page.mouse.up();
  await expect.poll(() => order(page)).toBe("bcad");
  expect(await page.evaluate(() => (window as any).calls)).toEqual([["bcad", 0, 2]]);
  await expect.poll(() => page.$$eval("#list > li", (els) => els.map((el) => Number((window as any).gsap.getProperty(el, "y"))))).toEqual([0, 0, 0, 0]);
  expect(await status(page)).toBe("Alpha moved to position 3 of 4.");
  await page.evaluate(() => {
    (window as any).s.revert();
    (window as any).s.revert();
  });
  expect(await page.$("#list + [role=status]")).toBeNull();
  expect(await declarations(page, "#a")).toEqual(await declared(page, "color: rgb(1, 2, 3)"));
  for (const id of ["b", "c", "d", "ha", "hb"]) expect(await page.$eval(`#${id}`, (el) => el.getAttribute("style")), id).toBeNull();
  expect(await order(page)).toBe("bcad");
});

test("the keyboard picks up, moves, drops, and announces each step", async ({ open }) => {
  const page = await open("sortable");
  await page.evaluate(() => {
    (window as any).calls = 0;
    (window as any).s = (window as any).SR.sortable(document.getElementById("list"), { onReorder: () => (window as any).calls++ });
  });
  await page.focus("#hb");
  await page.keyboard.press("Space");
  expect(await status(page)).toBe("Picked up Bravo, position 2 of 4.");
  expect(await page.$eval("#hb", (el) => el.getAttribute("aria-pressed"))).toBe("true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await order(page)).toBe("acdb");
  expect(await status(page)).toBe("Moved to position 4 of 4.");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("hb");
  // Past the end does nothing.
  await page.keyboard.press("ArrowDown");
  expect(await order(page)).toBe("acdb");
  await page.keyboard.press("Space");
  expect(await status(page)).toBe("Dropped Bravo at position 4 of 4.");
  expect(await page.$eval("#hb", (el) => el.getAttribute("aria-pressed"))).toBe("false");
  expect(await page.evaluate(() => (window as any).calls)).toBe(2);
  await page.evaluate(() => (window as any).s.revert());
  expect(await page.$eval("#hb", (el) => el.getAttribute("aria-pressed"))).toBeNull();
});

test("Escape puts a held item back where it started", async ({ open }) => {
  const page = await open("sortable");
  await page.evaluate(() => ((window as any).s = (window as any).SR.sortable(document.getElementById("list"))));
  await page.focus("#hc");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(await order(page)).toBe("cabd");
  await page.keyboard.press("Escape");
  expect(await order(page)).toBe("abcd");
  expect(await status(page)).toBe("Cancelled. Charlie is back at position 3 of 4.");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("hc");
  await page.evaluate(() => (window as any).s.revert());
});

test("under reduced motion the list still sorts, with no lift and no slide", async ({ open }) => {
  const page = await open("sortable");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).s = (window as any).SR.sortable(document.getElementById("list"));
  });
  await page.focus("#ha");
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => Number((window as any).gsap.getProperty("#a", "scale")))).toBe(1);
  await page.keyboard.press("ArrowDown");
  expect(await order(page)).toBe("bacd");
  await page.waitForTimeout(30);
  expect(await page.$$eval("#list > li", (els) => els.map((el) => Number((window as any).gsap.getProperty(el, "y"))))).toEqual([0, 0, 0, 0]);
  await page.keyboard.press("Space");
  await page.evaluate(() => (window as any).s.revert());
});

test("grab item drags a row from its name, not only its handle, and restores the row's style", async ({ open }) => {
  const page = await open("sortable");
  const before = await page.$eval("#a", (el) => el.getAttribute("style"));
  await page.evaluate(() => ((window as any).s = (window as any).SR.sortable(document.getElementById("list"), { grab: "item" })));
  const name = await page.$eval("#a [data-sortable-name]", (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(name.x, name.y);
  await page.mouse.down();
  await page.mouse.move(name.x, name.y + 30, { steps: 4 });
  await page.mouse.move(name.x, name.y + 115, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => order(page)).toBe("bcad");
  await page.evaluate(() => (window as any).s.revert());
  expect(await page.$eval("#a", (el) => el.getAttribute("style"))).toBe(before);
});
