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
  type PhaseEvent,
} from "../../shared/lifecycle";

/** Under `mode: "out-in"` exactly one page root exists, so this is also a count of the DOM. */
const onlyVisiblePage = (page: Parameters<typeof visiblePage>[0]) =>
  expect(visiblePage(page), "exactly one page is visible").toHaveCount(1);

const atPath = (path: string) => (url: URL) => url.pathname === path;

/** Resolves once a page root for `path` has been inserted since `mark`. */
const arrived = (phases: PhaseEvent[], mark: number, path: string) =>
  expect.poll(() => phasesFor(phases.slice(mark), path)).toContain("initial");

test("No flash", async ({ page, browser, baseURL }) => {
  // Hold the client bundle back so the document is on screen long before the
  // lifecycle can start. Only the scripts: Nuxt serves the stylesheet from the
  // same directory, and holding that back would delay layout rather than the
  // lifecycle.
  await page.route("**/_nuxt/**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "commit" });
  await expect(visiblePage(page).first()).toHaveAttribute("data-phase", "initial");
  await expect(page.locator("[data-page] [data-intro]").first()).toBeHidden();

  // The bundle arrives and the page still ends up settled and readable.
  await waitForPhase(page, "settled", 15_000);
  await expectSettledClean(page);

  // Scripts blocked entirely: the inline failsafe releases the mark, so the
  // page is readable within the contract's window rather than hidden forever.
  const blocked = await browser.newContext({ baseURL });
  const blockedPage = await blocked.newPage();
  await blockedPage.route("**/_nuxt/**/*.js", (route) => route.abort());
  await blockedPage.goto("/");
  await expect(blockedPage.locator("[data-intro]").first()).toBeVisible({ timeout: 1500 });
  await blocked.close();

  // Without JavaScript the mark is never set, so nothing is hidden at all.
  const bare = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const barePage = await bare.newPage();
  await barePage.goto("/");
  await expect(barePage.locator("[data-intro]").first()).toBeVisible();
  await expectReadable(barePage);
  await bare.close();
});

test("Clean settle", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);
  await onlyVisiblePage(page);

  expect(phasesFor(phases, "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(phases, "/", "intro", "settled")).toBeGreaterThanOrEqual(400);
  expect(await readCLS(page), "layout shift during the intro").toBeLessThan(0.05);
});

test("Outro before navigation", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);

  await page.getByTestId("nav-about").click();
  await waitForPhase(page, "outro");
  expect(new URL(page.url()).pathname, "URL changes only after the outro").toBe("/");

  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);
  await onlyVisiblePage(page);

  expect(phasesFor(phases, "/")).toEqual(["initial", "intro", "settled", "outro", "end"]);
  expect(durationBetween(phases, "/", "outro", "end")).toBeGreaterThanOrEqual(300);
});

test("History is intro-only", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);
  await page.getByTestId("nav-about").click();
  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);

  let mark = phases.length;
  await page.goBack();
  await page.waitForURL(atPath("/"));
  // popstate moves the URL before the router swaps anything, so the outgoing
  // root is still on screen -- and still settled -- for the frames Nuxt needs
  // to resolve the incoming page. Wait for the returning root to arrive before
  // asserting about "the settled page".
  await arrived(phases, mark, "/");
  await expectSettledClean(page);
  expect(phases.slice(mark).map((event) => event.phase), "back ran an outro").not.toContain("outro");

  mark = phases.length;
  await page.goForward();
  await page.waitForURL(atPath("/about"));
  await arrived(phases, mark, "/about");
  await expectSettledClean(page);
  expect(
    phases.slice(mark).map((event) => event.phase),
    "forward ran an outro",
  ).not.toContain("outro");
});

test("One navigation at a time", async ({ page, phases }) => {
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

  await page.waitForURL((url) => url.pathname !== "/");
  expect(new URL(page.url()).pathname, "the first accepted destination should win").toBe("/about");
  await expectSettledClean(page);
  await onlyVisiblePage(page);

  // One outro, not two: the second click was swallowed rather than queued.
  await expect.poll(() => phasesFor(phases, "/")).toContain("end");
  const home = phasesFor(phases, "/");
  expect(home.filter((phase) => phase === "outro")).toHaveLength(1);
  expect(home.filter((phase) => phase === "end")).toHaveLength(1);
});

test("Interruptible intro", async ({ page }) => {
  await page.goto("/");
  await expectSettledClean(page);

  await page.getByTestId("nav-about").click();
  await waitForPhase(page, "intro");
  await page.getByTestId("nav-work").click();

  await page.waitForURL(atPath("/work"));
  await expectSettledClean(page);
  await onlyVisiblePage(page);
});

test("Reduced motion", async ({ page, phases }) => {
  // `test.use({ reducedMotion })` does not reach the page in this Playwright
  // version; the page-level override does.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expectSettledClean(page);
  await expect.poll(() => phasesFor(phases, "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(phases, "/", "intro", "settled")).toBeLessThan(50);

  await page.getByTestId("nav-about").click();
  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);

  // Every phase still happens, and every `done` that commits the navigation
  // still fires; there is just no travel.
  await expect.poll(() => phasesFor(phases, "/about")).toEqual(["initial", "intro", "settled"]);
  expect(phasesFor(phases, "/")).toEqual(["initial", "intro", "settled", "outro", "end"]);
  expect(durationBetween(phases, "/about", "intro", "settled")).toBeLessThan(50);
  expect(durationBetween(phases, "/", "outro", "end")).toBeLessThan(50);
});

test("Cleanup", async ({ page }) => {
  await page.goto("/");
  await expectSettledClean(page);
  const targets = await visiblePage(page).first().locator("[data-intro]").count();
  expect(targets).toBeGreaterThan(0);

  await page.getByTestId("nav-about").click();
  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);

  await page.getByTestId("nav-home").click();
  await page.waitForURL(atPath("/"));
  await expectSettledClean(page);
  await onlyVisiblePage(page);

  // No doubled split or wrapper markup left behind by the round trip.
  expect(await visiblePage(page).first().locator("[data-intro]").count()).toBe(targets);
});

test("Nuxt: out-in keeps one page root and hands the next one over at initial", async ({
  page,
  phases,
}) => {
  await page.goto("/");
  await expectSettledClean(page);

  await page.getByTestId("nav-about").click();
  await waitForPhase(page, "outro");
  // `out-in` means the outgoing root leaves alone: the incoming one is not
  // inserted until this outro's `done`.
  expect(await page.locator("[data-page]").count(), "two page roots during the outro").toBe(1);

  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);
  expect(await page.locator("[data-page]").count()).toBe(1);

  // The old root reached its end state, and the new one was handed over at
  // `initial` rather than appearing settled.
  expect(phasesFor(phases, "/")).toEqual(["initial", "intro", "settled", "outro", "end"]);
  expect(phasesFor(phases, "/about")).toEqual(["initial", "intro", "settled"]);
});
