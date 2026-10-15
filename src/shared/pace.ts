import type { KeyValueStorage } from './storage';

/**
 * Темп ученика (раздел 3): T_med — медиана времени ответа по последним 20 ответам,
 * p — доля верных по последним 30. Хранится под общим для серии ключом `series:pace`;
 * у заданий генератора — свой ключ на каждый уровень (`series:pace:gen:B1`): предложения
 * читаются в разы дольше слов, и общий учёт делал бы игру то непосильной, то пустой.
 *
 * Поправка на разброс. Уровни и пороги риска откалиброваны для логнормального времени ответа
 * с σ = 0.5. Если ответы игрока разбросаны сильнее (задания разной длины), хвост длинных
 * ответов толще, и с тех же льдин он падал бы чаще задуманного. Поэтому правила получают
 * T_эфф = T_med · e^(k·(σ − σ₀)): σ оценивается по тем же ответам (устойчиво к выбросам) и
 * подтягивается к априорной оценке, пока ответов мало.
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
  refSigma: number;
  defaultSigma: number;
  sigmaPriorWeight: number;
  minSigma: number;
  maxSigma: number;
  spreadGain: number;
  /**
   * Запас на трудность вопросов этого вида: 1 — уровни как откалиброваны (банк). Задания
   * генератора нарочно трудные (их не угадать), и верных ответов у того же ученика меньше.
   */
  allowance: number;
}

export interface PaceSnapshot {
  /** Темп для правил — медиана с поправкой на разброс (T_эфф). */
  tMedMs: number;
  p: number;
  /** Медиана ответов как есть, в пределах диапазона. */
  medianMs: number;
  /** Оценка разброса σ. */
  sigma: number;
}

interface Stored {
  times: number[];
  results: boolean[];
}

export const PACE_KEY = 'series:pace';
const MIN_SAMPLES = 5;
/** Отклонения логарифма времени от медианы обрезаются: одна долгая задумчивость не раздувает σ. */
const LOG_CLIP = 1.5;

export class PaceTracker {
  private times: number[] = [];
  private results: boolean[] = [];

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly cfg: PaceConfig,
    private readonly key: string = PACE_KEY,
  ) {
    try {
      const raw = storage.get(key);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        if (Array.isArray(s.times))
          this.times = s.times.filter((x) => Number.isFinite(x) && x > 0).slice(-cfg.timeWindow);
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
    this.storage.set(this.key, JSON.stringify({ times: this.times, results: this.results } satisfies Stored));
  }

  /** Значения фиксируются на старте раунда и внутри него не меняются (3.3). */
  snapshot(): PaceSnapshot {
    const c = this.cfg;
    let median = c.defaultTmedMs;
    let sigma = c.defaultSigma;
    // Пока ответов мало, медиана шумит: до пяти ответов действуют значения по умолчанию.
    if (this.times.length >= MIN_SAMPLES) {
      const v = this.times.slice().sort((a, b) => a - b);
      const m = v.length >> 1;
      median = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
      sigma = shrunkSigma(this.times, median, c);
    }
    let p = c.defaultP;
    if (this.results.length >= MIN_SAMPLES) p = this.results.filter(Boolean).length / this.results.length;
    const medianMs = Math.min(c.maxTmedMs, Math.max(c.minTmedMs, median));
    const s = Math.min(c.maxSigma, Math.max(c.minSigma, sigma));
    return {
      tMedMs: Math.round(medianMs * spreadFactor(s, c) * c.allowance),
      p: Math.min(c.maxP, Math.max(c.minP, p)),
      medianMs,
      sigma: s,
    };
  }
}

/** Множитель T_эфф / T_med при разбросе σ. */
export function spreadFactor(sigma: number, c: Pick<PaceConfig, 'refSigma' | 'spreadGain'>): number {
  return Math.exp(c.spreadGain * (sigma - c.refSigma));
}

/**
 * σ по ответам: среднеквадратичное отклонение логарифма времени от логарифма медианы (с
 * обрезанными выбросами), подтянутое к априорной оценке весом sigmaPriorWeight ответов.
 */
export function shrunkSigma(
  times: readonly number[],
  medianMs: number,
  c: Pick<PaceConfig, 'defaultSigma' | 'sigmaPriorWeight'>,
): number {
  const n = times.length;
  if (n < 2) return c.defaultSigma;
  const lm = Math.log(medianMs);
  let sum = 0;
  for (const t of times) {
    const d = Math.max(-LOG_CLIP, Math.min(LOG_CLIP, Math.log(t) - lm));
    sum += d * d;
  }
  const sample = sum / (n - 1);
  const w = c.sigmaPriorWeight;
  return Math.sqrt((n * sample + w * c.defaultSigma ** 2) / (n + w));
}
