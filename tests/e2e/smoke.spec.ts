import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('an unauthenticated visit to /dashboard redirects to /login (P0-3)', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('the login page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  expect(serious).toEqual([]);
});
