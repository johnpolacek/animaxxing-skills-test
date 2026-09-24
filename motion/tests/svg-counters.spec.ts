import { test, expect, style, prop } from "./fixture";

// Recipes: animaxxing/references/recipes/svg-effects.md and counters-and-marquees.md

test("drawIn starts hidden, completes, and restores the SVG's own strokes", async ({ open }) => {
  const page = await open("svg-counters");
  const start = await page.evaluate(() => {
    (window as any).di = (window as any).V.drawIn(["#p1", "#c1"], { duration: 0.4 });
    return document.getElementById("p1")!.style.strokeDasharray;
  });
  expect(start).toMatch(/^0px/);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).di.timeline.progress())).toBe(1);
  await page.evaluate(() => {
    (window as any).di.revert();
    (window as any).di.revert();
  });
  expect(await style(page, "#p1")).toBe("");
  expect(await style(page, "#c1")).toBe("");
});

test("drawOut fires completion", async ({ open }) => {
  const page = await open("svg-counters");
  const done = await page.evaluate(async () => {
    let fired = false;
    const out = (window as any).V.drawOut("#p1", { duration: 0.2, onComplete: () => (fired = true) });
    await new Promise((resolve) => setTimeout(resolve, 500));
    out.revert();
    return fired;
  });
  expect(done).toBe(true);
});

test("morph toggle changes shape, restores the original d, and is inert after revert", async ({ open }) => {
  const page = await open("svg-counters");
  const d = () => page.$eval("#menu", (el) => el.getAttribute("d"));
  const original = await d();
  await page.evaluate(() => {
    (window as any).mt = (window as any).V.morphToggle(document.getElementById("menu"), "M6 6l12 12M18 6L6 18");
    (window as any).mt.set(true);
  });
  await page.waitForTimeout(600);
  expect(await d()).not.toBe(original);
  await page.evaluate(() => {
    (window as any).mt.set(false);
    (window as any).mt.set(true);
    (window as any).mt.revert();
  });
  await page.waitForTimeout(500);
  expect(await d()).toBe(original);
});

test("path follower moves along the path and restores its transform", async ({ open }) => {
  const page = await open("svg-counters");
  await page.evaluate(() => {
    (window as any).fp = (window as any).V.followPath(document.getElementById("dot"), document.getElementById("route"), { duration: 1 });
  });
  await page.waitForTimeout(300);
  expect(await page.$eval("#dot", (el) => el.getAttribute("transform") || (el as SVGElement).style.transform)).toBeTruthy();
  await page.evaluate(() => (window as any).fp.revert());
  expect(await style(page, "#dot")).toBe("");
  expect(await page.$eval("#dot", (el) => el.getAttribute("transform"))).toBeNull();
});

test("countUp keeps formatting, reserves width, reads the final value, and ends exact", async ({ open }) => {
  const page = await open("svg-counters");
  const ids = ["n1", "n2", "n3", "n4", "n5"];
  const left = () => page.$eval("#n5", (el) => el.getBoundingClientRect().left);
  const before = await left();
  await page.evaluate((list) => {
    (window as any).cs = list.map((id) => (window as any).C.countUp(document.getElementById(id), { duration: 0.6 }));
  }, ids);
  await page.waitForTimeout(200);
  // [counting digits, text left for assistive technology] per figure.
  const mid = await page.evaluate(
    (list) =>
      list.map((id) => {
        const el = document.getElementById(id)!;
        const shown = el.querySelector('[aria-hidden="true"]');
        const spoken = Array.from(el.childNodes).filter((node) => node !== shown).map((node) => node.textContent).join("");
        return [shown?.textContent ?? null, spoken];
      }),
    ids,
  );
  expect(mid[0][0]).not.toBe("12,480");
  expect(mid[0][1]).toBe("12,480");
  expect(mid[1][0]).toMatch(/^\d+\.\d%$/);
  expect(mid[1][1]).toBe("98.6%");
  expect(mid[2][0]).toMatch(/^\$\d\.\dM$/);
  expect(mid[3][0]).toMatch(/\.\d\d$/);
  expect(mid[4]).toEqual([null, "n/a"]);
  expect(Math.abs((await left()) - before)).toBeLessThan(0.5);

  await page.waitForTimeout(700);
  expect(await page.evaluate((list) => list.map((id) => document.getElementById(id)!.textContent), ids)).toEqual(["12,480", "98.6%", "$3.2M", "1,234.56", "n/a"]);
  await page.evaluate(() => (window as any).cs.forEach((count: any) => count.revert()));
  for (const id of ids) {
    expect(await style(page, `#${id}`)).toBe("");
    expect(await page.$eval(`#${id}`, (el) => el.children.length)).toBe(0);
  }
});

test("countUp reads three or more decimals and the locale's decimal mark", async ({ open }) => {
  const page = await open("svg-counters");
  const figures: Array<[string, string | undefined]> = [["99.999%", undefined], ["0.125", undefined], ["12.480", "de"], ["3,5 %", "de"]];
  const mid = await page.evaluate((list) => {
    const { C } = window as any;
    return list.map(([text, locale]) => {
      const span = document.createElement("span");
      span.textContent = text;
      document.body.append(span);
      const count = C.countUp(span, { locale });
      count.timeline.progress(0.3);
      const shown = span.querySelector('[aria-hidden="true"]')?.textContent;
      count.timeline.progress(1);
      return [shown, span.textContent];
    });
  }, figures);
  // Mid-count, each keeps the source's decimals and marks: no "99,999"-style grouping.
  expect(mid[0][0]).toMatch(/^\d{2}\.\d{3}%$/);
  expect(mid[1][0]).toMatch(/^0\.\d{3}$/);
  expect(mid[2][0]).toMatch(/^\d{1,2}\.\d{3}$/);
  expect(mid[3][0]).toMatch(/^\d,\d\s%$/);
  expect(mid.map(([, final]) => final)).toEqual(figures.map(([text]) => text));
});

test("countUp falls back to the browser's locale when the page lang is malformed", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    document.documentElement.lang = "en_US";
    const count = (window as any).C.countUp(document.getElementById("n2"));
    count.timeline.progress(0.3);
    const shown = document.querySelector('#n2 [aria-hidden="true"]')?.textContent;
    count.revert();
    return shown;
  });
  expect(result).toMatch(/^\d{1,2}\.\d%$/);
});

test("countUp leaves an existing aria-label alone", async ({ open }) => {
  const page = await open("svg-counters");
  const label = await page.evaluate(() => {
    const el = document.getElementById("n1")!;
    el.setAttribute("aria-label", "Twelve thousand");
    const count = (window as any).C.countUp(el);
    count.timeline.progress(0.5);
    const during = el.getAttribute("aria-label");
    count.revert();
    return [during, el.getAttribute("aria-label")];
  });
  expect(label).toEqual(["Twelve thousand", "Twelve thousand"]);
});

test("reverting a count mid-way restores the source text", async ({ open }) => {
  const page = await open("svg-counters");
  const text = await page.evaluate(() => {
    const count = (window as any).C.countUp(document.getElementById("n1"), { duration: 2 });
    count.timeline.progress(0.3);
    count.revert();
    return document.getElementById("n1")!.textContent;
  });
  expect(text).toBe("12,480");
});

test("marquee clones are hidden and inert, loop seamlessly, and pause on focus, command, and off screen", async ({ open }) => {
  const page = await open("svg-counters");
  const x = () => prop(page, ".marquee-inner", "x");
  const original = await page.$eval("#mq", (el) => el.innerHTML);
  await page.evaluate(() => {
    (window as any).mq = (window as any).C.marquee(document.getElementById("mq"), document.getElementById("row"), { speed: 360 });
  });
  const clones = await page.$$eval("[data-marquee-clone]", (list) =>
    list.map((clone) => [clone.getAttribute("aria-hidden"), (clone as HTMLElement).inert, !!clone.querySelector("[id]")]),
  );
  expect(clones.length).toBe(3);
  for (const clone of clones) expect(clone).toEqual(["true", true, false]);

  const x1 = await x();
  await page.waitForTimeout(500);
  const x2 = await x();
  expect(x2).not.toBe(x1);
  // One row is 360px wide; the loop never travels further than that.
  expect(x2).toBeLessThanOrEqual(0);
  expect(x2).toBeGreaterThan(-360);

  await page.evaluate(() => document.getElementById("lx")!.focus());
  const focused = await x();
  await page.waitForTimeout(300);
  expect(await x()).toBe(focused);
  await page.evaluate(() => document.getElementById("lx")!.blur());
  await page.waitForTimeout(200);
  expect(await x()).not.toBe(focused);

  await page.evaluate(() => (window as any).mq.pause());
  const paused = await x();
  await page.waitForTimeout(200);
  expect(await x()).toBe(paused);

  await page.evaluate(() => {
    (window as any).mq.play();
    window.scrollTo(0, 2000);
  });
  await page.waitForTimeout(200);
  const hidden = await x();
  await page.waitForTimeout(200);
  expect(await x()).toBe(hidden);

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById("mq")!.style.width = "900px";
  });
  await page.waitForTimeout(200);
  expect(await page.$$eval("[data-marquee-clone]", (list) => list.length)).toBe(4);

  await page.evaluate(() => {
    document.getElementById("mq")!.style.width = "";
    (window as any).mq.revert();
    (window as any).mq.revert();
  });
  expect(await page.$eval("#mq", (el) => el.innerHTML)).toBe(original);
});

test("reduced motion shows strokes whole, figures final, and a still marquee", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(async () => {
    const { V, C } = window as any;
    document.documentElement.dataset.motion = "reduced";
    let fired = false;
    const draw = V.drawIn("#p1", { onComplete: () => (fired = true) });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const count = C.countUp(document.getElementById("n1"));
    const loop = C.marquee(document.getElementById("mq"), document.getElementById("row"));
    const snapshot = {
      fired,
      dash: getComputedStyle(document.getElementById("p1")!).strokeDasharray,
      text: document.getElementById("n1")!.textContent,
      clones: document.querySelectorAll("[data-marquee-clone]").length,
    };
    draw.revert();
    count.revert();
    loop.revert();
    return snapshot;
  });
  expect(result).toEqual({ fired: true, dash: "none", text: "12,480", clones: 0 });
});

test("logoCycle swaps one cell at a time through the pool, holds on pause, and restores", async ({ open }) => {
  const page = await open("svg-counters");
  const before = await page.evaluate(() => document.getElementById("lg")!.outerHTML + document.getElementById("lpool")!.outerHTML);
  await page.evaluate(() => ((window as any).cycle = (window as any).C.logoCycle(document.getElementById("lg"), document.getElementById("lpool"), { interval: 0.2, duration: 0.2 })));
  const shown = () => page.$$eval("[data-logo-cell]", (cells) => cells.map((cell) => cell.textContent));
  await expect.poll(async () => (await shown()).join()).not.toBe("L0,L1");
  // Swaps settle to one logo per cell; the pool keeps the rest, so four logos still exist once each.
  await page.waitForTimeout(250);
  const all = await page.$$eval("#L0, #L1, #L2, #L3", (els) => els.length);
  expect(all).toBe(4);
  await page.evaluate(() => (window as any).cycle.pause());
  await page.waitForTimeout(300);
  const held = await shown();
  await page.waitForTimeout(600);
  expect(await shown()).toEqual(held);
  await page.evaluate(() => {
    (window as any).cycle.revert();
    (window as any).cycle.revert();
  });
  expect(await page.evaluate(() => document.getElementById("lg")!.outerHTML + document.getElementById("lpool")!.outerHTML)).toBe(before);
});

test("logoCycle under reduced motion leaves the grid as it is", async ({ open }) => {
  const page = await open("svg-counters");
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).cycle = (window as any).C.logoCycle(document.getElementById("lg"), document.getElementById("lpool"), { interval: 0.1 });
  });
  await page.waitForTimeout(500);
  expect(await page.$$eval("[data-logo-cell]", (cells) => cells.map((cell) => cell.textContent))).toEqual(["L0", "L1"]);
});
