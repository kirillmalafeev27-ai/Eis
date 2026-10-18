import { type Page, type Route, expect, test } from '@playwright/test';
import { EXERCISE_FORMATS } from '../server/generation/exerciseFormats';
import { startLevel, waitPhase, watchErrors } from './helpers';

/**
 * Вопросы генератора (движок Morskoy): формат заданий в панели и выбор тем. Сервер генерации
 * подменяется через page.route — тесты не ходят к модели.
 */

interface Q {
  id: string;
  instruction: string;
  prompt: string;
  promptLang: 'de' | 'ru';
  options: string[];
  optionsLang: 'de' | 'ru';
  correctIndex: number;
  format: string;
  audioText?: string;
}

/** Диалог с урока: реплики с новой строки, пропуск — во второй (так его пишет модель). */
const DIALOG_LINES = [
  '— Hast du das neue Sofa schon gesehen?',
  '— Ja, ich habe mich gestern gleich ___ gesetzt.',
];
const DIALOG: Q = {
  id: 'dialog-lines',
  instruction: 'Прочитай ситуацию и выбери подходящий вариант.',
  prompt: DIALOG_LINES.join('\n'),
  promptLang: 'de',
  options: ['an dem bequemen Sofa', 'über das bequeme Sofa', 'auf das bequeme Sofa', 'mit dem bequemen Sofa'],
  optionsLang: 'de',
  correctIndex: 2,
  format: 'dialog',
};

/** Образцы — разобранные примеры из каталога форматов, то есть из самих инструкций для ИИ. */
const SAMPLES: Q[] = [
  ...Object.entries(EXERCISE_FORMATS).map(([id, f]) => ({
    id,
    instruction: f.example.text,
    prompt: f.example.display,
    promptLang: 'de' as const,
    options: f.example.options,
    optionsLang: 'de' as const,
    correctIndex: f.example.correct,
    format: id,
  })),
  {
    id: 'audio',
    instruction: 'Прослушай немецкое предложение и выбери точный русский перевод.',
    prompt: 'Немецкая фраза звучит вслух. Выбери точный перевод.',
    promptLang: 'ru',
    audioText: 'Ich hole das Rezept in der Apotheke ab.',
    options: [
      'Я забираю рецепт в аптеке.',
      'Я отдаю рецепт в аптеке.',
      'Я забираю чек в аптеке.',
      'Я забираю рецепт у врача.',
    ],
    optionsLang: 'ru',
    correctIndex: 0,
    format: 'audio',
  },
  DIALOG,
];

/** На этих экранах задания каталога встают целиком, без прокрутки. */
const ROOMY = new Set(['390x844', '844x390', '1280x720']);

for (const [w, h] of [
  [360, 640],
  [390, 844],
  [844, 390],
  [1280, 720],
] as const) {
  test(`задания генератора помещаются в панель ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await startLevel(page, 3);
    await page.evaluate(() => window.__ice.freezeMelt());
    const problems: string[] = [];
    for (const q of SAMPLES) {
      const r = await page.evaluate((question) => {
        (window.__ice as unknown as { showQuestion(q: unknown): void }).showQuestion(question);
        const panel = document.querySelector('.series-card-question')!.getBoundingClientRect();
        const sheet = document.querySelector('.qp-sheet') as HTMLElement;
        const prompt = document.querySelector('.qp-prompt') as HTMLElement;
        const chips = [...document.querySelectorAll<HTMLElement>('.qp-chip')];
        const over = (e: HTMLElement) => e.scrollHeight > e.clientHeight + 1;
        const scroll = sheet.classList.contains('qp-scroll');
        // Прокручиваемый лист: всё должно быть доступно, если пролистать до конца.
        if (scroll) sheet.scrollTop = sheet.scrollHeight;
        const outside = (e: HTMLElement) => {
          const b = e.getBoundingClientRect();
          return b.left < panel.left - 1 || b.right > panel.right + 1 || b.bottom > panel.bottom + 1;
        };
        const font = parseFloat(getComputedStyle(chips[0].querySelector('.qp-text')!).fontSize);
        const res = {
          scroll,
          instruction: document.querySelector('.qp-instruction')?.textContent ?? '',
          listen: !(document.querySelector('.qp-listen') as HTMLElement).hidden,
          promptOver: !prompt.hidden && over(prompt),
          chipsOver: chips.filter((c) => over(c.querySelector('.qp-text') as HTMLElement)).length,
          lastOutside: outside(chips[chips.length - 1]),
          anyOutside: chips.filter(outside).length,
          minChipH: Math.min(...chips.map((c) => c.getBoundingClientRect().height)),
          font,
        };
        sheet.scrollTop = 0;
        return res;
      }, q);
      const tag = `${q.id}`;
      if (r.instruction !== q.instruction) problems.push(`${tag}: нет инструкции`);
      if (r.listen !== !!q.audioText) problems.push(`${tag}: кнопка «Слушать»`);
      if (r.promptOver) problems.push(`${tag}: задание обрезано`);
      if (r.chipsOver) problems.push(`${tag}: текст не помещается в ${r.chipsOver} фишках`);
      if (r.lastOutside) problems.push(`${tag}: последний вариант недоступен`);
      if (r.font < 12) problems.push(`${tag}: шрифт вариантов ${r.font}px`);
      if (r.minChipH < 35.5) problems.push(`${tag}: фишка ниже 36 px (${r.minChipH.toFixed(1)})`);
      if (!r.scroll && r.anyOutside) problems.push(`${tag}: ${r.anyOutside} фишек за краем панели`);
      if (ROOMY.has(`${w}x${h}`) && r.scroll) problems.push(`${tag}: прокрутка там, где места хватает`);
    }
    expect(problems).toEqual([]);
  });
}

test('реплики диалога — каждая своей строкой, и та, где пропуск, видна', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startLevel(page, 3);
  await page.evaluate(() => window.__ice.freezeMelt());
  await page.evaluate(
    (q) => (window.__ice as unknown as { showQuestion(q: unknown): void }).showQuestion(q),
    DIALOG,
  );
  await expect(page.locator('.qp-prompt .qp-line')).toHaveText(DIALOG_LINES);
  await expect(page.locator('.qp-prompt')).toHaveClass(/qp-dialog/);
  for (const line of await page.locator('.qp-prompt .qp-line').all()) await expect(line).toBeVisible();
});

/** Подменить сервер генерации: блок из десяти заданий по теме из запроса; gate придерживает ответ. */
async function mockGeneration(page: Page, opts: { gate?: Promise<void> } = {}) {
  const requests: Record<string, unknown>[] = [];
  let n = 0;
  await page.route('**/api/quiz/status', (route) =>
    route.fulfill({ json: { ok: true, generationConfigured: true, ttsConfigured: false, models: ['test'] } }),
  );
  await page.route('**/api/generate-questions', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (opts.gate) await opts.gate;
    const questions = Array.from({ length: 10 }, () => {
      n++;
      return {
        format: 'satzvarianten',
        text: 'Выбери грамматически правильный вариант.',
        display: `${String(body.grammarTopic)}: Sein Zug fährt um sechs, Aufgabe ${n}.`,
        options: [
          'Er hat vor, morgen früh aufzustehen.',
          'Er hat vor, morgen früh zu aufstehen.',
          'Er hat vor, morgen früh aufstehen zu.',
          'Er hat vor, morgen früh aufstehen.',
        ],
        correct: 0,
      };
    });
    await route.fulfill({ json: { questions } });
  });
  return requests;
}

async function chooseTopics(page: Page): Promise<void> {
  await expect(page.locator('.screen-quiz')).toBeVisible();
  await page.getByRole('radio', { name: /^B1/ }).click();
  await page.getByRole('radio', { name: 'Wetter' }).click();
  await page.getByRole('button', { name: 'Perfekt', exact: true }).click();
  await page.getByRole('button', { name: 'Dativ', exact: true }).click();
  await page.getByRole('button', { name: 'Готово' }).click();
}

test('выбор тем: «Играть» → темы → уровни → вопросы генератора в раунде', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockGeneration(page);
  await page.goto('/?test');
  await waitPhase(page, 'menu');
  await expect(page.locator('.menu-quiz')).toHaveText('Вопросы: встроенный набор');
  await page.getByRole('button', { name: 'Играть' }).click();
  await chooseTopics(page);
  await waitPhase(page, 'levels');

  await page.locator('.level-card').first().click();
  await waitPhase(page, 'intro', 'play');
  await page.evaluate(() => window.__ice.skipIntro());
  await waitPhase(page, 'play');
  await page.waitForFunction(() => window.__ice.correctIndex() >= 0);
  await expect(page.locator('.qp-instruction')).toHaveText('Выбери грамматически правильный вариант.');
  await expect(page.locator('.qp-prompt')).toHaveText(/^(Perfekt|Dativ): Sein Zug/);
  await expect(page.locator('.qp-sheet')).toHaveAttribute('data-layout', 'column');
  await page.waitForTimeout(200); // защита от двойного тапа (2.7.4)
  // Ошибка в задании генератора: верный вариант виден 1,8 с, а не 1 с — предложение успевают прочитать.
  const shownMs = await page.evaluate(async () => {
    const ice = window.__ice;
    ice.press(((ice.correctIndex() + 1) % 4) + 1);
    const t0 = performance.now();
    while (ice.correctIndex() < 0) await new Promise((r) => setTimeout(r, 20));
    return performance.now() - t0;
  });
  expect(shownMs).toBeGreaterThan(1700);
  await page.waitForTimeout(200);
  const answered = await page.evaluate(() => window.__ice.press(window.__ice.correctIndex() + 1));
  expect(answered).toBe(true);

  const topics = requests.map((r) => r.grammarTopic).sort();
  expect(topics).toEqual(['Dativ', 'Perfekt']);
  expect(requests[0]).toMatchObject({
    level: 'B1',
    lexicalTopic: 'Wetter',
    isWortstellung: false,
    count: 10,
  });

  // Выбор сохраняется: после перезагрузки «Играть» сразу ведёт к уровням.
  await page.reload();
  await waitPhase(page, 'menu');
  await expect(page.locator('.menu-quiz')).toHaveText('Вопросы: B1 · Perfekt, Dativ');
  await page.getByRole('button', { name: 'Играть' }).click();
  await waitPhase(page, 'levels');
  await expect(page.locator('.screen-quiz')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('раунд ждёт первый вопрос генератора, пока всё стоит', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await mockGeneration(page, { gate });
  await page.goto('/?test');
  await waitPhase(page, 'menu');
  await page.getByRole('button', { name: 'Вопросы' }).click();
  await chooseTopics(page);
  await page.getByRole('button', { name: 'Играть' }).click();
  await waitPhase(page, 'levels');
  await page.locator('.level-card').first().click();
  await waitPhase(page, 'intro', 'play');
  await page.evaluate(() => window.__ice.skipIntro());
  await expect(page.locator('.qp-intro')).toHaveText('Готовлю вопросы…');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__ice.phase())).toBe('intro');
  release();
  await waitPhase(page, 'play');
  await expect(page.locator('.qp-intro')).toHaveText('Приготовься…');
  await expect(page.locator('.qp-prompt')).toHaveText(/Sein Zug/);
});

test('без ключа генерации «Играть» ведёт сразу к уровням, а в «Вопросах» видно почему', async ({ page }) => {
  const errors = watchErrors(page);
  await page.route('**/api/quiz/status', (route) =>
    route.fulfill({ json: { ok: true, generationConfigured: false, ttsConfigured: false, models: [] } }),
  );
  await page.goto('/?test');
  await waitPhase(page, 'menu');
  await page.getByRole('button', { name: 'Вопросы' }).click();
  await expect(page.locator('.quiz-status')).toContainText('AITUNNEL_API_KEY');
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-quiz')).toHaveCount(0);
  await page.getByRole('button', { name: 'Играть' }).click();
  await waitPhase(page, 'levels');
  expect(errors).toEqual([]);
});
