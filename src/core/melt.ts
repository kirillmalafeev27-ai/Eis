import { balance } from '../config/balance';
import type { LevelConfig } from '../config/levels';
import { type Grid, isFloe, withCells } from './grid';
import { jumpTargets } from './jumps';
import type { Pace } from './risk';
import type { GameState } from './state';

/** Сила ледохода 0…1 — доля прошедшего срока разгона таяния (2.4.2). */
export function meltStrength(timeMs: number, level: LevelConfig, pace: Pace): number {
  void level;
  const start = balance.rules.meltStartAnswers * pace.tMedMs;
  const ramp = balance.rules.meltRampAnswers * pace.tMedMs;
  return Math.min(1, Math.max(0, (timeMs - start) / ramp));
}

/** Интервал между событиями таяния при данной силе ледохода. */
export function meltIntervalMs(strength: number, level: LevelConfig, pace: Pace): number {
  const answers = level.meltIntervalStart + (level.meltIntervalEnd - level.meltIntervalStart) * strength;
  return answers * pace.tMedMs;
}

/** Сколько намокает выбранная льдина (2.4.5). */
export function meltWarnMs(pace: Pace): number {
  return Math.max(balance.rules.meltWarnAnswers * pace.tMedMs, balance.rules.meltWarnMinMs);
}

export interface MeltCandidate {
  cell: number;
  weight: number;
}

/**
 * Кандидаты на таяние (2.4.3): льдины не под героем, вне его досягаемости, ещё не намокшие;
 * льдины с рыбой — только при силе ледохода от 0.5. Тонкие вдвое чаще толстых.
 */
export function meltCandidates(s: GameState, strength: number): MeltCandidate[] {
  const reach = new Set<number>();
  for (const j of jumpTargets(s.grid, s.hero.cell)) reach.add(j.to);
  const fishCells = new Set<number>();
  for (const f of s.fish) if (f.status === 'waiting') fishCells.add(f.cell);
  const out: MeltCandidate[] = [];
  const cells = s.grid.cells;
  for (let c = 0; c < cells.length; c++) {
    const kind = cells[c];
    if (!isFloe(kind)) continue;
    if (c === s.hero.cell || reach.has(c) || s.sinkAt[c] >= 0) continue;
    if (fishCells.has(c) && strength < balance.rules.fishMeltStrength) continue;
    out.push({
      cell: c,
      weight: kind === 'thin' ? balance.rules.meltWeightThin : balance.rules.meltWeightThick,
    });
  }
  return out;
}

/** Сетка, в которой намокающие льдины уже утонули (для проверки честности). */
export function gridWithWetSunk(s: GameState): Grid {
  const changes: [number, 'water'][] = [];
  for (let c = 0; c < s.sinkAt.length; c++)
    if (s.sinkAt[c] >= 0 && c !== s.hero.cell) changes.push([c, 'water']);
  return changes.length ? withCells(s.grid, changes) : s.grid;
}
