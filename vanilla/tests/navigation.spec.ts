import { test, expect, expectSettledClean, waitForPhase } from '../../shared/lifecycle';

// Page swapping is what makes the chrome persistent in the framework-free app.
test('Vanilla: failed fetch falls back to a real document navigation', async ({ page }) => {
  await page.goto('/');
  await expectSettledClean(page);
  await page.route('**/about/', (route) => route.request().resourceType() === 'fetch'
    ? route.abort()
    : route.continue());
  const documentRequest = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === '/about/');
  await page.getByTestId('nav-about').click();
  await documentRequest;
  await page.waitForURL('**/about/');
  await expectSettledClean(page);
  await expect(page.locator('[data-page]')).toHaveAttribute('data-page', 'about');
});

test('Vanilla: history cancels a pending click navigation and preserves chrome', async ({ page }) => {
  await page.goto('/');
  await expectSettledClean(page);
  await page.getByTestId('nav-about').click();
  await page.waitForURL('**/about/');
  await expectSettledClean(page);
  const header = await page.locator('[data-chrome="header"]').elementHandle();
  await page.route('**/work/', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue().catch(() => {});
  });
  await page.getByTestId('nav-work').click();
  await waitForPhase(page, 'outro');
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/');
  await expectSettledClean(page);
  await page.waitForTimeout(800); // allow the overtaken request/outro to finish
  await expect(page.locator('[data-page]')).toHaveAttribute('data-page', 'home');
  await expect(page).toHaveTitle('Animaxxing — Motion that knows when to stop');
  await expect(page.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page');
  expect(await header!.evaluate((el) => el.isConnected)).toBe(true);
});
