import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/** Opens a motion fixture and fails the test on any page error. */
export const test = base.extend<{ open: (fixture: string) => Promise<Page> }>({
  open: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(async (fixture) => {
      await page.goto("file://" + path.resolve(__dirname, "../fixtures", `${fixture}.html`));
      return page;
    });
    expect(errors, "page errors").toEqual([]);
  },
});

export { expect };

/** Inline style attribute, treating a missing attribute as empty. */
export const style = (page: Page, selector: string) =>
  page.$eval(selector, (el) => el.getAttribute("style") ?? "");

export const prop = (page: Page, selector: string, name: string) =>
  page.evaluate(([s, n]) => Number((window as any).gsap.getProperty(s, n)), [selector, name] as const);
