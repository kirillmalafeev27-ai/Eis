import { describe, expect, it } from 'vitest';
import { balance } from '../src/config/balance';
import { levels } from '../src/config/levels';
import { aOf, chebyshev, index, isFloe, lOf } from '../src/core/grid';
import { jumpTargets } from '../src/core/jumps';
import { generateLevel } from '../src/core/levelGen';
import { freshJumpRisk } from '../src/core/risk';
import { solveLevel } from '../src/core/solver';

const SEEDS = 1000;

describe('генератор уровня (раздел 5)', () => {
  for (const level of levels) {
    it(`уровень ${level.label}: ${SEEDS} сидов — только проходимые уровни с соблюдением ограничений`, () => {
      let relaxed = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = generateLevel(level, seed, 5000);
        const g = r.grid;
        if (r.relax) relaxed++;
        expect(g.height).toBe(level.rows + 2);
        expect(g.length).toBe(level.length);
        // Мостки — клетка ближнего берега, не крайняя.
        expect(aOf(g, r.bridge)).toBe(0);
        expect(lOf(g, r.bridge)).toBeGreaterThan(0);
        expect(lOf(g, r.bridge)).toBeLessThan(level.length - 1);
        // Полыньи: не больше 3 подряд, в ряду хотя бы 2 льдины.
        for (let a = 1; a <= level.rows; a++) {
          let floes = 0;
          let run = 0;
          for (let l = 0; l < level.length; l++) {
            const water = g.cells[index(g, a, l)] === 'water';
            run = water ? run + 1 : 0;
            expect(run).toBeLessThanOrEqual(balance.gen.maxWaterRun);
            if (!water) floes++;
          }
          expect(floes).toBeGreaterThanOrEqual(balance.gen.minFloesPerRow);
        }
        for (let l = 0; l < level.length; l++) {
          let run = 0;
          for (let a = 1; a <= level.rows; a++) {
            run = g.cells[index(g, a, l)] === 'water' ? run + 1 : 0;
            expect(run).toBeLessThanOrEqual(balance.gen.maxWaterRun);
          }
        }
        // Правило опоры: от любой льдины до толстой не больше 3 прыжков.
        const dist = new Map<number, number>();
        const queue: number[] = [];
        g.cells.forEach((k, c) => {
          if (k === 'thick') {
            dist.set(c, 0);
            queue.push(c);
          }
        });
        for (let qi = 0; qi < queue.length; qi++) {
          const c = queue[qi];
          for (const j of jumpTargets(g, c)) {
            if (!isFloe(g.cells[j.to]) || dist.has(j.to)) continue;
            dist.set(j.to, (dist.get(c) as number) + 1);
            queue.push(j.to);
          }
        }
        g.cells.forEach((k, c) => {
          if (isFloe(k)) expect(dist.get(c) ?? Infinity).toBeLessThanOrEqual(balance.gen.maxJumpsToThick);
        });
        // Рыбы: три, со второго ряда льда, не соседние, хотя бы одна на тонкой.
        expect(r.fish.length).toBe(3);
        for (const f of r.fish) {
          expect(isFloe(g.cells[f])).toBe(true);
          expect(aOf(g, f)).toBeGreaterThanOrEqual(balance.gen.fishMinRow);
        }
        for (let i = 0; i < 3; i++)
          for (let j = i + 1; j < 3; j++)
            expect(chebyshev(g, r.fish[i], r.fish[j])).toBeGreaterThanOrEqual(2);
        expect(r.fish.some((f) => g.cells[f] === 'thin')).toBe(true);
        // Дилемма (если требования не ослаблены).
        if (r.relax === 0)
          expect(r.fishRouteBound - r.shortestCrossing).toBeGreaterThanOrEqual(balance.gen.dilemmaCharges);
        // Решение: простой путь через всех рыб к берегу без красных прыжков.
        const path = r.solution;
        expect(path[0]).toBe(r.bridge);
        expect(g.cells[path[path.length - 1]]).toBe('far');
        expect(new Set(path).size).toBe(path.length);
        for (const f of r.fish) expect(path).toContain(f);
        for (let i = 1; i < path.length; i++) {
          const j = jumpTargets(g, path[i - 1]).find((x) => x.to === path[i]);
          expect(j).toBeTruthy();
          if (!j) continue;
          expect(freshJumpRisk(g.cells[path[i - 1]], j.cost, level, { tMedMs: 5000, p: 0.8 }).level).not.toBe(
            'fail',
          );
        }
      }
      // Ослабление требований — редкое исключение.
      expect(relaxed).toBeLessThanOrEqual(SEEDS * 0.01);
    }, 120000);
  }

  it('генерация детерминирована по сиду', () => {
    const a = generateLevel(levels[4], 4242, 5000);
    const b = generateLevel(levels[4], 4242, 5000);
    expect(a.grid.cells).toEqual(b.grid.cells);
    expect(a.fish).toEqual(b.fish);
    expect(a.bridge).toBe(b.bridge);
  });

  it('решатель находит путь на известной сетке и отказывает, если рыба в тупике', () => {
    const lv = levels[0];
    const ok = generateLevel(lv, 5, 5000);
    expect(solveLevel(ok.grid, ok.bridge, ok.fish, lv, 5000).path).not.toBeNull();
    // Рыба в кармане: войти можно, выйти — только назад.
    const cells = ok.grid.cells.slice();
    const pocket = index(ok.grid, 1, 0);
    cells[pocket] = 'thin';
    cells[index(ok.grid, 2, 0)] = 'water';
    cells[index(ok.grid, 1, 1)] = 'water';
    cells[index(ok.grid, 3, 0)] = 'water';
    cells[index(ok.grid, 1, 2)] = 'water';
    const grid = { ...ok.grid, cells };
    expect(
      solveLevel(
        grid,
        ok.bridge === index(ok.grid, 0, 1) ? index(ok.grid, 0, 2) : ok.bridge,
        [pocket, ...ok.fish.slice(1)],
        lv,
        5000,
      ).path,
    ).toBeNull();
  });
});
