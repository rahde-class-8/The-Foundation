import { expect, test, type Page } from '@playwright/test';
import { createLearner, days, fixtureConcepts, setClock, type Learner } from '../support/learners';
import { hasOwner } from './helpers';

// DoD 9–10 (P3-3): return later for a cold review, then see progress on the dashboard. A fresh
// learner's test clock is moved forward by 1 and 4 days.
test.skip(
  !hasOwner,
  'Requires the local Supabase stack with the practice fixture and the seeded test clock.',
);

async function signInAs(page: Page, learner: Learner, path: string) {
  await page.goto(path);
  await page.getByLabel('Email').fill(learner.email);
  await page.getByLabel('Password').fill(learner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

test('miss, return a day later for a cold review, and see it on the dashboard (DoD 8–10)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const learner = await createLearner();
  const concepts = await fixtureConcepts(learner.client);

  // Day 0: a weak answer with a diagnosed misconception, then skip the correction.
  await signInAs(page, learner, `/practice?start=concept&id=${concepts.queues}`);
  await page.getByLabel('Your answer').fill('I am not sure. [[mock:misconception:push-model]]');
  await page.getByLabel('Your answer').press('Control+Enter');
  await page.getByRole('button', { name: 'Accept and correct' }).click();
  await page.getByRole('button', { name: 'Skip and continue' }).click();
  await expect(page.getByText(/Next review:/)).toBeVisible();

  // Day 1: the concept is due in the Weak Box (DoD 9).
  await setClock(learner.id, days(1));
  await page.goto('/reviews');
  const list = page.getByRole('list', { name: 'Reviews' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Queues');
  await expect(page.getByText('Mock misconception push-model')).toBeVisible();

  await page.getByRole('link', { name: /Start review session \(1\)/ }).click();
  await page
    .getByLabel('Your answer')
    .fill('Queues decouple producers from consumers, and buffering absorbs traffic spikes.');
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await page.getByRole('button', { name: 'Accept and continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/Next review:/)).toBeVisible();
  // A cold review grows the interval; non-cold practice would say so here.
  await expect(page.getByText(/practice from memory later/)).toHaveCount(0);

  // Day 4: due again, and the dashboard reflects both cold answers (DoD 10).
  await setClock(learner.id, days(4));
  await page.goto('/dashboard');
  const summary = page.getByRole('list', { name: 'Summary' });
  await expect(summary.getByRole('listitem').filter({ hasText: 'Due today' })).toContainText('1');
  await expect(page.getByRole('region', { name: 'Cold-recall accuracy' })).toContainText(
    '1 of 2 passed',
  );
  await expect(page.getByRole('region', { name: 'Weakest concepts' })).toContainText('Queues');
  await expect(page.getByRole('region', { name: 'Readiness' })).toContainText(
    'Estimate — not a prediction of exam results',
  );

  // Reschedule from the Weak Box; the change shows in the concept's history (WB-3, WB-4).
  await page.goto('/reviews');
  await page.getByRole('button', { name: 'Reschedule Queues' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reschedule Queues' });
  const date = dialog.getByLabel('New review date');
  const min = (await date.getAttribute('min')) ?? '';
  const target = new Date(`${min}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 2);
  await date.fill(target.toISOString().slice(0, 10));
  await dialog.getByLabel('Reason').fill('Focus on networking first');
  await dialog.getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Queues moved to' })).toBeVisible();

  await page.getByRole('tab', { name: /Upcoming/ }).click();
  await page.getByRole('button', { name: 'History of Queues' }).click();
  await expect(page.getByRole('dialog', { name: 'Queues' })).toContainText(
    'Focus on networking first',
  );

  await setClock(learner.id, 0);
});
