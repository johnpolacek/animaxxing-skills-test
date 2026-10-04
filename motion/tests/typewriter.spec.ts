import { test, expect, style } from "./fixture";

// Recipe: animaxxing/references/recipes/typewriter.md

test("typeIn types every character behind a caret, keeps the layout, and restores the markup", async ({ open }) => {
  const page = await open("typewriter");
  const original = await page.$eval("#t", (el) => el.innerHTML);
  const below = () => page.$eval("#after", (el) => el.getBoundingClientRect().top);
  const top = await below();
  const result = await page.evaluate(async () => {
    const { TW } = window as any;
    const el = document.getElementById("t")!;
    let fired = 0;
    const tl = TW.typeIn(el, { speed: 120, blinks: 1, onComplete: () => fired++ });
    const layer = el.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    const source = el.querySelector<HTMLElement>('span[style*="opacity: 0"]');
    const lengths: number[] = [];
    tl.eventCallback("onUpdate", () => lengths.push(layer.firstChild!.textContent!.length));
    const caret = !!el.querySelector("[data-caret]");
    const sourceText = source?.textContent;
    await new Promise((resolve) => setTimeout(resolve, tl.totalDuration() * 1000 + 300));
    return { fired, caret, sourceText, lengths, progress: tl.progress() };
  });
  expect(result.progress).toBe(1);
  expect(result.fired).toBe(1);
  expect(result.caret).toBe(true);
  expect(result.sourceText).toBe("Every way a pagecan move.");
  // Grows one character at a time, never backward, up to the whole text with its line break.
  const grew = result.lengths.every((n, i) => i === 0 || n >= result.lengths[i - 1]!);
  expect(grew).toBe(true);
  expect(Math.max(...result.lengths)).toBe("Every way a page\ncan move.".length);
  expect(await below()).toBe(top);
  expect(await page.$eval("#t", (el) => el.innerHTML)).toBe(original);
  expect(await page.$eval("#t", (el) => (el as HTMLElement).style.position)).toBe("");
  expect(await page.$eval("#t", (el) => (el as HTMLElement).style.color)).toBe("rgb(10, 20, 30)");
});

test("typeIn keeps the layout the same while typing", async ({ open }) => {
  const page = await open("typewriter");
  const sizes = await page.evaluate(() => {
    const { TW } = window as any;
    const el = document.getElementById("t")!;
    const box = () => {
      const r = el.getBoundingClientRect();
      return `${r.width}x${r.height}`;
    };
    const before = box();
    const tl = TW.typeIn(el, { speed: 60 });
    tl.pause();
    const seen = new Set<string>();
    for (let p = 0; p <= 1; p += 0.1) {
      tl.progress(p);
      seen.add(box());
    }
    tl.progress(1);
    return { before, seen: [...seen] };
  });
  expect(sizes.seen).toEqual([sizes.before]);
});

test("typeOut deletes last character first, ends hidden, and restores the markup", async ({ open }) => {
  const page = await open("typewriter");
  const original = await page.$eval("#t", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { TW } = window as any;
    const el = document.getElementById("t")!;
    let fired = 0;
    const tl = TW.typeOut(el, { speed: 120, onComplete: () => fired++ });
    const layer = el.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    const texts: string[] = [];
    tl.eventCallback("onUpdate", () => texts.push(layer.firstChild!.textContent!));
    await new Promise((resolve) => setTimeout(resolve, tl.totalDuration() * 1000 + 300));
    return { fired, texts, visibility: getComputedStyle(el).visibility };
  });
  expect(result.fired).toBe(1);
  expect(result.texts.every((t, i) => i === 0 || result.texts[i - 1]!.startsWith(t))).toBe(true);
  expect(result.texts[result.texts.length - 1]).toBe("");
  expect(result.visibility).toBe("hidden");
  expect(await page.$eval("#t", (el) => el.innerHTML)).toBe(original);
});

test("killing a typing run and calling revertTyping restores the heading", async ({ open }) => {
  const page = await open("typewriter");
  const original = await page.$eval("#t", (el) => el.innerHTML);
  await page.evaluate(() => {
    const { TW } = window as any;
    const el = document.getElementById("t")!;
    const tl = TW.typeIn(el, { speed: 10 });
    tl.progress(0.3);
    tl.kill();
    TW.revertTyping(el);
    TW.revertTyping(el);
  });
  expect(await page.$eval("#t", (el) => el.innerHTML)).toBe(original);
  expect(await page.$eval("#t", (el) => (el as HTMLElement).style.position)).toBe("");
});

test("the caret blinks under three flashes a second, then goes", async ({ open }) => {
  const page = await open("typewriter");
  const result = await page.evaluate(() => {
    const { TW, gsap } = window as any;
    const el = document.getElementById("t")!;
    const tl = TW.typeIn(el, { speed: 200, blinks: 3 });
    tl.pause(0);
    const caret = el.querySelector<HTMLElement>("[data-caret]")!;
    const changes: number[] = [];
    let last = true;
    for (let t = 0; t <= tl.duration(); t += 1 / 120) {
      tl.seek(t);
      const on = Number(gsap.getProperty(caret, "autoAlpha")) > 0;
      if (on !== last) changes.push(t);
      last = on;
    }
    tl.progress(1);
    const final = Number(gsap.getProperty(caret, "autoAlpha")) > 0;
    if (final !== last) changes.push(tl.duration());
    last = final;
    return { changes, endOn: last };
  });
  // Off and on again per blink, then off: 3 blinks make 7 changes.
  expect(result.changes.length).toBe(7);
  expect(result.endOn).toBe(false);
  // A flash is a pair of changes; pairs at least a third of a second apart.
  for (let i = 2; i < result.changes.length; i += 2) expect(result.changes[i]! - result.changes[i - 2]!).toBeGreaterThan(1 / 3);
});

test("typing under reduced motion never builds an overlay and still completes", async ({ open }) => {
  const page = await open("typewriter");
  const original = await page.$eval("#t", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { TW } = window as any;
    document.documentElement.dataset.motion = "reduced";
    const el = document.getElementById("t")!;
    let fired = 0;
    TW.typeIn(el, { onComplete: () => fired++ });
    const layered = !!el.querySelector('[aria-hidden="true"]');
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { fired, layered };
  });
  expect(result).toEqual({ fired: 1, layered: false });
  expect(await page.$eval("#t", (el) => el.innerHTML)).toBe(original);
});

test("retype deletes and types each word, stops on the last, reads once whole, and reverts", async ({ open }) => {
  const page = await open("typewriter");
  const original = await page.$eval("#line", (el) => el.innerHTML);
  const result = await page.evaluate(async () => {
    const { TW } = window as any;
    const word = document.getElementById("word")!;
    const r = TW.retype(word, ["developers", "writers"], { speed: 200, hold: 0.1 });
    // Every frame of the run, sampled by seeking, then played to the end for real.
    r.pause();
    const seen = new Set<string>();
    for (let t = 0; t <= r.timeline.duration(); t += 1 / 240) {
      r.timeline.seek(t, false);
      seen.add(word.textContent!);
    }
    r.timeline.seek(0);
    r.play();
    const hidden = word.getAttribute("aria-hidden");
    const spoken = Array.from(document.getElementById("line")!.querySelectorAll("span")).find((s) => s.style.clipPath === "inset(50%)")?.textContent;
    await new Promise((resolve) => r.timeline.eventCallback("onComplete", resolve));
    const end = word.textContent;
    const caretGone = getComputedStyle(document.querySelector("[data-caret]")!).visibility;
    r.revert();
    r.revert();
    return { seen: [...seen], hidden, spoken, end, caretGone, attr: word.getAttribute("aria-hidden") };
  });
  expect(result.hidden).toBe("true");
  expect(result.spoken).toBe("designers, developers, writers");
  expect(result.seen).toContain("");
  expect(result.seen).toContain("devel");
  expect(result.seen).toContain("developers");
  expect(result.end).toBe("writers");
  expect(result.caretGone).toBe("hidden");
  expect(result.attr).toBeNull();
  expect(await page.$eval("#line", (el) => el.innerHTML)).toBe(original);
});

test("retype pauses and plays, and does nothing under reduced motion", async ({ open }) => {
  const page = await open("typewriter");
  const result = await page.evaluate(async () => {
    const { TW } = window as any;
    const word = document.getElementById("word")!;
    const r = TW.retype(word, ["developers"], { speed: 40, hold: 0.05, loop: true });
    r.pause();
    const at = r.timeline.time();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const held = r.timeline.time() === at;
    r.play();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const moved = r.timeline.time() > at;
    r.revert();
    document.documentElement.dataset.motion = "reduced";
    const still = TW.retype(word, ["developers"]);
    const changed = word.textContent !== "designers" || !!document.querySelector("[data-caret]");
    still.revert();
    return { held, moved, changed };
  });
  expect(result).toEqual({ held: true, moved: true, changed: false });
  expect(await style(page, "#word")).toBe("");
});
