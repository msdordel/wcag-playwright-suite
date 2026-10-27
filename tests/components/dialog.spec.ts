import { test, expect, gotoStable, sc } from '../../src/a11y/fixtures';
import { tabKey } from '../../src/a11y/keyboard';

// Some dialog libraries (including this one, Cauldron) render a 0×0 role="dialog" wrapper with positioned
// children. Playwright treats a 0×0 element as hidden, so visibility is asserted on the dialog's heading.
const dialogContent = (page: import('@playwright/test').Page) => page.getByRole('dialog').getByRole('heading').first();

/**
 * Modal dialog contract (WAI-ARIA APG). Copy this for each dialog in the app.
 * A modal may hold focus while open. That is allowed under 2.1.2 only because
 * Escape and the close button let the user leave it.
 */
const openTrigger = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Cook Chocolate Cake' });

test.beforeEach(async ({ page }) => {
  await gotoStable(page, '/');
  await openTrigger(page).focus();
  await page.keyboard.press('Enter');
});

test('dialog is named, modal and receives focus', sc('4.1.2', '2.4.3'), async ({ page }) => {
  const dialog = page.getByRole('dialog');
  await expect(dialogContent(page)).toBeVisible();
  await expect.soft(dialog, '4.1.2 dialog needs an accessible name (aria-labelledby → heading)').toHaveAccessibleName(/\S/);
  const isModal = await dialog.evaluate((d) => d.getAttribute('aria-modal') === 'true' || (d as HTMLDialogElement).matches?.(':modal'));
  expect.soft(isModal, '4.1.2 dialog must be aria-modal or opened with showModal()').toBe(true);
  expect(await dialog.evaluate((d) => d.contains(document.activeElement)), '2.4.3 focus must move into the dialog').toBe(true);
});

test('focus stays inside while open and Escape exits', sc('2.1.2', '2.4.3'), async ({ page }) => {
  const dialog = page.getByRole('dialog');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press(tabKey(page, { reverse: i % 4 === 3 }));
    expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `2.4.3 focus escaped modal on press ${i + 1}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('closing returns focus to the trigger', sc('2.4.3'), async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(openTrigger(page), '2.4.3 focus must return to the control that opened the dialog').toBeFocused();
});

test('Edit control is a keyboard-operable button', sc('2.1.1', '4.1.2'), async ({ page }) => {
  await page.keyboard.press('Escape');
  const edit = page.getByTestId('edit-button').first();
  const control = edit.locator('xpath=ancestor-or-self::*[@tabindex or self::button or self::a][1]');
  await expect.soft(control, '4.1.2 Edit must expose role=button').toHaveRole('button');
  await control.focus();
  await page.keyboard.press('Enter');
  await expect(dialogContent(page), '2.1.1 Edit must open with Enter').toBeVisible();
});

test('open dialog has no axe violations', sc('1.3.1', '4.1.2', '1.4.3'), async ({ page, axe }) => {
  await axe({ include: ['[role="dialog"], dialog'], label: 'cook dialog' });
});
