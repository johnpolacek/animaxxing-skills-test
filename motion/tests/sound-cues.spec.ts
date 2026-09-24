import { test, expect } from "./fixture";

// Recipe: animaxxing/references/recipes/sound-cues.md

type Page = import("@playwright/test").Page;

/** Builds the cues and wires the fixture's toggle the way the recipe's Wiring section does. */
const build = (page: Page, options = "{}") =>
  page.evaluate((o) => {
    const w = window as any;
    w.sound = w.SO.soundCues({ sources: { tick: w.TICK, bed: w.BED, missing: "missing.webm" }, ...eval(`(${o})`) });
    document.getElementById("toggle")!.onclick = () => w.sound.setEnabled(!w.sound.enabled());
  }, options);
const started = (page: Page) => page.evaluate(() => (window as any).audio.started.length);
const state = (page: Page) => page.evaluate(() => (window as any).audio.contexts[0]?.state ?? "none");
/** Turns sound on from a real click and waits for the cues to decode. */
const turnOn = async (page: Page) => {
  await page.click("#toggle");
  await page.waitForFunction(() => (window as any).audio.contexts.at(-1)?.state === "running");
  await page.waitForTimeout(200);
};

test("silent and contextless until the visitor turns sound on", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page);
  await page.evaluate(() => (window as any).sound.play("tick"));
  await page.mouse.click(300, 300);
  expect(await state(page)).toBe("none");
  expect(await started(page)).toBe(0);

  await turnOn(page);
  await page.evaluate(() => (window as any).sound.play("tick"));
  expect(await started(page)).toBe(1);
  // A missing file stays silent without errors.
  await page.evaluate(() => (window as any).sound.play("missing"));
  expect(await started(page)).toBe(1);
});

test("a stored preference unlocks on the first gesture", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page, "{ enabled: true }");
  expect(await state(page)).toBe("none");
  await page.mouse.click(300, 300);
  await page.waitForFunction(() => (window as any).audio.contexts[0]?.state === "running");
  expect(await page.evaluate(() => (window as any).sound.enabled())).toBe(true);
});

test("gap, voices, and pitch spread", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page, "{ gap: 0.3, vary: 40 }");
  await turnOn(page);
  await page.evaluate(() => {
    const s = (window as any).sound;
    s.play("tick");
    s.play("tick");
  });
  expect(await started(page)).toBe(1);
  await page.waitForTimeout(350);
  await page.evaluate(() => (window as any).sound.play("tick", { volume: 0.5 }));
  expect(await started(page)).toBe(2);
  const detunes = await page.evaluate(() => (window as any).audio.started.map((s: any) => s.detune));
  detunes.forEach((d: number) => expect(Math.abs(d)).toBeLessThanOrEqual(40));
  await page.evaluate(() => (window as any).sound.revert());

  // Reduced motion finishes timelines at once; the voice cap keeps a pile-up quiet.
  await build(page, "{ gap: 0, voices: 2 }");
  await turnOn(page);
  const before = await started(page);
  await page.evaluate(() => {
    const s = (window as any).sound;
    for (let i = 0; i < 5; i++) s.play("bed");
  });
  expect((await started(page)) - before).toBe(2);
});

test("timeline cues sound only moving forward", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page, "{ gap: 0 }");
  await turnOn(page);
  await page.evaluate(() => {
    const w = window as any;
    w.tl = w.gsap.timeline({ paused: true }).to({}, { duration: 0.2 });
    w.sound.cue(w.tl, "tick", 0.1);
    w.tl.play();
  });
  await page.waitForTimeout(400);
  expect(await started(page)).toBe(1);
  await page.evaluate(() => (window as any).tl.reverse());
  await page.waitForTimeout(400);
  expect(await started(page)).toBe(1);
});

test("off, hidden tab, ambient bed, and revert", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page);
  await page.evaluate(() => ((window as any).stopBed = (window as any).sound.ambient("bed", { fade: 0.1 })));
  await turnOn(page);
  expect(await page.evaluate(() => (window as any).audio.started.filter((s: any) => s.loop).length)).toBe(1);

  // Hiding the tab suspends; showing it resumes while on.
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await page.waitForFunction(() => (window as any).audio.contexts[0].state === "suspended");
  await setHidden(false);
  await page.waitForFunction(() => (window as any).audio.contexts[0].state === "running");

  // Off fades and suspends; plays are dropped.
  await page.click("#toggle");
  await page.waitForFunction(() => (window as any).audio.contexts[0].state === "suspended");
  const before = await started(page);
  await page.evaluate(() => (window as any).sound.play("tick"));
  expect(await started(page)).toBe(before);
  // Back on: the bed is still playing, not restarted.
  await page.click("#toggle");
  await page.waitForFunction(() => (window as any).audio.contexts[0].state === "running");
  expect(await page.evaluate(() => (window as any).audio.started.filter((s: any) => s.loop).length)).toBe(1);
  await page.evaluate(() => (window as any).stopBed());

  await page.evaluate(() => {
    (window as any).sound.revert();
    (window as any).sound.revert();
  });
  await page.waitForFunction(() => (window as any).audio.contexts[0].state === "closed");
  await page.evaluate(() => (window as any).sound.play("tick"));
  await page.mouse.click(300, 300);
  expect(await started(page)).toBe(before);
  expect(await page.evaluate(() => (window as any).audio.contexts.length)).toBe(1);
});

test("ambient after revert is a no-op", async ({ open }) => {
  const page = await open("sound-cues");
  await build(page);
  await turnOn(page);
  await page.evaluate(() => (window as any).sound.revert());
  const before = await started(page);
  await page.evaluate(() => (window as any).sound.ambient("bed")());
  expect(await started(page)).toBe(before);
});
