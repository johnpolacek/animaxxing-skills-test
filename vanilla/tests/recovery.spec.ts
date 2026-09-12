import { test, expect, type Page } from "@playwright/test";

// This is a fault-injection fixture, not an assertion that every framework
// adapter implements recovery. It uses production-built GSAP and SplitText.
test.skip(!!process.env.APP_DIR, "Reference-only failure fixture; agent evals use shared first-load checks.");

async function clean(page: Page, id = "page") {
  const root = page.locator(`#${id}`);
  await expect(root).toHaveAttribute("data-phase", "settled");
  await expect(root).toHaveAttribute("data-completions", "1");
  for (const target of await root.locator("[data-intro]").all()) {
    await expect(target).toBeVisible();
    await expect(target).toHaveCSS("opacity", "1");
    await expect(target).toHaveCSS("transform", "none");
  }
  await expect(root.locator("h1 > *")).toHaveCount(0);
  await expect(root.locator("a")).toHaveAttribute("href", "/work/");
  if (id === "page") {
    await expect(root.locator("h1")).toHaveCSS("color", "rgb(30, 50, 70)");
    await expect(page.locator("#closed-panel")).toBeHidden();
  }
  await expect(page.locator("#outgoing")).toHaveAttribute("data-phase", "end");
  await expect(page.locator("#outgoing")).toBeHidden();
}

async function trackRecoveredFrames(page: Page) {
  await page.addInitScript(() => {
    const samples: boolean[] = [];
    (window as any).__recoveryFrames = samples;
    const frame = () => {
      const root = document.querySelector<HTMLElement>('#page[data-boot="recovered"][data-current="true"]');
      if (root) samples.push(Array.from(root.querySelectorAll<HTMLElement>("[data-intro]")).every(node => {
        const css = getComputedStyle(node);
        return css.visibility === "visible" && css.opacity === "1" && css.transform === "none";
      }));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function stable(page: Page) {
  // Beyond preparation resolution and the old timeline's possible completion.
  await page.waitForTimeout(1900);
  await clean(page);
  const frames = await page.evaluate(() => (window as any).__recoveryFrames as boolean[]);
  expect(frames.length).toBeGreaterThan(10);
  expect(frames.every(Boolean), "a recovered frame was hidden again").toBe(true);
}

for (const fault of ["before", "styles", "split", "cleanup", "running"]) {
  test(`Recovery: failure at ${fault}`, async ({ page }) => {
    await trackRecoveredFrames(page);
    await page.goto(`/recovery/?fault=${fault}`);
    await clean(page);
    await page.locator("#repeat").click();
    await stable(page);
    await expect(page.locator("#shell")).toHaveAttribute("data-phase", "settled");
    await page.locator("#page a").click();
    await expect(page).toHaveURL(/\/work\//);
  });
}

for (const prepare of ["font", "media"]) {
  for (const result of ["resolve", "reject"] as const) {
    test(`Recovery: stalled ${prepare} later ${result}s`, async ({ page }) => {
      await trackRecoveredFrames(page);
      await page.addInitScript(({ prepare, result }) => {
        const wait = () => new Promise<any>((resolve, reject) => setTimeout(() => {
          if (result === "reject") reject(new Error("preparation failed"));
          else resolve(document.fonts);
        }, 1800));
        if (prepare === "font") Object.defineProperty(document.fonts, "ready", { get: wait });
        else HTMLImageElement.prototype.decode = wait;
      }, { prepare, result });
      await page.goto(`/recovery/?prepare=${prepare}`);
      await expect(page.locator("#page")).toHaveAttribute("data-boot", "recovered", { timeout: 1500 });
      await clean(page);
      await stable(page);
    });
  }
}

test("Recovery: late bundle cannot hide recovered content", async ({ page }) => {
  await trackRecoveredFrames(page);
  await page.route("**/*.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto("/recovery/", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "js");
  await clean(page);
  await page.waitForLoadState("load");
  await stable(page);
});

test("Recovery: successful intro outlasts initialization budget without a flash", async ({ page }) => {
  await page.addInitScript(() => {
    const frames: { boot: string | undefined; visible: boolean }[] = [];
    (window as any).__introFrames = frames;
    const sample = () => {
      const root = document.querySelector<HTMLElement>("#page");
      if (root) frames.push({ boot: root.dataset.boot, visible: getComputedStyle(root.querySelector("h1")!).visibility === "visible" });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Arrives within the 900ms budget; the intentional 1.4s intro must finish.
  await page.route("**/*.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.continue();
  });
  await page.goto("/recovery/", { waitUntil: "commit" });
  await expect(page.locator("#page")).toHaveAttribute("data-boot", "running");
  await page.locator("#repeat").click();
  await page.waitForTimeout(950);
  await expect(page.locator("#page")).toHaveAttribute("data-phase", "intro");
  await clean(page);
  await expect(page.locator("#page")).toHaveAttribute("data-boot", "settled");
  const frames = await page.evaluate(() => (window as any).__introFrames as { boot: string; visible: boolean }[]);
  expect(frames.some(f => f.boot === "pending")).toBe(true);
  expect(frames.filter(f => f.boot === "pending").every(f => !f.visible)).toBe(true);
});

test("Recovery: reduced motion stays functional with once-only completion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/recovery/");
  await clean(page);
  await page.locator("#repeat").click();
  await clean(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "js");
  await page.locator("#page a").click();
  await expect(page).toHaveURL(/\/work\//);
});

test("Recovery: navigation cancels stale preparation and leaves hidden owners alone", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document.fonts, "ready", {
    get: () => new Promise(resolve => setTimeout(() => resolve(document.fonts), 1800)),
  }));
  await page.goto("/recovery/?prepare=font");
  await page.locator("#navigate").click();
  await clean(page, "destination");
  await page.waitForTimeout(1900);
  await clean(page, "destination");
  await expect(page.locator("#page")).toHaveAttribute("data-phase", "end");
  await expect(page.locator("#page")).toBeHidden();
  await expect(page.locator("#page")).not.toHaveAttribute("data-completions");
});
