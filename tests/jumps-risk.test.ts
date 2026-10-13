import { describe, expect, it } from 'vitest';
import { levels } from '../src/config/levels';
import { fallChance } from '../src/core/answerModel';
import { findJump, jumpTargets } from '../src/core/jumps';
import { freshFloeMs, freshJumpRisk, jumpRisk, riskLevelOf } from '../src/core/risk';
import { mulberry32 } from '../src/core/rng';
import { PACE, at, gridFrom } from './helpers';

const G = gridFrom([
  '# # # #', // a=4
  '. O . .', // a=3
  '. ~ . ~', // a=2
  '. . O .', // a=1
  '= = = =', // a=0
]);

describe('jumpTargets (2.2)', () => {
  it('обычный прыжок — на соседнюю клетку по 4 сторонам за 1 заряд, по берегу тоже', () => {
    const t = jumpTargets(G, at(G, 0, 1));
    expect(t.map((j) => j.to).sort((a, b) => a - b)).toEqual([at(G, 0, 0), at(G, 0, 2), at(G, 1, 1)].sort((a, b) => a - b));
    expect(t.every((j) => j.cost === 1 && !j.long)).toBe(true);
  });

  it('длинный прыжок — по прямой через ровно одну клетку воды за 2 заряда', () => {
    const j = findJump(G, at(G, 1, 1), at(G, 3, 1));
    expect(j).toMatchObject({ long: true, cost: 2 });
  });

  it('через льдину длинным прыжком не прыгают', () => {
    expect(findJump(G, at(G, 1, 0), at(G, 1, 2))).toBeNull();
    expect(findJump(G, at(G, 1, 0), at(G, 3, 0))).toBeNull();
  });

  it('длинный прыжок на берег и с берега возможен, в воду — нет', () => {
    expect(findJump(G, at(G, 1, 3), at(G, 3, 3))).toMatchObject({ long: true, cost: 2 });
    expect(jumpTargets(G, at(G, 1, 3)).some((j) => j.to === at(G, 2, 3))).toBe(false);
  });
});

describe('jumpRisk (2.8)', () => {
  it('пороги: меньше 0.35 — синий, до 0.65 — оранжевый, больше — красный', () => {
    expect(riskLevelOf(0.34)).toBe('safe');
    expect(riskLevelOf(0.35)).toBe('risky');
    expect(riskLevelOf(0.65)).toBe('risky');
    expect(riskLevelOf(0.66)).toBe('fail');
  });

  it('нужное время — заряды × T_med / p за вычетом набранных; берег бесконечен', () => {
    const r = jumpRisk({ cost: 2, pipsHave: 1, availableMs: 12500, pace: PACE });
    expect(r.neededMs).toBeCloseTo(6250);
    expect(r.ratio).toBeCloseTo(0.5);
    expect(jumpRisk({ cost: 2, pipsHave: 0, availableMs: Infinity, pace: PACE }).level).toBe('safe');
    expect(jumpRisk({ cost: 1, pipsHave: 1, availableMs: 10, pace: PACE }).level).toBe('safe');
  });

  it('свежая льдина: таймер = ответы × T_med + 1 с (2.3.1)', () => {
    expect(freshFloeMs('thin', levels[0], 5000)).toBe(3.6 * 5000 + 1000);
    expect(freshFloeMs('thick', levels[0], 5000)).toBe(5.8 * 5000 + 1000);
  });

  it('намерение дизайна (4.2): с тонкой длинный прыжок почти всегда красный, с толстой обычный — синий', () => {
    for (const lv of levels) {
      expect(freshJumpRisk('thin', 2, lv, PACE).level).toBe('fail');
      expect(freshJumpRisk('thick', 1, lv, PACE).level).toBe('safe');
      expect(freshJumpRisk('thick', 2, lv, PACE).level).not.toBe('fail');
      expect(freshJumpRisk('near', 2, lv, PACE).level).toBe('safe');
    }
    expect(freshJumpRisk('thin', 1, levels[0], PACE).level).toBe('safe');
    expect(freshJumpRisk('thin', 1, levels[6], PACE).level).toBe('risky');
  });
});

describe('калибровка порогов моделью ответа (2.8, этап 1)', () => {
  const rng = mulberry32(2024);
  const runs = 12000;

  it('эталонный ученик (p = 0.8, T_med = 5 с): граница синего ≈ 5% падений, красного ≈ 25%', () => {
    const blue = fallChance(rng, 0.35, 1, PACE, runs);
    const red = fallChance(rng, 0.65, 1, PACE, runs);
    expect(blue).toBeGreaterThan(0.035);
    expect(blue).toBeLessThan(0.065);
    expect(red).toBeGreaterThan(0.2);
    expect(red).toBeLessThan(0.28);
  });

  it('для точности 65–90%, T_med 3–8 с, обычных и длинных прыжков: синий меньше 5–6%, красный больше 25%', () => {
    for (const p of [0.65, 0.8, 0.9]) {
      for (const tMedMs of [3000, 5000, 8000]) {
        for (const cost of [1, 2]) {
          const pace = { tMedMs, p };
          expect(fallChance(rng, 0.3, cost, pace, 6000)).toBeLessThan(0.065);
          expect(fallChance(rng, 0.75, cost, pace, 6000)).toBeGreaterThan(0.25);
        }
      }
    }
  });
});
