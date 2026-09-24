import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/section-pager.md

type Page = import("@playwright/test").Page;

const build = (page: Page, options = "{}") =>
  page.evaluate((o) => {
    const w = window as any;
    w.changes = [];
    w.pager = w.SP.sectionPager(document.getElementById("pager"), {
      duration: 0.3,
      ...eval(`(${o})`),
      onChange: (index: number, previous: number) => w.changes.push([index, previous]),
    });
  }, options);
const index = (page: Page) => page.evaluate(() => (window as any).pager.index());
const yPercents = (page: Page) =>
  page.evaluate(() => ["#s0", "#s1", "#s2", "#s3"].map((s) => Math.round(Number((window as any).gsap.getProperty(s, "yPercent")))));
/** One wheel gesture: a few quick notches over the pager, then a rest long enough for Observer's onStop. */
const flick = async (page: Page, dy = 120) => {
  await page.mouse.move(500, 350);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(40);
  }
};

test("builds a stacked deck and restores everything on revert", async ({ open }) => {
  const page = await open("section-pager");
  expect(await page.$eval("#s1", (el) => el.getBoundingClientRect().top)).toBeGreaterThan(600);
  await build(page);
  expect(await page.$eval("#pager", (el) => el.hasAttribute("data-pager"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  expect(await yPercents(page)).toEqual([0, 100, 100, 100]);
  expect(await index(page)).toBe(0);

  await page.evaluate(() => {
    (window as any).pager.revert();
    (window as any).pager.revert();
  });
  expect(await page.$eval("#pager", (el) => el.hasAttribute("data-pager"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.getAttribute("style") ?? "")).toBe("");
  expect(await style(page, "#s0")).toBe("color: rgb(1, 2, 3);");
  expect(await style(page, "#s1")).toBe("");
  // Back to the scrolling layout.
  expect(await page.$eval("#s1", (el) => el.getBoundingClientRect().top)).toBeGreaterThan(600);
  await flick(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("one wheel gesture moves one section, however long it runs", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  await flick(page);
  // A long inertia tail: keep wheeling past the move's end without resting.
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(50);
  }
  expect(await index(page)).toBe(1);
  await page.waitForTimeout(400);
  expect(await yPercents(page)).toEqual([100, 0, 100, 100]);
  expect(await page.evaluate(() => (window as any).changes)).toEqual([[1, 0]]);

  await flick(page);
  await page.waitForTimeout(500);
  expect(await index(page)).toBe(2);
  await flick(page, -120);
  await page.waitForTimeout(500);
  expect(await index(page)).toBe(1);
  // The page itself never scrolled.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the covering section moves in while the outgoing one drifts", async ({ open }) => {
  const page = await open("section-pager");
  await build(page, "{ duration: 1, drift: 30 }");
  await page.evaluate(() => {
    (window as any).gsap.globalTimeline.pause();
    (window as any).pager.next();
    const clock = (window as any).gsap.globalTimeline;
    clock.time(clock.time() + 0.5);
  });
  const [out, into] = await yPercents(page);
  expect(into).toBeGreaterThan(0);
  expect(into).toBeLessThan(100);
  expect(out).toBeLessThan(0);
  expect(out).toBeGreaterThan(-30);
  expect(await prop(page, "#s1", "zIndex")).toBeGreaterThan(await prop(page, "#s0", "zIndex"));
  // A second request finishes the first move before starting. Resume first:
  // gsap.set does not render while the global timeline is paused.
  await page.evaluate(() => {
    (window as any).gsap.globalTimeline.resume();
    (window as any).pager.goTo(3);
  });
  // The first move landed: section 0 parked, section 1 whole and now leaving.
  expect((await yPercents(page))[0]).toBe(100);
  expect((await yPercents(page))[1]).toBeLessThanOrEqual(0);
  await page.waitForTimeout(1200);
  expect(await yPercents(page)).toEqual([100, 100, 100, 0]);
  expect(await page.evaluate(() => (window as any).changes)).toEqual([[1, 0], [3, 1]]);
});

test("keys page from the body but not from fields, widgets, or Space on a control", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(1);

  await page.focus("#field");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.type(" hi");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(1);
  expect(await page.$eval("#field", (el) => (el as HTMLInputElement).value)).toBe(" hi");

  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(3);
  await page.focus("#tab");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(3);

  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(0);
  await page.focus("#b0");
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(1);
  await page.keyboard.press("Shift+ ");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(0);
});

test("focus in a parked section shows it at once without scrolling the pager", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  await page.focus("#link2");
  expect(await index(page)).toBe(2);
  expect((await yPercents(page))[2]).toBe(0);
  expect(await page.$eval("#pager", (el) => [el.scrollTop, el.scrollLeft])).toEqual([0, 0]);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("ignored scrollers, edges, disable, and loop", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  expect(await page.evaluate(() => (window as any).pager.previous())).toBeUndefined();
  await page.evaluate(() => (window as any).pager.goTo(1)?.progress(1));
  // Wheeling over the inner scroller scrolls it, not the pager.
  const box = (await page.$eval("#inner", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + 20 };
  }))!;
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(1);
  expect(await page.$eval("#inner", (el) => el.scrollTop)).toBeGreaterThan(0);

  await page.evaluate(() => (window as any).pager.disable());
  await flick(page);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(1);
  await page.evaluate(() => (window as any).pager.enable());
  await flick(page);
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(2);
  await page.evaluate(() => (window as any).pager.revert());

  await build(page, "{ loop: true }");
  await page.evaluate(() => (window as any).pager.previous()?.progress(1));
  expect(await index(page)).toBe(3);
  await page.evaluate(() => (window as any).pager.next()?.progress(1));
  expect(await index(page)).toBe(0);
});

test("reduced motion swaps at once and still reports the change", async ({ open }) => {
  const page = await open("section-pager");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await build(page);
  await page.evaluate(() => {
    const w = window as any;
    w.done = 0;
    w.pager.next().eventCallback("onComplete", () => w.done++);
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).done)).toBe(1);
  expect(await yPercents(page)).toEqual([100, 0, 100, 100]);
  expect(await page.evaluate(() => (window as any).changes)).toEqual([[1, 0]]);
});

test("a swipe up moves one section and pinch-zoom stays allowed", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 400, height: 700 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("file://" + require("node:path").resolve(__dirname, "../fixtures/section-pager.html"));
  await build(page);
  expect(await page.$eval("#pager", (el) => getComputedStyle(el).touchAction)).toBe("pinch-zoom");
  const cdp = await context.newCDPSession(page);
  const swipe = async (fromY: number, toY: number) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: fromY }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: fromY + ((toY - fromY) * i) / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(500, 150);
  await page.waitForTimeout(500);
  expect(await index(page)).toBe(1);
  // Below section 1's ignored scroller.
  await swipe(380, 690);
  await page.waitForTimeout(500);
  expect(await index(page)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

test("a tap right after a swipe never swallows the next swipe", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 400, height: 700 } });
  const page = await context.newPage();
  await page.goto("file://" + require("node:path").resolve(__dirname, "../fixtures/section-pager.html"));
  await build(page);
  const cdp = await context.newCDPSession(page);
  const swipe = async (fromY: number, toY: number) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: fromY }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: fromY + ((toY - fromY) * i) / 8 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(690, 400);
  await page.touchscreen.tap(200, 650);
  await page.waitForTimeout(800);
  await swipe(690, 400);
  await page.waitForTimeout(500);
  expect(await index(page)).toBe(2);
  await context.close();
});

test("scrollers rendered after build still scroll instead of paging", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  await page.evaluate(() => {
    const late = document.createElement("div");
    late.id = "late";
    late.setAttribute("data-pager-ignore", "");
    late.style.cssText = "height:120px;overflow:auto";
    late.innerHTML = '<div style="height:600px">Late</div>';
    document.getElementById("s0")!.append(late);
  });
  const box = await page.$eval("#late", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + 20 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(0);
  expect(await page.$eval("#late", (el) => el.scrollTop)).toBeGreaterThan(0);
});

test("Space on a checkbox or tab role toggles it without paging", async ({ open }) => {
  const page = await open("section-pager");
  await build(page);
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "check";
    box.setAttribute("role", "checkbox");
    box.tabIndex = 0;
    document.getElementById("s0")!.append(box);
  });
  await page.focus("#check");
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  expect(await index(page)).toBe(0);
});
