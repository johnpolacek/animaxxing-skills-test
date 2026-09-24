import { test, expect, style, prop, declarations, declared } from "./fixture";

// Recipe: animaxxing/references/recipes/page-covers.md

const panelStates = (page: import("@playwright/test").Page) =>
  page.$$eval(".curtain-panel", (panels) =>
    panels.map((panel) => ({
      visibility: getComputedStyle(panel).visibility,
      y: Number((window as any).gsap.getProperty(panel, "yPercent")),
    })),
  );

test("curtain rests hidden, covers and blocks clicks, then reveals and restores", async ({ open }) => {
  const page = await open("page-covers");
  await page.evaluate(() => {
    // The preloader shares this fixture; take it out of the way.
    document.getElementById("pre")!.style.display = "none";
    (window as any).c = (window as any).PC.curtain(".curtain-panel", { duration: 0.2, stagger: 0.03 });
  });
  expect((await panelStates(page)).map((p) => p.visibility)).toEqual(["hidden", "hidden", "hidden"]);
  // At rest the page is clickable through the curtain.
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.id)).toBe("page-button");

  const covered = await page.evaluate(async () => {
    let fired = 0;
    (window as any).c.cover().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fired;
  });
  expect(covered).toBe(1);
  expect(await panelStates(page)).toEqual([
    { visibility: "visible", y: 0 },
    { visibility: "visible", y: 0 },
    { visibility: "visible", y: 0 },
  ]);
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.className)).toBe("curtain-panel");

  await page.evaluate(async () => {
    (window as any).c.reveal();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  expect((await panelStates(page)).map((p) => p.visibility)).toEqual(["hidden", "hidden", "hidden"]);
  expect(await page.evaluate(() => document.elementFromPoint(220, 210)?.id)).toBe("page-button");

  await page.evaluate(() => {
    (window as any).c.revert();
    (window as any).c.revert();
  });
  for (const style_ of await page.$$eval(".curtain-panel", (panels) => panels.map((p) => p.getAttribute("style") ?? ""))) expect(style_).toBe("");
});

test("a cover requested mid-reveal turns the panels back from where they are", async ({ open }) => {
  const page = await open("page-covers");
  const turned = await page.evaluate(async () => {
    const { PC, gsap } = window as any;
    const c = PC.curtain(".curtain-panel", { duration: 0.4, stagger: 0 });
    c.cover().progress(1);
    c.reveal();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const panel = document.querySelector(".curtain-panel")!;
    const leaving = Number(gsap.getProperty(panel, "yPercent"));
    c.cover();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { leaving, turning: Number(gsap.getProperty(panel, "yPercent")) };
  });
  // Moving out upward, then back down toward 0: never reset to the bottom edge.
  expect(turned.leaving).toBeLessThan(0);
  expect(turned.turning).toBeLessThan(0);
  expect(turned.turning).toBeGreaterThanOrEqual(turned.leaving);
  await page.waitForTimeout(600);
  expect((await panelStates(page)).every((p) => p.visibility === "visible" && Math.abs(p.y) < 0.5)).toBe(true);
});

test("curtain under reduced motion completes without ever showing a panel", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const c = (window as any).PC.curtain(".curtain-panel");
    let fired = 0;
    let shown = false;
    const watch = () => document.querySelectorAll(".curtain-panel").forEach((p) => (shown ||= getComputedStyle(p).visibility === "visible"));
    c.cover().eventCallback("onComplete", () => fired++);
    for (let i = 0; i < 5; i++) {
      watch();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    c.reveal().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { fired, shown };
  });
  expect(result).toEqual({ fired: 2, shown: false });
});

test("preloader follows reported progress forward only, finishes hidden, and restores", async ({ open }) => {
  const page = await open("page-covers");
  await page.evaluate(() => ((window as any).p = (window as any).PC.preloader(document.getElementById("pre"), { catchUp: 0.1 })));
  await page.evaluate(() => (window as any).p.progress(0.5));
  await page.waitForTimeout(300);
  const half = await page.$eval("#pre", (el) => [el.querySelector("[data-preloader-count]")!.textContent, el.getAttribute("aria-valuenow")]);
  expect(half).toEqual(["50", "50"]);
  expect(await prop(page, "[data-preloader-bar]", "scaleX")).toBeCloseTo(0.5, 2);

  await page.evaluate(() => (window as any).p.progress(0.3));
  await page.waitForTimeout(200);
  expect(await page.$eval("[data-preloader-count]", (el) => el.textContent)).toBe("50");

  const fired = await page.evaluate(async () => {
    let done = 0;
    (window as any).p.finish().eventCallback("onComplete", () => done++);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return done;
  });
  expect(fired).toBe(1);
  expect(await page.$eval("#pre", (el) => [getComputedStyle(el).visibility, el.getAttribute("aria-valuenow")])).toEqual(["hidden", "100"]);

  await page.evaluate(() => {
    (window as any).p.revert();
    (window as any).p.revert();
  });
  expect(await style(page, "#pre")).toBe("");
  expect(await style(page, "[data-preloader-bar]")).toBe("");
  expect(await page.$eval("#pre", (el) => [el.querySelector("[data-preloader-count]")!.textContent, el.getAttribute("aria-valuenow")])).toEqual(["0", "0"]);
});

test("preloader under reduced motion jumps to progress and hides at once", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    document.documentElement.dataset.motion = "reduced";
    const p = (window as any).PC.preloader(document.getElementById("pre"));
    p.progress(0.4);
    const count = document.querySelector("[data-preloader-count]")!.textContent;
    let fired = 0;
    p.finish().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { count, fired, visibility: getComputedStyle(document.getElementById("pre")!).visibility };
  });
  expect(result).toEqual({ count: "40", fired: 1, visibility: "hidden" });
});

test("curtain tilt leans panels in and out; the title shows while covered and restores", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    const w = window as any;
    document.getElementById("pre")!.style.display = "none";
    const title = document.getElementById("ctitle")!;
    const panel = document.querySelector(".curtain-panel")!;
    const c = w.PC.curtain(".curtain-panel", { duration: 0.3, stagger: 0, tilt: 8, title });
    const rotation = () => Number(w.gsap.getProperty(panel, "rotation"));
    // Extremes of the lean while each sweep runs.
    const run = async (tl: any) => {
      let min = Infinity;
      let max = -Infinity;
      tl.eventCallback("onUpdate", () => {
        min = Math.min(min, rotation());
        max = Math.max(max, rotation());
      });
      await new Promise((resolve) => tl.eventCallback("onComplete", resolve));
      return [min, max];
    };
    const cover = await run(c.cover("About"));
    const covered = [rotation(), title.textContent, getComputedStyle(title).visibility];
    const reveal = await run(c.reveal());
    const revealed = getComputedStyle(title).visibility;
    c.revert();
    return { cover, covered, reveal, revealed, text: title.textContent };
  });
  expect(result.cover[1]).toBeGreaterThan(4);
  expect(result.covered).toEqual([0, "About", "visible"]);
  expect(result.reveal[0]).toBeLessThan(-4);
  expect(result.revealed).toBe("hidden");
  expect(result.text).toBe("Old");
  expect(await declarations(page, "#ctitle")).toEqual(await declared(page, "position:absolute;inset:0;margin:0;color:#fff;visibility:hidden"));
  expect(await page.$$eval(".curtain-panel", (panels) => panels.map((panel) => panel.getAttribute("style") ?? ""))).toEqual(["", "", ""]);
});

test("curtain wipe opens a clip-path from the entry edge without moving the panels, then clears", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    const w = window as any;
    document.getElementById("pre")!.style.display = "none";
    const panel = document.querySelector<HTMLElement>(".curtain-panel")!;
    const c = w.PC.curtain(".curtain-panel", { duration: 0.2, stagger: 0, wipe: true, tilt: 8 });
    let moved = 0;
    const watch = () => (moved = Math.max(moved, Math.abs(Number(w.gsap.getProperty(panel, "yPercent"))), Math.abs(Number(w.gsap.getProperty(panel, "rotation")))));
    const run = (tl: any) => {
      const clips: string[] = [];
      tl.eventCallback("onUpdate", () => {
        watch();
        clips.push(getComputedStyle(panel).clipPath);
      });
      return new Promise<string[]>((resolve) => tl.eventCallback("onComplete", () => resolve(clips)));
    };
    const coverClips = await run(c.cover());
    const covered = { clip: getComputedStyle(panel).clipPath, visibility: getComputedStyle(panel).visibility };
    const hit = document.elementFromPoint(220, 210)?.className;
    const revealClips = await run(c.reveal());
    const revealed = getComputedStyle(panel).visibility;
    c.revert();
    return { coverClips, covered, hit, revealClips, revealed, moved };
  });
  expect(result.moved).toBe(0);
  expect(result.coverClips.length).toBeGreaterThan(1);
  expect(result.coverClips.every((clip) => clip.startsWith("polygon("))).toBe(true);
  expect(result.covered).toEqual({ clip: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", visibility: "visible" });
  expect(result.hit).toBe("curtain-panel");
  // Closing toward the top edge: the top points stay put while the bottom points rise. The last update is the reset.
  expect(result.revealClips.at(-2)).toMatch(/^polygon\(0% 0%, 100% 0%, 100% [0-9.]+%, 0% [0-9.]+%\)$/);
  expect(result.revealed).toBe("hidden");
  expect(await page.$$eval(".curtain-panel", (panels) => panels.map((panel) => panel.getAttribute("style") ?? ""))).toEqual(["", "", ""]);
});

test("a wipe cover requested mid-reveal turns back from the current clip", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    const { PC } = window as any;
    document.getElementById("pre")!.style.display = "none";
    const panel = document.querySelector<HTMLElement>(".curtain-panel")!;
    const c = PC.curtain(".curtain-panel", { duration: 0.4, stagger: 0, wipe: true });
    c.cover().progress(1);
    c.reveal();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const leaving = getComputedStyle(panel).clipPath;
    c.cover();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const turning = getComputedStyle(panel).clipPath;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { leaving, turning, end: getComputedStyle(panel).clipPath, visibility: getComputedStyle(panel).visibility };
  });
  // Partly closed toward the top, never snapped back to the bottom edge.
  expect(result.leaving).not.toBe("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)");
  expect(result.turning).toMatch(/^polygon\(0% 0%, 100% 0%/);
  expect(result.end).toBe("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)");
  expect(result.visibility).toBe("visible");
});

test("curtain drift carries the content away on cover, trails it in on reveal, and leaves no transform", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    const w = window as any;
    document.getElementById("pre")!.style.display = "none";
    const content = document.querySelector("main")!;
    const c = w.PC.curtain(".curtain-panel", { duration: 0.2, stagger: 0, drift: { content, distance: 0.2 } });
    // Read the computed matrix: gsap.getProperty would write inline transform longhands.
    const y = () => new DOMMatrix(getComputedStyle(content).transform).m42;
    await new Promise((resolve) => c.cover().eventCallback("onComplete", resolve));
    const covered = y();
    let most = 0;
    const reveal = c.reveal();
    reveal.eventCallback("onUpdate", () => (most = Math.max(most, y())));
    await new Promise((resolve) => reveal.eventCallback("onComplete", resolve));
    const after = content.getAttribute("style") ?? "";
    // Revert mid-cover also restores the wrapper.
    c.cover();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const moving = y();
    c.revert();
    return { covered, most, after, moving, reverted: content.getAttribute("style") ?? "", height: innerHeight };
  });
  expect(result.covered).toBeCloseTo(-0.2 * result.height, 0);
  expect(result.most).toBeGreaterThan(0.1 * result.height);
  expect(result.after).toBe("");
  expect(result.moving).toBeLessThan(0);
  expect(result.reverted).toBe("");
});

test("curtain drift under reduced motion never moves the content", async ({ open }) => {
  const page = await open("page-covers");
  const result = await page.evaluate(async () => {
    const w = window as any;
    document.documentElement.dataset.motion = "reduced";
    const content = document.querySelector("main")!;
    const c = w.PC.curtain(".curtain-panel", { wipe: true, drift: { content } });
    let fired = 0;
    c.cover().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 60));
    c.reveal().eventCallback("onComplete", () => fired++);
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { fired, y: new DOMMatrix(getComputedStyle(content).transform).m42, style: content.getAttribute("style") ?? "" };
  });
  expect(result).toEqual({ fired: 2, y: 0, style: "" });
});
