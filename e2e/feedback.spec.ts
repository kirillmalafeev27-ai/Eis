import { type Page, expect, test } from '@playwright/test';
import { answerUntil, startLevel, watchErrors } from './helpers';

/**
 * Сочность (9.2): на событие отвечают слово и звук. Журнал откликов ведёт игра в режиме
 * ?test (`__ice.feedback()`), картинку проверяют снимки раскладки.
 */
type Ice = {
  feedback(): string[];
  ageFloe(k: number): void;
  wetCell(cell: number, ms: number): void;
  tapCell(a: number, l: number): void;
  state(): {
    grid: { cells: string[]; length: number; height: number };
    hero: { cell: number; floeStart: number | null };
    time: number;
  };
};
async function waitFeedback(page: Page, ...items: string[]): Promise<void> {
  await page
    .waitForFunction(
      (need) => {
        const log = (window.__ice as unknown as Ice).feedback();
        return need.every((n) => n.split('|').some((alt) => log.includes(alt)));
      },
      items,
      { timeout: 15_000 },
    )
    .catch(async (e: unknown) => {
      const log = await page.evaluate(() => (window.__ice as unknown as Ice).feedback());
      throw new Error(`нет отклика ${items.join(', ')}; журнал: ${log.join(' ')}`, { cause: e });
    });
}

test('прыжок, приземление, падение, намокание, отказ и ошибка дают слово и звук', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 3);
  await page.evaluate(() => window.__ice.freezeMelt());
  await waitFeedback(page, "word:AUF GEHT'S!", 'sound:start');

  // Верный ответ и прыжок.
  await page.evaluate(() => window.__ice.toShore());
  // Первый прыжок может быть вдоль берега, поэтому отвечаем, пока не приземлимся на льдину.
  await answerUntil(page, async () =>
    page.evaluate(() =>
      (window.__ice as unknown as Ice).feedback().some((f) => f === 'word:KNACK!' || f === 'word:STAPF!'),
    ),
  );
  await waitFeedback(
    page,
    'sound:correct',
    'sound:hop|sound:hui',
    'word:HOPP!|word:HUI!',
    'sound:landThin|sound:landThick',
    'word:KNACK!|word:STAPF!',
  );

  // Неверный ответ: «бонк» и HOPPLA! в углу панели.
  await page.waitForFunction(() => window.__ice.panelMode() === 'active');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const i = window.__ice.correctIndex();
    window.__ice.press(i === 0 ? 2 : 1);
  });
  await waitFeedback(page, 'sound:wrong');

  // Отказ: тап по воде.
  const water = await page.evaluate(() => {
    const s = (window.__ice as unknown as Ice).state();
    const i = s.grid.cells.findIndex((k) => k === 'water');
    return i < 0 ? null : { a: Math.floor(i / s.grid.length), l: i % s.grid.length };
  });
  if (water) {
    await page.evaluate(({ a, l }) => (window.__ice as unknown as Ice).tapCell(a, l), water);
    await waitFeedback(page, 'sound:denied', 'word:ZU WEIT!');
  }

  // Намокание и утопание далёкой льдины.
  const far = await page.evaluate(() => {
    const s = (window.__ice as unknown as Ice).state();
    const L = s.grid.length;
    const ha = Math.floor(s.hero.cell / L);
    for (let c = s.grid.cells.length - 1; c >= 0; c--) {
      const k = s.grid.cells[c];
      if ((k === 'thin' || k === 'thick') && Math.floor(c / L) >= ha + 3) return c;
    }
    return -1;
  });
  expect(far).toBeGreaterThanOrEqual(0);
  await page.evaluate((c) => (window.__ice as unknown as Ice).wetCell(c, 1500), far);
  await waitFeedback(page, 'sound:drip', 'word:TROPF…');
  await waitFeedback(page, 'sound:blubb', 'word:BLUBB!');

  // Падение: льдина под героем доживает последние мгновения.
  await page.evaluate(() => (window.__ice as unknown as Ice).ageFloe(0.97));
  await waitFeedback(page, 'sound:krach', 'word:KRACH!', 'sound:splash', 'word:PLATSCH!');
  expect(errors).toEqual([]);
});

test('«меньше движения»: камера не дрожит и не зумится, кнопки и слова без прыжков', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 3);
  await page.evaluate(() => window.__ice.freezeMelt());
  expect(await page.locator('.series-root').getAttribute('class')).toContain('is-calm');
  const camera = () =>
    page.evaluate(() => {
      const game = (window.__ice as unknown as { game(): { scene: { scenes: unknown[] } } }).game();
      const sc = game.scene.scenes.find((x) => (x as { world?: unknown }).world) as {
        cameras: { main: { zoom: number; scrollX: number; scrollY: number } };
      };
      const c = sc.cameras.main;
      return `${c.zoom.toFixed(4)}:${c.scrollX.toFixed(1)}:${c.scrollY.toFixed(1)}`;
    });
  const first = await camera();
  const seen = new Set<string>([first]);
  await page.evaluate(() => window.__ice.toShore());
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() => {
      const ice = window.__ice;
      if (ice.panelMode() !== 'active') return;
      const c = ice.correctIndex();
      if (c >= 0) ice.press(c + 1);
    });
    for (let k = 0; k < 4; k++) {
      seen.add(await camera());
      await page.waitForTimeout(40);
    }
  }
  const log = await page.evaluate(() => (window.__ice as unknown as Ice).feedback());
  expect(log.filter((f) => f.startsWith('sound:land')).length).toBeGreaterThanOrEqual(2);
  expect([...seen]).toEqual([first]);
  expect(errors).toEqual([]);
});
