import { type Page, expect, test } from '@playwright/test';
import { answerUntil, startLevel, waitPhase, watchErrors } from './helpers';

/**
 * Раскладка на устройствах из чек-листа (раздел 16): меню, раунд и итоги. Снимки
 * складываются в test-results/screens для глазной проверки читаемости.
 */
const SIZES = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1920, 1080],
] as const;

async function checkLayout(page: Page): Promise<void> {
  const box = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  // Страница не прокручивается: всё помещается в окно.
  expect(box.sw).toBeLessThanOrEqual(box.w + 1);
  expect(box.sh).toBeLessThanOrEqual(box.h + 1);
}

async function inside(page: Page, selector: string, container = 'body'): Promise<void> {
  const ok = await page.evaluate(
    ([sel, cont]) => {
      const c = document.querySelector(cont)?.getBoundingClientRect();
      const els = [...document.querySelectorAll(sel)];
      if (!c || !els.length) return false;
      return els.every((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1
        );
      });
    },
    [selector, container] as const,
  );
  expect(ok, `${selector} внутри ${container}`).toBe(true);
}

for (const [w, h] of SIZES) {
  test(`раскладка ${w}×${h}`, async ({ page }) => {
    const errors = watchErrors(page);
    const shot = (name: string) => page.screenshot({ path: `test-results/screens/${w}x${h}-${name}.png` });
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?test');
    await waitPhase(page, 'menu');
    await page.waitForTimeout(800);
    await checkLayout(page);
    await inside(page, '.menu-buttons .paper-btn');
    await shot('1-menu');

    await startLevel(page, 2);
    await page.waitForTimeout(500);
    await checkLayout(page);
    await inside(page, '.qp-chip');
    await inside(page, '.basket', '.series-card-world');
    await shot('2-play');

    await page.evaluate(() => window.__ice.toShore());
    await answerUntil(page, async () =>
      page.evaluate(() => ['finale', 'results'].includes(window.__ice.phase())),
    );
    await waitPhase(page, 'results');
    await page.waitForTimeout(1600);
    await checkLayout(page);
    await inside(page, '.screen-results .paper-btn');
    await shot('3-results');
    expect(errors).toEqual([]);
  });
}
