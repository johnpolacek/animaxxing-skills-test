import { test, expect, style, prop } from "./fixture";

// Recipe: animaxxing/references/recipes/media-effects.md

/** Center pixel of the sequence canvas as [r, g, b, a]. */
const pixel = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById("cv") as HTMLCanvasElement;
    return Array.from(canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
  });

/** Installs a fake video with controllable metadata; the recipe only reads duration and readyState and writes currentTime. */
const stubVideo = (page: import("@playwright/test").Page, readyState: number) =>
  page.evaluate((state) => {
    const video = document.getElementById("vid") as HTMLVideoElement;
    let time = 0;
    Object.defineProperty(video, "duration", { get: () => 10, configurable: true });
    Object.defineProperty(video, "readyState", { get: () => state, configurable: true });
    Object.defineProperty(video, "currentTime", { get: () => time, set: (value: number) => (time = value), configurable: true });
  }, readyState);

test("image reveal clips the frame, settles the image, completes, and leaves nothing inline", async ({ open }) => {
  const page = await open("media-effects");
  const initial = await page.evaluate(() => {
    const { ME, gsap } = window as any;
    (window as any).fired = 0;
    (window as any).r = ME.imageReveal(document.getElementById("f1"), { direction: "left", onComplete: () => (window as any).fired++ });
    // The controller composes the timeline into its own intro.
    (window as any).parent = gsap.timeline().add((window as any).r.timeline, 0);
    return [document.getElementById("f1")!.getAttribute("style"), document.getElementById("i1")!.getAttribute("style")];
  });
  expect(initial[0]).toBe("border-radius: 4px; clip-path: inset(0% 0% 0% 100%);");
  expect(initial[1]).toMatch(/scale\(1\.15/);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect(await style(page, "#f1")).toBe("border-radius: 4px;");
  expect(await style(page, "#i1")).toBe("transform: translateZ(0px);");
  await page.evaluate(() => {
    (window as any).r.revert();
    (window as any).r.revert();
  });
  expect(await style(page, "#f1")).toBe("border-radius: 4px;");
});

test("a scroll reveal waits clipped but reachable, opens on entry, and restores", async ({ open }) => {
  const page = await open("media-effects");
  await page.evaluate(() => {
    (window as any).fired = 0;
    (window as any).r = (window as any).ME.imageReveal(document.getElementById("f3"), { onScroll: true, duration: 0.3, onComplete: () => (window as any).fired++ });
  });
  await page.waitForTimeout(200);
  // Chrome serializes the closed inset in shorthand.
  expect(await style(page, "#f3")).toMatch(/^clip-path: inset\(100% 0% 0%( 0%)?\);$/);
  // Clip only: the image keeps its place in the accessibility tree.
  expect(await page.$eval("#f3", (el) => getComputedStyle(el).visibility)).toBe("visible");
  expect(await page.locator("#f3").ariaSnapshot()).toContain("Three");
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(1);

  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as any).fired)).toBe(1);
  expect(await style(page, "#f3")).toBe("");
  expect(await style(page, "#i3")).toBe("");
  await page.evaluate(() => (window as any).r.revert());
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
});

test("focus inside a waiting frame opens it without scrolling", async ({ open }) => {
  const page = await open("media-effects");
  const result = await page.evaluate(async () => {
    (window as any).r = (window as any).ME.imageReveal(document.getElementById("f3"), { onScroll: true, duration: 0.1 });
    document.getElementById("g")!.focus({ preventScroll: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { style: document.getElementById("f3")!.getAttribute("style") ?? "", scrollY };
  });
  expect(result).toEqual({ style: "", scrollY: 0 });
  await page.evaluate(() => (window as any).r.revert());
});

test("a throwing reveal setup rolls back the clip and rethrows", async ({ open }) => {
  const page = await open("media-effects");
  const result = await page.evaluate(() => {
    const { ME, ST, gsap } = window as any;
    const create = ST.create;
    ST.create = () => {
      throw new Error("boom");
    };
    try {
      ME.imageReveal(document.getElementById("f1"), { onScroll: true });
      return "no throw";
    } catch (error) {
      ST.create = create;
      // The failed setup must not stay GSAP's current context.
      return `${(error as Error).message}|${document.getElementById("f1")!.getAttribute("style")}|${document.getElementById("i1")!.getAttribute("style")}|${!!gsap.context()}|${ST.getAll().length}`;
    }
  });
  expect(result).toBe("boom|border-radius: 4px;|transform: translateZ(0px);|false|0");
});

test("hover preview follows the mouse, crossfades between items, hides on leave, and restores", async ({ open }) => {
  const page = await open("media-effects");
  await page.evaluate(() => {
    document.getElementById("pv")!.removeAttribute("aria-hidden");
    (window as any).t = (window as any).ME.hoverPreview(document.getElementById("list"), document.getElementById("pv"));
  });
  expect(await page.$eval("#pv", (el) => el.getAttribute("aria-hidden"))).toBe("true");
  const visibleSrc = () =>
    page.$$eval("#pv img", (imgs) => imgs.filter((img) => Number(getComputedStyle(img).opacity) > 0.9).map((img) => (img as HTMLImageElement).src));

  await page.mouse.move(100, 320);
  await page.waitForTimeout(500);
  expect(await page.$eval("#pv", (el) => getComputedStyle(el).visibility)).toBe("visible");
  expect(Math.abs((await prop(page, "#pv", "x")) - 124)).toBeLessThan(2);
  expect(await visibleSrc()).toEqual([await page.$eval("#l1", (el) => (el as HTMLElement).dataset.preview)]);

  await page.mouse.move(100, 370, { steps: 3 });
  await page.waitForTimeout(600);
  expect(Math.abs((await prop(page, "#pv", "y")) - 394)).toBeLessThan(2);
  expect(await visibleSrc()).toEqual([await page.$eval("#l2", (el) => (el as HTMLElement).dataset.preview)]);

  await page.mouse.move(600, 600);
  await page.waitForTimeout(500);
  expect(await page.$eval("#pv", (el) => getComputedStyle(el).visibility)).toBe("hidden");

  // The preview never gates the link.
  await page.mouse.click(100, 420);
  expect(await page.evaluate(() => location.hash)).toBe("#p3");

  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$$eval("#pv img", (imgs) => imgs.length)).toBe(0);
  expect(await style(page, "#pv")).toBe("");
  expect(await page.$eval("#pv", (el) => el.hasAttribute("aria-hidden"))).toBe(false);
});

test("hover preview ignores touch and pen", async ({ open }) => {
  const page = await open("media-effects");
  const result = await page.evaluate(async () => {
    (window as any).t = (window as any).ME.hoverPreview(document.getElementById("list"), document.getElementById("pv"));
    const item = document.getElementById("l1")!;
    for (const pointerType of ["touch", "pen"]) {
      item.dispatchEvent(new PointerEvent("pointerover", { pointerType, clientX: 100, clientY: 320, bubbles: true }));
      item.dispatchEvent(new PointerEvent("pointermove", { pointerType, clientX: 100, clientY: 320, bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const preview = document.getElementById("pv")!;
    const shown = Array.from(preview.querySelectorAll("img")).filter((img) => img.src).length;
    (window as any).t();
    return { visibility: getComputedStyle(preview).visibility, shown };
  });
  expect(result).toEqual({ visibility: "hidden", shown: 0 });
});

test("scrub video waits for metadata, follows the scroll both ways, and restores", async ({ open }) => {
  const page = await open("media-effects");
  await stubVideo(page, 0);
  await page.evaluate(() => {
    const video = document.getElementById("vid") as HTMLVideoElement;
    video.muted = false;
    (window as any).t = (window as any).ME.scrubVideo(video);
  });
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  expect(await page.$eval("#vid", (el) => (el as HTMLVideoElement).muted)).toBe(true);
  await page.evaluate(() => document.getElementById("vid")!.dispatchEvent(new Event("loadedmetadata")));
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(1);

  // The section spans scroll 1400 to 2800; halfway is 5 s of a 10 s clip.
  await page.evaluate(() => window.scrollTo(0, 2100));
  await page.waitForTimeout(1000);
  expect(Math.abs((await page.$eval("#vid", (el) => (el as HTMLVideoElement).currentTime)) - 5)).toBeLessThan(0.3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  expect(await page.$eval("#vid", (el) => (el as HTMLVideoElement).currentTime)).toBeLessThan(0.05);

  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  expect(await page.$eval("#vid", (el) => (el as HTMLVideoElement).muted)).toBe(false);
});

test("scrub video torn down before metadata never builds a trigger", async ({ open }) => {
  const page = await open("media-effects");
  await stubVideo(page, 0);
  const count = await page.evaluate(() => {
    const video = document.getElementById("vid") as HTMLVideoElement;
    const teardown = (window as any).ME.scrubVideo(video);
    teardown();
    video.dispatchEvent(new Event("loadedmetadata"));
    return (window as any).ST.getAll().length;
  });
  expect(count).toBe(0);
});

test("frame sequence loads near the section, draws the scrubbed frame, sizes to the canvas, and restores", async ({ open }) => {
  const page = await open("media-effects");
  await page.evaluate(() => ((window as any).t = (window as any).ME.frameSequence(document.getElementById("cv"), (window as any).FRAMES)));
  await page.waitForTimeout(300);
  expect(await page.$eval("#cv", (el) => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height])).toEqual([200, 100]);
  // Nothing loads until the section is within a viewport of the fold.
  expect((await pixel(page))[3]).toBe(0);
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(2);

  // The section spans scroll 3500 to 4900; 4300 asks for frame round(7 * 800 / 1400) = 4.
  await page.evaluate(() => window.scrollTo(0, 4300));
  await expect.poll(() => pixel(page), { timeout: 3000 }).toEqual([128, 0, 127, 255]);
  await page.evaluate(() => window.scrollTo(0, 5000));
  await expect.poll(() => pixel(page), { timeout: 3000 }).toEqual([224, 0, 31, 255]);
  await page.evaluate(() => window.scrollTo(0, 3400));
  await expect.poll(() => pixel(page), { timeout: 3000 }).toEqual([0, 0, 255, 255]);

  await page.evaluate(() => {
    (window as any).t();
    (window as any).t();
  });
  expect(await page.$eval("#cv", (el) => [el.hasAttribute("width"), el.hasAttribute("height"), (el as HTMLCanvasElement).width])).toEqual([false, false, 300]);
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
});

test("frame sequence draws the nearest loaded frame when others fail", async ({ open }) => {
  const page = await open("media-effects");
  await page.evaluate(() => {
    // Frames 4 to 7 never load; the sequence end must fall back to frame 3.
    const frames = (window as any).FRAMES.map((src: string, i: number) => (i < 4 ? src : "data:,"));
    (window as any).t = (window as any).ME.frameSequence(document.getElementById("cv"), frames, { concurrency: 2 });
    window.scrollTo(0, 5000);
  });
  await expect.poll(() => pixel(page), { timeout: 3000 }).toEqual([96, 0, 159, 255]);
  await page.evaluate(() => (window as any).t());
});

test("a throwing sequence setup rolls back the canvas size and rethrows", async ({ open }) => {
  const page = await open("media-effects");
  const result = await page.evaluate(() => {
    const { ME, ST, gsap } = window as any;
    const Observer = window.ResizeObserver;
    (window as any).ResizeObserver = class {
      constructor() {
        throw new Error("boom");
      }
    };
    try {
      ME.frameSequence(document.getElementById("cv"), (window as any).FRAMES);
      return "no throw";
    } catch (error) {
      (window as any).ResizeObserver = Observer;
      const canvas = document.getElementById("cv") as HTMLCanvasElement;
      return `${(error as Error).message}|${canvas.hasAttribute("width")}|${canvas.width}|${!!gsap.context()}|${ST.getAll().length}`;
    }
  });
  expect(result).toBe("boom|false|300|false|0");
});

test("reduced motion: reveals complete unclipped, preview and video build nothing, sequence draws one still", async ({ open }) => {
  const page = await open("media-effects");
  await stubVideo(page, 1);
  const result = await page.evaluate(async () => {
    const { ME, ST } = window as any;
    document.documentElement.dataset.motion = "reduced";
    let fired = 0;
    const reveal = ME.imageReveal(document.getElementById("f1"), { onComplete: () => fired++ });
    const waiting = ME.imageReveal(document.getElementById("f3"), { onScroll: true, onComplete: () => fired++ });
    const preview = ME.hoverPreview(document.getElementById("list"), document.getElementById("pv"));
    const video = ME.scrubVideo(document.getElementById("vid"));
    (window as any).seq = ME.frameSequence(document.getElementById("cv"), (window as any).FRAMES, { still: 6 });
    const clipped = document.getElementById("f1")!.getAttribute("style");
    // Only the waiting reveal's trigger exists; the video and sequence built none.
    const triggers = ST.getAll().length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = fired;
    window.scrollTo(0, 700);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const snapshot = {
      clipped,
      triggers,
      before,
      fired,
      layers: document.querySelectorAll("#pv img").length,
      canvasWidth: (document.getElementById("cv") as HTMLCanvasElement).width,
    };
    reveal.revert();
    waiting.revert();
    preview();
    video();
    return snapshot;
  });
  expect(result).toEqual({ clipped: "border-radius: 4px", triggers: 1, before: 1, fired: 2, layers: 0, canvasWidth: 200 });
  expect(await pixel(page)).toEqual([192, 0, 63, 255]);
  await page.evaluate(() => (window as any).seq());
  expect(await page.evaluate(() => (window as any).ST.getAll().length)).toBe(0);
  expect(await style(page, "#f1")).toBe("border-radius: 4px;");
});
