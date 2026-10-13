import { balance } from '../config/balance';
import { isBank, isFloe } from './grid';
import { freshFloeMs } from './risk';
import type { GameState } from './state';

/** Состояние льдины для вида (13.3.1). */
export type FloeStatus = 'intact' | 'underHero' | 'wet' | 'sunk' | 'debris' | 'bank';

export function floeStatus(s: GameState, cell: number): FloeStatus {
  const kind = s.grid.cells[cell];
  if (isBank(kind)) return 'bank';
  if (!isFloe(kind)) return 'sunk';
  if (s.hero.cell === cell) return 'underHero';
  if (s.sinkAt[cell] >= 0) return 'wet';
  if (s.debris[cell]) return 'debris';
  return 'intact';
}

/** Полный таймер льдины данного вида для темпа раунда (2.3.1). */
export function floeTimerMs(s: GameState, kind: 'thin' | 'thick'): number {
  return freshFloeMs(kind, s.level, s.pace.tMedMs);
}

/** Момент, когда развалится льдина под героем; Infinity на берегу. */
export function heroFloeEndsAt(s: GameState): number {
  return s.hero.floeStart >= 0 ? s.hero.floeStart + s.hero.floeDuration : Infinity;
}

/** Доля прошедшего таймера льдины под героем, 0…1. */
export function heroFloeProgress(s: GameState): number {
  if (s.hero.floeStart < 0 || s.hero.floeDuration <= 0) return 0;
  return Math.min(1, Math.max(0, (s.time - s.hero.floeStart) / s.hero.floeDuration));
}

/** Сколько ещё продержится клетка под героем: таймер или намокание, что меньше. */
export function heroAvailableMs(s: GameState): number {
  let avail = heroFloeEndsAt(s) - s.time;
  const sink = s.sinkAt[s.hero.cell];
  if (sink >= 0) avail = Math.min(avail, sink - s.time);
  return Math.max(0, avail);
}

/** Моменты стадий трещин 1…4 (25%, 50%, 75%, раскол на 90%) от начала таймера. */
export function crackStageFractions(): number[] {
  return [...balance.rules.crackStages, balance.rules.splitAt];
}

/** Стадия трещин по доле таймера: 0…4. */
export function crackStageAt(progress: number): number {
  const f = crackStageFractions();
  let stage = 0;
  for (let i = 0; i < f.length; i++) if (progress >= f[i]) stage = i + 1;
  return stage;
}

/** Сколько секунд осталось при отсчёте: 3, 2, 1 или 0, если отсчёт ещё не начался. */
export function countdownNumberAt(remainingMs: number): number {
  if (remainingMs > balance.rules.countdownFromMs) return 0;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
