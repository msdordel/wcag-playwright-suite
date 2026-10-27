import type { Page } from '@playwright/test';
import { REFLOW_EXEMPT } from './config';

/** 1.4.12 Text Spacing: the exact user-override values the SC requires content to tolerate. */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

/**
 * 1.4.10: elements extending past the right edge of the viewport, excluding
 * content that is allowed two-dimensional scrolling.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate((exempt) => {
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= vw + 1) return [];
    return [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .filter((el) => !exempt.some((sel) => el.closest(sel)))
      .filter((el) => el.checkVisibility())
      // Report only the outermost offenders, not every descendant.
      .filter((el, _, all) => !all.some((other) => other !== el && other.contains(el)))
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`);
  }, REFLOW_EXEMPT);
}

/**
 * 1.4.4 / 1.4.12: elements whose text is cut off by overflow:hidden/clip.
 * This heuristic does not catch overlapping text; check that in manual review.
 */
export async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.body.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.checkVisibility() && el.innerText?.trim())
      .filter((el) => {
        const cs = getComputedStyle(el);
        const hidesX = /hidden|clip/.test(cs.overflowX);
        const hidesY = /hidden|clip/.test(cs.overflowY);
        const isTruncationStyled = cs.textOverflow === 'ellipsis';
        return (
          (hidesY && el.scrollHeight > el.clientHeight + 1) ||
          (hidesX && !isTruncationStyled && el.scrollWidth > el.clientWidth + 1)
        );
      })
      .map((el) => `${el.tagName.toLowerCase()}: "${el.innerText.trim().slice(0, 50)}"`),
  );
}
