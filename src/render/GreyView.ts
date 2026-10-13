import type Phaser from 'phaser';
import { balance } from '../config/balance';
import type { HintMode } from '../config/levels';
import { palette, hex } from '../config/palette';
import type { GameEvent } from '../core/events';
import { heroFloeProgress } from '../core/floes';
import { aOf, lOf } from '../core/grid';
import { jumpTargets } from '../core/jumps';
import { routeRisks } from '../core/rules';
import type { GameState } from '../core/state';
import type { Orientation } from './orientation';

/**
 * Серый прототип (этап 2): льдины — прямоугольники двух оттенков, рыбы — кружки,
 * таймер — временная полоска, намокание — смена цвета, маршрут — точки трёх цветов.
 * Нужен, чтобы проверить, интересна ли игра на голых фигурах.
 */
export class GreyView {
  private readonly g: Phaser.GameObjects.Graphics;
  private orient: Orientation | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly hints: HintMode,
  ) {
    this.g = scene.add.graphics();
  }

  setOrientation(o: Orientation): void {
    this.orient = o;
  }

  onEvents(_events: GameEvent[]): void {
    /* серому прототипу события не нужны: он перерисовывает всё каждый кадр */
  }

  update(s: GameState): void {
    const o = this.orient;
    if (!o) return;
    const g = this.g;
    const c = o.cell;
    g.clear();
    const b = o.bounds;
    g.fillStyle(0x3c4a5a, 1);
    g.fillRect(b.x - c * 4, b.y - c * 4, b.w + c * 8, b.h + c * 8);
    const reach = new Set(jumpTargets(s.grid, s.hero.cell).map((j) => j.to));
    for (let i = 0; i < s.grid.cells.length; i++) {
      const kind = s.grid.cells[i];
      const p = o.toWorld(aOf(s.grid, i), lOf(s.grid, i));
      let color = 0x2b3640;
      if (kind === 'near' || kind === 'far') color = 0xd7dce0;
      else if (kind === 'thick') color = 0xb9c0c6;
      else if (kind === 'thin') color = s.debris[i] ? 0x6f7a84 : 0x8a949d;
      if (s.sinkAt[i] >= 0) color = 0x4a5763;
      const inset = kind === 'water' ? 0 : c * 0.06;
      g.fillStyle(color, 1);
      g.fillRect(p.x - c / 2 + inset, p.y - c / 2 + inset, c - inset * 2, c - inset * 2);
      if (reach.has(i) && kind !== 'water') {
        g.lineStyle(4, 0xffffff, 0.7);
        g.strokeRect(p.x - c / 2 + inset, p.y - c / 2 + inset, c - inset * 2, c - inset * 2);
      }
      if (s.sinkAt[i] >= 0) {
        const k = Math.min(1, (s.time - s.wetStart[i]) / Math.max(1, s.sinkAt[i] - s.wetStart[i]));
        g.fillStyle(0x1f2a33, 0.6);
        g.fillRect(
          p.x - c / 2 + inset,
          p.y + c / 2 - inset - (c - inset * 2) * k,
          c - inset * 2,
          (c - inset * 2) * k,
        );
      }
    }
    // Маршрут — точки трёх цветов.
    if (this.hints !== 'none' && s.route) {
      for (const step of routeRisks(s)) {
        const p = o.toWorld(aOf(s.grid, step.from), lOf(s.grid, step.from));
        const col =
          this.hints === 'route'
            ? 0x222222
            : step.risk.level === 'safe'
              ? hex(palette.hints.safe)
              : step.risk.level === 'risky'
                ? hex(palette.hints.risky)
                : hex(palette.hints.fail);
        const q = o.toWorld(aOf(s.grid, step.to), lOf(s.grid, step.to));
        g.lineStyle(6, col, 0.9);
        g.lineBetween(p.x, p.y, q.x, q.y);
        g.fillStyle(col, 1);
        g.fillCircle(q.x, q.y, c * 0.1);
      }
    }
    // Рыбы — кружки.
    for (const f of s.fish) {
      if (f.status !== 'waiting') continue;
      const p = o.toWorld(aOf(s.grid, f.cell), lOf(s.grid, f.cell));
      g.fillStyle(0x9aa3ab, 1);
      g.fillCircle(p.x + c * 0.22, p.y - c * 0.22, c * 0.14);
      g.lineStyle(3, 0x222222, 1);
      g.strokeCircle(p.x + c * 0.22, p.y - c * 0.22, c * 0.14);
    }
    // Герой.
    const hp = o.toWorld(aOf(s.grid, s.hero.cell), lOf(s.grid, s.hero.cell));
    g.fillStyle(0x30363c, 1);
    g.fillCircle(hp.x, hp.y, c * 0.22);
    g.fillStyle(hex(palette.hero.scarf), 1);
    g.fillRect(hp.x - c * 0.22, hp.y - c * 0.04, c * 0.44, c * 0.08);
    // Заряды.
    for (let i = 0; i < s.hero.pips; i++) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(hp.x - c * 0.12 + i * c * 0.24, hp.y - c * 0.36, c * 0.07);
    }
    // Временная полоска таймера (только в сером прототипе).
    if (s.hero.floeStart !== null) {
      const k = 1 - heroFloeProgress(s);
      g.fillStyle(0x111111, 0.8);
      g.fillRect(hp.x - c * 0.4, hp.y + c * 0.3, c * 0.8, c * 0.08);
      g.fillStyle(k > 0.5 ? 0xdddddd : k > 0.25 ? 0xe0a050 : 0xe05050, 1);
      g.fillRect(hp.x - c * 0.4, hp.y + c * 0.3, c * 0.8 * k, c * 0.08);
      for (const st of balance.rules.crackStages) {
        g.fillStyle(0x000000, 1);
        g.fillRect(hp.x - c * 0.4 + c * 0.8 * (1 - st) - 1, hp.y + c * 0.3, 2, c * 0.08);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
