/**
 * Сидированный генератор mulberry32. Общий для логики, генератора уровней и бумажного кита.
 * Чистая функция шага `rngStep` позволяет хранить состояние генератора внутри GameState.
 */
export type Rng = () => number;

export function rngStep(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    const r = rngStep(s);
    s = r.state;
    return r.value;
  };
}

/** Целое в [min, max] включительно. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Перемешивание Фишера — Йетса на месте. */
export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** Смешивание целых в новый сид (для «сид + номер попытки»). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ b ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

/** Нормальная величина (Бокс — Мюллер). */
export function randNormal(rng: Rng): number {
  let u = 0;
  while (u <= Number.EPSILON) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Логнормальная величина с заданной медианой. */
export function randLogNormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(sigma * randNormal(rng));
}
