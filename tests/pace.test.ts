import { describe, expect, it } from 'vitest';
import { balance } from '../src/config/balance';
import { levels } from '../src/config/levels';
import { timeToCorrect } from '../src/core/answerModel';
import { freshFloeMs } from '../src/core/risk';
import { mulberry32, randLogNormal } from '../src/core/rng';
import { createState } from '../src/core/state';
import { generateLevel } from '../src/core/levelGen';
import { assistWarmth, loadProgress, recordStreak } from '../src/game/persist';
import { PACE_KEY, type PaceConfig, PaceTracker, shrunkSigma, spreadFactor } from '../src/shared/pace';
import { memoryStorage } from '../src/shared/storage';
import { paceConfigFor, simulate } from '../tools/simulate';

const BANK: PaceConfig = balance.pace;
const GEN_B1: PaceConfig = paceConfigFor('gen', 'B1');

function tracker(cfg: PaceConfig, times: number[], correct = 0.8, key = PACE_KEY) {
  const t = new PaceTracker(memoryStorage(), cfg, key);
  times.forEach((ms, i) => t.record(ms, i / times.length < correct));
  return t;
}

function lognormal(n: number, median: number, sigma: number, seed = 1): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => randLogNormal(rng, median, sigma));
}

describe('учёт темпа (раздел 3)', () => {
  it('без ответов — значения по умолчанию; у банка поправки нет: 5 с', () => {
    const s = new PaceTracker(memoryStorage(), BANK).snapshot();
    expect(s.tMedMs).toBe(5000);
    expect(s.p).toBe(0.8);
    expect(s.sigma).toBe(0.5);
  });

  it('задания генератора: своё значение по умолчанию на уровень, с поправкой на разброс и запасом', () => {
    const s = new PaceTracker(memoryStorage(), GEN_B1).snapshot();
    expect(s.medianMs).toBe(14_000);
    expect(s.p).toBe(0.7);
    const expected = 14_000 * spreadFactor(0.65, GEN_B1) * GEN_B1.allowance;
    expect(s.tMedMs).toBe(Math.round(expected));
    expect(paceConfigFor('gen', 'A1').defaultTmedMs).toBeLessThan(paceConfigFor('gen', 'C1').defaultTmedMs);
  });

  it('потолок медианы: 10 с у банка, 30 с у заданий генератора', () => {
    const slow = Array.from({ length: 20 }, () => 40_000);
    expect(tracker(BANK, slow).snapshot().medianMs).toBe(10_000);
    expect(tracker(GEN_B1, slow).snapshot().medianMs).toBe(30_000);
  });

  it('банк и генератор хранятся отдельно и не смешиваются', () => {
    const storage = memoryStorage();
    const bank = new PaceTracker(storage, BANK);
    const gen = new PaceTracker(storage, GEN_B1, `${PACE_KEY}:gen:B1`);
    for (let i = 0; i < 10; i++) {
      bank.record(2500, true);
      gen.record(15_000, true);
    }
    expect(new PaceTracker(storage, BANK).snapshot().medianMs).toBe(3000);
    expect(new PaceTracker(storage, GEN_B1, `${PACE_KEY}:gen:B1`).snapshot().medianMs).toBe(15_000);
  });

  it('разброс оценивается по ответам: σ 0.5 — поправки почти нет, σ 0.8 — льдины дольше', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const calm = tracker(BANK, lognormal(20, 5000, 0.5, seed)).snapshot();
      expect(calm.sigma).toBeGreaterThan(0.38);
      expect(calm.sigma).toBeLessThan(0.62);
      const wide = tracker(BANK, lognormal(20, 5000, 0.8, seed)).snapshot();
      expect(wide.sigma).toBeGreaterThan(0.6);
      expect(wide.tMedMs / wide.medianMs).toBeGreaterThan(1.15);
    }
  });

  it('одна долгая задумчивость не раздувает разброс и не сдвигает медиану', () => {
    const times = [...lognormal(19, 5000, 0.5, 3), 120_000];
    const s = tracker(BANK, times).snapshot();
    expect(s.sigma).toBeLessThan(0.65);
    expect(s.medianMs).toBeLessThan(6500);
    expect(shrunkSigma([5000], 5000, BANK)).toBe(BANK.defaultSigma);
  });
});

describe('поправка на разброс держит задуманный шанс упасть (4.2)', () => {
  /** Доля падений со свежей льдины: время до верного ответа > ответы × T + 1 с. */
  function fall(answers: number, tRule: number, tTrue: number, sigma: number, seed: number) {
    const rng = mulberry32(seed);
    const model = { sigma, wrongShowMs: 1000, switchMs: 300 };
    const avail = answers * tRule + balance.rules.floeGraceMs;
    let f = 0;
    const runs = 20_000;
    for (let i = 0; i < runs; i++) if (timeToCorrect(rng, 1, { tMedMs: tTrue, p: 0.8 }, model) > avail) f++;
    return f / runs;
  }

  it('тонкая и толстая льдина уровней 1, 4 и ∞ при σ от 0.4 до 0.8', () => {
    const T = 12_000;
    for (const level of [levels[0], levels[3], levels[6]]) {
      for (const answers of [level.thinAnswers, level.thickAnswers]) {
        const design = fall(answers, T, T, 0.5, 11);
        for (const sigma of [0.4, 0.6, 0.7, 0.8]) {
          const corrected = fall(answers, T * spreadFactor(sigma, BANK), T, sigma, 11);
          const raw = fall(answers, T, T, sigma, 11);
          // С поправкой шанс близок к задуманному, без неё при σ > 0.5 он заметно выше.
          expect(Math.abs(corrected - design)).toBeLessThan(Math.max(0.025, design * 0.35));
          if (sigma >= 0.7) expect(raw).toBeGreaterThan(corrected);
        }
      }
    }
  });
});

describe('«тёплый шарф» — помощь после неудач', () => {
  it('+1 тепло после двух поражений подряд, +2 после четырёх; можно выключить', () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => assistWarmth(n))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(assistWarmth(5, false)).toBe(0);
  });

  it('серия считается по уровню и обнуляется победой; старое сохранение без серии читается', () => {
    const storage = memoryStorage();
    storage.set('progress', JSON.stringify({ levels: {}, unlocked: 3, tutorial: {} }));
    const p = loadProgress(storage);
    expect(p.streak).toEqual({});
    recordStreak(p, '2', false);
    recordStreak(p, '2', false);
    recordStreak(p, '3', false);
    expect(p.streak).toEqual({ '2': 2, '3': 1 });
    recordStreak(p, '2', true);
    expect(p.streak['2']).toBe(0);
  });

  it('раунд стартует с лишним делением тепла', () => {
    const level = levels[0];
    const gen = generateLevel(level, 5, 5000);
    expect(createState(level, gen, { tMedMs: 5000, p: 0.8 }, 5).hero.warmth).toBe(3);
    expect(createState(level, gen, { tMedMs: 5000, p: 0.8 }, 5, { warmth: 4 }).hero.warmth).toBe(4);
    expect(freshFloeMs('thin', level, 5000)).toBe(level.thinAnswers * 5000 + 1000);
  });
});

describe('баланс с заданиями генератора (симуляция, раздел 14)', () => {
  // Типичный ученик на заданиях Morskoy: медиана 12 с, разброс 0.65, 70% верных.
  const player = { tMedMs: 12_000, p: 0.7, sigma: 0.65 };
  const opts = { paceConfig: GEN_B1, wrongShowMs: balance.questions.wrongFeedbackGeneratedMs };

  it('первый раунд с ними проходим: уровень 1, значения темпа по умолчанию', () => {
    const r = simulate(levels[0], 'balanced', 120, player, 3, { ...opts, history: 0 });
    expect(r.winRate).toBeGreaterThanOrEqual(0.95);
  });

  it('после адаптации уровень 1 почти всегда проходим, а 4-й — с риском, но проходим', () => {
    expect(simulate(levels[0], 'cautious', 120, player, 5, opts).winRate).toBeGreaterThanOrEqual(0.93);
    const l4 = simulate(levels[3], 'balanced', 150, player, 7, opts).winRate;
    expect(l4).toBeGreaterThan(0.72);
    expect(l4).toBeLessThan(0.97);
  });
});
