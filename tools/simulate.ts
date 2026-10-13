import { balance } from '../src/config/balance';
import type { LevelConfig } from '../src/config/levels';
import { defaultAnswerModel, sampleAnswer } from '../src/core/answerModel';
import type { GameAction, GameEvent } from '../src/core/events';
import { generateLevel } from '../src/core/levelGen';
import type { Pace } from '../src/core/risk';
import { mixSeed, mulberry32 } from '../src/core/rng';
import { nextScheduledTime, reduce } from '../src/core/rules';
import { type GameState, caughtFish, createState, starsFor } from '../src/core/state';
import { type BotKind, makeBot } from './bots';

/**
 * Прогон раундов ботами на настоящем движке правил, без графики (раздел 14).
 * Время ответа — логнормальное с медианой T_med и σ = 0.5, верность — p.
 */
export interface RoundResult {
  won: boolean;
  fish: number;
  stars: number;
  timeMs: number;
  fallsCrack: number;
  fallsMelt: number;
  cause: 'cold' | 'trapped' | 'timeout' | null;
  longJumps: number;
  jumps: number;
}

const MAX_ROUND_MS = 15 * 60 * 1000;

export function simulateRound(level: LevelConfig, seed: number, pace: Pace, kind: BotKind): RoundResult {
  const gen = generateLevel(level, seed, pace.tMedMs);
  let s: GameState = createState(level, gen, pace, seed);
  const rng = mulberry32(mixSeed(seed, 0xb07));
  const bot = makeBot(kind);
  const model = defaultAnswerModel;

  const dispatch = (a: GameAction): GameEvent[] => {
    const r = reduce(s, a);
    s = r.state;
    return r.events;
  };
  const replan = () => {
    if (s.status !== 'playing') return;
    const target = bot.plan(s);
    if (target === null) return;
    if (target !== s.hero.target) dispatch({ type: 'SET_TARGET', cell: target });
  };

  replan();
  let pending = sampleAnswer(rng, pace, model);
  let answerAt = pending.timeMs;
  while (s.status === 'playing' && s.time < MAX_ROUND_MS) {
    const next = Math.min(answerAt, nextScheduledTime(s));
    const events = dispatch({ type: 'TICK', dt: Math.max(0, next - s.time) });
    if (events.length) replan();
    if (s.status !== 'playing') break;
    if (s.time >= answerAt) {
      const ev = dispatch({ type: 'ANSWER', correct: pending.correct, timeMs: pending.timeMs });
      if (ev.length) replan();
      const gap = pending.correct ? model.switchMs : model.wrongShowMs + model.switchMs;
      pending = sampleAnswer(rng, pace, model);
      answerAt = s.time + gap + pending.timeMs;
    }
  }
  const fish = caughtFish(s);
  const won = s.status === 'won';
  return {
    won,
    fish,
    stars: starsFor(won, fish),
    timeMs: s.time,
    fallsCrack: s.stats.fallsCrack,
    fallsMelt: s.stats.fallsMelt,
    cause: s.status === 'playing' ? 'timeout' : s.cause,
    longJumps: s.stats.longJumps,
    jumps: s.stats.jumps,
  };
}

export interface SimReport {
  level: number;
  bot: BotKind;
  runs: number;
  tMedMs: number;
  p: number;
  winRate: number;
  avgFish: number;
  avgFishInWins: number;
  stars: [number, number, number, number];
  fallsCrack: number;
  fallsMelt: number;
  lossCold: number;
  lossTrapped: number;
  lossTimeout: number;
  longJumps: number;
  avgTimeS: number;
}

export function simulate(level: LevelConfig, kind: BotKind, runs: number, pace: Pace, baseSeed = 1): SimReport {
  const stars: [number, number, number, number] = [0, 0, 0, 0];
  let wins = 0;
  let fish = 0;
  let fishWins = 0;
  let fallsCrack = 0;
  let fallsMelt = 0;
  let cold = 0;
  let trapped = 0;
  let timeout = 0;
  let longJumps = 0;
  let time = 0;
  for (let i = 0; i < runs; i++) {
    const seed = mixSeed(baseSeed, i * 7919 + level.id) >>> 0;
    const r = simulateRound(level, seed, pace, kind);
    stars[r.stars]++;
    fish += r.fish;
    if (r.won) {
      wins++;
      fishWins += r.fish;
    }
    fallsCrack += r.fallsCrack;
    fallsMelt += r.fallsMelt;
    if (r.cause === 'cold') cold++;
    if (r.cause === 'trapped') trapped++;
    if (r.cause === 'timeout') timeout++;
    longJumps += r.longJumps;
    time += r.timeMs;
  }
  return {
    level: level.id,
    bot: kind,
    runs,
    tMedMs: pace.tMedMs,
    p: pace.p,
    winRate: wins / runs,
    avgFish: fish / runs,
    avgFishInWins: wins ? fishWins / wins : 0,
    stars,
    fallsCrack: fallsCrack / runs,
    fallsMelt: fallsMelt / runs,
    lossCold: cold,
    lossTrapped: trapped,
    lossTimeout: timeout,
    longJumps: longJumps / runs,
    avgTimeS: time / runs / 1000,
  };
}

export const defaultPace: Pace = { tMedMs: balance.pace.defaultTmedMs, p: balance.pace.defaultP };
