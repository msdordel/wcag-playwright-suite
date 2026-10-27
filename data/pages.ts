import type { Page } from '@playwright/test';

/**
 * The page inventory. Every route a user can reach belongs here. Axe can only audit
 * what is rendered, so add a `state` for each meaningful UI state: open menus,
 * dialogs, validation errors, empty and error results, and logged-in views.
 *
 * Currently targets Deque's intentionally broken demo (https://broken-workshop.dequelabs.com/):
 * a single-page recipe dashboard whose Cook and Edit actions open a modal.
 */
export interface UiState {
  name: string;
  setup: (page: Page) => Promise<void>;
}

export interface PageUnderTest {
  name: string;
  path: string;
  critical?: boolean;
  states?: UiState[];
}

export const openCookModal = (page: Page) => page.getByRole('button', { name: 'Cook Chocolate Cake' }).click();
// "Edit" is a div[tabindex=0] wrapping an <img alt="Edit">, not a button. That is one of the site's intentional bugs.
export const openEditModal = (page: Page) => page.getByTestId('edit-button').first().click();

export const PAGES: PageUnderTest[] = [
  {
    name: 'Recipe dashboard',
    path: '/',
    critical: true,
    states: [
      { name: 'cook modal open', setup: openCookModal },
      { name: 'edit modal open', setup: openEditModal },
      {
        name: 'edit modal validation error',
        setup: async (page) => {
          await openEditModal(page);
          await page.getByRole('textbox', { name: /ingredient/i }).first().fill('');
          await page.getByRole('button', { name: 'Save' }).click();
        },
      },
    ],
  },
];

/**
 * Regions that must be consistent across pages (3.2.3 Consistent Navigation, 3.2.6 Consistent Help),
 * compared as ARIA snapshots. Empty here: a single-page app has nothing to compare against.
 */
export const CONSISTENT_REGIONS: { sc: string; name: string; locate: (p: Page) => import('@playwright/test').Locator }[] = [];
