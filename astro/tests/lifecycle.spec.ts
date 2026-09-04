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

type Page = Parameters<typeof visiblePage>[0];

/** The router swaps one body in for another, so there is only ever one page. */
const onlyVisiblePage = (page: Page) =>
  expect(visiblePage(page), "exactly one page is visible").toHaveCount(1);

const atPath = (path: string) => (url: URL) => url.pathname === path;

/**
 * A history traversal changes the URL before the router has fetched or swapped
 * anything, so waiting on the URL alone can catch the page being left rather
 * than the one being returned to. Wait for the destination's own wrapper.
 */
const waitForPageNamed = (page: Page, name: string) =>
  expect(visiblePage(page).first()).toHaveAttribute("data-page", name);

/**
 * File each phase under the page it belongs to.
 *
 * Astro's router replaces `<body>` inside the view transition callback and only
 * pushes the history entry afterwards, so the incoming page exists in the
 * document for one microtask under the URL it came from. The fixture stamps
 * every event with `location.pathname` as it is written, so a destination's
 * `initial` arrives filed under the previous path. It is always followed by
 * that same page's `intro` under the right one, which is what this repairs.
 *
 * This is the one place the Astro lifecycle is genuinely not shaped like the
 * Next.js one, and it is a property of the router rather than of any
 * implementation built on it.
 */
function attributed(events: PhaseEvent[]): PhaseEvent[] {
  return events.map((event, i) => {
    const next = events[i + 1];
    if (event.phase !== "initial" || !next || next.path === event.path) return event;
    return { ...event, path: next.path };
  });
}

test("No flash", async ({ page, browser, baseURL }) => {
  // Hold the bundled modules back so the document is on screen long before the
  // lifecycle can start. Only the scripts: Astro serves the stylesheet from the
  // same directory, and holding that back would delay layout rather than the
  // lifecycle.
  await page.route("**/_astro/*.js", async (route) => {
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
  await blockedPage.route("**/_astro/*.js", (route) => route.abort());
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

  expect(phasesFor(attributed(phases), "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(attributed(phases), "/", "intro", "settled")).toBeGreaterThanOrEqual(400);
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

  expect(phasesFor(attributed(phases), "/")).toEqual(["initial", "intro", "settled", "outro", "end"]);
  expect(durationBetween(attributed(phases), "/", "outro", "end")).toBeGreaterThanOrEqual(300);
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
  await waitForPageNamed(page, "home");
  await expectSettledClean(page);
  expect(phases.slice(mark).map((event) => event.phase), "back ran an outro").not.toContain("outro");

  mark = phases.length;
  await page.goForward();
  await page.waitForURL(atPath("/about"));
  await waitForPageNamed(page, "about");
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
  await expect.poll(() => phasesFor(attributed(phases), "/")).toContain("end");
  const home = phasesFor(attributed(phases), "/");
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
  await expect.poll(() => phasesFor(attributed(phases), "/")).toEqual(["initial", "intro", "settled"]);
  expect(durationBetween(attributed(phases), "/", "intro", "settled")).toBeLessThan(50);

  await page.getByTestId("nav-about").click();
  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);

  // Every phase still happens, and every callback that releases the swap still
  // fires; there is just no travel.
  await expect
    .poll(() => phasesFor(attributed(phases), "/about"))
    .toEqual(["initial", "intro", "settled"]);
  expect(phasesFor(attributed(phases), "/")).toEqual([
    "initial",
    "intro",
    "settled",
    "outro",
    "end",
  ]);
  expect(durationBetween(attributed(phases), "/about", "intro", "settled")).toBeLessThan(50);
  expect(durationBetween(attributed(phases), "/", "outro", "end")).toBeLessThan(50);
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

test("Astro: a page visited twice runs its intro again", async ({ page, phases }) => {
  await page.goto("/");
  await expectSettledClean(page);
  const markup = await visiblePage(page).first().innerHTML();
  const targets = await visiblePage(page).first().locator("[data-intro]").count();

  await page.getByTestId("nav-about").click();
  await page.waitForURL(atPath("/about"));
  await expectSettledClean(page);

  await page.getByTestId("nav-home").click();
  await page.waitForURL(atPath("/"));
  await expectSettledClean(page);
  await onlyVisiblePage(page);

  // A module script runs once per visit, not once per page, so home's second
  // arrival is driven entirely by listeners registered on the first. The full
  // lifecycle still runs on the freshly swapped body.
  expect(phasesFor(attributed(phases), "/").slice(-3)).toEqual(["initial", "intro", "settled"]);
  expect(await visiblePage(page).first().locator("[data-intro]").count()).toBe(targets);
  expect(await visiblePage(page).first().innerHTML()).toBe(markup);
});
