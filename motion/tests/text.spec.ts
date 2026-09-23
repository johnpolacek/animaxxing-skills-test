import { test, expect, style } from "./fixture";

// Recipes: split-entrances.md, route-letters.md, speak-in.md, wave.md, blast-off.md

const ENTRANCES = ["charsRiseIn", "charsSpringIn", "charsCascadeIn", "charsFlipIn", "charsScatterIn", "wordsSlideIn", "linesMaskIn", "scrambleIn"];
const EXITS = ["charsFallOut", "charsCascadeOut", "charsFlipOut", "charsScatterOut", "wordsSlideOut", "linesMaskOut", "scrambleOut"];

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
