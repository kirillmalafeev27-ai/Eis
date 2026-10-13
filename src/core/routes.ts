import type { LevelConfig } from '../config/levels';
import { type Grid, isBank } from './grid';
import { type Jump, jumpTargets } from './jumps';
import {
  type JumpRisk,
  type Pace,
  type Penalties,
  defaultPenalties,
  freshFloeMs,
  freshJumpRisk,
  jumpRisk,
  riskPenalty,
} from './risk';

/** Шаг маршрута: прыжок и его риск в момент расчёта. */
export interface RouteStep extends Jump {
  risk: JumpRisk;
}

export interface Route {
  steps: RouteStep[];
  /** Заряды + штрафы за риск. */
  cost: number;
  /** Сколько толстых льдин на пути (для равенства цен). */
  thick: number;
  target: number;
}

/**
 * Всё, что нужно маршрутизатору о мире. Доступное время на клетке-старте задаёт
 * вызывающий (остаток таймера или намокания), на остальных — полный таймер свежей
 * льдины или срок намокания, что меньше; у берега оно бесконечно (2.8.1).
 */
export interface RouteEnv {
  grid: Grid;
  level: LevelConfig;
  pace: Pace;
  start: number;
  pips: number;
  startAvailableMs: number;
  /** Через сколько мс утонет клетка (намокание), Infinity — если не намокает. */
  sinkInMs: (cell: number) => number;
  penalties?: Penalties;
}

export function takeoffAvailableMs(env: RouteEnv, cell: number): number {
  if (cell === env.start) return env.startAvailableMs;
  const kind = env.grid.cells[cell];
  if (isBank(kind)) return Infinity;
  const fresh = freshFloeMs(kind === 'thick' ? 'thick' : 'thin', env.level, env.pace.tMedMs);
  return Math.min(fresh, env.sinkInMs(cell));
}

export function stepRisk(env: RouteEnv, jump: Jump): JumpRisk {
  return jumpRisk({
    cost: jump.cost,
    pipsHave: jump.from === env.start ? env.pips : 0,
    availableMs: takeoffAvailableMs(env, jump.from),
    pace: env.pace,
  });
}

const EPS = 1e-9;

/**
 * Маршрут с наименьшей ценой (2.2.4): заряды плюс штраф за риск каждого прыжка;
 * при равенстве — больше толстых льдин. `targets` — одна клетка или несколько
 * (например, весь дальний берег для «К берегу»).
 */
export function findRoute(env: RouteEnv, targets: number | readonly number[]): Route | null {
  const g = env.grid;
  const n = g.cells.length;
  const isTarget = new Uint8Array(n);
  if (typeof targets === 'number') isTarget[targets] = 1;
  else for (const t of targets) isTarget[t] = 1;
  if (isTarget[env.start]) return null;

  const penalties = env.penalties ?? defaultPenalties;
  const dist = new Float64Array(n).fill(Infinity);
  const thick = new Int32Array(n);
  const done = new Uint8Array(n);
  const prev: (RouteStep | null)[] = new Array(n).fill(null);
  dist[env.start] = 0;

  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || dist[i] === Infinity) continue;
      if (
        best < 0 ||
        dist[i] < dist[best] - EPS ||
        (Math.abs(dist[i] - dist[best]) <= EPS && thick[i] > thick[best])
      ) {
        best = i;
      }
    }
    if (best < 0) return null;
    done[best] = 1;
    if (isTarget[best]) return unwind(prev, env.start, best, dist[best], thick[best]);
    // Финишные клетки берега дальше не раскрываем: дальний берег — конец пути.
    if (best !== env.start && g.cells[best] === 'far') continue;
    for (const j of jumpTargets(g, best)) {
      if (done[j.to] || j.to === env.start) continue;
      const risk = stepRisk(env, j);
      const d = dist[best] + j.cost + riskPenalty(risk.level, penalties);
      const t = thick[best] + (g.cells[j.to] === 'thick' ? 1 : 0);
      if (d < dist[j.to] - EPS || (Math.abs(d - dist[j.to]) <= EPS && t > thick[j.to])) {
        dist[j.to] = d;
        thick[j.to] = t;
        prev[j.to] = { ...j, risk };
      }
    }
  }
}

function unwind(
  prev: (RouteStep | null)[],
  start: number,
  target: number,
  cost: number,
  thick: number,
): Route {
  const steps: RouteStep[] = [];
  let cur = target;
  while (cur !== start) {
    const s = prev[cur];
    if (!s) break;
    steps.push(s);
    cur = s.from;
  }
  steps.reverse();
  return { steps, cost, thick, target };
}

/** Есть ли от клетки хоть какой-то путь к дальнему берегу, даже красный (проверка тупика). */
export function hasRouteToFarBank(grid: Grid, cell: number): boolean {
  if (grid.cells[cell] === 'far') return true;
  const seen = new Uint8Array(grid.cells.length);
  const stack = [cell];
  seen[cell] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    for (const j of jumpTargets(grid, c)) {
      if (seen[j.to]) continue;
      if (grid.cells[j.to] === 'far') return true;
      seen[j.to] = 1;
      stack.push(j.to);
    }
  }
  return false;
}

/**
 * Честный маршрут (2.4.4): каждый прыжок, кроме первого, не красный для свежей льдины.
 * Вызывающий заранее считает намокающие льдины утонувшими.
 */
export function hasFairRoute(grid: Grid, cell: number, level: LevelConfig, pace: Pace): boolean {
  if (grid.cells[cell] === 'far') return true;
  const seen = new Uint8Array(grid.cells.length);
  const stack = [cell];
  seen[cell] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const kind = grid.cells[c];
    for (const j of jumpTargets(grid, c)) {
      if (seen[j.to]) continue;
      if (c !== cell && freshJumpRisk(kind, j.cost, level, pace).level === 'fail') continue;
      if (grid.cells[j.to] === 'far') return true;
      seen[j.to] = 1;
      stack.push(j.to);
    }
  }
  return false;
}

/** Кратчайшие расстояния в зарядах от клетки (Дейкстра по ценам 1 и 2). */
export function chargeDistances(
  grid: Grid,
  from: number,
  allow?: (jump: Jump, takeoff: number) => boolean,
): Float64Array {
  const n = grid.cells.length;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    if (best !== from && grid.cells[best] === 'far') continue;
    for (const j of jumpTargets(grid, best)) {
      if (allow && !allow(j, best)) continue;
      const d = dist[best] + j.cost;
      if (d < dist[j.to]) dist[j.to] = d;
    }
  }
  return dist;
}

/** Расстояние в зарядах до ближайшей клетки дальнего берега из каждой клетки. */
export function distancesToFarBank(
  grid: Grid,
  allow?: (jump: Jump, takeoff: number) => boolean,
): Float64Array {
  // Обратная Дейкстра: из каждой клетки считаем до берега, переворачивая рёбра.
  const n = grid.cells.length;
  const reverse: { from: number; cost: number }[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < n; c++) {
    if (grid.cells[c] === 'water' || grid.cells[c] === 'far') continue;
    for (const j of jumpTargets(grid, c)) {
      if (allow && !allow(j, c)) continue;
      reverse[j.to].push({ from: c, cost: j.cost });
    }
  }
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (let c = 0; c < n; c++) if (grid.cells[c] === 'far') dist[c] = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    for (const e of reverse[best]) {
      const d = dist[best] + e.cost;
      if (d < dist[e.from]) dist[e.from] = d;
    }
  }
  return dist;
}
