import { test, expect, style } from "./fixture";

// Recipes: split-entrances.md, route-letters.md, speak-in.md, wave.md, blast-off.md

const ENTRANCES = ["charsRiseIn", "charsSpringIn", "charsCascadeIn", "charsFlipIn", "charsScatterIn", "wordsSlideIn", "linesMaskIn", "linesEllipseIn", "linesHighlightIn", "scrambleIn"];
const EXITS = ["charsFallOut", "charsCascadeOut", "charsFlipOut", "charsScatterOut", "wordsSlideOut", "linesMaskOut", "linesEllipseOut", "linesHighlightOut", "scrambleOut"];

for (const name of [...ENTRANCES, ...EXITS, "charsWeightWave"]) {
  test(`${name} completes and restores the heading's markup`, async ({ open }) => {
    const page = await open("text");
    const original = await page.$eval("#h", (el) => el.innerHTML);
    const result = await page.evaluate(async (runner) => {
      const { SE } = window as any;
      let fired = 0;
      const timeline = SE[runner](document.getElementById("h"), { onComplete: () => fired++ });
      const splitDuring = document.getElementById("h")!.children.length > 0 || runner.startsWith("scramble");
      timeline.timeScale(8);
      await new Promise((resolve) => setTimeout(resolve, Math.max(300, (timeline.totalDuration() / 8) * 1000 + 250)));
      return { fired, splitDuring, progress: timeline.progress() };
    }, name);
    expect(result.progress).toBe(1);
    expect(result.fired).toBe(1);
    expect(result.splitDuring).toBe(true);
    expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
    const visibility = await page.$eval("#h", (el) => getComputedStyle(el).visibility);
    expect(visibility).toBe(EXITS.includes(name) ? "hidden" : "visible");
    if (!EXITS.includes(name)) expect(await style(page, "#h")).toMatch(/^(|visibility: inherit;|opacity: 1; visibility: inherit;|visibility: inherit; opacity: 1;)$/);
  });
}

test("split runners under reduced motion never split and still complete", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const results = await page.evaluate(async (names) => {
    const { SE } = window as any;
    document.documentElement.dataset.motion = "reduced";
    const out: Record<string, { fired: number; split: boolean }> = {};
    for (const name of names) {
      let fired = 0;
      SE[name](document.getElementById("h"), { onComplete: () => fired++ });
      const split = document.getElementById("h")!.children.length > 0;
      await new Promise((resolve) => setTimeout(resolve, 50));
      out[name] = { fired, split };
    }
    return out;
  }, [...ENTRANCES, ...EXITS]);
  for (const [name, result] of Object.entries(results)) expect(result, name).toEqual({ fired: 1, split: false });
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("route intro settles clean, and the outro completes hidden", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#page", (el) => el.innerHTML);
  const intro = await page.evaluate(async () => {
    const { RL } = window as any;
    let fired = 0;
    const timeline = RL.buildPageIntro(document.getElementById("page"), () => fired++);
    timeline.timeScale(8);
    await new Promise((resolve) => setTimeout(resolve, (timeline.totalDuration() / 8) * 1000 + 300));
    return fired;
  });
  expect(intro).toBe(1);
  expect(await page.$eval("#title", (el) => el.children.length)).toBe(0);
  for (const id of ["#title", "#item1", "#item2"]) {
    expect(await page.$eval(id, (el) => getComputedStyle(el).visibility), id).toBe("visible");
    expect(await page.$eval(id, (el) => (el as HTMLElement).style.transform), id).toBe("");
    expect(await page.$eval(id, (el) => (el as HTMLElement).style.willChange), id).toBe("");
  }

  const outro = await page.evaluate(async () => {
    const { RL } = window as any;
    let fired = 0;
    const timeline = RL.buildPageOutro(document.getElementById("page"), () => fired++);
    timeline.timeScale(8);
    await new Promise((resolve) => setTimeout(resolve, (timeline.totalDuration() / 8) * 1000 + 300));
    return fired;
  });
  expect(outro).toBe(1);
  for (const id of ["#item1", "#item2"]) expect(await page.$eval(id, (el) => getComputedStyle(el).visibility), id).toBe("hidden");
  expect(await page.$eval("#page", (el) => el.textContent)).toBe(await page.evaluate((html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent;
  }, original));
});

test("killing a route intro mid-way reverts its letter splits", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#title", (el) => el.innerHTML);
  const split = await page.evaluate(async () => {
    const timeline = (window as any).RL.buildPageIntro(document.getElementById("page"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const during = document.getElementById("title")!.children.length;
    timeline.kill();
    return during;
  });
  expect(split).toBeGreaterThan(0);
  expect(await page.$eval("#title", (el) => el.innerHTML)).toBe(original);
});

test("speak-in reveals every word, keeps finishes, and reverts to the source", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#sub", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { SI } = window as any;
    const el = document.getElementById("sub")!;
    (window as any).gsap.set(el, { autoAlpha: 0 });
    const spoken = SI.speakIn(el, { emphasis: ["rizz", { word: "cooked", finish: "tilt", angle: 4 }] });
    spoken.timeline.timeScale(8);
    await new Promise((resolve) => setTimeout(resolve, (spoken.timeline.totalDuration() / 8) * 1000 + 300));
    const hidden = spoken.words.filter((w: HTMLElement) => getComputedStyle(w).visibility !== "visible").length;
    const tilted = spoken.words.find((w: HTMLElement) => w.textContent?.startsWith("cooked"))?.style.transform ?? "";
    (window as any).spoken = spoken;
    return { words: spoken.words.length, hidden, tilted };
  });
  expect(result.words).toBe(12);
  expect(result.hidden).toBe(0);
  expect(result.tilted).toContain("rotate");
  await page.evaluate(() => (window as any).spoken.revert());
  expect(await page.$eval("#sub", (el) => el.innerHTML)).toBe(original);
});

test("speak-in under reduced motion shows the paragraph without splitting", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#sub", (el) => el.innerHTML);
  const words = await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    const spoken = (window as any).SI.speakIn(document.getElementById("sub"));
    spoken.timeline.progress(1);
    return spoken.words.length;
  });
  expect(words).toBe(0);
  expect(await page.$eval("#sub", (el) => el.innerHTML)).toBe(original);
  expect(await page.$eval("#sub", (el) => getComputedStyle(el).visibility)).toBe("visible");
});

test("wave ripples without drifting and its stop restores the heading", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  const box = () => page.$eval("#h", (el) => el.getBoundingClientRect().height);
  const height = await box();
  await page.evaluate(() => ((window as any).stop = (window as any).W.startWave(document.getElementById("h"), { period: 0.3 })));
  await page.waitForTimeout(1200);
  expect(await page.$eval("#h", (el) => el.querySelectorAll("div, span").length)).toBeGreaterThan(5);
  expect(await box()).toBe(height);
  await page.evaluate(() => {
    (window as any).stop();
    (window as any).stop();
  });
  await page.waitForTimeout(400);
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("wave pauses without re-splitting and resumes", async ({ open }) => {
  const page = await open("text");
  /** Whether any letter moves within `ms`, sampled every frame. */
  const moves = (ms: number) =>
    page.evaluate(async (window_) => {
      const heading = document.getElementById("h")!;
      const start = heading.innerHTML;
      const end = performance.now() + window_;
      let moved = false;
      while (performance.now() < end) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (heading.innerHTML !== start) moved = true;
      }
      return moved;
    }, ms);
  await page.evaluate(() => ((window as any).wave = (window as any).W.startWave(document.getElementById("h"), { period: 0.3 })));
  expect(await moves(900)).toBe(true);
  await page.evaluate(() => (window as any).wave.pause());
  // A pass already running lands at rest; wait for it rather than a fixed time.
  for (let i = 0; i < 10 && (await moves(400)); i++);
  const letters = await page.$eval("#h", (el) => el.querySelectorAll("div").length);
  expect(await moves(900)).toBe(false);
  expect(await page.$eval("#h", (el) => el.querySelectorAll("div").length)).toBe(letters);
  await page.evaluate(() => (window as any).wave.resume());
  expect(await moves(900)).toBe(true);
  await page.evaluate(() => (window as any).wave());
});

test("a wave stopped with keepSplit hands every letter over at rest", async ({ open }) => {
  const page = await open("text");
  const result = await page.evaluate(async () => {
    const heading = document.getElementById("h")!;
    const wave = (window as any).W.startWave(heading, { period: 0.2 });
    const letters = () => Array.from(heading.querySelectorAll<HTMLElement>("div"));
    const moving = () => letters().some((c) => c.style.transform || c.style.fontWeight || c.style.opacity);
    for (let i = 0; i < 300 && !moving(); i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    const caught = moving();
    wave(true);
    return { caught, moving: moving(), split: letters().length > 0, willChange: letters().some((c) => c.style.willChange) };
  });
  expect(result).toEqual({ caught: true, moving: false, split: true, willChange: false });
});

test("wave does nothing under reduced motion", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#h", (el) => el.innerHTML);
  await page.evaluate(() => {
    document.documentElement.dataset.motion = "reduced";
    (window as any).W.startWave(document.getElementById("h"), { period: 0.2 });
  });
  await page.waitForTimeout(500);
  expect(await page.$eval("#h", (el) => el.innerHTML)).toBe(original);
});

test("blast-off clears the hero, and its revert restores headline and container", async ({ open }) => {
  const page = await open("text");
  const heading = await page.$eval("#hh", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { SI, B } = window as any;
    const spoken = SI.speakIn(document.getElementById("sub"));
    spoken.timeline.progress(1);
    const blast = B.blastOff({
      root: document.getElementById("hero"),
      heading: document.getElementById("hh"),
      words: spoken.words,
      pressed: document.getElementById("go"),
      others: [document.getElementById("other")],
    });
    await new Promise((resolve) => setTimeout(resolve, blast.timeline.totalDuration() * 1000 + 300));
    const progress = blast.timeline.progress();
    const pressed = getComputedStyle(document.getElementById("go")!).visibility === "hidden" || Number(getComputedStyle(document.getElementById("go")!).opacity) < 0.05;
    blast.revert();
    spoken.revert();
    return { progress, pressed };
  });
  expect(result).toEqual({ progress: 1, pressed: true });
  expect(await page.$eval("#hh", (el) => el.innerHTML)).toBe(heading);
  for (const id of ["#hero", "#hh", "#go", "#other"]) expect(await style(page, id), id).toBe("");
});

test("linesEllipseIn clips each line mask with an ellipse that opens as the line rises", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#hl", (el) => el.innerHTML);
  const samples = await page.evaluate(async () => {
    const { SE } = window as any;
    const el = document.getElementById("hl")!;
    let done!: () => void;
    const finished = new Promise<void>((resolve) => (done = resolve));
    const tl = SE.linesEllipseIn(el, { onComplete: () => done() });
    tl.pause();
    const read = () => {
      const mask = el.firstElementChild as HTMLElement;
      const line = mask.firstElementChild as HTMLElement;
      return { clip: getComputedStyle(mask).clipPath, y: Number((window as any).gsap.getProperty(line, "yPercent")) };
    };
    tl.seek(0.01);
    const start = read();
    tl.seek(0.5);
    const mid = read();
    tl.timeScale(8).play();
    await finished;
    return { start, mid };
  });
  expect(samples.start.clip).toMatch(/^ellipse\(/);
  expect(samples.start.y).toBeGreaterThan(30);
  expect(samples.mid.y).toBeLessThan(samples.start.y);
  expect(samples.mid.clip).not.toBe(samples.start.clip);
  expect(await page.$eval("#hl", (el) => el.innerHTML)).toBe(original);
});

for (const id of ["hl", "hlr"]) {
  test(`linesHighlightIn bars span each line's words in ${id === "hlr" ? "RTL" : "LTR"} and leave nothing behind`, async ({ open }) => {
    const page = await open("text");
    const original = await page.$eval(`#${id}`, (el) => el.innerHTML);
    const result = await page.evaluate(async (target) => {
      const { SE } = window as any;
      const el = document.getElementById(target)!;
      let done!: () => void;
      const finished = new Promise<void>((resolve) => (done = resolve));
      const tl = SE.linesHighlightIn(el, { onComplete: () => done() });
      tl.pause();
      // The first line's bar has fully covered its words.
      tl.seek(0.34);
      const bars = Array.from(el.querySelectorAll<HTMLElement>("[aria-hidden='true'][style*='line-highlight']"));
      const firstLine = bars[0]!.parentElement!;
      const words = Array.from(firstLine.children).filter((child) => child !== bars[0]);
      const wordBox = words.map((word) => word.getBoundingClientRect());
      // The bar's layout box, not its transformed box: it is still scaling here.
      const lineBox = firstLine.getBoundingClientRect();
      const bar = { left: lineBox.left + bars[0]!.offsetLeft, right: lineBox.left + bars[0]!.offsetLeft + bars[0]!.offsetWidth };
      const hiddenWords = words.every((word) => getComputedStyle(word).visibility === "hidden");
      const out = {
        bars: bars.length,
        barLeft: bar.left,
        barRight: bar.right,
        wordsLeft: Math.min(...wordBox.map((box) => box.left)),
        wordsRight: Math.max(...wordBox.map((box) => box.right)),
        lineWidth: firstLine.getBoundingClientRect().width,
        hiddenWords,
        color: getComputedStyle(bars[0]!).backgroundColor,
      };
      tl.timeScale(8).play();
      await finished;
      return out;
    }, id);
    expect(result.bars).toBe(2);
    expect(result.hiddenWords).toBe(true);
    expect(Math.abs(result.barLeft - result.wordsLeft)).toBeLessThan(1.5);
    expect(Math.abs(result.barRight - result.wordsRight)).toBeLessThan(1.5);
    expect(result.barRight - result.barLeft).toBeLessThan(result.lineWidth / 2);
    if (id === "hl") expect(result.color).toBe("rgb(210, 255, 0)");
    expect(await page.$eval(`#${id}`, (el) => el.innerHTML)).toBe(original);
  });
}

test("a highlight run killed mid-sweep restores the text with no bars", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#hl", (el) => el.innerHTML);
  await page.evaluate(() => {
    const { SE } = window as any;
    const el = document.getElementById("hl")!;
    const tl = SE.linesHighlightIn(el);
    tl.pause().seek(0.4);
    tl.kill();
    SE.revertText(el);
  });
  expect(await page.$eval("#hl", (el) => el.innerHTML)).toBe(original);
});

for (const sample of [{ reduced: false, progress: 0.5 }, { reduced: false, progress: 1 }, { reduced: true, progress: 1 }]) {
  test(`blast-off preserves authored styles (reduced=${sample.reduced}, progress=${sample.progress})`, async ({ open }) => {
    const page = await open("text");
    const result = await page.evaluate((sample) => {
      if (sample.reduced) document.documentElement.dataset.motion = "reduced";
      const root = document.getElementById("hero")!;
      const pressed = document.getElementById("go")!;
      const other = document.getElementById("other")!;
      root.style.setProperty("transform", "translateX(24px)", "important");
      pressed.style.setProperty("filter", "contrast(1.2)", "important");
      other.style.filter = "brightness(0.8)";
      const read = () => [root.style.transform, root.style.getPropertyPriority("transform"), pressed.style.filter, pressed.style.getPropertyPriority("filter"), other.style.filter];
      const before = read();
      const blast = (window as any).B.blastOff({ root, heading: document.getElementById("hh"), pressed, others: [other], words: [] });
      blast.timeline.progress(sample.progress);
      blast.revert();
      blast.revert();
      return { before, after: read() };
    }, sample);
    expect(result.after).toEqual(result.before);
  });
}

const GLITCH_TYPES = ["slice", "blocks", "skew", "ghost", "weight", "scanline"];

for (const type of GLITCH_TYPES) {
  for (const runner of ["glitchIn", "glitchOut"]) {
    test(`${runner} ${type} jumps, completes once, and restores the heading exactly`, async ({ open }) => {
      const page = await open("text");
      const original = await page.$eval("#gh", (el) => el.innerHTML);
      const result = await page.evaluate(
        async ([name, kind]) => {
          const { SE, gsap } = window as any;
          const el = document.getElementById("gh")!;
          let fired = 0;
          const tl = SE[name](el, { type: kind, onComplete: () => fired++ });
          const copies = el.querySelectorAll('[aria-hidden="true"]').length;
          const ids = el.querySelectorAll("#gem").length;
          const source = Array.from(el.children).find((child) => (child as HTMLElement).style.opacity === "0");
          // Largest offset seen on any moving part while it runs.
          let peak = 0;
          tl.eventCallback("onUpdate", () => {
            const parts = [el, ...Array.from(el.querySelectorAll<HTMLElement>('[aria-hidden="true"], div, span'))];
            for (const part of parts) peak = Math.max(peak, Math.abs(Number(gsap.getProperty(part, "x"))), Math.abs(Number(gsap.getProperty(part, "skewX"))));
            const weights = Array.from(el.querySelectorAll<HTMLElement>("div")).map((c) => c.style.fontWeight);
            if (new Set(weights).size > 1) peak = Math.max(peak, 1);
          });
          await new Promise((resolve) => setTimeout(resolve, tl.totalDuration() * 1000 + 300));
          return { fired, copies, ids, hasSource: !!source, peak, progress: tl.progress() };
        },
        [runner, type],
      );
      expect(result.progress).toBe(1);
      expect(result.fired).toBe(1);
      expect(result.peak).toBeGreaterThan(0);
      if (!["skew", "weight"].includes(type)) {
        expect(result.copies).toBeGreaterThan(1);
        expect(result.ids).toBe(1);
        expect(result.hasSource).toBe(true);
      }
      expect(await page.$eval("#gh", (el) => el.innerHTML)).toBe(original);
      const css = await page.$eval("#gh", (el) => ({ position: el.style.position, transform: el.style.transform, visibility: getComputedStyle(el).visibility, padding: el.style.padding }));
      expect(css.position).toBe("");
      expect(css.transform === "" || /translate\(0px, 0px\)|none/.test(css.transform)).toBe(true);
      expect(css.padding).toBe("4px 10px");
      expect(css.visibility).toBe(runner === "glitchOut" ? "hidden" : "visible");
    });
  }
}

test("glitch killed mid-run restores the heading through revertText", async ({ open }) => {
  const page = await open("text");
  const original = await page.$eval("#gh", (el) => el.innerHTML);
  for (const type of GLITCH_TYPES) {
    await page.evaluate((kind) => {
      const { SE } = window as any;
      const el = document.getElementById("gh")!;
      const tl = SE.glitchIn(el, { type: kind });
      tl.progress(0.4);
      tl.kill();
      SE.revertText(el);
    }, type);
    expect(await page.$eval("#gh", (el) => el.innerHTML), type).toBe(original);
    expect(await page.$eval("#gh", (el) => el.style.position), type).toBe("");
  }
});

test("glitch under reduced motion never layers or splits and still completes", async ({ open }) => {
  const page = await open("text");
  const result = await page.evaluate(async () => {
    const { SE } = window as any;
    document.documentElement.dataset.motion = "reduced";
    const el = document.getElementById("gh")!;
    let fired = 0;
    SE.glitchIn(el, { type: "slice", onComplete: () => fired++ });
    const children = el.children.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { fired, children };
  });
  expect(result).toEqual({ fired: 1, children: 1 });
});

test("glitch shows and hides copies at most once each, under three flashes a second", async ({ open }) => {
  const page = await open("text");
  const flips = await page.evaluate(() => {
    const { SE, gsap } = window as any;
    const el = document.getElementById("gh")!;
    const counts: Record<string, number> = {};
    for (const kind of ["slice", "blocks", "ghost", "scanline"]) {
      const tl = SE.glitchIn(el, { type: kind });
      tl.pause(0);
      const layers = Array.from(el.querySelectorAll<HTMLElement>('[aria-hidden="true"]'));
      const shown = () => layers.map((layer) => Number(gsap.getProperty(layer, "autoAlpha")) > 0);
      let last = shown();
      let most = 0;
      const changes = layers.map(() => 0);
      for (let t = 0; t <= tl.duration(); t += 1 / 60) {
        tl.seek(t);
        const now = shown();
        now.forEach((on, i) => {
          if (on !== last[i]) changes[i]!++;
        });
        last = now;
      }
      most = Math.max(...changes);
      tl.progress(1);
      counts[kind] = most;
    }
    return counts;
  });
  for (const [kind, most] of Object.entries(flips)) expect(most, kind).toBeLessThanOrEqual(2);
});
