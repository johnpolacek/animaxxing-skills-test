/**
 * One spec per behavior in ../../CONTRACT.md, asserted only through the
 * observable surface: `data-phase` on the page wrapper, `[data-intro]` targets,
 * the `html[data-motion="js"]` mark, and the nav test ids.
 *
 * Not exercised here: the back-forward cache and hidden-tab behavior. Chromium
 * under automation does not reproduce either reliably -- bfcache eligibility
 * varies with the automation flags in use, and the frame ticker's behavior in a
 * background tab cannot be forced from the driver -- so a spec for them would
 * report on the harness rather than on the implementation. The implementation
 * still has to handle both (`pagehide`, `pageshow.persisted`, and an outro
 * raced against a timeout); check those by hand.
 */
import {
  durationBetween,
  expect,
  expectReadable,
  expectSettledClean,
  phasesFor,
  readCLS,
  test,
  visiblePage,
  waitForPhase,
} from "../../shared/lifecycle";

/** `/about` and `/about/` are the same route. */
const route = (value: string | URL) => {
  const path = typeof value === "string" ? new URL(value).pathname : value.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
};

const at = (path: string) => (url: URL) => route(url) === route(new URL(path, "http://x"));

test("no flash of settled content before the intro", async ({ page, browser, baseURL }) => {
  // 1. Scripts delayed: the page waits at `initial` with intro targets hidden,
  //    and settles once the controller finally arrives.
  await page.route("**/*.js", async (routed) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await routed.continue();
  });
  await page.goto("/", { waitUntil: "commit" });
  await expect(visiblePage(page).first()).toHaveAttribute("data-phase", "initial");
  await expect(page.locator("[data-intro]").first()).toBeHidden();
  await expectSettledClean(page);

  // 2. Scripts blocked entirely: readable within a second, because the phase is
  //    released or the mark was never set.
  const blocked = await browser.newContext({ baseURL });
  const blockedPage = await blocked.newPage();
  await blockedPage.route("**/*.js", (routed) => routed.abort());
  await blockedPage.goto("/");
  await expect(blockedPage.locator("[data-intro]").first()).toBeVisible({ timeout: 1500 });
  await blocked.close();

  // 3. No JavaScript at all: no mark, nothing hidden.
  const noScript = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto("/about/");
  await expect(noScriptPage.locator("html")).not.toHaveAttribute("data-motion", "js");
  await expectReadable(noScriptPage);
  await noScript.close();
});

test("clean settle with negligible layout shift", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);

  // The phase log is delivered out of the page asynchronously, so poll for it.
  await expect.poll(() => phasesFor(phases, "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(phases, "/", "intro", "settled")).toBeGreaterThanOrEqual(400);
  expect(await readCLS(page)).toBeLessThan(0.02);
});

test("outro before navigation", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);

  await page.getByTestId("nav-about").click();
  await waitForPhase(page, "outro");
  expect(route(page.url()), "URL changed before the outro ran").toBe("/");

  await page.waitForURL(at("/about/"));
  await expectSettledClean(page);

  await expect.poll(() => phasesFor(phases, "/")).toContain("end");
  const home = phasesFor(phases, "/");
  expect(home).toContain("outro");
  expect(home.indexOf("outro")).toBeGreaterThan(home.indexOf("settled"));
  expect(home.indexOf("end")).toBeGreaterThan(home.indexOf("outro"));
  expect(durationBetween(phases, "/", "outro", "end")).toBeGreaterThanOrEqual(300);
});

test("history is intro-only", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);

  await page.getByTestId("nav-about").click();
  await page.waitForURL(at("/about/"));
  await expectSettledClean(page);

  await page.goBack();
  await page.waitForURL(at("/"));
  await expectSettledClean(page);

  // Bindings arrive in order, so once the returning page has reported, every
  // event the page we left produced is already in the log.
  await expect.poll(() => phases[phases.length - 1]?.path).toBe("/");
  expect(phasesFor(phases, "/about/"), "a page outroed on the way back").not.toContain("outro");
});

test("one navigation at a time", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);

  // Two links, one gesture, no awaiting navigation between them. The second
  // click is a beat behind so that "the first destination wins" is an
  // assertion and not a coin flip; 80ms is still deep inside the outro.
  await Promise.all([
    page.getByTestId("nav-about").click(),
    (async () => {
      await page.waitForTimeout(80);
      await page.getByTestId("nav-work").click();
    })(),
  ]);

  await page.waitForURL((url) => route(url) !== "/");
  expect(route(page.url()), "the first accepted destination should win").toBe("/about");
  await expect(page.locator("[data-page]:visible")).toHaveCount(1);
  await expectSettledClean(page);

  // One outro, not two: the second click was swallowed rather than queued.
  await expect.poll(() => phasesFor(phases, "/")).toContain("end");
  const home = phasesFor(phases, "/");
  expect(home.filter((phase) => phase === "outro")).toHaveLength(1);
  expect(home.filter((phase) => phase === "end")).toHaveLength(1);
});

test("interruptible intro", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });
  await waitForPhase(page, "intro");

  await page.getByTestId("nav-work").click();
  await page.waitForURL(at("/work/"));
  await expectSettledClean(page);
});

test("reduced motion", async ({ page, phases }) => {
  // `test.use({ reducedMotion })` does not reach the page in Playwright 1.62;
  // the page-level override does, and it survives full-document navigation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expectSettledClean(page);

  // No pre-paint mark: the page paints settled and nothing is ever hidden.
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "js");
  await expect.poll(() => phasesFor(phases, "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(phases, "/", "intro", "settled")).toBeLessThan(50);

  await page.getByTestId("nav-about").click();
  await page.waitForURL(at("/about/"));
  await expectSettledClean(page);

  await expect.poll(() => phasesFor(phases, "/")).toContain("end");
  expect(phasesFor(phases, "/")).toContain("outro");
  expect(durationBetween(phases, "/", "outro", "end")).toBeLessThan(50);
  await expect.poll(() => phasesFor(phases, "/about/")).toEqual(["initial", "intro", "settled"]);
});

test("cleanup", async ({ page }) => {
  await page.goto("/");
  await expectSettledClean(page);
  const targets = await page.locator("[data-page] [data-intro]").count();
  const markup = await visiblePage(page).first().innerHTML();

  await page.getByTestId("nav-about").click();
  await page.waitForURL(at("/about/"));
  await expectSettledClean(page);

  await page.getByTestId("nav-home").click();
  await page.waitForURL(at("/"));
  await expectSettledClean(page);

  expect(await page.locator("[data-page] [data-intro]").count()).toBe(targets);
  // Byte-identical markup: no leftover inline styles, no duplicated split or
  // wrapper elements from an animation that ran twice.
  expect(await visiblePage(page).first().innerHTML()).toBe(markup);
});
