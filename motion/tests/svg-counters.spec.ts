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

test("morph sequence flows through each shape, ends on its own with loop, and restores d on revert", async ({ open }) => {
  const page = await open("svg-counters");
  const d = () => page.$eval("#menu", (el) => el.getAttribute("d"));
  const original = await d();
  const stops = await page.evaluate(() => {
    const w = window as any;
    w.seq = w.V.morphSequence(document.getElementById("menu"), ["M6 6l12 12M18 6L6 18", "M12 5v14M5 12h14"], { duration: 0.5, hold: 0.25 });
    const tl = w.seq.timeline;
    const out = [tl.paused(), tl.duration()];
    const at = (t: number) => (tl.seek(t), document.getElementById("menu")!.getAttribute("d"));
    out.push(at(0.5), at(1.25), at(tl.duration()));
    return out;
  });
  expect(stops[0]).toBe(true);
  // Three morphs and three rests: two shapes, then back to its own.
  expect(stops[1]).toBeCloseTo(0.5 * 3 + 0.25 * 3, 5);
  expect(stops[2]).not.toBe(original);
  expect(stops[3]).not.toBe(stops[2]);
  expect(stops[4]).not.toBe(stops[3]);
  await page.evaluate(() => (window as any).seq.revert());
  expect(await d()).toBe(original);
});

test("morph sequence under reduced motion keeps the authored shape", async ({ open, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open("svg-counters");
  const result = await page.evaluate(() => {
    const w = window as any;
    const seq = w.V.morphSequence(document.getElementById("menu"), ["M6 6l12 12M18 6L6 18"]);
    const duration = seq.timeline.duration();
    seq.timeline.progress(1);
    const d = document.getElementById("menu")!.getAttribute("d");
    seq.revert();
    return [duration, d];
  });
  expect(result).toEqual([0, "M4 7h16M4 12h16M4 17h16"]);
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

test("morphScrub follows scroll both ways and restores the authored d", async ({ open }) => {
  const page = await open("svg-counters");
  const original = await page.$eval("#curve", (el) => el.getAttribute("d"));
  const height = () => page.$eval("#curve", (el) => (el as SVGPathElement).getBBox().height);
  const startHeight = await height();
  await page.evaluate(() => {
    (window as any).ms = (window as any).V.morphScrub(document.getElementById("curve"), "M0 10 C30 10 70 10 100 10 Z");
  });
  // The edge's top at the viewport's top: the end of the scrub, flat.
  await page.evaluate(() => window.scrollTo(0, document.getElementById("edge")!.getBoundingClientRect().top + scrollY));
  await expect.poll(height).toBeLessThan(0.5);
  // Halfway through its pass the curve is partly flattened.
  await page.evaluate(() => window.scrollTo(0, document.getElementById("edge")!.getBoundingClientRect().top + scrollY - innerHeight / 2));
  await expect.poll(height).toBeGreaterThan(1);
  expect(await height()).toBeLessThan(startHeight - 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(height).toBeCloseTo(startHeight, 1);
  await page.evaluate(() => {
    window.scrollTo(0, document.getElementById("edge")!.getBoundingClientRect().top + scrollY);
    (window as any).ms();
    (window as any).ms();
  });
  expect(await page.$eval("#curve", (el) => el.getAttribute("d"))).toBe(original);
  expect(await style(page, "#curve")).toBe("");
});

test("morphScrub under reduced motion keeps the authored shape", async ({ open }) => {
  const page = await open("svg-counters");
  const original = await page.$eval("#curve", (el) => el.getAttribute("d"));
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).ms = (window as any).V.morphScrub(document.getElementById("curve"), "M0 10 C30 10 70 10 100 10 Z");
    window.scrollTo(0, document.getElementById("edge")!.getBoundingClientRect().top + scrollY);
  });
  await page.waitForTimeout(200);
  expect(await page.$eval("#curve", (el) => el.getAttribute("d"))).toBe(original);
  await page.evaluate(() => (window as any).ms());
});

test("p1 restores authored CSS priorities", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    const w = window as any;
    const el = document.getElementById("p1")!;
    el.style.setProperty("stroke-dashoffset", "3px", "important");
    const before = [el.style.getPropertyValue("stroke-dashoffset"), el.style.getPropertyPriority("stroke-dashoffset")];
    const effect = w.V.drawIn(el);
    effect.timeline.progress(0.5); effect.revert(); effect.revert();
    return { before, after: [el.style.getPropertyValue("stroke-dashoffset"), el.style.getPropertyPriority("stroke-dashoffset")] };
  });
  expect(result.after).toEqual(result.before);
});

test("n1 restores authored CSS priorities", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    const w = window as any;
    const el = document.getElementById("n1")!;
    el.style.setProperty("min-width", "80px", "important");
    const before = [el.style.getPropertyValue("min-width"), el.style.getPropertyPriority("min-width")];
    const effect = w.C.countUp(el);
    effect.timeline.progress(0.5); effect.revert(); effect.revert();
    return { before, after: [el.style.getPropertyValue("min-width"), el.style.getPropertyPriority("min-width")] };
  });
  expect(result.after).toEqual(result.before);
});

test("odometer rolls columns to a new value, reads it once, and restores the latest text", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(async () => {
    const el = document.getElementById("od1")!;
    const odo = (window as any).C.odometer(el, { duration: 0.3, stagger: 0 });
    const built = { shown: el.querySelector('[aria-hidden="true"]')?.textContent?.length ?? 0, spoken: el.textContent?.endsWith("1,204") };
    const roll = odo.set(1210);
    let peak = 0;
    roll.eventCallback("onUpdate", () => {
      const strips = el.querySelectorAll<HTMLElement>('[aria-hidden="true"] span[style*="absolute"]');
      peak = Math.max(peak, Math.abs(Number((window as any).gsap.getProperty(strips[strips.length - 1], "yPercent"))));
    });
    const spokenNow = Array.from(el.children).find((child) => !child.hasAttribute("aria-hidden"))?.textContent;
    await new Promise((resolve) => roll.eventCallback("onComplete", resolve));
    const sizers = Array.from(el.querySelectorAll<HTMLElement>('span[style*="visibility"]')).map((s) => s.textContent).join("");
    odo.revert();
    odo.revert();
    return { built, spokenNow, peak, sizers, text: el.textContent, children: el.children.length, style: el.getAttribute("style") };
  });
  expect(result.built.spoken).toBe(true);
  expect(result.spokenNow).toBe("1,210");
  expect(result.peak).toBeGreaterThan(0);
  expect(result.sizers).toBe("1210");
  expect(result.text).toBe("1,210");
  expect(result.children).toBe(0);
  expect(result.style).toBe("color:red");
});

test("odometer rolls forward through 9 to 0 when rising and back when falling", async ({ open }) => {
  const page = await open("svg-counters");
  const ends = await page.evaluate(() => {
    const el = document.getElementById("od2")!;
    const odo = (window as any).C.odometer(el, { duration: 0.2, stagger: 0 });
    const gsap = (window as any).gsap;
    const ones = () => {
      const strips = el.querySelectorAll<HTMLElement>('[aria-hidden="true"] span[style*="absolute"]');
      return strips[strips.length - 1]!;
    };
    // 99 to 100: the shape changes, the ones column rolls 9 forward to the second 0.
    const up = odo.set(100);
    up.progress(0.999);
    const rising = -Number(gsap.getProperty(ones(), "yPercent")) / 5;
    up.progress(1);
    const settled = -Number(gsap.getProperty(ones(), "yPercent")) / 5;
    // 100 to 99: falling, the ones column runs down from the second set.
    const down = odo.set(99);
    down.progress(0.001);
    const fallingStart = -Number(gsap.getProperty(ones(), "yPercent")) / 5;
    down.progress(1);
    const text = el.textContent;
    odo.revert();
    return { rising, settled, fallingStart, text, after: el.textContent };
  });
  expect(ends.rising).toBeGreaterThan(9.5);
  expect(ends.settled).toBeCloseTo(0, 3);
  expect(ends.fallingStart).toBeGreaterThan(9.5);
  expect(ends.text?.endsWith("99")).toBe(true);
  expect(ends.after).toBe("99");
});

test("odometer formats numbers like the first value and ignores a repeat", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    const el = document.getElementById("od3")!;
    const odo = (window as any).C.odometer(el);
    const roll = odo.set(12.5);
    roll.progress(1);
    const same = odo.set("$12.50");
    odo.revert();
    return { text: el.textContent, same: same === undefined };
  });
  expect(result).toEqual({ text: "$12.50", same: true });
});

test("odometer under reduced motion writes the value at once and builds nothing", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const el = document.getElementById("od1")!;
    const odo = (window as any).C.odometer(el);
    const children = el.children.length;
    const roll = odo.set(2000);
    odo.revert();
    return { children, roll: roll === undefined, text: el.textContent };
  });
  expect(result).toEqual({ children: 0, roll: true, text: "2,000" });
});

test("odometer continues from mid-roll when a new value arrives", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    const el = document.getElementById("od2")!;
    const odo = (window as any).C.odometer(el, { duration: 1, stagger: 0 });
    const gsap = (window as any).gsap;
    const ones = () => {
      const strips = el.querySelectorAll<HTMLElement>('[aria-hidden="true"] span[style*="absolute"]');
      return -Number(gsap.getProperty(strips[strips.length - 1], "yPercent")) / 5;
    };
    // 99 to 93 falls; stop partway, then rise to 98 with the same shape.
    const first = odo.set(93);
    first.progress(0.5);
    const mid = ones() % 10;
    const second = odo.set(98);
    const resumed = ones() % 10;
    second.progress(1);
    const end = ones();
    odo.revert();
    return { mid, resumed, end, text: el.textContent };
  });
  expect(result.mid).toBeGreaterThan(3);
  expect(result.mid).toBeLessThan(9);
  expect(Math.abs(result.resumed - result.mid)).toBeLessThan(0.01);
  expect(result.end).toBeCloseTo(8, 3);
  expect(result.text).toBe("98");
});

test("pathScrub slides text along its path with scroll, both ways, and restores its offset", async ({ open }) => {
  const page = await open("svg-counters");
  const offset = () => page.$eval("#tp", (el) => parseFloat(el.getAttribute("startOffset") ?? "0"));
  await page.evaluate(() => ((window as any).ps = (window as any).V.pathScrub(document.getElementById("tp"), { scrub: true })));
  // The svg sits below the fold: the text waits at 100%.
  expect(await offset()).toBeCloseTo(100, 0);
  await page.evaluate(() => window.scrollTo(0, document.getElementById("tp-svg")!.getBoundingClientRect().top + scrollY - 100));
  await expect.poll(offset).toBeLessThan(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(offset).toBeGreaterThan(95);
  await page.evaluate(() => {
    (window as any).ps();
    (window as any).ps();
  });
  expect(await page.$eval("#tp", (el) => el.getAttribute("startOffset"))).toBe("10%");
});

test("pathScrub under reduced motion places the text at rest and restores it", async ({ open }) => {
  const page = await open("svg-counters");
  const result = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const el = document.getElementById("tp")!;
    const revert = (window as any).V.pathScrub(el, { to: 0 });
    const placed = el.getAttribute("startOffset");
    revert();
    return { placed, after: el.getAttribute("startOffset") };
  });
  expect(result).toEqual({ placed: "0%", after: "10%" });
});

test("pathLoop turns text one lap at a time, pauses on command and off screen, and restores", async ({ open }) => {
  const page = await open("svg-counters");
  const offset = () => page.$eval("#tpl", (el) => parseFloat(el.getAttribute("startOffset") ?? "0"));
  await page.evaluate(() => ((window as any).pl = (window as any).V.pathLoop(document.getElementById("tpl"), { duration: 1 })));
  const seen = await page.evaluate(async () => {
    const values: number[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      values.push(parseFloat(document.getElementById("tpl")!.getAttribute("startOffset") ?? "0"));
    }
    return values;
  });
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...seen)).toBeLessThanOrEqual(50);
  expect(new Set(seen).size).toBeGreaterThan(5);
  await page.evaluate(() => (window as any).pl.pause());
  const held = await offset();
  await page.waitForTimeout(200);
  expect(await offset()).toBe(held);
  await page.evaluate(() => (window as any).pl.play());
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(150);
  const away = await offset();
  await page.waitForTimeout(200);
  expect(await offset()).toBe(away);
  await page.evaluate(() => {
    (window as any).pl.revert();
    (window as any).pl.revert();
  });
  expect(await page.$eval("#tpl", (el) => el.getAttribute("startOffset"))).toBeNull();
});
