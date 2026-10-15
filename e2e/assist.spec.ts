import { expect, test } from '@playwright/test';
import { answerUntil, startLevel, waitPhase, watchErrors } from './helpers';

/**
 * «Тёплый шарф» (balance.assist): после двух поражений подряд на уровне герой получает лишнее
 * деление тепла. Первое поражение уже записано в сохранение, второе игрок «добывает» сам:
 * три падения с состаренных льдин.
 */
type Ice = {
  ageFloe(k: number): void;
  state(): { hero: { floeStart: number | null; warmth: number }; status: string } | null;
};

test('после двух поражений подряд — тёплый шарф: +1 тепло', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('ice:progress'))
      localStorage.setItem(
        'ice:progress',
        JSON.stringify({ levels: {}, unlocked: 1, tutorial: {}, streak: { '1': 1 } }),
      );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 1);
  await expect(page.locator('.thermo-mark')).toHaveCount(3);
  await page.evaluate(() => window.__ice.freezeMelt());
  await page.evaluate(() => window.__ice.toShore());
  await answerUntil(page, async () =>
    page.evaluate(() => (window.__ice as unknown as Ice).state()?.hero.floeStart !== null),
  );

  // Три падения: льдина под героем «стареет» до развала, герой выбирается на обломок.
  for (let warmth = 2; warmth >= 0; warmth--) {
    await page.evaluate(() => (window.__ice as unknown as Ice).ageFloe(1));
    await page.waitForFunction((w) => {
      const s = (window.__ice as unknown as Ice).state();
      return !s || s.hero.warmth <= w;
    }, warmth);
  }
  await waitPhase(page, 'results');
  await expect(page.locator('.res-scarf')).toHaveText('В следующий раз — тёплый шарф: +1 тепло');

  await page.getByRole('button', { name: 'Ещё раз' }).click();
  await waitPhase(page, 'intro', 'play');
  await expect(page.locator('.caption-note')).toHaveText('Тёплый шарф: +1 тепло');
  await expect(page.locator('.thermo-mark')).toHaveCount(4);
  await expect(page.locator('.thermo-mark.is-scarf')).toHaveCount(1);
  expect(await page.evaluate(() => (window.__ice as unknown as Ice).state()?.hero.warmth)).toBe(4);
  expect(errors).toEqual([]);
});
