import { levels } from '../src/config/levels';
import type { LevelConfig } from '../src/config/levels';
import type { GameAction, GameEvent } from '../src/core/events';
import { type CellKind, type Grid, index } from '../src/core/grid';
import { reduce } from '../src/core/rules';
import { type GameState, createState } from '../src/core/state';

export const L1: LevelConfig = levels[0];
export const PACE = { tMedMs: 5000, p: 0.8 };

/**
 * Сетка из рисунка: строки сверху вниз — от дальнего берега к ближнему.
 * '#' дальний берег, '=' ближний, '.' тонкая, 'O' толстая, '~' вода.
 */
export function gridFrom(rows: string[]): Grid {
  const lines = rows.map((r) => r.replace(/\s+/g, ''));
  const height = lines.length;
  const length = lines[0].length;
  const cells: CellKind[] = new Array(height * length);
  lines.forEach((line, i) => {
    const a = height - 1 - i;
    for (let l = 0; l < length; l++) {
      const ch = line[l];
      cells[a * length + l] =
        ch === '#' ? 'far' : ch === '=' ? 'near' : ch === '.' ? 'thin' : ch === 'O' ? 'thick' : 'water';
    }
  });
  return { rows: height - 2, length, height, cells };
}

export function at(g: Grid, a: number, l: number): number {
  return index(g, a, l);
}

export function stateFrom(
  rows: string[],
  opts: { bridge?: [number, number]; fish?: [number, number][]; level?: LevelConfig; pace?: typeof PACE; seed?: number } = {},
): GameState {
  const grid = gridFrom(rows);
  const bridge = opts.bridge ? at(grid, ...opts.bridge) : at(grid, 0, 1);
  const fish = (opts.fish ?? []).map(([a, l]) => at(grid, a, l));
  return createState(opts.level ?? L1, { grid, bridge, fish }, opts.pace ?? PACE, opts.seed ?? 1);
}

export class Runner {
  events: GameEvent[] = [];
  constructor(public s: GameState) {}
  do(a: GameAction): GameEvent[] {
    const r = reduce(this.s, a);
    this.s = r.state;
    this.events.push(...r.events);
    return r.events;
  }
  tick(ms: number, step = 50): GameEvent[] {
    const out: GameEvent[] = [];
    let left = ms;
    while (left > 1e-9) {
      const dt = Math.min(step, left);
      out.push(...this.do({ type: 'TICK', dt }));
      left -= dt;
    }
    return out;
  }
  correct(n = 1): GameEvent[] {
    const out: GameEvent[] = [];
    for (let i = 0; i < n; i++) out.push(...this.do({ type: 'ANSWER', correct: true, timeMs: 4000 }));
    return out;
  }
  wrong(): GameEvent[] {
    return this.do({ type: 'ANSWER', correct: false, timeMs: 4000 });
  }
  target(a: number, l: number): GameEvent[] {
    return this.do({ type: 'SET_TARGET', cell: at(this.s.grid, a, l) });
  }
  /** Заморозить таяние, чтобы проверять другие правила без помех. */
  noMelt(): this {
    this.s = { ...this.s, melt: { ...this.s.melt, nextAt: Infinity } };
    return this;
  }
}

export function types(evs: GameEvent[]): string[] {
  return evs.map((e) => e.type);
}
