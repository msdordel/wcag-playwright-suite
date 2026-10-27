import type { Locator } from '@playwright/test';
import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { openCookModal, openEditModal } from '../../data/pages';

/**
 * Layer 4: form behaviour. This is the pattern to copy for every form in the app.
 * Targets the recipe edit form in the Deque demo site.
 */

/** Errors may be linked through aria-describedby or aria-errormessage. Accept either. */
async function expectErrorAssociated(field: Locator, text: RegExp) {
  try {
    await expect(field).toHaveAccessibleErrorMessage(text, { timeout: 1_000 });
  } catch {
    await expect(field, '3.3.1 error text must be programmatically associated with its field').toHaveAccessibleDescription(text);
  }
}

test.beforeEach(async ({ page }) => {
  await gotoStable(page, '/');
  await openEditModal(page);
});

test('every field has a meaningful accessible name', sc('1.3.1', '3.3.2', '4.1.2'), async ({ page }) => {
  const dialog = page.getByRole('dialog');
  for (const field of await dialog.locator('input:not([type=hidden]), select, textarea').all()) {
    await expect.soft(field, '4.1.2 field has no accessible name').toHaveAccessibleName(/\w/);
  }
});

test('cook form fields have meaningful accessible names', sc('1.3.1', '3.3.2', '4.1.2'), async ({ page }) => {
  // axe misses this one: the field has a <label>, but it contains only whitespace.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await openCookModal(page);
  for (const field of await page.getByRole('dialog').locator('input:not([type=hidden]), select, textarea').all()) {
    await expect.soft(field, '4.1.2 field has no accessible name').toHaveAccessibleName(/\w/);
  }
});

test('empty required field is identified on save', sc('3.3.1', '4.1.2'), async ({ page }) => {
  const field = page.getByRole('textbox', { name: /ingredient/i }).first();
  await field.fill('');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Ingredient must not be empty')).toBeVisible();
  await expect.soft(field, '3.3.1 invalid field must expose aria-invalid="true"').toHaveAttribute('aria-invalid', 'true');
  await expectErrorAssociated(field, /must not be empty/i);
});

test('focus moves to the error after a failed save', sc('3.3.1', '2.4.3'), async ({ page }) => {
  await page.getByRole('textbox', { name: /ingredient/i }).first().fill('');
  await page.getByRole('button', { name: 'Save' }).click();

  const focusOk = await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && (a.getAttribute('aria-invalid') === 'true' || a.matches('input, textarea') || !!a.closest('[role="alert"]'));
  });
  expect(focusOk, '3.3.1 focus did not move to the invalid field after a failed save').toBe(true);
});

test('form in error state has no axe violations', sc('1.3.1', '3.3.1', '4.1.2'), async ({ page, axe }) => {
  await page.getByRole('textbox', { name: /ingredient/i }).first().fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await axe({ include: ['.RecipeModal'], label: 'edit form – errors' });
});
