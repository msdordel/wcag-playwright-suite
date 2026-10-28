import type { Locator, Page } from '@playwright/test';

/**
 * The page inventory, grouped by site. Every route a user can reach belongs here. Axe can only
 * audit what is rendered, so add a `state` for each meaningful UI state: open menus, dialogs,
 * validation errors, empty and error results, and logged-in views.
 *
 * All targets are Deque's intentionally inaccessible demo sites. Run a subset with SITES=dream,mars.
 */
export interface UiState {
  name: string;
  setup: (page: Page) => Promise<void>;
}

export interface PageUnderTest {
  /** Stable file-safe key, e.g. "computech-cart". Used for snapshot names. */
  id: string;
  name: string;
  /** Absolute URL, resolved from the site's origin. */
  path: string;
  site: string;
  critical?: boolean;
  states?: UiState[];
}

/**
 * Regions that must be consistent across a site's pages (3.2.3 Consistent Navigation,
 * 3.2.6 Consistent Help), compared as ARIA snapshots.
 */
export interface ConsistentRegion {
  sc: string;
  name: string;
  locate: (p: Page) => Locator;
}

export interface Site {
  id: string;
  name: string;
  origin: string;
  pages: Omit<PageUnderTest, 'site' | 'id'>[];
  /** Browsers that cannot load the site, with the reason. Those tests are skipped, never silently passed. */
  unsupportedBrowsers?: Partial<Record<'chromium' | 'firefox' | 'webkit', string>>;
  consistentRegions?: ConsistentRegion[];
}

export const WORKSHOP_URL = 'https://broken-workshop.dequelabs.com/';

export const openCookModal = (page: Page) => page.getByRole('button', { name: 'Cook Chocolate Cake' }).click();
// "Edit" is a div[tabindex=0] wrapping an <img alt="Edit">, not a button. That is one of the site's intentional bugs.
export const openEditModal = (page: Page) => page.getByTestId('edit-button').first().click();

export const ALL_SITES: Site[] = [
  {
    // Single-page recipe dashboard whose Cook and Edit actions open a modal.
    id: 'workshop',
    name: 'Broken Workshop',
    origin: WORKSHOP_URL,
    pages: [
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
    ],
  },
  {
    // Single-page travel booking site. Every link is a "#" placeholder.
    id: 'dream',
    name: 'Dream Destination',
    origin: 'https://dequeuniversity.com',
    pages: [{ name: 'Home', path: '/demo/dream', critical: true }],
  },
  {
    // Every inner link goes to a generic "mars2.html?a=…" stub, so only the home page is real.
    id: 'mars',
    name: 'Mars Commuter',
    origin: 'https://dequeuniversity.com',
    pages: [{ name: 'Home', path: '/demo/mars/', critical: true }],
  },
  {
    // Multi-page PHP shop. It has no landmarks, so shared regions are located by content.
    id: 'computech',
    name: 'Gefälscht CompuTech',
    origin: 'https://webtestingcourse.dequecloud.com',
    unsupportedBrowsers: {
      // The server sends the wrong intermediate certificate. Chromium (and WebKit on macOS) fetch the
      // right one; Playwright's Firefox and WebKit on Linux reject the page.
      firefox: 'server sends the wrong TLS intermediate certificate (SEC_ERROR_UNKNOWN_ISSUER)',
      ...(process.platform === 'linux' && { webkit: 'server sends the wrong TLS intermediate certificate (Unacceptable TLS certificate on Linux)' }),
    },
    pages: [
      { name: 'Home', path: '/', critical: true },
      { name: 'Laptops & Notebooks', path: '/laptopsandnotebooks.php' },
      { name: 'Laptop product', path: '/laptop1.php' },
      { name: 'Cart', path: '/cart.php', critical: true },
      { name: 'Contact', path: '/contact.php' },
    ],
    consistentRegions: [
      {
        sc: '3.2.3',
        name: 'main navigation',
        locate: (p) => p.getByRole('list').filter({ has: p.getByRole('link', { name: 'Laptops & Notebooks' }) }).first(),
      },
      { sc: '3.2.3', name: 'site search', locate: (p) => p.getByRole('group', { name: 'Site Search' }) },
    ],
  },
];

const selected = process.env.SITES?.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = selected?.filter((id) => !ALL_SITES.some((s) => s.id === id)) ?? [];
if (unknown.length) throw new Error(`Unknown SITES: ${unknown.join(', ')}. Known: ${ALL_SITES.map((s) => s.id).join(', ')}`);

export const SITES = selected?.length ? ALL_SITES.filter((s) => selected.includes(s.id)) : ALL_SITES;

export const PAGES: PageUnderTest[] = SITES.flatMap((s) =>
  s.pages.map((p) => ({
    ...p,
    id: `${s.id}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    site: s.id,
    name: `${s.name} › ${p.name}`,
    path: new URL(p.path, s.origin).href,
  })),
);

export const pagesOf = (site: Site) => PAGES.filter((p) => p.site === site.id);
export const hasSite = (id: string) => SITES.some((s) => s.id === id);

/** Why this page can't be tested in this browser, or undefined if it can. */
export const unsupportedReason = (p: PageUnderTest, browserName: string) =>
  ALL_SITES.find((s) => s.id === p.site)?.unsupportedBrowsers?.[browserName as 'chromium' | 'firefox' | 'webkit'];
