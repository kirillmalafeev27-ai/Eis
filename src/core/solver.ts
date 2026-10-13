import { balance } from '../config/balance';
import type { LevelConfig } from '../config/levels';
import type { Grid } from './grid';
import { type Jump, jumpTargets } from './jumps';
import { type Pace, freshJumpRisk } from './risk';

/**
 * Решатель (5.5–5.7): существует ли маршрут без повторов клеток от мостков через всех рыб
 * к дальнему берегу, в котором ни один прыжок не красный для свежей льдины при p = 0.8.
 * Поиск в глубину по простым путям с отсечением по нижней оценке оставшихся зарядов
 * и бюджетом узлов.
 */
export interface SolveResult {
  path: number[] | null;
  nodes: number;
  /** Решатель не уложился в бюджет узлов. */
  exhausted: boolean;
}

/** Прыжок разрешён решателем: не красный для свежей льдины вида клетки-старта. */
export function solverAllows(grid: Grid, level: LevelConfig, pace: Pace): (jump: Jump, takeoff: number) => boolean {
  return (jump, takeoff) => freshJumpRisk(grid.cells[takeoff], jump.cost, level, pace).level !== 'fail';
}

export interface Edge {
  to: number;
  cost: number;
}

/** Списки смежности графа прыжков (с фильтром), посчитанные один раз. */
export function adjacency(grid: Grid, allow?: (jump: Jump, takeoff: number) => boolean): Edge[][] {
  const n = grid.cells.length;
  const adj: Edge[][] = new Array(n);
  for (let c = 0; c < n; c++) {
    adj[c] = [];
    if (grid.cells[c] === 'water' || grid.cells[c] === 'far') continue;
    for (const j of jumpTargets(grid, c)) if (!allow || allow(j, c)) adj[c].push({ to: j.to, cost: j.cost });
  }
  return adj;
}

/** Обратная Дейкстра: расстояние в зарядах от каждой клетки до множества целей. */
export function distancesTo(
  grid: Grid,
  isTarget: (cell: number) => boolean,
  allow?: (jump: Jump, takeoff: number) => boolean,
  adj: Edge[][] = adjacency(grid, allow),
): Float64Array {
  const n = grid.cells.length;
  const reverse: Edge[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < n; c++) for (const e of adj[c]) reverse[e.to].push({ to: c, cost: e.cost });
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  for (let c = 0; c < n; c++) if (isTarget(c)) dist[c] = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    for (const e of reverse[best]) {
      const d = dist[best] + e.cost;
      if (d < dist[e.to]) dist[e.to] = d;
    }
  }
  return dist;
}

/**
 * Срезает тупики: внутренней клетке простого пути нужен вход и отдельный от него выход.
 * Клетки без них удаляются, пока такие находятся; если удалить пришлось рыбу — пути через
 * всех рыб нет (null). Мостки — только выход, дальний берег — только вход.
 */
export function pruneDeadEnds(grid: Grid, adj: Edge[][], start: number, required: Uint8Array): Edge[][] | null {
  const n = grid.cells.length;
  const alive = new Uint8Array(n);
  for (let c = 0; c < n; c++) alive[c] = grid.cells[c] === 'water' ? 0 : 1;
  const inc: number[][] = Array.from({ length: n }, () => []);
  for (let c = 0; c < n; c++) for (const e of adj[c]) inc[e.to].push(c);
  for (let changed = true; changed; ) {
    changed = false;
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === start || grid.cells[c] === 'far') continue;
      let ok = false;
      for (const u of inc[c]) {
        if (!alive[u]) continue;
        for (const e of adj[c]) {
          if (alive[e.to] && e.to !== u) {
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
      if (ok) continue;
      if (required[c]) return null;
      alive[c] = 0;
      changed = true;
    }
  }
  return adj.map((edges, c) => (alive[c] ? edges.filter((e) => alive[e.to]) : []));
}

const PERMS: Record<number, number[][]> = {
  0: [[]],
  1: [[0]],
  2: [
    [0, 1],
    [1, 0],
  ],
  3: [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ],
};

/** Нижняя оценка оставшихся зарядов: минимум по порядкам обхода непойманных рыб (5.6). */
export function makeLowerBound(fish: readonly number[], toFish: Float64Array[], toFar: Float64Array) {
  return (cell: number, caughtMask: number): number => {
    const rest: number[] = [];
    for (let i = 0; i < fish.length; i++) if (!(caughtMask & (1 << i))) rest.push(i);
    if (!rest.length) return toFar[cell];
    let best = Infinity;
    for (const perm of PERMS[rest.length]) {
      let sum = toFish[rest[perm[0]]][cell];
      for (let k = 1; k < perm.length && sum < best; k++) {
        sum += toFish[rest[perm[k]]][fish[rest[perm[k - 1]]]];
      }
      sum += toFar[fish[rest[perm[perm.length - 1]]]];
      if (sum < best) best = sum;
    }
    return best;
  };
}

export function solveLevel(
  grid: Grid,
  bridge: number,
  fish: readonly number[],
  level: LevelConfig,
  tMedMs: number,
  budget: number = balance.gen.solverBudget,
): SolveResult {
  const pace: Pace = { tMedMs, p: balance.gen.solverP };
  const n = grid.cells.length;
  const required = new Uint8Array(n);
  for (const f of fish) required[f] = 1;
  const adj = pruneDeadEnds(grid, adjacency(grid, solverAllows(grid, level, pace)), bridge, required);
  if (!adj) return { path: null, nodes: 0, exhausted: false };

  const toFar = distancesTo(grid, (c) => grid.cells[c] === 'far', undefined, adj);
  const toFish = fish.map((f) => distancesTo(grid, (c) => c === f, undefined, adj));
  const lb = makeLowerBound(fish, toFish, toFar);
  const allMask = (1 << fish.length) - 1;
  const fishBit = new Int32Array(n);
  fish.forEach((f, i) => (fishBit[f] = 1 << i));
  const isFar = new Uint8Array(n);
  for (let c = 0; c < n; c++) if (grid.cells[c] === 'far') isFar[c] = 1;

  const start = lb(bridge, 0);
  if (start === Infinity) return { path: null, nodes: 0, exhausted: false };

  const visited = new Uint8Array(n);
  const path: number[] = [bridge];
  let nodes = 0;
  let exhausted = false;

  // Отсечение по достижимости: непойманные рыбы и берег должны быть достижимы
  // из текущей клетки по непосещённым клеткам — иначе ветка заведомо пустая.
  const seen = new Int32Array(n);
  const queue = new Int32Array(n);
  let stamp = 0;
  const reachableAll = (cell: number, mask: number): boolean => {
    stamp++;
    let need = 0;
    for (let i = 0; i < fish.length; i++) if (!(mask & (1 << i))) need++;
    let farSeen = false;
    let head = 0;
    let tail = 0;
    queue[tail++] = cell;
    seen[cell] = stamp;
    while (head < tail) {
      const c = queue[head++];
      const edges = adj[c];
      for (let k = 0; k < edges.length; k++) {
        const to = edges[k].to;
        if (seen[to] === stamp || visited[to]) continue;
        seen[to] = stamp;
        if (isFar[to]) {
          farSeen = true;
          continue;
        }
        if (fishBit[to] && !(mask & fishBit[to])) need--;
        queue[tail++] = to;
      }
    }
    return farSeen && need <= 0;
  };

  const dfs = (cell: number, mask: number, cost: number, bound: number, depth: number): boolean => {
    if (++nodes > budget) {
      exhausted = true;
      return false;
    }
    // Проверка достижимости дорогая — на каждом третьем шаге её хватает.
    if (depth % 3 === 0 && !reachableAll(cell, mask)) return false;
    const kids: { to: number; cost: number; mask: number; est: number }[] = [];
    for (const e of adj[cell]) {
      if (visited[e.to]) continue;
      const m = mask | fishBit[e.to];
      const c = cost + e.cost;
      if (isFar[e.to]) {
        if (m === allMask) {
          path.push(e.to);
          return true;
        }
        continue;
      }
      const est = c + lb(e.to, m);
      if (est > bound) continue;
      kids.push({ to: e.to, cost: c, mask: m, est });
    }
    kids.sort((x, y) => x.est - y.est);
    for (const k of kids) {
      visited[k.to] = 1;
      path.push(k.to);
      if (dfs(k.to, k.mask, k.cost, bound, depth + 1)) return true;
      path.pop();
      visited[k.to] = 0;
      if (exhausted) return false;
    }
    return false;
  };

  for (let slack = 0; slack <= 24 && !exhausted; slack += 2) {
    visited.fill(0);
    visited[bridge] = 1;
    path.length = 1;
    if (dfs(bridge, fishBit[bridge], 0, start + slack, 0)) return { path: path.slice(), nodes, exhausted: false };
  }
  return { path: null, nodes, exhausted };
}
