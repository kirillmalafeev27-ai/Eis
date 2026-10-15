import { balance } from '../config/balance';
import type { LevelConfig } from '../config/levels';
import { type CellKind, isBank } from './grid';

/**
 * Риск прыжка (2.8) — единственная функция на весь проект: её используют следы маршрута,
 * штрафы маршрутизатора, честность таяния и решатель (13.3.6).
 */
export type RiskLevel = 'safe' | 'risky' | 'fail';

/** Темп игрока, зафиксированный на старте раунда (раздел 3). */
export interface Pace {
  /** Темп для правил: медиана ответа с поправкой на разброс (shared/pace.ts). */
  tMedMs: number;
  p: number;
  /** Для отладки: медиана как есть и оценка разброса σ. */
  medianMs?: number;
  sigma?: number;
}

export interface JumpRisk {
  /** Нужное время / доступное время. */
  ratio: number;
  level: RiskLevel;
  neededMs: number;
  availableMs: number;
}

/** Нужное время: заряды следующего прыжка × T_med / p, за вычетом уже набранных зарядов. */
export function neededMs(cost: number, pipsHave: number, pace: Pace): number {
  return (Math.max(0, cost - pipsHave) * pace.tMedMs) / pace.p;
}

export function riskLevelOf(ratio: number): RiskLevel {
  if (ratio < balance.rules.riskBlue) return 'safe';
  if (ratio <= balance.rules.riskRed) return 'risky';
  return 'fail';
}

export function jumpRisk(input: {
  cost: number;
  pipsHave: number;
  availableMs: number;
  pace: Pace;
}): JumpRisk {
  const need = neededMs(input.cost, input.pipsHave, input.pace);
  const avail = input.availableMs;
  let ratio: number;
  if (need <= 0 || avail === Infinity) ratio = 0;
  else if (avail <= 0) ratio = Infinity;
  else ratio = need / avail;
  return { ratio, level: riskLevelOf(ratio), neededMs: need, availableMs: avail };
}

/** Сколько держит только что занятая льдина: ответы × T_med + floeGrace (2.3.1). */
export function freshFloeMs(kind: 'thin' | 'thick', level: LevelConfig, tMedMs: number): number {
  const answers = kind === 'thick' ? level.thickAnswers : level.thinAnswers;
  return answers * tMedMs + balance.rules.floeGraceMs;
}

/** Риск прыжка со свежей льдины данного вида (2.8): для решателя и честности таяния. */
export function freshJumpRisk(takeoff: CellKind, cost: number, level: LevelConfig, pace: Pace): JumpRisk {
  if (isBank(takeoff)) return jumpRisk({ cost, pipsHave: 0, availableMs: Infinity, pace });
  const kind = takeoff === 'thick' ? 'thick' : 'thin';
  return jumpRisk({ cost, pipsHave: 0, availableMs: freshFloeMs(kind, level, pace.tMedMs), pace });
}

export interface Penalties {
  orange: number;
  red: number;
}

export const defaultPenalties: Penalties = {
  orange: balance.rules.penaltyOrange,
  red: balance.rules.penaltyRed,
};

export function riskPenalty(level: RiskLevel, penalties: Penalties = defaultPenalties): number {
  return level === 'safe' ? 0 : level === 'risky' ? penalties.orange : penalties.red;
}
