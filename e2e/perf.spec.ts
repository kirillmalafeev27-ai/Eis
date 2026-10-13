import { expect, test } from '@playwright/test';
import { waitPhase, watchErrors } from './helpers';

/**
 * Бюджет генерации арта (7.3, 13.6): рисование всех текстур на Canvas — не дольше 1,5 с.
 * Передача страниц атласа на GPU в программном WebGL несоразмерно дорогая, поэтому
 * она не входит в проверку (см. DECISIONS.md), а только выводится в отчёт.
 */
test('генерация арта укладывается в бюджет', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  await waitPhase(page, 'menu');
  const r = await page.evaluate(() => {
    const ice = window.__ice as unknown as { genSteps(): number[]; genMs(): number; genUploadMs(): number };
    return { steps: ice.genSteps(), total: ice.genMs(), upload: ice.genUploadMs() };
  });
  const drawMs = r.steps.reduce((a, b) => a + b, 0);
  test.info().annotations.push({
    type: 'generation',
    description: `рисование ${drawMs} мс, всего ${Math.round(r.total)} мс, загрузка на GPU ${Math.round(r.upload)} мс`,
  });
  expect(r.steps.length).toBeGreaterThan(10);
  expect(drawMs).toBeLessThanOrEqual(1500);
  expect(errors).toEqual([]);
});
