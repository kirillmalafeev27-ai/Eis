import { balance } from '../config/balance';
import type { HintMode } from '../config/levels';
import { type QuizConfig, sanitizeQuizConfig } from '../shared/questions/topics';
import { type KeyValueStorage, readJson, writeJson } from '../shared/storage';

/** Настройки игрока (11.5.6), сохраняются между сессиями. */
export interface Settings {
  sfx: number;
  ambient: number;
  muted: boolean;
  /** null — как в системе (prefers-reduced-motion). */
  reducedMotion: boolean | null;
  quality: 'high' | 'low';
  /** Качество снижено автоматически по низкому FPS (13.6.4). */
  qualityAuto: boolean;
  /** Потолок подсказок игрока; уровень может разрешать меньше. */
  hints: HintMode;
  sfxLang: 'de' | 'ru';
  /** «Тёплый шарф»: после неудач подряд на уровне — лишнее деление тепла (balance.assist). */
  assist: boolean;
}

export interface LevelProgress {
  stars: number;
  bestTimeMs: number | null;
  won: boolean;
}

export interface Progress {
  levels: Record<string, LevelProgress>;
  /** Наибольший открытый уровень. */
  unlocked: number;
  tutorial: Record<string, boolean>;
  /** Поражений подряд на уровне — для «тёплого шарфа»; победа обнуляет. */
  streak: Record<string, number>;
}

const SETTINGS = 'settings';
const PROGRESS = 'progress';
const QUIZ = 'quiz';

/**
 * Выбор тем вопросов. chosen — игрок уже решал (темы или встроенный набор): тогда «Играть»
 * больше не открывает выбор тем сам.
 */
export interface QuizChoice {
  chosen: boolean;
  config: QuizConfig | null;
}

export function defaultSettings(): Settings {
  return {
    sfx: balance.audio.sfxDefault,
    ambient: balance.audio.ambientDefault,
    muted: false,
    reducedMotion: null,
    quality: 'high',
    qualityAuto: false,
    hints: 'risk',
    sfxLang: 'de',
    assist: true,
  };
}

export function loadSettings(s: KeyValueStorage): Settings {
  return readJson(s, SETTINGS, defaultSettings());
}

export function saveSettings(s: KeyValueStorage, v: Settings): void {
  writeJson(s, SETTINGS, v);
}

export function loadProgress(s: KeyValueStorage): Progress {
  const p = readJson<Progress>(s, PROGRESS, { levels: {}, unlocked: 1, tutorial: {}, streak: {} });
  return {
    levels: p.levels ?? {},
    unlocked: Math.max(1, p.unlocked ?? 1),
    tutorial: p.tutorial ?? {},
    streak: p.streak ?? {},
  };
}

/** Итог раунда для серии поражений: победа обнуляет, поражение добавляет одно. */
export function recordStreak(p: Progress, levelKey: string, won: boolean): void {
  p.streak[levelKey] = won ? 0 : (p.streak[levelKey] ?? 0) + 1;
}

/** Сколько лишних делений тепла даёт «тёплый шарф» при такой серии поражений. */
export function assistWarmth(lossStreak: number, enabled = true): number {
  if (!enabled) return 0;
  const a = balance.assist;
  if (lossStreak >= a.secondScarfAfterLosses) return 2;
  if (lossStreak >= a.scarfAfterLosses) return 1;
  return 0;
}

export function saveProgress(s: KeyValueStorage, p: Progress): void {
  writeJson(s, PROGRESS, p);
}

/** Рекорд уровня: по звёздам, при равенстве — по времени переправы (2.5.3). */
export function isBetter(
  prev: LevelProgress | undefined,
  stars: number,
  timeMs: number,
  won: boolean,
): boolean {
  if (!won) return false;
  if (!prev || !prev.won) return true;
  if (stars !== prev.stars) return stars > prev.stars;
  return prev.bestTimeMs === null || timeMs < prev.bestTimeMs;
}

const ORDER: HintMode[] = ['none', 'route', 'risk'];

/** Подсказки в пределах того, что разрешает уровень (11.5.6). */
export function effectiveHints(level: HintMode, user: HintMode): HintMode {
  return ORDER[Math.min(ORDER.indexOf(level), ORDER.indexOf(user))];
}

export function loadQuiz(s: KeyValueStorage): QuizChoice {
  const raw = readJson<{ chosen?: unknown; config?: unknown }>(s, QUIZ, {});
  return { chosen: raw.chosen === true, config: sanitizeQuizConfig(raw.config) };
}

export function saveQuiz(s: KeyValueStorage, config: QuizConfig | null): void {
  writeJson(s, QUIZ, { chosen: true, config } satisfies QuizChoice);
}
