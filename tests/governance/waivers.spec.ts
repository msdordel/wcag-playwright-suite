import { test, expect } from '@playwright/test';
import { WAIVERS, isExpired } from '../../src/a11y/waivers';

/** Guards against the waiver register turning into a permanent ignore list. */
const MAX_WAIVER_DAYS = 90;

test.describe('waiver register', () => {
  for (const w of WAIVERS) {
    test(`${w.ticket} (${w.rule})`, async () => {
      expect.soft(w.ticket, 'needs a tracker ticket').toMatch(/^[A-Z][A-Z0-9]+-\d+$/);
      expect.soft(w.reason.length, 'needs a real justification').toBeGreaterThan(15);
      expect.soft(w.approvedBy, 'needs an approver').toBeTruthy();
      expect.soft(isExpired(w), `expired ${w.expires}; fix the issue or renew with fresh approval`).toBe(false);
      const days = (new Date(w.expires).getTime() - Date.now()) / 86_400_000;
      expect.soft(days, `expiry more than ${MAX_WAIVER_DAYS} days out`).toBeLessThanOrEqual(MAX_WAIVER_DAYS);
    });
  }

  test('register is well-formed', async () => {
    for (const w of WAIVERS) expect(Number.isNaN(new Date(w.expires).getTime()), `${w.ticket}: bad date`).toBe(false);
  });
});
