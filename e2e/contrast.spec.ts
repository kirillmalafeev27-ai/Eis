import { expect, test } from '@playwright/test';
import { waitPhase, watchErrors } from './helpers';

/**
 * Тест контраста (8.4): при силе ледохода 0, 0.5 и 1 относительная яркость по WCAG
 * в центре объектов тестовой сцены. Толстая/тонкая ≥ 1.3, тонкая/вода ≥ 2.0,
 * рыба/тонкая ≥ 1.5. Тот же тест — для запасного пути без фильтров (8.5).
 */
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

for (const mode of ['', '&nofilters']) {
  for (const strength of [0, 0.5, 1]) {
    test(`контраст: сила ${strength}${mode ? ', без фильтров' : ''}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`/?test&scene=contrast&strength=${strength}${mode}`);
      await waitPhase(page, 'contrast');
      await page.waitForTimeout(1200);
      const samples: number[][] = [];
      for (let i = 0; i < 3; i++) {
        samples.push(
          await page.evaluate(async () => {
            const p = window.__ice.contrastPoints();
            if (!p) return [];
            return window.__ice.sample([p.water, p.thin, p.thick, p.fish], 4);
          }),
        );
        await page.waitForTimeout(150);
      }
      expect(samples.every((s) => s.length === 4)).toBe(true);
      const [water, thin, thick, fish] = [0, 1, 2, 3].map((k) => median(samples.map((s) => s[k])));
      const r = { thickThin: ratio(thick, thin), thinWater: ratio(thin, water), fishThin: ratio(fish, thin) };
      test.info().annotations.push({ type: 'ratios', description: JSON.stringify(r) });
      expect(thick).toBeGreaterThan(thin);
      expect(r.thickThin).toBeGreaterThanOrEqual(1.3);
      expect(r.thinWater).toBeGreaterThanOrEqual(2.0);
      expect(r.fishThin).toBeGreaterThanOrEqual(1.5);
      expect(errors).toEqual([]);
    });
  }
}
