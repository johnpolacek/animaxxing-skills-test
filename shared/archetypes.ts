import type { Page } from "@playwright/test";
import { test, expect, expectSettledClean, type PhaseEvent } from "./lifecycle";

// Transition archetypes: see "Transition archetypes" in CONTRACT.md.
// The archetypes are not part of TASK.md, so agent-built apps skip this suite.

type Box = { x: number; y: number; w: number; h: number };
type Seen = { box: Box | null; visible: boolean };
type Sample = { path: string; thumb: Seen; hero: Seen; curtain: string | null; panelsVisible: boolean };
type ScrollFrame = { path: string; phase: string | null; y: number; wheeled: boolean };

const near = (a: Box, b: Box, tolerance: number) =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.w - b.w) <= tolerance && Math.abs(a.h - b.h) <= tolerance;

/** `/gallery/` and `/gallery` are the same route; frameworks differ on the trailing slash. */
const routeOf = (path: string) => path.replace(/\/$/, "") || "/";

/** Phase events for one route, however the app spells its trailing slash. */
const phasesAt = (events: PhaseEvent[], path: string) => events.filter((e) => routeOf(e.path) === path).map((e) => e.phase);

/** Dispatches a click without Playwright scrolling the target into view first. */
const clickInPlace = (page: Page, testId: string) =>
  page.evaluate((id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click(), testId);

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

const center = (page: Page) => {
  const size = page.viewportSize()!;
  return { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) };
};

const THUMB = (n: number) => `[data-shared="item-${n}"]:not([data-shared-hero])`;
const HERO = (n: number) => `[data-shared="item-${n}"][data-shared-hero]`;

/**
 * After a history move, waits for the destination page to settle. Some routers
 * change the URL before swapping, so the outgoing page can still be live, and
 * settled, under the new URL for a moment.
 */
async function settleAfterHistory(page: Page, phases: PhaseEvent[], path: RegExp, since: number) {
  await expect(page).toHaveURL((url) => path.test(url.pathname));
  await expect.poll(() => phases.slice(since).some((event) => path.test(event.path) && event.phase === "settled"), { timeout: 5000 }).toBe(true);
  await expectSettledClean(page);
}

async function settleAt(page: Page, path: string) {
  await page.goto(path);
  await expectSettledClean(page);
  await page.mouse.move(400, 300);
}

/**
 * Samples every frame for `ms` after `trigger`: the path, item N's thumbnail
 * and hero (box, and whether actually visible), and the curtain.
 */
async function sampleFrames(page: Page, n: number, ms: number, trigger: () => Promise<unknown>) {
  await page.evaluate(
    ([thumbSel, heroSel, duration]) => {
      const samples: Sample[] = [];
      (window as any).__frames = samples;
      const end = performance.now() + (duration as number);
      const seen = (sel: string): Seen => {
        const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((candidate) =>
          candidate.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        );
        if (!el) return { box: null, visible: false };
        const r = el.getBoundingClientRect();
        let opacity = 1;
        for (let node: HTMLElement | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        return { box: { x: r.left, y: r.top, w: r.width, h: r.height }, visible: opacity > 0.5 && r.width > 0 };
      };
      const frame = () => {
        const curtain = document.querySelector<HTMLElement>("[data-curtain]");
        samples.push({
          path: location.pathname.replace(/\/$/, "") || "/",
          thumb: seen(thumbSel as string),
          hero: seen(heroSel as string),
          curtain: curtain?.getAttribute("data-curtain-phase") ?? null,
          panelsVisible: Array.from(document.querySelectorAll("[data-curtain-panel]")).some((p) => getComputedStyle(p).visibility === "visible"),
        });
        if (performance.now() < end) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    [THUMB(n), HERO(n), ms] as const,
  );
  await trigger();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as any).__frames as Sample[]);
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).filter({ visible: true }).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
}

/** Waits for the visible page to reach a phase, checking every frame rather than on the assertion schedule. */
const waitForPhaseFrame = (page: Page, phase: string, timeout: number) =>
  page
    .waitForFunction(
      (wanted) => Array.from(document.querySelectorAll<HTMLElement>("[data-page]")).some((el) => el.offsetParent !== null && el.getAttribute("data-phase") === wanted),
      phase,
      { timeout },
    )
    .catch(() => {});

export function archetypeTests() {
  test.describe("Archetypes", () => {
    test.skip(!!process.env.APP_DIR, "Archetypes are not part of TASK.md; they run against the reference app only.");

    test("Scroller: Lenis runs, and wheel input eases", async ({ page }) => {
      await settleAt(page, "/gallery");
      await expect(page.locator("html")).toHaveClass(/(^|\s)lenis(\s|$)/);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(80);
      const early = await scrollY(page);
      await page.waitForTimeout(1500);
      const settled = await scrollY(page);
      expect(early).toBeGreaterThan(0);
      expect(early).toBeLessThan(700);
      expect(Math.abs(settled - 800)).toBeLessThanOrEqual(3);
    });

    test("Scroller: the page holds still from outro to swap, and a push lands at the top", async ({ page }) => {
      // Both pages are tall, so landing at the top is a decision, not a clamp.
      await settleAt(page, "/gallery/2");
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(1500);
      const left = await scrollY(page);
      expect(Math.abs(left - 600)).toBeLessThanOrEqual(3);

      // Record every frame from the click: which page is up, its phase, the scroll position,
      // and whether the wheel has been turned yet.
      await page.evaluate(() => {
        const frames: ScrollFrame[] = [];
        (window as any).__scrollFrames = frames;
        let wheeled = false;
        addEventListener("wheel", () => (wheeled = true), { capture: true, passive: true });
        const frame = () => {
          const visible = Array.from(document.querySelectorAll<HTMLElement>("[data-page]")).find((el) => el.offsetParent !== null);
          frames.push({ path: location.pathname.replace(/\/$/, "") || "/", phase: visible?.getAttribute("data-phase") ?? null, y: Math.round(window.scrollY), wheeled });
          if (frames.length < 900) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await clickInPlace(page, "gallery-back");
      // Turn the wheel as soon as the outro is on; an outro lasts at least 300 ms.
      await waitForPhaseFrame(page, "outro", 2000);
      await page.mouse.wheel(0, 500);
      await expect(page).toHaveURL(/\/gallery\/?$/);
      await expectSettledClean(page);
      expect(await scrollY(page), "the new page did not land at the top").toBeLessThanOrEqual(1);

      const frames = await page.evaluate(() => (window as any).__scrollFrames as ScrollFrame[]);
      const leaving = frames.filter((f) => f.path === "/gallery/2" && f.wheeled && (f.phase === "outro" || f.phase === "end"));
      expect(leaving.length, "no outgoing frame was sampled after the wheel").toBeGreaterThan(0);
      const moved = leaving.filter((f) => Math.abs(f.y - left) > 3).map((f) => f.y);
      expect(moved, "the outgoing page scrolled between outro and swap").toEqual([]);

      // The next wheel scrolls from the top of the new page.
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1500);
      expect(Math.abs((await scrollY(page)) - 300)).toBeLessThanOrEqual(3);
    });

    test("Scroller: back restores the left position, and the next wheel continues from it", async ({ page, phases }) => {
      await settleAt(page, "/gallery");
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1500);
      const left = await scrollY(page);
      await clickInPlace(page, "nav-about");
      await expect(page).toHaveURL(/\/about\/?$/);
      await expectSettledClean(page);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(1200);

      const since = phases.length;
      await page.goBack();
      await settleAfterHistory(page, phases, /\/gallery\/?$/, since);
      const restored = await scrollY(page);
      expect(Math.abs(restored - left), `restored ${restored}, left ${left}`).toBeLessThanOrEqual(5);
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(1500);
      expect(Math.abs((await scrollY(page)) - (restored + 200))).toBeLessThanOrEqual(5);
    });

    test("Curtain: covers before the URL changes, reveals a prepared page, and keeps chrome", async ({ page }) => {
      await settleAt(page, "/");
      const header = await page.locator('[data-chrome="header"]').elementHandle();
      await expect(page.locator("[data-curtain]")).toHaveAttribute("data-curtain-phase", "idle");
      const log = await page.evaluate(() => {
        const events: { curtain: string | null; path: string; phase: string | null; center: string }[] = [];
        (window as any).__curtainLog = events;
        const record = () => {
          const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2) as HTMLElement | null;
          const visiblePage = Array.from(document.querySelectorAll<HTMLElement>("[data-page]")).find((el) => el.offsetParent !== null);
          events.push({
            curtain: document.querySelector("[data-curtain]")?.getAttribute("data-curtain-phase") ?? null,
            path: location.pathname.replace(/\/$/, "") || "/",
            phase: visiblePage?.getAttribute("data-phase") ?? null,
            center: center?.closest("[data-curtain-panel]") ? "panel" : "page",
          });
        };
        new MutationObserver(record).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-curtain-phase", "data-phase"] });
        return events.length;
      });
      expect(log).toBe(0);
      await clickInPlace(page, "curtain-link");
      await expect(page).toHaveURL(/\/work\/?$/, { timeout: 5000 });
      await expectSettledClean(page);
      await expect(page.locator("[data-curtain]")).toHaveAttribute("data-curtain-phase", "idle", { timeout: 3000 });
      const events = await page.evaluate(() => (window as any).__curtainLog as { curtain: string | null; path: string; phase: string | null; center: string }[]);

      const covered = events.findIndex((e) => e.curtain === "covered");
      const revealing = events.findIndex((e) => e.curtain === "revealing");
      expect(covered, JSON.stringify(events)).toBeGreaterThanOrEqual(0);
      expect(revealing).toBeGreaterThan(covered);
      // Covered on the old URL, with the center on a panel.
      expect(events[covered]!.path).toBe("/");
      expect(events[covered]!.center).toBe("panel");
      // The incoming page never settles before the curtain starts to reveal.
      const settledEarly = events.slice(0, revealing).some((e) => e.path === "/work" && e.phase === "settled");
      expect(settledEarly, "incoming page settled under the curtain").toBe(false);
      for (const panel of await page.locator("[data-curtain-panel]").all()) await expect(panel).toHaveCSS("visibility", "hidden");
      expect(await header!.evaluate((el) => el.isConnected)).toBe(true);
    });

    test("Curtain: a click while covered lands on the curtain, not the page", async ({ page }) => {
      await settleAt(page, "/");
      // Every click's target, from the capture phase: the link click first, then ours.
      await page.evaluate(() => {
        const hits: string[] = [];
        (window as any).__clickHits = hits;
        // A panel, the page, or the bare root, which a view transition hit-tests to for its frames.
        const classify = (target: Element | null) =>
          target?.closest("[data-curtain-panel]") ? "panel" : target?.closest("[data-page], [data-chrome]") ? "page" : "root";
        (window as any).__classify = classify;
        addEventListener("click", (event) => hits.push(classify(event.target as Element | null)), { capture: true });
      });
      await clickInPlace(page, "curtain-link");
      // Checked every frame: `covered` can last a single frame when the fetch is already back.
      const hit = await page.waitForFunction(
        () => {
          const phase = document.querySelector("[data-curtain]")?.getAttribute("data-curtain-phase");
          if (phase !== "covered" && phase !== "revealing") return null;
          return { phase, center: (window as any).__classify(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) as string };
        },
        null,
        { timeout: 3000 },
      );
      expect((await hit.jsonValue() as { center: string }).center, "the page took a click while covered").not.toBe("page");
      const { x, y } = center(page);
      await page.mouse.click(x, y);
      await expect(page).toHaveURL(/\/work\/?$/);
      await expectSettledClean(page);
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/work\/?$/);
      const hits = await page.evaluate(() => (window as any).__clickHits as string[]);
      expect(hits[0]).toBe("page");
      expect(hits[1], "the page took a click while covered").not.toBe("page");
    });

    test("Curtain: back and forward never close it", async ({ page, phases }) => {
      await settleAt(page, "/");
      await clickInPlace(page, "curtain-link");
      await expect(page).toHaveURL(/\/work\/?$/);
      await expectSettledClean(page);
      await expect(page.locator("[data-curtain]")).toHaveAttribute("data-curtain-phase", "idle", { timeout: 3000 });
      const since = phases.length;
      const samples = await sampleFrames(page, 2, 1500, () => page.goBack());
      expect(samples.every((s) => s.curtain === "idle" && !s.panelsVisible), "curtain moved on history").toBe(true);
      await settleAfterHistory(page, phases, /^\/$/, since);
    });

    test("Shared element: the thumbnail stays lit and the hero morphs from its box", async ({ page, phases }) => {
      await settleAt(page, "/gallery");
      const thumb = await boxOf(page, THUMB(2));
      const samples = await sampleFrames(page, 2, 2500, () => clickInPlace(page, "gallery-item-2"));
      await expect(page).toHaveURL(/\/gallery\/2\/?$/);
      await expectSettledClean(page);
      await expect.poll(() => phasesAt(phases, "/gallery")).toContain("outro");

      // Until the hero shows, the clicked thumbnail stays lit.
      const firstHero = samples.findIndex((s) => s.hero.visible);
      expect(firstHero, "the hero never showed").toBeGreaterThan(0);
      expect(samples.slice(0, firstHero).every((s) => s.thumb.visible), "thumbnail faded before the hero showed").toBe(true);
      expect(samples.every((s) => s.curtain === null || s.curtain === "idle"), "curtain on a morph navigation").toBe(true);

      const first = samples[firstHero]!.hero.box!;
      expect(near(first, thumb, 40), `first hero box ${JSON.stringify(first)} vs thumbnail ${JSON.stringify(thumb)}`).toBe(true);

      const hero = page.locator(HERO(2)).filter({ visible: true }).first();
      expect(await hero.evaluate((el) => ["transform", "opacity", "visibility"].filter((p) => (el as HTMLElement).style.getPropertyValue(p) !== ""))).toEqual([]);
      const final = await boxOf(page, HERO(2));
      const last = samples.filter((s) => s.hero.visible).at(-1)!.hero.box!;
      expect(near(last, final, 2)).toBe(true);
      expect(final.w).toBeGreaterThan(thumb.w * 2);
    });

    test("Shared element: back to the gallery morphs nothing", async ({ page, phases }) => {
      await settleAt(page, "/gallery");
      const thumb = await boxOf(page, THUMB(2));
      await clickInPlace(page, "gallery-item-2");
      await expect(page).toHaveURL(/\/gallery\/2\/?$/);
      await expectSettledClean(page);
      const since = phases.length;
      const samples = await sampleFrames(page, 2, 1500, () => page.goBack());
      await settleAfterHistory(page, phases, /\/gallery\/?$/, since);
      const returning = samples.filter((s) => s.path === "/gallery" && s.thumb.visible);
      expect(returning.length).toBeGreaterThan(0);
      expect(near(returning[0]!.thumb.box!, thumb, 2), `first thumbnail box ${JSON.stringify(returning[0]!.thumb.box)} vs ${JSON.stringify(thumb)}`).toBe(true);
    });

    test.describe("reduced motion", () => {
      test("Reduced motion: no scroller, no visible curtain, and no morph", async ({ page }) => {
        // Emulated before the first document, as the lifecycle specs do.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await settleAt(page, "/");
        await expect(page.locator("html")).not.toHaveClass(/(^|\s)lenis(\s|$)/);
        const curtain = await sampleFrames(page, 2, 1200, () => clickInPlace(page, "curtain-link"));
        await expect(page).toHaveURL(/\/work\/?$/);
        await expectSettledClean(page);
        expect(curtain.some((s) => s.panelsVisible), "a curtain panel showed under reduced motion").toBe(false);

        await settleAt(page, "/gallery/2");
        const final = await boxOf(page, HERO(2));
        await settleAt(page, "/gallery");
        const morph = await sampleFrames(page, 2, 1200, () => clickInPlace(page, "gallery-item-2"));
        await expect(page).toHaveURL(/\/gallery\/2\/?$/);
        await expectSettledClean(page);
        const arriving = morph.filter((s) => s.hero.visible);
        expect(arriving.length).toBeGreaterThan(0);
        expect(near(arriving[0]!.hero.box!, final, 2), `first hero box ${JSON.stringify(arriving[0]!.hero.box)} vs ${JSON.stringify(final)}`).toBe(true);
      });
    });
  });
}
