import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/endless-drag.md

type Page = import("@playwright/test").Page;

// Loop: three 200px items with a 20px gap in an 800px viewport. One set spans 660px, so one clone set
// fills it and the wrap span is 1320px. Item stops are multiples of 220px, modulo 1320.
const SPAN = 1320;
const loop = (page: Page, options = "{}") =>
  page.evaluate((o) => {
    const w = window as any;
    w.loop = w.ED.dragLoop(document.getElementById("lvp"), document.getElementById("ltr"), eval(`(${o})`));
  }, options);
const grid = (page: Page, options = "{}") =>
  page.evaluate((o) => {
    const w = window as any;
    w.grid = w.ED.dragGrid(document.getElementById("gvp"), document.getElementById("grid"), eval(`(${o})`));
  }, options);
const position = (page: Page) => page.evaluate(() => Number((window as any).gsap.getProperty((window as any).loop.draggable.target, "x")));
/** Left edges of the real items relative to the viewport. */
const lefts = (page: Page) =>
  page.evaluate(() => {
    const origin = document.getElementById("lvp")!.getBoundingClientRect().left;
    return ["i0", "i1", "i2"].map((id) => Math.round(document.getElementById(id)!.getBoundingClientRect().left - origin));
  });
const drag = async (page: Page, from: [number, number], by: [number, number], steps = 10, pause = 16) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + (by[0] * i) / steps, from[1] + (by[1] * i) / steps);
    await page.waitForTimeout(pause);
  }
  await page.mouse.up();
};
const onStop = (x: number) => Math.abs(((x % 220) + 220) % 220) < 1 || Math.abs((((x % 220) + 220) % 220) - 220) < 1;
/** Every sample point in the viewport falls inside some tile's cell (tile plus gap). */
const covered = (page: Page) =>
  page.evaluate(() => {
    const viewport = document.getElementById("gvp")!.getBoundingClientRect();
    const cells = [...document.getElementById("grid")!.children].map((el) => el.getBoundingClientRect());
    for (let x = 0; x < viewport.width; x += 20) {
      for (let y = 0; y < viewport.height; y += 20) {
        const px = viewport.left + x;
        const py = viewport.top + y;
        if (!cells.some((r) => px >= r.left && px < r.left + 160 && py >= r.top && py < r.top + 110)) return `gap at ${x},${y}`;
      }
    }
    return "covered";
  });

test.describe("dragLoop", () => {
  test("clones fill the span, hidden and inert without ids, and revert restores the markup", async ({ open }) => {
    const page = await open("endless-drag");
    const markup = await page.$eval("#ltr", (el) => el.innerHTML);
    await loop(page);
    const clones = await page.$$eval("#ltr [data-drag-clone]", (els) =>
      els.map((el) => ({ hidden: el.getAttribute("aria-hidden"), inert: (el as HTMLElement).inert, ids: el.querySelectorAll("[id]").length + (el.id ? 1 : 0) })),
    );
    expect(clones).toHaveLength(3);
    expect(clones.every((c) => c.hidden === "true" && c.inert && c.ids === 0)).toBe(true);
    expect(await page.locator("[id='i0']").count()).toBe(1);
    // Each real item is in the accessibility tree once.
    await expect(page.getByRole("link", { name: "1", exact: true })).toHaveCount(1);
    expect(await lefts(page)).toEqual([0, 220, 440]);

    await page.evaluate(() => {
      (window as any).loop.revert();
      (window as any).loop.revert();
    });
    expect(await page.$eval("#ltr", (el) => el.innerHTML)).toBe(markup);
    expect(await style(page, "#lvp")).toBe("");
  });

  test("a drag past the last item wraps to the first and lands on an item", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page);
    // Drag right from the start: items wrap in from the left instead of stopping at an edge.
    await drag(page, [300, 100], [330, 0]);
    await expect.poll(async () => onStop(await position(page)), { timeout: 3000 }).toBe(true);
    await page.waitForTimeout(1500);
    const x = await position(page);
    expect(x).toBeGreaterThan(0);
    expect(onStop(x), `landed at ${x}`).toBe(true);
    // Whatever the position, the visible run has no gap: some item covers each 220px slot across the viewport.
    const starts = await page.$$eval("#ltr > *", (els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    for (let slot = 0; slot < 800; slot += 220) expect(starts.some((left) => left <= slot && left + 220 > slot), `slot ${slot}`).toBe(true);
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  test("a click follows a link; a drag never does", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page);
    await drag(page, [100, 100], [-150, 0]);
    expect(await page.evaluate(() => location.hash)).toBe("");
    await page.waitForTimeout(1500);
    const box = (await page.locator("#i2").boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 20);
    expect(await page.evaluate(() => location.hash)).toBe("#i2");
  });

  test("a horizontal wheel moves the same position and lands; a vertical wheel scrolls the page", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page, "{ duration: 0.2 }");
    await page.mouse.move(400, 100);
    await page.mouse.wheel(150, 0);
    await expect.poll(() => position(page)).toBe(-220);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await position(page)).toBe(-220);
    expect(await page.evaluate(() => (window as any).loop.index())).toBe(1);
  });

  test("tab brings each real item into view without scrolling the viewport", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page, "{ duration: 0.1 }");
    await page.focus("#before");
    const visited: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      visited.push(await page.evaluate(() => document.activeElement!.id));
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        const vp = document.getElementById("lvp")!;
        const rect = document.activeElement!.getBoundingClientRect();
        const box = vp.getBoundingClientRect();
        return { scrollLeft: vp.scrollLeft, left: rect.left - box.left, right: rect.right - box.left };
      });
      expect(state.scrollLeft).toBe(0);
      expect(state.left).toBeGreaterThanOrEqual(-1);
      expect(state.right).toBeLessThanOrEqual(801);
    }
    // Clones are skipped: the next Tab leaves the loop.
    expect(visited).toEqual(["i0", "i1", "i2"]);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement!.id)).toBe("t0");
  });

  test("drift runs, holds on hover, focus, drag, and pause, and resumes", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page, "{ drift: 200 }");
    const moving = async () => {
      const a = await position(page);
      await page.waitForTimeout(150);
      return (await position(page)) !== a;
    };
    expect(await moving()).toBe(true);
    expect(await position(page)).toBeLessThan(0);

    await page.mouse.move(400, 100);
    expect(await moving()).toBe(false);
    await page.mouse.move(400, 600);
    expect(await moving()).toBe(true);

    await page.evaluate(() => (window as any).loop.pause());
    expect(await moving()).toBe(false);
    await page.evaluate(() => (window as any).loop.play());
    expect(await moving()).toBe(true);

    await page.focus("#before");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(700);
    expect(await moving()).toBe(false);
    await page.keyboard.press("Shift+Tab");
    expect(await moving()).toBe(true);

    // A throw cut short by a wheel still lets the drift resume.
    await page.mouse.move(600, 100);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(600 - 80 * i, 100);
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
    await page.mouse.wheel(60, 0);
    await page.mouse.move(400, 600);
    await page.waitForTimeout(400);
    expect(await moving()).toBe(true);
  });

  test("revert mid-throw stops the throw and restores markup and inline styles exactly", async ({ open }) => {
    const page = await open("endless-drag");
    const markup = await page.$eval("#ltr", (el) => el.outerHTML);
    await loop(page);
    await drag(page, [600, 100], [-400, 0], 5, 10);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).gsap.isTweening((window as any).loop.draggable.target))).toBe(true);
    await page.evaluate(() => (window as any).loop.revert());
    expect(await page.$eval("#ltr", (el) => el.outerHTML)).toBe(markup);
    expect(await style(page, "#lvp")).toBe("");
    const settled = await page.$eval("#ltr", (el) => el.outerHTML);
    await page.waitForTimeout(300);
    expect(await page.$eval("#ltr", (el) => el.outerHTML)).toBe(settled);
  });

  test("resize rebuilds the clones and keeps the current item", async ({ open }) => {
    const page = await open("endless-drag");
    await loop(page, "{ duration: 0 }");
    await page.evaluate(() => (window as any).loop.toIndex(2));
    await page.waitForTimeout(100);
    await page.$eval("#lvp", (el) => ((el as HTMLElement).style.width = "1400px"));
    await expect.poll(() => page.locator("#ltr [data-drag-clone]").count()).toBe(6);
    expect(await page.evaluate(() => (window as any).loop.index())).toBe(2);
    expect((await lefts(page))[2]).toBe(0);
  });

  test("reduced motion drags and lands with no throw and no drift", async ({ open }) => {
    const page = await open("endless-drag");
    await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
    await loop(page, "{ drift: 200 }");
    expect(await page.evaluate(() => !!(window as any).loop.draggable.vars.inertia)).toBe(false);
    const still = await position(page);
    await page.waitForTimeout(200);
    expect(await position(page)).toBe(still);
    await drag(page, [500, 100], [-170, 0]);
    await expect.poll(() => position(page)).toBe(-220);
  });
});

test.describe("dragGrid", () => {
  test("a block of three tiles wraps to cover the viewport, with clean clones", async ({ open }) => {
    const page = await open("endless-drag");
    const markup = await page.$eval("#grid", (el) => el.outerHTML);
    await grid(page);
    expect(await covered(page)).toBe("covered");
    const clones = await page.$$eval("#grid [data-drag-clone]", (els) =>
      els.map((el) => el.getAttribute("aria-hidden") === "true" && (el as HTMLElement).inert && !el.querySelector("[id]") && !el.id),
    );
    expect(clones.length).toBeGreaterThan(3);
    expect(clones.every(Boolean)).toBe(true);
    await expect(page.getByRole("link", { name: "T1", exact: true })).toHaveCount(1);

    await drag(page, [300, 300], [-230, -170]);
    await page.waitForTimeout(1500);
    expect(await covered(page)).toBe("covered");
    expect(await page.evaluate(() => location.hash)).toBe("");

    await page.evaluate(() => {
      (window as any).grid.revert();
      (window as any).grid.revert();
    });
    expect(await page.$eval("#grid", (el) => el.outerHTML)).toBe(markup);
    expect(await style(page, "#gvp")).toBe("");
  });

  test("resize rebuilds the copies to cover the new viewport", async ({ open }) => {
    const page = await open("endless-drag");
    await grid(page);
    const before = await page.locator("#grid > *").count();
    await page.$eval("#gvp", (el) => Object.assign((el as HTMLElement).style, { width: "1200px", height: "900px" }));
    await expect.poll(() => page.locator("#grid > *").count()).toBeGreaterThan(before);
    expect(await covered(page)).toBe("covered");
  });

  test("tab centers each real tile without scrolling the viewport; a click follows", async ({ open }) => {
    const page = await open("endless-drag");
    await grid(page, "{ duration: 0.1 }");
    await page.focus("#i2");
    for (const id of ["t0", "t1", "t2"]) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement!.id)).toBe(id);
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        const vp = document.getElementById("gvp")!;
        const box = vp.getBoundingClientRect();
        const rect = document.activeElement!.getBoundingClientRect();
        return { scroll: vp.scrollLeft + vp.scrollTop, cx: rect.left + rect.width / 2 - box.left, cy: rect.top + rect.height / 2 - box.top };
      });
      expect(state.scroll).toBe(0);
      expect(state.cx).toBeCloseTo(300, 0);
      expect(state.cy).toBeCloseTo(200, 0);
    }
    const box = (await page.locator("#t1").boundingBox())!;
    await page.mouse.click(box.x + 10, box.y + 10);
    expect(await page.evaluate(() => location.hash)).toBe("#t1");
  });

  test("the wheel pans sideways and leaves vertical wheels to the page unless it captures both", async ({ open }) => {
    const page = await open("endless-drag");
    await grid(page);
    const at = () => page.evaluate(() => {
      const target = (window as any).grid.draggable.target;
      return [Number((window as any).gsap.getProperty(target, "x")), Number((window as any).gsap.getProperty(target, "y"))];
    });
    await page.mouse.move(300, 400);
    await page.mouse.wheel(100, 0);
    await expect.poll(at).toEqual([-100, 0]);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await at()).toEqual([-100, 0]);

    await page.evaluate(() => {
      (window as any).grid.revert();
      window.scrollTo(0, 0);
    });
    await grid(page, "{ capture: 'both' }");
    await page.mouse.move(300, 400);
    await page.mouse.wheel(0, 100);
    await expect.poll(at).toEqual([0, -100]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("revert mid-throw restores markup and styles exactly", async ({ open }) => {
    const page = await open("endless-drag");
    const markup = await page.$eval("#grid", (el) => el.outerHTML);
    await grid(page);
    await drag(page, [400, 300], [-300, -200], 5, 10);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => (window as any).gsap.isTweening((window as any).grid.draggable.target))).toBe(true);
    await page.evaluate(() => (window as any).grid.revert());
    expect(await page.$eval("#grid", (el) => el.outerHTML)).toBe(markup);
    expect(await style(page, "#gvp")).toBe("");
  });

  test("reduced motion drags with no throw", async ({ open }) => {
    const page = await open("endless-drag");
    await page.evaluate(() => (document.documentElement.dataset.motion = "reduced"));
    await grid(page);
    expect(await page.evaluate(() => !!(window as any).grid.draggable.vars.inertia)).toBe(false);
    await drag(page, [300, 300], [-100, -50]);
    expect(await covered(page)).toBe("covered");
  });
});

test.describe("touch", () => {
  test.use({ viewport: { width: 900, height: 700 }, isMobile: true, hasTouch: true });

  test("vertical swipes over the loop and an x-capturing grid scroll the page", async ({ open, page }) => {
    await open("endless-drag");
    await loop(page);
    await grid(page);
    expect(await page.$eval("#lvp", (el) => getComputedStyle(el).touchAction)).toContain("pan-y");
    expect(await page.$eval("#gvp", (el) => getComputedStyle(el).touchAction)).toContain("pan-y");
    const cdp = await page.context().newCDPSession(page);
    for (const [x, y] of [[400, 100], [300, 400]]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await cdp.send("Input.synthesizeScrollGesture", { x, y, yDistance: -300, gestureSourceType: "touch", speed: 800 });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    }
  });
});
