/**
 * Перевод координат реки (a, l) в экранные и обратно (13.5.4). Единственный модуль,
 * который знает ориентацию: в портрете ближний берег внизу и река течёт вправо,
 * в ландшафте ближний берег слева и река течёт вниз (поворот по часовой стрелке).
 */
export type Orient = 'portrait' | 'landscape';

export interface Margins {
  near: number;
  far: number;
  side: number;
}

export interface Vec {
  x: number;
  y: number;
}

export class Orientation {
  constructor(
    readonly orient: Orient,
    /** R + 2 */
    readonly height: number,
    /** L */
    readonly length: number,
    readonly cell: number,
    readonly margins: Margins,
  ) {}

  /** Центр клетки (a, l) в пикселях мира. */
  toWorld(a: number, l: number): Vec {
    const c = this.cell;
    return this.orient === 'portrait'
      ? { x: (l + 0.5) * c, y: (this.height - 1 - a + 0.5) * c }
      : { x: (a + 0.5) * c, y: (l + 0.5) * c };
  }

  /** Дробные координаты реки по точке мира (обратное к toWorld). */
  toRiver(x: number, y: number): { a: number; l: number } {
    const c = this.cell;
    return this.orient === 'portrait'
      ? { a: this.height - 1 - (y / c - 0.5), l: x / c - 0.5 }
      : { a: x / c - 0.5, l: y / c - 0.5 };
  }

  /** Клетка (a, l) под точкой мира или null вне сетки. */
  cellAt(x: number, y: number): { a: number; l: number } | null {
    const r = this.toRiver(x, y);
    const a = Math.round(r.a);
    const l = Math.round(r.l);
    if (a < 0 || a >= this.height || l < 0 || l >= this.length) return null;
    return { a, l };
  }

  /** Экранное направление движения по реке на +a (через реку) и +l (по течению). */
  get across(): Vec {
    return this.orient === 'portrait' ? { x: 0, y: -1 } : { x: 1, y: 0 };
  }

  get flow(): Vec {
    return this.orient === 'portrait' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  }

  /** Стрелка экрана → шаг в координатах реки. */
  screenDirToRiver(dx: number, dy: number): { da: number; dl: number } {
    if (this.orient === 'portrait') return { da: -dy, dl: dx };
    return { da: dx, dl: dy };
  }

  /** Размер сетки в пикселях мира. */
  get gridSize(): { w: number; h: number } {
    const c = this.cell;
    return this.orient === 'portrait'
      ? { w: this.length * c, h: this.height * c }
      : { w: this.height * c, h: this.length * c };
  }

  /** Границы мира вместе с полями: за дальним берегом — избушка, за ближним — плашка. */
  get bounds(): { x: number; y: number; w: number; h: number } {
    const c = this.cell;
    const m = this.margins;
    const g = this.gridSize;
    if (this.orient === 'portrait') {
      return { x: -m.side * c, y: -m.far * c, w: g.w + 2 * m.side * c, h: g.h + (m.far + m.near) * c };
    }
    return { x: -m.near * c, y: -m.side * c, w: g.w + (m.near + m.far) * c, h: g.h + 2 * m.side * c };
  }

  /** Размер мира в клетках с полями (для расчёта минимальной клетки раскладкой). */
  static cellsNeeded(orient: Orient, height: number, length: number, m: Margins): { w: number; h: number } {
    return orient === 'portrait'
      ? { w: length + 2 * m.side, h: height + m.near + m.far }
      : { w: height + m.near + m.far, h: length + 2 * m.side };
  }
}
