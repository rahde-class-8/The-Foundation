import { expect, test } from '@playwright/test';

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

test.skip(
  !email || !password,
  'Requires the local Supabase stack and OWNER_EMAIL / OWNER_PASSWORD.',
);

test('the owner signs in, visits every section, and signs out (P0-3)', async ({ page }) => {
  await page.goto('/practice');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email ?? '');
  await page.getByLabel('Password').fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/practice$/);
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const [link, heading] of [
    ['Dashboard', 'Dashboard'],
    ['Services', 'Service library'],
    ['Weak Box', 'Weak Box'],
    ['Content', 'Content'],
    ['Settings', 'Settings'],
  ] as const) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
