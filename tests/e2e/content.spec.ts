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
  test.setTimeout(90_000);
  const name = `queues-${crypto.randomUUID().slice(0, 8)}.pdf`;
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
  await page.getByLabel('Source').selectOption({ label: name });
  await page.getByRole('list', { name: 'Passages' }).getByRole('checkbox').first().check();
  await page.getByLabel('Service').selectOption({ label: 'Practice Fixture Service' });
  await page.getByLabel('Up to').selectOption('1');
  await page.getByRole('button', { name: 'Generate drafts' }).click();
  await page.getByRole('status').getByRole('link').first().click();

  await expect(page.getByRole('heading', { name: 'Review draft' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Cited passages' })).toContainText(
    'Not verified against AWS docs',
  );
  const title = await page.getByLabel('Title').inputValue();
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
