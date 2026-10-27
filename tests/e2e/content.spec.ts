import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { hasOwner, signIn } from './helpers';

// Phase 4: upload → passages → AI draft → review → publish, as the owner. Each run uploads a unique
// copy of the fixture (a comment after %%EOF) so retries are not rejected as duplicates.
test.skip(
  !hasOwner,
  'Requires the local Supabase stack, the practice fixture, and OWNER_EMAIL / OWNER_PASSWORD.',
);

const fixture = (name: string) => readFileSync(`tests/fixtures/pdfs/${name}`);

test('upload a PDF, draft from its passages, review, and publish (CNT-2…7, P4-4)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const runId = crypto.randomUUID().slice(0, 8);
  const name = `queues-${runId}.pdf`;
  const buffer = Buffer.concat([fixture('valid.pdf'), Buffer.from(`\n% ${name}\n`)]);

  await signIn(page, '/content');
  await page.getByLabel('Upload PDF').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  const row = page
    .getByRole('list', { name: 'Sources' })
    .getByRole('listitem')
    .filter({ hasText: name });
  await expect(row).toContainText(/\d+ passages/, { timeout: 30_000 });
  await expect(row).toContainText('Your notes');

  await page.getByRole('tab', { name: 'Passages' }).click();
  await page.getByLabel('Source', { exact: true }).selectOption({ label: name });
  await page.getByRole('list', { name: 'Passages' }).getByRole('checkbox').first().check();
  await page
    .getByLabel('Service', { exact: true })
    .selectOption({ label: 'Practice Fixture Service' });
  await page.getByLabel('Up to', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Generate drafts' }).click();
  // The first call to a function can be slow while the Edge runtime starts it.
  const created = page.getByRole('status').filter({ hasText: /draft(s)? created/ });
  await expect(created).toBeVisible({ timeout: 60_000 });
  await created.getByRole('link').first().click();

  await expect(page.getByRole('heading', { name: 'Review draft' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Cited passages' })).toContainText(
    'Not verified against AWS docs',
  );
  // A unique title keeps this run's concept apart from earlier runs on the shared owner account.
  const title = `${await page.getByLabel('Title').inputValue()} ${runId}`;
  await page.getByLabel('Title').fill(title);
  const approve = page.getByRole('button', { name: 'Approve and publish' });
  await expect(approve).toBeDisabled();
  const checklist = page.getByRole('group', { name: 'Review checklist' });
  for (const box of await checklist.getByRole('checkbox').all()) await box.check();
  await approve.click();

  await expect(page).toHaveURL(/\/services\/practice-fixture$/);
  const concept = page.getByRole('listitem').filter({ hasText: title });
  await expect(concept).toContainText('Not verified against AWS docs');
});

test('failed and rejected uploads explain why (CNT-2a, CNT-8a)', async ({ page }) => {
  await signIn(page, '/content');

  await page.getByLabel('Upload PDF').setInputFiles({
    name: 'installer.pdf',
    mimeType: 'application/pdf',
    buffer: fixture('renamed-exe.pdf'),
  });
  await expect(page.getByText('This is not a PDF file.')).toBeVisible();

  await page.getByLabel('Upload PDF').setInputFiles({
    name: `locked-${crypto.randomUUID().slice(0, 8)}.pdf`,
    mimeType: 'application/pdf',
    buffer: fixture('encrypted.pdf'),
  });
  await expect(page.getByText('The PDF is password-protected.').first()).toBeVisible({
    timeout: 30_000,
  });
});
