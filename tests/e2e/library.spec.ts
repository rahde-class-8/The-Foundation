import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { hasOwner, signIn } from './helpers';

test.skip(
  !hasOwner,
  'Requires the local Supabase stack, the imported catalog, and OWNER_EMAIL / OWNER_PASSWORD.',
);

test('browse, search, and study a service (DoD 1–3)', async ({ page }) => {
  await signIn(page, '/services');

  await expect(page.getByRole('region', { name: 'Security, identity & compliance' })).toBeVisible();
  await expect(page.getByRole('link', { name: /AWS Lambda/ })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search' }).fill('elb');
  await expect(page).toHaveURL(/q=elb/);
  const results = page.getByRole('main').getByRole('link', { name: /Elastic Load Balancing/ });
  await expect(results).toBeVisible();
  await expect(page.getByRole('link', { name: /AWS Lambda/ })).toHaveCount(0);

  await results.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Elastic Load Balancing' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mastery profile' })).toBeVisible();

  const concept = page.getByRole('button', { name: /Cross-zone load balancing/ });
  await concept.click();
  await expect(page.getByRole('heading', { name: 'Sources' }).first()).toBeVisible();
  await expect(concept).toContainText('Studied');

  await page.reload();
  await expect(page.getByRole('button', { name: /Cross-zone load balancing/ })).toContainText(
    'Studied',
  );
});

test('filters by exam domain and searches by concept (LIB-2, LIB-3)', async ({ page }) => {
  await signIn(page, '/services');

  await page
    .getByRole('combobox', { name: 'Exam domain' })
    .selectOption({ label: 'D4 · Design Cost-Optimized Architectures' });
  await expect(page).toHaveURL(/domain=/);
  await expect(page.getByRole('link', { name: /Amazon Simple Storage Service/ })).toBeVisible();

  await page.getByRole('combobox', { name: 'Exam domain' }).selectOption({ label: 'All domains' });
  await page.getByRole('searchbox', { name: 'Search' }).fill('visibility timeout');
  const sqs = page.getByRole('link', { name: /Amazon Simple Queue Service/ });
  await expect(sqs).toBeVisible();
  await expect(sqs.getByLabel('Matching concepts')).toContainText('Visibility timeout');
});

test('the first page of the library renders within one second (P1-4)', async ({ page }) => {
  await signIn(page, '/dashboard');

  const started = Date.now();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Services' })
    .click();
  await expect(page.getByRole('main').getByRole('link').first()).toBeVisible();
  const elapsed = Date.now() - started;

  expect(elapsed, `services rendered in ${elapsed} ms`).toBeLessThan(1000);
});

test('library pages have no serious accessibility violations', async ({ page }) => {
  await signIn(page, '/services');
  await expect(page.getByRole('link', { name: /AWS Lambda/ })).toBeVisible();
  const library = await new AxeBuilder({ page }).analyze();

  await page.getByRole('link', { name: /AWS Lambda/ }).click();
  await page.getByRole('button', { name: /Invocation models/ }).click();
  const profile = await new AxeBuilder({ page }).analyze();

  const serious = [...library.violations, ...profile.violations].filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
