import { expect, test } from '@playwright/test';
import { hasOwner, signIn } from './helpers';

test.skip(
  !hasOwner,
  'Requires the local Supabase stack, the practice fixture, and OWNER_EMAIL / OWNER_PASSWORD.',
);

async function startFixtureSession(page: import('@playwright/test').Page) {
  await signIn(page, '/services?q=practice+fixture');
  await page.getByRole('link', { name: /Practice Fixture Service/ }).click();
  await page.getByRole('link', { name: 'Practice this service' }).click();
  await expect(page).toHaveURL(/\/practice\?session=/);
}

test('answer, AI grade, accept, and schedule (DoD 1–8)', async ({ page }) => {
  await startFixtureSession(page);

  const answer = page.getByLabel('Your answer');
  await answer.fill(
    'Queues decouple producers from consumers, and buffering absorbs traffic spikes. Topics push every message to subscribers; subscribers never poll topics.',
  );
  await answer.press('Control+Enter');

  await expect(page.getByRole('heading', { name: 'AI grade' })).toBeVisible();
  await expect(page.getByText('Mock grader (local development)')).toBeVisible();
  await page.getByRole('button', { name: /^Accept and/ }).click();
  const continueButton = page.getByRole('button', { name: /Continue|Skip and continue/ }).first();
  await continueButton.click();

  await expect(page.getByText(/Next review:/)).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByLabel('Your answer')).toBeVisible();
});

test('AI failure falls back to self-assessment and correction (REC-5, REC-7, P2-1)', async ({
  page,
}) => {
  await startFixtureSession(page);

  const answer = page.getByLabel('Your answer');
  await answer.fill('Not sure [[mock:error]]');
  await page.getByRole('button', { name: 'Submit answer' }).click();

  await expect(page.getByRole('heading', { name: 'Grade it yourself' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('The AI grader is unavailable right now.')).toBeVisible();
  for (const group of await page.getByRole('radiogroup').all())
    await group.getByLabel('Missing').check();
  await page.keyboard.press('3');

  await expect(page.getByRole('heading', { name: 'Correct it' })).toBeVisible();
  await page.getByLabel(/Your correction/).fill('Correction attempt without the reference.');
  await page.getByRole('button', { name: 'Submit correction' }).click();
  await page
    .getByRole('button', { name: /Skip and continue|Continue/ })
    .first()
    .click();
  await expect(page.getByText(/Next review:/)).toBeVisible();
});

test('a submitted answer survives a reload (P2-3, REC-10)', async ({ page }) => {
  await startFixtureSession(page);
  await page.getByLabel('Your answer').fill('Reload test [[mock:timeout]]');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(
    page
      .getByText('Your answer is saved. Grading…')
      .or(page.getByRole('heading', { name: 'Grade it yourself' })),
  ).toBeVisible();

  await page.reload();

  await expect(page.getByText('Reload test [[mock:timeout]]')).toBeVisible();
});
