import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startLevel } from './helpers';

/**
 * Панель вопроса (11.2) на каждом вопросе банка: длинные немецкие слова не ломают
 * вёрстку, вопросы с 2, 3 и 4 вариантами показываются правильно. Самый тесный портрет
 * и ландшафт со столбиком фишек.
 */
interface Q {
  id: string;
  prompt: string;
  options: string[];
}
const raw = JSON.parse(
  readFileSync(new URL('../src/shared/questions/bank.de.json', import.meta.url), 'utf8'),
) as Q[] | { questions: Q[] };
const bank = Array.isArray(raw) ? raw : raw.questions;

for (const [w, h] of [
  [360, 640],
  [1280, 720],
] as const) {
  test(`все вопросы банка помещаются в панель ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await startLevel(page, 1);
    await page.evaluate(() => window.__ice.freezeMelt());
    const problems: string[] = [];
    for (const q of bank) {
      const r = await page.evaluate((question) => {
        (window.__ice as unknown as { showQuestion(q: unknown): void }).showQuestion(question);
        const panel = document.querySelector('.series-card-question')!.getBoundingClientRect();
        const prompt = document.querySelector('.qp-prompt') as HTMLElement;
        const chips = [...document.querySelectorAll<HTMLElement>('.qp-chip')];
        const over = (e: HTMLElement) =>
          e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1;
        const outside = (e: HTMLElement) => {
          const b = e.getBoundingClientRect();
          return (
            b.left < panel.left - 1 ||
            b.right > panel.right + 1 ||
            b.top < panel.top - 1 ||
            b.bottom > panel.bottom + 1
          );
        };
        return {
          count: chips.length,
          promptOver: over(prompt),
          chipsOver: chips.filter((c) => over(c.querySelector('.qp-text') as HTMLElement)).length,
          chipsOutside: chips.filter(outside).length,
          minChipH: Math.min(...chips.map((c) => c.getBoundingClientRect().height)),
        };
      }, q);
      if (r.count !== q.options.length) problems.push(`${q.id}: ${r.count} фишек вместо ${q.options.length}`);
      if (r.promptOver) problems.push(`${q.id}: задание не помещается`);
      if (r.chipsOver) problems.push(`${q.id}: текст не помещается в ${r.chipsOver} фишках`);
      if (r.chipsOutside) problems.push(`${q.id}: ${r.chipsOutside} фишек за краем панели`);
      if (r.minChipH < 55.5) problems.push(`${q.id}: фишка ниже 56 px (${r.minChipH.toFixed(1)})`);
    }
    expect(problems).toEqual([]);
  });
}
