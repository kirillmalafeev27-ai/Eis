import { DIRS, type Grid, inBounds, index, aOf, lOf, isSolid } from './grid';

/**
 * Прыжок (2.2): обычный — на соседнюю клетку по 4 сторонам за 1 заряд;
 * длинный — по прямой через ровно одну клетку воды за 2 заряда.
 */
export interface Jump {
  from: number;
  to: number;
  long: boolean;
  cost: 1 | 2;
}

/**
 * Досягаемость из клетки — единственная функция на весь проект: её используют ввод,
 * подсказки, маршруты, таяние и решатель (13.3.6).
 */
export function jumpTargets(grid: Grid, cell: number): Jump[] {
  const out: Jump[] = [];
  const a = aOf(grid, cell);
  const l = lOf(grid, cell);
  const cells = grid.cells;
  for (const [da, dl] of DIRS) {
    const a1 = a + da;
    const l1 = l + dl;
    if (!inBounds(grid, a1, l1)) continue;
    const near = index(grid, a1, l1);
    if (isSolid(cells[near])) {
      out.push({ from: cell, to: near, long: false, cost: 1 });
      continue;
    }
    // Через льдину длинным прыжком не прыгают: только через воду.
    const a2 = a + 2 * da;
    const l2 = l + 2 * dl;
    if (!inBounds(grid, a2, l2)) continue;
    const far = index(grid, a2, l2);
    if (isSolid(cells[far])) out.push({ from: cell, to: far, long: true, cost: 2 });
  }
  return out;
}

/** Прыжок из `from` в `to`, если он возможен одним движением. */
export function findJump(grid: Grid, from: number, to: number): Jump | null {
  for (const j of jumpTargets(grid, from)) if (j.to === to) return j;
  return null;
}
