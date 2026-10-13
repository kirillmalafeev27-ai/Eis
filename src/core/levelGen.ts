import { balance } from '../config/balance';
import type { LevelConfig } from '../config/levels';
import { type CellKind, type Grid, aOf, chebyshev, index, isFloe, lOf, manhattan, makeGrid } from './grid';
import { jumpTargets } from './jumps';
import { type Rng, mixSeed, mulberry32, randInt, shuffle } from './rng';
import { distancesTo, makeLowerBound, solveLevel } from './solver';
import type { GeneratedLevel } from './state';

/**
 * Генератор уровня (раздел 5): полыньи с ограничениями, толстые льдины с правилом опоры,
 * три рыбы в стороне от прямого пути, проверка дилеммы и проходимости решателем.
 */
export interface LevelGenResult extends GeneratedLevel {
  seed: number;
  attempts: number;
  /** 0 — все требования; 1 — без дилеммы и рыбы в стороне; 2 — полыней вдвое меньше; 3 — без полыней. */
  relax: number;
  solution: number[];
  shortestCrossing: number;
  fishRouteBound: number;
  warnings: string[];
}

export function generateLevel(level: LevelConfig, seed: number, tMedMs: number): LevelGenResult {
  const warnings: string[] = [];
  const maxAttempts = balance.gen.attempts;
  for (let attempt = 0; ; attempt++) {
    const relax = attempt < maxAttempts ? 0 : attempt < 2 * maxAttempts ? 1 : attempt < 3 * maxAttempts ? 2 : 3;
    if (attempt === maxAttempts) {
      warnings.push(`level ${level.id}, seed ${seed}: ${maxAttempts} attempts failed, relaxing requirements`);
    }
    const rng = mulberry32(mixSeed(seed, attempt));
    const built = buildAttempt(level, rng, relax);
    if (!built) continue;
    const solved = solveLevel(built.grid, built.bridge, built.fish, level, tMedMs);
    if (!solved.path) continue;
    if (relax > 0 && typeof console !== 'undefined') console.warn(warnings[warnings.length - 1]);
    return {
      ...built,
      seed,
      attempts: attempt + 1,
      relax,
      solution: solved.path,
      warnings,
    };
  }
}

interface Built extends GeneratedLevel {
  shortestCrossing: number;
  fishRouteBound: number;
}

export function buildAttempt(level: LevelConfig, rng: Rng, relax: number): Built | null {
  const R = level.rows;
  const L = level.length;
  const base = makeGrid(R, L);
  const cells = base.cells.slice() as CellKind[];
  const bridge = index(base, 0, randInt(rng, 1, L - 2));

  // 1. Полыньи (5.2).
  const waterShare = relax >= 3 ? 0 : relax >= 2 ? level.waterShare / 2 : level.waterShare;
  const waterTarget = Math.round(waterShare * R * L);
  const ice: number[] = [];
  for (let a = 1; a <= R; a++) for (let l = 0; l < L; l++) ice.push(index(base, a, l));
  let placed = 0;
  for (const c of shuffle(rng, ice.slice())) {
    if (placed >= waterTarget) break;
    if (canBeWater(base, cells, c)) {
      cells[c] = 'water';
      placed++;
    }
  }

  // 2. Толстые льдины и правило опоры (5.3).
  const floes = ice.filter((c) => cells[c] !== 'water');
  const thickTarget = Math.round(level.thickShare * floes.length);
  for (const c of shuffle(rng, floes.slice()).slice(0, thickTarget)) cells[c] = 'thick';
  enforceSupport(base, cells);

  const grid: Grid = { ...base, cells };

  // 3. Кратчайшая переправа — от неё считается «в стороне» и дилемма.
  const toFar = distancesTo(grid, (c) => cells[c] === 'far');
  const shortest = toFar[bridge];
  if (shortest === Infinity) return null;
  const crossing = shortestPath(grid, bridge, toFar);

  // 4. Рыбы (5.4).
  const fish = placeFish(grid, rng, crossing, relax);
  if (!fish) return null;

  // 5. Дилемма (5.6): нижняя оценка маршрута через рыб длиннее переправы на 3 заряда.
  const toFish = fish.map((f) => distancesTo(grid, (c) => c === f));
  const bound = makeLowerBound(fish, toFish, toFar)(bridge, 0);
  if (bound === Infinity) return null;
  if (relax === 0 && bound - shortest < balance.gen.dilemmaCharges) return null;

  return { grid, bridge, fish, shortestCrossing: shortest, fishRouteBound: bound };
}

function canBeWater(g: Grid, cells: CellKind[], c: number): boolean {
  if (cells[c] === 'water') return false;
  const a = aOf(g, c);
  const l = lOf(g, c);
  // В каждом ряду льда хотя бы 2 льдины.
  let floesInRow = 0;
  for (let x = 0; x < g.length; x++) if (cells[index(g, a, x)] !== 'water') floesInRow++;
  if (floesInRow - 1 < balance.gen.minFloesPerRow) return false;
  // Не больше 3 клеток воды подряд в ряду и в столбце.
  const max = balance.gen.maxWaterRun;
  let run = 1;
  for (let x = l - 1; x >= 0 && cells[index(g, a, x)] === 'water'; x--) run++;
  for (let x = l + 1; x < g.length && cells[index(g, a, x)] === 'water'; x++) run++;
  if (run > max) return false;
  run = 1;
  for (let y = a - 1; y >= 1 && cells[index(g, y, l)] === 'water'; y--) run++;
  for (let y = a + 1; y <= g.rows && cells[index(g, y, l)] === 'water'; y++) run++;
  return run <= max;
}

/** Расстояние в прыжках по льдинам до ближайшей толстой. */
function jumpsToThick(g: Grid, cells: CellKind[]): Int32Array {
  const grid: Grid = { ...g, cells };
  const dist = new Int32Array(cells.length).fill(-1);
  const queue: number[] = [];
  for (let c = 0; c < cells.length; c++) {
    if (cells[c] === 'thick') {
      dist[c] = 0;
      queue.push(c);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    for (const j of jumpTargets(grid, c)) {
      if (!isFloe(cells[j.to]) || dist[j.to] >= 0) continue;
      dist[j.to] = dist[c] + 1;
      queue.push(j.to);
    }
  }
  return dist;
}

/** Правило опоры: от любой льдины до толстой — не больше 3 прыжков (5.3). */
function enforceSupport(g: Grid, cells: CellKind[]): void {
  for (let guard = 0; guard < cells.length; guard++) {
    const dist = jumpsToThick(g, cells);
    let worst = -1;
    let worstD: number = balance.gen.maxJumpsToThick;
    for (let c = 0; c < cells.length; c++) {
      if (!isFloe(cells[c])) continue;
      const d = dist[c] < 0 ? Infinity : dist[c];
      if (d > worstD) {
        worstD = d;
        worst = c;
      }
    }
    if (worst < 0) return;
    cells[worst] = 'thick';
  }
}

/** Один кратчайший путь (в зарядах) от мостков до дальнего берега. */
function shortestPath(g: Grid, from: number, toFar: Float64Array): number[] {
  const path = [from];
  let cur = from;
  for (let guard = 0; guard < g.cells.length && g.cells[cur] !== 'far'; guard++) {
    let next = -1;
    for (const j of jumpTargets(g, cur)) {
      if (toFar[j.to] + j.cost === toFar[cur] && (next < 0 || j.to < next)) next = j.to;
    }
    if (next < 0) break;
    path.push(next);
    cur = next;
  }
  return path;
}

function placeFish(g: Grid, rng: Rng, crossing: number[], relax: number): number[] | null {
  const count = balance.gen.fishCount;
  const cand: number[] = [];
  for (let c = 0; c < g.cells.length; c++) {
    const a = aOf(g, c);
    if (isFloe(g.cells[c]) && a >= balance.gen.fishMinRow && a <= g.rows) cand.push(c);
  }
  if (cand.length < count) return null;
  const offRoute = (c: number) => {
    let d = Infinity;
    for (const p of crossing) d = Math.min(d, manhattan(g, c, p));
    return d;
  };
  const far = cand.filter((c) => offRoute(c) >= balance.gen.fishOffRoute);
  for (let tries = 0; tries < 60; tries++) {
    const picks: number[] = [];
    if (relax === 0) {
      if (!far.length) return null;
      picks.push(far[Math.floor(rng() * far.length)]);
    }
    for (const c of shuffle(rng, cand.slice())) {
      if (picks.length >= count) break;
      if (picks.every((p) => chebyshev(g, p, c) >= 2)) picks.push(c);
    }
    if (picks.length < count) continue;
    if (!picks.some((c) => g.cells[c] === 'thin')) continue;
    return picks;
  }
  return null;
}

/** Сид для «Ещё раз»: новый, но воспроизводимый. */
export function nextSeed(seed: number): number {
  return mixSeed(seed, 0x1ce) >>> 0;
}
