import { balance } from '../config/balance';
import type { LevelConfig } from '../config/levels';
import type { Grid } from './grid';
import type { RouteStep } from './routes';
import type { Pace } from './risk';
import { mixSeed } from './rng';

export type FishStatus = 'waiting' | 'caught' | 'lost';

export interface FishState {
  cell: number;
  status: FishStatus;
}

export interface HeroState {
  cell: number;
  pips: number;
  target: number | null;
  warmth: number;
  falls: number;
  /** Когда запущен таймер льдины под героем; null — герой на берегу. */
  floeStart: number | null;
  floeDuration: number;
  /** Сколько стадий трещин уже наступило: 0…4 (4 — раскол на 90%). */
  crackStage: number;
  /** Последнее показанное число отсчёта (3, 2, 1); 0 — отсчёта ещё не было. */
  countdown: number;
}

export interface MeltState {
  startAt: number;
  nextAt: number;
  events: number;
  skipped: number;
}

export interface Stats {
  answers: number;
  correct: number;
  wrong: number;
  times: number[];
  jumps: number;
  longJumps: number;
  fallsCrack: number;
  fallsMelt: number;
  fishLost: number;
}

export type Status = 'playing' | 'won' | 'lost';
export type LoseCause = 'cold' | 'trapped';

export interface GameState {
  level: LevelConfig;
  seed: number;
  pace: Pace;
  grid: Grid;
  bridge: number;
  /** Обломок на месте падения — тонкая льдина особого вида. */
  debris: boolean[];
  /** Начало намокания или −1. */
  wetStart: number[];
  /** Момент, когда намокающая льдина утонет, или −1. */
  sinkAt: number[];
  fish: FishState[];
  hero: HeroState;
  /** Маршрут к цели — прыжки от героя. */
  route: RouteStep[] | null;
  /** Время раунда в мс без пауз и интро. */
  time: number;
  paused: boolean;
  status: Status;
  cause: LoseCause | null;
  endTime: number | null;
  /** Состояние генератора mulberry32 для таяния. */
  rng: number;
  melt: MeltState;
  stats: Stats;
}

export interface GeneratedLevel {
  grid: Grid;
  bridge: number;
  fish: number[];
}

export interface StateOptions {
  /** Деления тепла на старте: больше трёх — «тёплый шарф» после неудач (balance.assist). */
  warmth?: number;
}

export function createState(
  level: LevelConfig,
  gen: GeneratedLevel,
  pace: Pace,
  seed: number,
  opts: StateOptions = {},
): GameState {
  const n = gen.grid.cells.length;
  const meltStart = balance.rules.meltStartAnswers * pace.tMedMs;
  return {
    level,
    seed,
    pace: { ...pace },
    grid: gen.grid,
    bridge: gen.bridge,
    debris: new Array(n).fill(false),
    wetStart: new Array(n).fill(-1),
    sinkAt: new Array(n).fill(-1),
    fish: gen.fish.map((cell) => ({ cell, status: 'waiting' as FishStatus })),
    hero: {
      cell: gen.bridge,
      pips: 0,
      target: null,
      warmth: opts.warmth ?? balance.rules.warmth,
      falls: 0,
      floeStart: null,
      floeDuration: 0,
      crackStage: 0,
      countdown: 0,
    },
    route: null,
    time: 0,
    paused: false,
    status: 'playing',
    cause: null,
    endTime: null,
    rng: mixSeed(seed, 0x5eed),
    melt: { startAt: meltStart, nextAt: meltStart, events: 0, skipped: 0 },
    stats: {
      answers: 0,
      correct: 0,
      wrong: 0,
      times: [],
      jumps: 0,
      longJumps: 0,
      fallsCrack: 0,
      fallsMelt: 0,
      fishLost: 0,
    },
  };
}

/** Рабочая копия состояния для редуктора: снаружи reduce остаётся чистой функцией. */
export function draftState(s: GameState): GameState {
  return {
    ...s,
    grid: { ...s.grid, cells: s.grid.cells.slice() },
    debris: s.debris.slice(),
    wetStart: s.wetStart.slice(),
    sinkAt: s.sinkAt.slice(),
    fish: s.fish.map((f) => ({ ...f })),
    hero: { ...s.hero },
    route: s.route ? s.route.slice() : null,
    melt: { ...s.melt },
    stats: { ...s.stats },
  };
}

export function caughtFish(s: GameState): number {
  let n = 0;
  for (const f of s.fish) if (f.status === 'caught') n++;
  return n;
}

export function starsFor(won: boolean, fish: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  return fish >= 3 ? 3 : fish >= 2 ? 2 : 1;
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const v = values.slice().sort((x, y) => x - y);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
