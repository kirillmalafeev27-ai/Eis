import { balance } from '../config/balance';
import type { HintMode } from '../config/levels';
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
}

const SETTINGS = 'settings';
const PROGRESS = 'progress';

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
  };
}

export function loadSettings(s: KeyValueStorage): Settings {
  return readJson(s, SETTINGS, defaultSettings());
}

export function saveSettings(s: KeyValueStorage, v: Settings): void {
  writeJson(s, SETTINGS, v);
}

export function loadProgress(s: KeyValueStorage): Progress {
  const p = readJson<Progress>(s, PROGRESS, { levels: {}, unlocked: 1, tutorial: {} });
  return { levels: p.levels ?? {}, unlocked: Math.max(1, p.unlocked ?? 1), tutorial: p.tutorial ?? {} };
}

export function saveProgress(s: KeyValueStorage, p: Progress): void {
  writeJson(s, PROGRESS, p);
}

/** Рекорд уровня: по звёздам, при равенстве — по времени переправы (2.5.3). */
export function isBetter(prev: LevelProgress | undefined, stars: number, timeMs: number, won: boolean): boolean {
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
