import { test, expect, expectSettledClean } from "./lifecycle";

const chrome = '[data-chrome="header"], [data-chrome="footer"]';
const targets = '[data-chrome="header"] [data-chrome-intro], [data-chrome="footer"]';
const at = (path: string) => (url: URL) => url.pathname.replace(/\/$/, "") === path.replace(/\/$/, "");

async function settled(page: import('@playwright/test').Page) {
  await expect(page.locator(chrome)).toHaveCount(2);
  for (const root of await page.locator(chrome).all()) {
    await expect(root).toHaveAttribute("data-chrome-phase", "settled");
  }
  const dirty = await page.locator(targets).evaluateAll((nodes) => nodes.filter((node) => {
    const el = node as HTMLElement;
    const style = getComputedStyle(el);
    return style.visibility !== 'visible' || Number(style.opacity) !== 1 ||
      ['transform', 'transform-origin', 'opacity', 'visibility', 'will-change'].some((key) => el.style.getPropertyValue(key));
  }).map((el) => el.outerHTML));
  expect(dirty).toEqual([]);
}

test('Chrome: brand enters from the left, then links scale in one at a time', async ({ page }) => {
  // Observe rendered frames, not GSAP internals. Start before any app code.
  await page.addInitScript(() => {
    const frames: { t: number; opacity: number[]; x: number[]; y: number[]; scale: number[]; footerY: number; footerPhase: string | undefined }[] = [];
    (window as any).__chromeFrames = frames;
    const sample = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-chrome="header"] [data-chrome-intro], [data-chrome="footer"]'));
      if (nodes.length) frames.push({
        t: performance.now(),
        opacity: nodes.map((el) => getComputedStyle(el).visibility === 'hidden' ? 0 : Number(getComputedStyle(el).opacity)),
        x: nodes.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41),
        y: nodes.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
        scale: nodes.map((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a),
        footerY: nodes.at(-1)!.getBoundingClientRect().y,
        footerPhase: nodes.at(-1)!.dataset.chromePhase,
      });
      if (frames.at(-1)?.footerPhase !== 'settled') requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/');
  await settled(page);
  await expect(page.locator('[data-chrome="header"] [data-chrome-intro]')).toHaveCount(4);
  await expect(page.locator('[data-chrome="header"] .site-nav a[data-chrome-intro]')).toHaveCount(3);
  await expect(page.locator('[data-chrome="footer"] [data-chrome-intro]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__chromeFrames.at(-1)?.footerPhase)).toBe('settled');
  const frames = await page.evaluate(() => (window as any).__chromeFrames) as { t: number; opacity: number[]; x: number[]; y: number[]; scale: number[]; footerY: number; footerPhase: string }[];
  for (let i = 0; i < 5; i++) {
    expect(frames.some((f) => f.opacity[i] > 0.05 && f.opacity[i] < 0.9), `target ${i} must visibly fade`).toBe(true);
  }
  expect(frames.some((f) => f.x[0] < -1), 'brand must enter from the left').toBe(true);
  expect(frames.every((f) => f.y[0] === 0 && f.scale[0] === 1), 'brand must not rise or scale').toBe(true);
  for (let i = 1; i < 4; i++) {
    expect(frames.some((f) => f.scale[i] >= 0.49 && f.scale[i] < 0.95), `link ${i} must scale from 50%`).toBe(true);
    expect(frames.every((f) => f.x[i] === 0 && f.y[i] === 0), `link ${i} must not travel`).toBe(true);
  }
  const starts = [0, 1, 2, 3].map((index) => frames.find((f) => f.opacity[index] > 0.05)!);
  expect(starts[1].opacity[0], 'links start after the brand finishes').toBeGreaterThan(0.98);
  expect(starts[1].t - starts[0].t).toBeGreaterThan(300);
  expect(starts[2].t - starts[1].t).toBeGreaterThan(200);
  expect(starts[3].t - starts[2].t).toBeGreaterThan(200);
  expect(frames.every((f) => f.x[4] === 0 && f.y[4] === 0 && f.scale[4] === 1), 'footer must only fade').toBe(true);
  const intro = frames.filter((f) => f.footerPhase === 'intro');
  expect(intro.at(-1)!.t - intro[0].t, 'slow footer fade').toBeGreaterThan(1000);
  expect(Math.max(...frames.map((f) => f.footerY)) - Math.min(...frames.map((f) => f.footerY))).toBeLessThan(1);
});

test('Chrome: links and history preserve settled DOM without replaying motion', async ({ page, phases }) => {
  await page.goto('/');
  await settled(page);
  await expectSettledClean(page);
  const original = await page.locator(chrome).elementHandles();
  const nav = await page.locator('[data-chrome="header"] [data-chrome-intro]').elementHandles();
  const all = [...original, ...nav];
  const positions = await Promise.all(all.map((el) => el.boundingBox()));
  // Catch even a brief hide/replay between the assertions at route completion.
  await page.evaluate(() => {
    (window as any).__chromeMutations = [];
    document.querySelectorAll('[data-chrome]').forEach((root) => {
      new MutationObserver((records) => {
        (window as any).__chromeMutations.push(...records.map((r) => r.attributeName));
      }).observe(root, { subtree: true, attributes: true, attributeFilter: ['style', 'data-chrome-phase'] });
    });
  });
  const verify = async () => {
    await settled(page);
    await expectSettledClean(page);
    for (let i = 0; i < all.length; i++) {
      expect(await all[i].evaluate((el) => el.isConnected), 'chrome DOM was replaced').toBe(true);
      const box = await all[i].boundingBox();
      expect(box!.x).toBeCloseTo(positions[i]!.x, 0);
      expect(box!.y).toBeCloseTo(positions[i]!.y, 0);
    }
    expect(await page.evaluate(() => (window as any).__chromeMutations)).toEqual([]);
  };
  // Some routers change the URL before swapping on history moves, so wait for the destination to settle.
  const arrive = async (path: string, since: number) => {
    await page.waitForURL(at(path));
    await expect
      .poll(() => phases.slice(since).some((e) => e.phase === 'settled' && e.path.replace(/\/$/, '') === path), { timeout: 5000 })
      .toBe(true);
    await verify();
  };
  let since = phases.length;
  await page.getByTestId('nav-about').click();
  await arrive('/about', since);
  since = phases.length;
  await page.getByTestId('nav-work').click();
  await arrive('/work', since);
  since = phases.length;
  await page.goBack();
  await arrive('/about', since);
  since = phases.length;
  await page.goForward();
  await arrive('/work', since);
});

test('Chrome: navigation during the first fade does not restart it', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('[data-chrome="footer"]');
  await expect(footer).toHaveAttribute('data-chrome-phase', 'intro');
  const original = await footer.elementHandle();
  await footer.evaluate((el) => {
    (window as any).__footerReplay = false;
    let last = Number(getComputedStyle(el).opacity);
    const sample = () => {
      const current = Number(getComputedStyle(el).opacity);
      if (!el.isConnected || current + 0.001 < last) (window as any).__footerReplay = true;
      last = current;
      if (el.getAttribute('data-chrome-phase') !== 'settled') requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Dispatch avoids Playwright waiting for the moving nav link to become stable.
  await page.getByTestId('nav-about').dispatchEvent('click');
  await page.waitForURL(at('/about'));
  await settled(page);
  await expectSettledClean(page);
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as any).__footerReplay)).toBe(false);
});

test('Chrome: reduced motion settles immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectSettledClean(page);
  await settled(page);
  await page.getByTestId('nav-about').click();
  await page.waitForURL(at('/about'));
  await settled(page);
});

test('Chrome: readable without JavaScript or when the bundle fails', async ({ browser, baseURL }) => {
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ baseURL, javaScriptEnabled });
    const page = await context.newPage();
    if (javaScriptEnabled) await page.route('**/*.js', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator(targets)).toHaveCount(5);
    for (const target of await page.locator(targets).all()) {
      await expect(target).toBeVisible({ timeout: 1500 });
      await expect(target).toHaveCSS('opacity', '1');
    }
    await context.close();
  }
});
