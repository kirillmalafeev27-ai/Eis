import { type Grid, farBankCells, isFloe, withCells } from '../src/core/grid';
import { type Route, type RouteEnv, findRoute, hasRouteToFarBank } from '../src/core/routes';
import { type Penalties, defaultPenalties } from '../src/core/risk';
import { routeEnv } from '../src/core/rules';
import type { GameState } from '../src/core/state';

/**
 * Боты симуляции (14.3). Все пересчитывают план после каждого события.
 * Осторожный и жадный ведут героя по своему пути шаг за шагом (цель — следующая клетка),
 * сбалансированный ставит цель и доверяет маршрутизатору игры (2.2.4).
 */
export type BotKind = 'cautious' | 'balanced' | 'greedy';

export interface Bot {
  kind: BotKind;
  /** Клетка-цель для SET_TARGET или null — цели нет. */
  plan(s: GameState): number | null;
}

const CAUTIOUS: Penalties = { orange: defaultPenalties.orange * 3, red: 1000 };
const GREEDY: Penalties = { orange: 0, red: 0 };

function env(s: GameState, penalties: Penalties): RouteEnv {
  return { ...routeEnv(s), penalties };
}

/** Намокшие льдины к тому времени утонут — на обратном пути на них не рассчитываем. */
function sinkWet(s: GameState, grid: Grid): Grid {
  const changes: [number, 'water'][] = [];
  for (let c = 0; c < s.sinkAt.length; c++)
    if (s.sinkAt[c] >= 0 && c !== s.hero.cell && isFloe(grid.cells[c])) changes.push([c, 'water']);
  return changes.length ? withCells(grid, changes) : grid;
}

/** Сетка после прохода маршрута: покинутые льдины утонули, намокшие — тоже. */
function gridAfter(s: GameState, route: Route): Grid {
  const changes: [number, 'water'][] = [];
  const cells = [s.hero.cell, ...route.steps.slice(0, -1).map((st) => st.to)];
  for (const c of cells) if (isFloe(s.grid.cells[c])) changes.push([c, 'water']);
  return sinkWet(s, withCells(s.grid, changes));
}

function waitingFish(s: GameState): number[] {
  return s.fish.filter((f) => f.status === 'waiting').map((f) => f.cell);
}

function routeToBank(s: GameState, penalties: Penalties): Route | null {
  return findRoute(env(s, penalties), farBankCells(s.grid));
}

/** Крюк за рыбой: маршрут к рыбе, после которого остаётся путь к берегу. */
function fishDetour(s: GameState, penalties: Penalties, accept: (r: Route) => boolean): Route | null {
  let best: Route | null = null;
  for (const f of waitingFish(s)) {
    const r = findRoute(env(s, penalties), f);
    if (!r || !accept(r)) continue;
    if (!hasRouteToFarBank(gridAfter(s, r), f)) continue;
    if (!best || r.cost < best.cost) best = r;
  }
  return best;
}

export function makeBot(kind: BotKind): Bot {
  if (kind === 'balanced') {
    return {
      kind,
      plan(s) {
        const detour = fishDetour(s, defaultPenalties, (r) =>
          r.steps.every((st) => st.risk.level !== 'fail'),
        );
        if (detour) return detour.target;
        const bank = routeToBank(s, defaultPenalties);
        return bank ? bank.target : null;
      },
    };
  }
  if (kind === 'cautious') {
    return {
      kind,
      plan(s) {
        const detour = fishDetour(s, CAUTIOUS, (r) => r.steps.every((st) => st.risk.level === 'safe'));
        const r = detour ?? routeToBank(s, CAUTIOUS);
        return r && r.steps.length ? r.steps[0].to : null;
      },
    };
  }
  return {
    kind,
    plan(s) {
      // Жадный: кратчайший по зарядам путь через всех доступных рыб, риск не важен.
      const fish = waitingFish(s);
      let bestFirst: number | null = null;
      let bestCost = Infinity;
      for (const order of permutations(fish)) {
        let cost = 0;
        let first: number | null = null;
        let grid = s.grid;
        let from = s.hero.cell;
        let ok = true;
        for (const goal of [...order, -1]) {
          const startEnv: RouteEnv = {
            ...env(s, GREEDY),
            grid,
            start: from,
            pips: from === s.hero.cell ? s.hero.pips : 0,
          };
          const r = findRoute(startEnv, goal < 0 ? farBankCells(grid) : goal);
          if (!r || !r.steps.length) {
            ok = false;
            break;
          }
          if (first === null) first = r.steps[0].to;
          cost += r.cost;
          const sunk: [number, 'water'][] = [];
          for (const c of [from, ...r.steps.slice(0, -1).map((st) => st.to)])
            if (isFloe(grid.cells[c])) sunk.push([c, 'water']);
          grid = sinkWet(s, withCells(grid, sunk));
          from = r.target;
        }
        if (ok && cost < bestCost) {
          bestCost = cost;
          bestFirst = first;
        }
      }
      if (bestFirst !== null) return bestFirst;
      const bank = routeToBank(s, GREEDY);
      return bank && bank.steps.length ? bank.steps[0].to : null;
    },
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((x, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}
