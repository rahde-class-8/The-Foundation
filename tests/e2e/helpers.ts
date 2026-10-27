import { expect, type Page } from '@playwright/test';

export const ownerEmail = process.env.OWNER_EMAIL;
export const ownerPassword = process.env.OWNER_PASSWORD;
export const hasOwner = Boolean(ownerEmail && ownerPassword);

export async function signIn(page: Page, path = '/dashboard') {
  await page.goto(path);
  await page.getByLabel('Email').fill(ownerEmail ?? '');
  await page.getByLabel('Password').fill(ownerPassword ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}
