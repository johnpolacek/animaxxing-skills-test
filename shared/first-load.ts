import { test, expect, type Page } from "@playwright/test";

const targets = '[data-page] [data-intro], [data-chrome="header"] [data-chrome-intro], [data-chrome="footer"]';

async function readable(page: Page) {
  // Require real content so an empty client-only shell cannot pass vacuously.
  await expect(page.locator("[data-page] h1").first()).toBeVisible({ timeout: 1500 });
  expect((await page.locator("[data-page] h1").first().innerText()).trim()).not.toBe("");
  expect(await page.locator(targets).count()).toBeGreaterThan(2);
  for (const target of await page.locator(targets).all()) {
    await expect(target).toBeVisible({ timeout: 1500 });
    await expect(target).toHaveCSS("opacity", "1");
  }
  await expect(page.getByTestId("nav-about")).toHaveAttribute("href", /\/about\/?$/);
}

// All seven current references send route HTML: static vanilla/Astro, SSR
// Next/Nuxt/SvelteKit/React Router, and TanStack Start. Client-only variants need
// separate fallback assertions, not this suite's required route heading.
export function firstLoadTests() {
  test("First load: disabled JavaScript preserves content and native route links", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.locator("html")).not.toHaveAttribute("data-motion", "js");
      await readable(page);
      await page.getByTestId("nav-about").click();
      await expect(page).toHaveURL(/\/about\/?$/);
      await readable(page);
      const directURL = await page.getByTestId("nav-work").getAttribute("href");
      expect(directURL).toMatch(/^\/work\/?$/);
      await page.goto(directURL!);
      await readable(page);
    } finally { await context.close(); }
  });

  test("First load: early marker survives bundle blocking until bounded recovery", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\.m?js(?:\?|$)/, async route => { await gate; await route.abort(); });
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expect(page.locator("html")).toHaveAttribute("data-motion", "js");
      await expect(page.locator("[data-page] [data-intro]").first()).toBeHidden();
      release();
      await readable(page);
      await page.getByTestId("nav-about").click();
      await expect(page).toHaveURL(/\/about\/?$/);
      await readable(page);
    } finally { release(); }
  });
}
