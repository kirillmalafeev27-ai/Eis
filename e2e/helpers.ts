import { type Page, expect } from '@playwright/test';

/** Отладочный доступ игры (src/game/App.ts → debugApi), только с ?test. */
interface IceApi {
  phase(): string;
  panelMode(): string;
  correctIndex(): number;
  press(n: number): boolean;
  toShore(): void;
  skipIntro(): void;
  orientation(): string;
  freezeMelt(): void;
  state(): {
    status: string;
    paused: boolean;
    hero: { cell: number; warmth: number };
    stats: { answers: number; correct: number; jumps: number };
  } | null;
  contrastPoints(): Record<'water' | 'thin' | 'thick' | 'fish', { x: number; y: number }> | null;
  sample(points: { x: number; y: number }[], r: number): Promise<number[]>;
}

declare global {
  interface Window {
    __ice: IceApi;
  }
}

/** Собрать ошибки страницы: игра не должна сыпать ими ни при каком сценарии. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function waitPhase(page: Page, ...phases: string[]): Promise<void> {
  await page.waitForFunction((ps) => !!window.__ice && ps.includes(window.__ice.phase()), phases, {
    timeout: 90_000,
  });
}

/** Открыть раунд уровня сразу, без меню, и пропустить интро. */
export async function startLevel(page: Page, level: number, extra = ''): Promise<void> {
  await page.goto(`/?test&level=${level}${extra}`);
  await waitPhase(page, 'intro', 'play');
  await page.evaluate(() => window.__ice.skipIntro());
  await waitPhase(page, 'play');
}

/** Ответить верно на текущий вопрос, если он открыт. */
export async function answerCorrect(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const ice = window.__ice;
    if (ice.panelMode() !== 'active') return false;
    const i = ice.correctIndex();
    return i >= 0 ? ice.press(i + 1) : false;
  });
}

/** Отвечать верно, пока не выполнится условие или не кончатся попытки. */
export async function answerUntil(page: Page, done: () => Promise<boolean>, steps = 120): Promise<void> {
  for (let i = 0; i < steps; i++) {
    if (await done()) return;
    await answerCorrect(page);
    await page.waitForTimeout(160);
  }
  expect(await done()).toBe(true);
}

export function heroCell(page: Page): Promise<number> {
  return page.evaluate(() => window.__ice.state()?.hero.cell ?? -1);
}
