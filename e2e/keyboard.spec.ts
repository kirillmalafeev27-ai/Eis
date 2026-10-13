import { type Page, expect, test } from '@playwright/test';
import { startLevel, watchErrors } from './helpers';

/**
 * Доступность (11.6): весь раунд проходится с клавиатуры — цифры 1–4 для ответа,
 * стрелки для соседней льдины, Shift + стрелка для длинного прыжка, H — к берегу,
 * пробел — стоять.
 */
interface S {
  grid: { cells: string[]; length: number; height: number };
  hero: { cell: number; target: number | null };
  status: string;
  stats: { longJumps: number };
}

const st = (page: Page) => page.evaluate(() => window.__ice.state() as unknown as S);

/** Нажать верную цифру с клавиатуры, если вопрос открыт. */
async function answerByKey(page: Page): Promise<void> {
  const i = await page.evaluate(() =>
    window.__ice.panelMode() === 'active' ? window.__ice.correctIndex() : -1,
  );
  if (i >= 0) await page.keyboard.press(String(i + 1));
  await page.waitForTimeout(180);
}

test('раунд с клавиатуры: стрелки, длинный прыжок с Shift, пробел, H и цифры', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 2);
  await page.evaluate(() => window.__ice.freezeMelt());
  await page.waitForFunction(() => window.__ice.panelMode() === 'active');
  await page.waitForTimeout(300);

  // Пробел снимает цель, H ставит дальний берег.
  await page.keyboard.press('h');
  expect((await st(page)).hero.target).not.toBeNull();
  await page.keyboard.press(' ');
  expect((await st(page)).hero.target).toBeNull();

  // Длинный прыжок: идём стрелкой вверх (в портрете — к дальнему берегу), пока впереди
  // не окажутся две льдины подряд; ближнюю топим отладочной кнопкой и прыгаем через
  // полынью с Shift + стрелкой.
  let longDone = false;
  for (let step = 0; step < 40 && !longDone; step++) {
    const s = await st(page);
    if (s.status !== 'playing') break;
    const L = s.grid.length;
    const a = Math.floor(s.hero.cell / L);
    const l = s.hero.cell % L;
    const at = (aa: number) => (aa < s.grid.height ? s.grid.cells[aa * L + l] : 'none');
    const ice = (k: string) => k === 'thin' || k === 'thick';
    if (ice(at(a + 1)) && (ice(at(a + 2)) || at(a + 2) === 'far')) {
      const gap = (a + 1) * L + l;
      await page.evaluate(
        (c) => (window.__ice as unknown as { wetCell(c: number, ms: number): void }).wetCell(c, 200),
        gap,
      );
      await page.waitForFunction(
        (c) => (window.__ice.state() as unknown as S | null)?.grid.cells[c] === 'water',
        gap,
      );
    }
    const now = await st(page);
    const ahead = now.grid.cells[(a + 1) * L + l];
    const beyond = a + 2 < now.grid.height ? now.grid.cells[(a + 2) * L + l] : 'none';
    const long = ahead === 'water' && (ice(beyond) || beyond === 'far');
    await page.keyboard.press(long ? 'Shift+ArrowUp' : ice(ahead) ? 'ArrowUp' : 'h');
    if (long) expect((await st(page)).hero.target, 'цель длинного прыжка').toBe((a + 2) * L + l);
    for (let i = 0; i < 12; i++) {
      if ((await st(page)).hero.cell !== s.hero.cell) break;
      await answerByKey(page);
    }
    if (long && (await st(page)).stats.longJumps > s.stats.longJumps) longDone = true;
  }

  // До берега — клавишей H и цифрами.
  await page.keyboard.press('h');
  for (let i = 0; i < 80; i++) {
    if ((await st(page)).status !== 'playing') break;
    await answerByKey(page);
  }
  expect((await st(page)).status, 'итог раунда').toBe('won');
  expect(longDone, 'был длинный прыжок с Shift + стрелкой').toBe(true);

  // Финал пропускается Enter, на итогах кнопки доступны с клавиатуры.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ice.phase() === 'results');
  await expect(page.getByRole('button', { name: 'Дальше' })).toBeVisible();
  expect(errors).toEqual([]);
});
