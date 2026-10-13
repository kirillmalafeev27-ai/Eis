/**
 * Уровни «Льдин» (раздел 4). Числа стартовые; подстройка — по итогам симуляции (раздел 14),
 * причины изменений записываются в DECISIONS.md.
 */
export type HintMode = 'risk' | 'route' | 'none';

export interface LevelConfig {
  /** Номер уровня, 1…7; седьмой — «∞». */
  id: number;
  /** Подпись в выборе уровня. */
  label: string;
  /** Рядов льда R; сетка — (R + 2) × L. */
  rows: number;
  /** Клеток вдоль течения L. */
  length: number;
  /** Доля полыней среди клеток льда. */
  waterShare: number;
  /** Доля толстых льдин среди льдин. */
  thickShare: number;
  /** Тонкая льдина держит thinAnswers × T_med (+ floeGrace). */
  thinAnswers: number;
  /** Толстая льдина держит thickAnswers × T_med (+ floeGrace). */
  thickAnswers: number;
  /** Интервал таяния в начале ледохода, × T_med. */
  meltIntervalStart: number;
  /** Интервал таяния в конце разгона, × T_med. */
  meltIntervalEnd: number;
  /** Какие подсказки маршрута разрешены уровнем. */
  hints: HintMode;
}

export const levels: readonly LevelConfig[] = [
  { id: 1, label: '1', rows: 5, length: 7, waterShare: 0.15, thickShare: 0.4, thinAnswers: 3.6, thickAnswers: 5.8, meltIntervalStart: 2.4, meltIntervalEnd: 1.2, hints: 'risk' },
  { id: 2, label: '2', rows: 5, length: 7, waterShare: 0.2, thickShare: 0.35, thinAnswers: 3.3, thickAnswers: 5.4, meltIntervalStart: 2.2, meltIntervalEnd: 1.0, hints: 'risk' },
  { id: 3, label: '3', rows: 6, length: 7, waterShare: 0.2, thickShare: 0.3, thinAnswers: 3.0, thickAnswers: 5.0, meltIntervalStart: 2.0, meltIntervalEnd: 0.9, hints: 'risk' },
  { id: 4, label: '4', rows: 6, length: 9, waterShare: 0.25, thickShare: 0.28, thinAnswers: 2.8, thickAnswers: 4.8, meltIntervalStart: 2.0, meltIntervalEnd: 0.8, hints: 'risk' },
  { id: 5, label: '5', rows: 7, length: 9, waterShare: 0.25, thickShare: 0.25, thinAnswers: 2.6, thickAnswers: 4.6, meltIntervalStart: 1.8, meltIntervalEnd: 0.8, hints: 'route' },
  { id: 6, label: '6', rows: 7, length: 9, waterShare: 0.3, thickShare: 0.22, thinAnswers: 2.4, thickAnswers: 4.4, meltIntervalStart: 1.6, meltIntervalEnd: 0.7, hints: 'route' },
  { id: 7, label: '∞', rows: 7, length: 9, waterShare: 0.3, thickShare: 0.2, thinAnswers: 2.2, thickAnswers: 4.2, meltIntervalStart: 1.6, meltIntervalEnd: 0.6, hints: 'none' },
];

export function levelById(id: number): LevelConfig {
  const clamped = Math.max(1, Math.min(levels.length, Math.round(id)));
  return levels[clamped - 1];
}
