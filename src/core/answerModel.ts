import { balance } from '../config/balance';
import { type Rng, randLogNormal } from './rng';
import type { Pace } from './risk';

/**
 * Модель ответа ученика (2.8, 14.2): время ответа логнормальное с медианой T_med и σ = 0.5,
 * доля верных — p, показ ошибки — 1 с, смена вопроса — 0.3 с.
 */
export interface AnswerModel {
  sigma: number;
  wrongShowMs: number;
  switchMs: number;
}

export const defaultAnswerModel: AnswerModel = {
  sigma: balance.answerModel.sigma,
  wrongShowMs: balance.answerModel.wrongShowMs,
  switchMs: balance.answerModel.switchMs,
};

/** Один ответ: время от появления вопроса до клика и верность. */
export function sampleAnswer(rng: Rng, pace: Pace, model: AnswerModel = defaultAnswerModel) {
  return { timeMs: randLogNormal(rng, pace.tMedMs, model.sigma), correct: rng() < pace.p };
}

/** Время до k-го верного ответа (момент прыжка), начиная с появления вопроса. */
export function timeToCorrect(rng: Rng, k: number, pace: Pace, model: AnswerModel = defaultAnswerModel): number {
  let t = 0;
  let got = 0;
  for (let guard = 0; guard < 1000 && got < k; guard++) {
    const ans = sampleAnswer(rng, pace, model);
    t += ans.timeMs;
    if (ans.correct) {
      got++;
      if (got < k) t += model.switchMs;
    } else {
      t += model.wrongShowMs + model.switchMs;
    }
  }
  return t;
}

/** Monte Carlo: доля падений для прыжка ценой `cost` при отношении нужного к доступному `ratio`. */
export function fallChance(
  rng: Rng,
  ratio: number,
  cost: number,
  pace: Pace,
  runs: number,
  model: AnswerModel = defaultAnswerModel,
): number {
  const available = (cost * pace.tMedMs) / pace.p / ratio;
  let falls = 0;
  for (let i = 0; i < runs; i++) if (timeToCorrect(rng, cost, pace, model) > available) falls++;
  return falls / runs;
}
