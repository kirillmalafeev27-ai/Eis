import type { KeyValueStorage } from './storage';

/**
 * Темп ученика (раздел 3): T_med — медиана времени ответа по последним 20 ответам,
 * p — доля верных по последним 30. Хранится под общим для серии ключом `series:pace`.
 */
export interface PaceConfig {
  timeWindow: number;
  accuracyWindow: number;
  defaultTmedMs: number;
  minTmedMs: number;
  maxTmedMs: number;
  defaultP: number;
  minP: number;
  maxP: number;
}

export interface PaceSnapshot {
  tMedMs: number;
  p: number;
}

interface Stored {
  times: number[];
  results: boolean[];
}

export const PACE_KEY = 'series:pace';
const MIN_SAMPLES = 5;

export class PaceTracker {
  private times: number[] = [];
  private results: boolean[] = [];

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly cfg: PaceConfig,
  ) {
    try {
      const raw = storage.get(PACE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        if (Array.isArray(s.times)) this.times = s.times.filter((x) => Number.isFinite(x) && x > 0).slice(-cfg.timeWindow);
        if (Array.isArray(s.results)) this.results = s.results.map(Boolean).slice(-cfg.accuracyWindow);
      }
    } catch {
      /* повреждённые данные — начинаем с умолчаний */
    }
  }

  record(timeMs: number, correct: boolean): void {
    this.times.push(timeMs);
    this.results.push(correct);
    this.times = this.times.slice(-this.cfg.timeWindow);
    this.results = this.results.slice(-this.cfg.accuracyWindow);
    this.storage.set(PACE_KEY, JSON.stringify({ times: this.times, results: this.results } satisfies Stored));
  }

  /** Значения фиксируются на старте раунда и внутри него не меняются (3.3). */
  snapshot(): PaceSnapshot {
    const c = this.cfg;
    let tMedMs = c.defaultTmedMs;
    // Пока ответов мало, медиана шумит: до пяти ответов действуют значения по умолчанию.
    if (this.times.length >= MIN_SAMPLES) {
      const v = this.times.slice().sort((a, b) => a - b);
      const m = v.length >> 1;
      tMedMs = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    }
    let p = c.defaultP;
    if (this.results.length >= MIN_SAMPLES) p = this.results.filter(Boolean).length / this.results.length;
    return {
      tMedMs: Math.min(c.maxTmedMs, Math.max(c.minTmedMs, tMedMs)),
      p: Math.min(c.maxP, Math.max(c.minP, p)),
    };
  }
}
