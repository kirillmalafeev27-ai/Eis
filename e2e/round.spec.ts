import { expect, test } from '@playwright/test';
import { answerCorrect, answerUntil, heroCell, startLevel, waitPhase, watchErrors } from './helpers';

test('пройти раунд: меню → уровень 1 → интро → переправа → итоги → дальше', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?test');
  await waitPhase(page, 'menu');
  await page.getByRole('button', { name: 'Играть' }).click();
  await waitPhase(page, 'levels');
  await page.locator('.level-card').first().click();
  await waitPhase(page, 'intro');
  // Интро пропускается тапом (11.5.3).
  await page.locator('.intro-caption').click();
  await waitPhase(page, 'play');
  await page.evaluate(() => window.__ice.toShore());
  await answerUntil(page, async () =>
    page.evaluate(() => ['finale', 'results'].includes(window.__ice.phase())),
  );
  await waitPhase(page, 'results');
  const results = page.locator('.screen-results');
  await expect(results).toBeVisible();
  await expect(results.locator('h2')).toHaveText(/Переправился!|Еле успел!/);
  await expect(page.locator('.res-photo-img')).toBeVisible();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await waitPhase(page, 'intro', 'play');
  expect(await page.evaluate(() => window.__ice.state()?.status)).toBe('playing');
  expect(errors).toEqual([]);
});

test('без фильтров раунд тоже проходится', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await startLevel(page, 1, '&nofilters');
  await page.evaluate(() => window.__ice.toShore());
  await answerUntil(page, async () => page.evaluate(() => window.__ice.state()?.status === 'won'));
  expect(errors).toEqual([]);
});

test('пауза прячет вопрос и останавливает время', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 2);
  await page.keyboard.press('p');
  await expect(page.locator('.screen-pause')).toBeVisible();
  expect(await page.evaluate(() => window.__ice.panelMode())).toBe('paused');
  const blur = await page.locator('.qp-body').evaluate((e) => getComputedStyle(e).filter);
  expect(blur).toContain('blur');
  const t0 = await page.evaluate(() => (window.__ice.state() as unknown as { time: number }).time);
  await page.waitForTimeout(1200);
  const t1 = await page.evaluate(() => (window.__ice.state() as unknown as { time: number }).time);
  expect(t1).toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-pause')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ice.panelMode())).toBe('active');
});

test('двойной тап не отвечает на следующий вопрос', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 2);
  await page.evaluate(() => window.__ice.freezeMelt());
  // Вопрос открыт и защита от двойного тапа для него уже истекла.
  await page.waitForFunction(() => window.__ice.panelMode() === 'active');
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__ice.state()?.stats.answers ?? -1);
  const key = String((await page.evaluate(() => window.__ice.correctIndex())) + 1);
  await page.keyboard.press(key);
  await page.keyboard.press(key);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__ice.state()?.stats.answers ?? -1);
  expect(after - before).toBe(1);
});

test('поворот экрана посреди раунда: река и панель поворачиваются, раунд идёт', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 2);
  await page.evaluate(() => window.__ice.freezeMelt());
  expect(await page.evaluate(() => window.__ice.orientation())).toBe('portrait');
  await page.evaluate(() => window.__ice.toShore());
  const start = await heroCell(page);
  await answerUntil(page, async () => (await heroCell(page)) !== start);
  const mid = await heroCell(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__ice.orientation())).toBe('landscape');
  expect(await page.evaluate(() => window.__ice.phase())).toBe('play');
  expect(await heroCell(page)).toBe(mid);
  await answerCorrect(page);
  await answerUntil(page, async () => (await heroCell(page)) !== mid);
  expect(errors).toEqual([]);
});
