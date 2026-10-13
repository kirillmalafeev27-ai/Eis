/**
 * Сетка реки в координатах реки (2.1): `a` — поперёк реки (0 — ближний берег, R + 1 — дальний),
 * `l` — вдоль течения (0…L − 1). Клетка кодируется индексом `a * L + l`.
 */
export type CellKind = 'near' | 'far' | 'thin' | 'thick' | 'water';

export interface Grid {
  /** Рядов льда R. */
  readonly rows: number;
  /** Клеток вдоль течения L. */
  readonly length: number;
  /** R + 2. */
  readonly height: number;
  readonly cells: readonly CellKind[];
}

export interface Cell {
  a: number;
  l: number;
}

export function makeGrid(rows: number, length: number): Grid {
  const height = rows + 2;
  const cells: CellKind[] = new Array(height * length);
  for (let a = 0; a < height; a++) {
    for (let l = 0; l < length; l++) {
      cells[a * length + l] = a === 0 ? 'near' : a === height - 1 ? 'far' : 'thin';
    }
  }
  return { rows, length, height, cells };
}

export function index(g: Grid, a: number, l: number): number {
  return a * g.length + l;
}

export function aOf(g: Grid, i: number): number {
  return Math.floor(i / g.length);
}

export function lOf(g: Grid, i: number): number {
  return i % g.length;
}

export function cellOf(g: Grid, i: number): Cell {
  return { a: aOf(g, i), l: lOf(g, i) };
}

export function inBounds(g: Grid, a: number, l: number): boolean {
  return a >= 0 && a < g.height && l >= 0 && l < g.length;
}

export function isFloe(kind: CellKind): boolean {
  return kind === 'thin' || kind === 'thick';
}

export function isBank(kind: CellKind): boolean {
  return kind === 'near' || kind === 'far';
}

/** На клетку можно встать: льдина или берег. */
export function isSolid(kind: CellKind): boolean {
  return kind !== 'water';
}

export function withCells(g: Grid, changes: ReadonlyArray<[number, CellKind]>): Grid {
  const cells = g.cells.slice();
  for (const [i, k] of changes) cells[i] = k;
  return { rows: g.rows, length: g.length, height: g.height, cells };
}

export function withCell(g: Grid, i: number, kind: CellKind): Grid {
  return withCells(g, [[i, kind]]);
}

export function farBankCells(g: Grid): number[] {
  const out: number[] = [];
  for (let l = 0; l < g.length; l++) out.push(index(g, g.height - 1, l));
  return out;
}

export function manhattan(g: Grid, i: number, j: number): number {
  return Math.abs(aOf(g, i) - aOf(g, j)) + Math.abs(lOf(g, i) - lOf(g, j));
}

export function chebyshev(g: Grid, i: number, j: number): number {
  return Math.max(Math.abs(aOf(g, i) - aOf(g, j)), Math.abs(lOf(g, i) - lOf(g, j)));
}

/** Четыре направления в координатах реки. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
