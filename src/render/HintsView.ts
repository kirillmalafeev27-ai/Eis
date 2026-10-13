import type Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import type { HintMode } from '../config/levels';
import { aOf, lOf } from '../core/grid';
import { jumpTargets } from '../core/jumps';
import { pipsNeeded, routeRisks } from '../core/rules';
import type { GameState } from '../core/state';
import { type WorldLayers, artImage, setArt } from './layers';
import type { Orientation } from './orientation';

/**
 * Подсказки (2.8): бумажные следы маршрута по риску каждого прыжка, пунктирные дуги
 * длинных прыжков, снежинки-заряды над героем. Слой 6 — поверх цветокоррекции.
 */
export class HintsView {
  private prints: Phaser.GameObjects.Image[] = [];
  private dots: Phaser.GameObjects.Image[] = [];
  private ring: Phaser.GameObjects.Image[] = [];
  private pips: Phaser.GameObjects.Image[] = [];
  private orient: Orientation | null = null;
  private time = 0;
  private pipsShown = -1;
  private pipPop = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
    private mode: HintMode,
  ) {}

  setMode(mode: HintMode): void {
    this.mode = mode;
  }

  setOrientation(o: Orientation): void {
    this.orient = o;
  }

  private pool(list: Phaser.GameObjects.Image[], n: number, key: string): void {
    while (list.length < n) {
      const img = artImage(this.scene, this.art, key);
      this.layers.overlay.add(img);
      list.push(img);
    }
    list.forEach((img, i) => img.setVisible(i < n));
  }

  /** Новая снежинка «загорается». */
  pipGained(): void {
    this.pipPop = 1;
  }

  update(
    dtMs: number,
    s: GameState,
    surface: (cell: number) => { x: number; y: number } | null,
    hero: { x: number; y: number; head: { x: number; y: number } },
    showWorldHints: boolean,
    reducedMotion: boolean,
  ): void {
    const o = this.orient;
    if (!o) return;
    this.time += dtMs;
    const c = o.cell;
    const at = (cell: number) => surface(cell) ?? o.toWorld(aOf(s.grid, cell), lOf(s.grid, cell));
    const playing = s.status === 'playing' && showWorldHints;

    // Следы маршрута.
    const steps = playing && this.mode !== 'none' ? routeRisks(s) : [];
    this.pool(this.prints, steps.length, K.printRoute);
    steps.forEach((st, i) => {
      const img = this.prints[i];
      const from = st.from === s.hero.cell ? { x: hero.x, y: hero.y } : at(st.from);
      const to = at(st.to);
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const off = st.from === s.hero.cell ? 0.33 : 0.12;
      const key = this.mode === 'risk' ? K.print(st.risk.level) : K.printRoute;
      setArt(img, this.art, key);
      img.setPosition(from.x + Math.cos(ang) * c * off, from.y + Math.sin(ang) * c * off - 4);
      img.setRotation(ang + Math.PI / 2);
      img.setScale((i % 2 ? -1 : 1) / this.art.s, 1 / this.art.s);
      img.setAlpha(1);
    });

    // Кольцо цели.
    const target = playing ? s.hero.target : null;
    const ringN = target !== null ? 12 : 0;
    this.pool(this.ring, ringN, K.arcDot);
    if (target !== null) {
      const p = at(target);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(this.time / 220) * 0.05;
      this.ring.forEach((d, i) => {
        const a = (i / ringN) * Math.PI * 2 + this.time / 2600;
        d.setPosition(p.x + Math.cos(a) * c * 0.36 * pulse, p.y + Math.sin(a) * c * 0.3 * pulse);
        d.setScale(0.75 / this.art.s);
        d.setAlpha(0.9);
      });
    }

    // Пунктирные дуги к целям длинных прыжков (2.8.2).
    const longs = playing ? jumpTargets(s.grid, s.hero.cell).filter((j) => j.long) : [];
    const per = 9;
    this.pool(this.dots, longs.length * per, K.arcDot);
    longs.forEach((j, li) => {
      const a = { x: hero.x, y: hero.y - 10 };
      const b = at(j.to);
      for (let k = 0; k < per; k++) {
        const t = (k + 1) / (per + 1);
        const d = this.dots[li * per + k];
        d.setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * c * 0.42);
        d.setScale((0.55 + 0.25 * Math.sin(Math.PI * t)) / this.art.s);
        d.setAlpha(0.85);
      }
    });

    // Снежинки-заряды над героем (6).
    const need = playing ? pipsNeeded(s) : 0;
    this.pool(this.pips, need, K.pipOn);
    if (this.pipsShown !== s.hero.pips) {
      this.pipsShown = s.hero.pips;
    }
    this.pipPop = Math.max(0, this.pipPop - dtMs / 260);
    this.pips.forEach((p, i) => {
      if (i >= need) return;
      setArt(p, this.art, i < s.hero.pips ? K.pipOn : K.pipOff);
      const x = hero.head.x + (i - (need - 1) / 2) * c * 0.2;
      const y = hero.head.y - c * 0.38;
      const pop = i === s.hero.pips - 1 && !reducedMotion ? 1 + this.pipPop * 0.6 : 1;
      p.setPosition(x, y);
      p.setScale((0.85 * pop) / this.art.s);
      p.setRotation(this.time / 3000 + i);
    });
    void balance;
  }

  destroy(): void {
    for (const l of [this.prints, this.dots, this.ring, this.pips]) for (const i of l) i.destroy();
  }
}
