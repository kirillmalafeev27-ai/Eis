import type Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import { aOf, lOf } from '../core/grid';
import type { GameState } from '../core/state';
import { type WorldLayers, artImage, cellHash } from './layers';
import type { Light } from './light';
import type { Orientation } from './orientation';

/**
 * Рыбы (7.5.8): розовая бумажная рыба со светлым брюхом и плавниками на шарнирах.
 * Раз в 2–4 с она бьёт хвостом и подпрыгивает; позы — «на двойках».
 */
const FISH_SCALE = 1.22;

interface FishRig {
  root: Phaser.GameObjects.Container;
  tail: Phaser.GameObjects.Image;
  fin: Phaser.GameObjects.Image;
}

interface Fish {
  index: number;
  cell: number;
  rig: FishRig;
  shade: FishRig;
  facing: number;
  nextFlop: number;
  flopT: number;
  gone: boolean;
  offset: { x: number; y: number };
}

export class FishView {
  private fish: Fish[] = [];
  private time = 0;
  private orient: Orientation | null = null;
  /** Колбэк «рыба бьёт хвостом» — для ZAPPEL! и брызг. */
  onFlop: ((i: number, x: number, y: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
    s: GameState,
    seed: number,
  ) {
    s.fish.forEach((f, i) => {
      const rig = this.build(false);
      const shade = this.build(true);
      this.layers.standing.add(rig.root);
      this.layers.shadows.add(shade.root);
      const h = cellHash(seed, f.cell, 31);
      this.fish.push({
        index: i,
        cell: f.cell,
        rig,
        shade,
        facing: h < 0.5 ? -1 : 1,
        nextFlop:
          (balance.anim.fishFlopMinMs + h * (balance.anim.fishFlopMaxMs - balance.anim.fishFlopMinMs)) *
          (0.4 + h),
        flopT: -1,
        gone: f.status !== 'waiting',
        offset: { x: (h - 0.5) * 30, y: 18 + h * 10 },
      });
      if (f.status !== 'waiting') {
        rig.root.setVisible(false);
        shade.root.setVisible(false);
      }
    });
  }

  private build(shadow: boolean): FishRig {
    const k = (key: string) => (shadow ? K.shadow(key) : key);
    const tail = artImage(this.scene, this.art, k(K.fishTail), -20, -12);
    const body = artImage(this.scene, this.art, k(K.fishBody), 0, 0);
    const fin = artImage(this.scene, this.art, k(K.fishFin), -2, -20);
    const root = this.scene.add.container(0, 0, [tail, fin, body]);
    return { root, tail, fin };
  }

  setOrientation(o: Orientation): void {
    this.orient = o;
  }

  /** Середина тела рыбы в мире (для теста контраста). */
  bodyPoint(i: number): { x: number; y: number } | null {
    const f = this.fish[i];
    if (!f || f.gone) return null;
    return { x: f.rig.root.x - 4 * FISH_SCALE * f.facing, y: f.rig.root.y - 14 * FISH_SCALE };
  }

  /** Рыба попала в корзину: подпрыгивает и ныряет в корзину героя. */
  caught(index: number, to: { x: number; y: number }, done: () => void): void {
    const f = this.fish[index];
    if (!f || f.gone) return;
    f.gone = true;
    f.shade.root.setVisible(false);
    const r = f.rig.root;
    const sx = r.x;
    const sy = r.y;
    const dur = 380;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur,
      ease: 'Sine.InOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        r.setPosition(sx + (to.x - sx) * k, sy + (to.y - sy) * k - Math.sin(Math.PI * k) * 70);
        r.setRotation(k * Math.PI * 1.5 * f.facing);
        r.setScale(f.facing * (1 - 0.55 * k), 1 - 0.55 * k);
        r.setDepth(to.y + 2);
      },
      onComplete: () => {
        r.setVisible(false);
        done();
      },
    });
  }

  /** Рыба уплыла: ныряет и машет хвостом на прощание. */
  lost(index: number): void {
    const f = this.fish[index];
    if (!f || f.gone) return;
    f.gone = true;
    f.shade.root.setVisible(false);
    const r = f.rig.root;
    this.scene.tweens.add({
      targets: r,
      y: r.y + 26,
      scaleY: 0.2,
      alpha: 0,
      duration: 650,
      ease: 'Back.In',
      onComplete: () => r.setVisible(false),
    });
    this.scene.tweens.add({ targets: f.rig.tail, rotation: 0.9, yoyo: true, repeat: 3, duration: 80 });
  }

  update(
    dtMs: number,
    s: GameState,
    light: Light,
    surface: (cell: number) => { x: number; y: number } | null,
    reducedMotion: boolean,
    frozen: boolean,
  ): void {
    const o = this.orient;
    if (!o) return;
    if (!frozen) this.time += dtMs;
    const tq = Math.floor((this.time / 1000) * balance.anim.posesPerSecond) / balance.anim.posesPerSecond;
    for (const f of this.fish) {
      if (f.gone) continue;
      const base = surface(f.cell) ?? o.toWorld(aOf(s.grid, f.cell), lOf(s.grid, f.cell));
      let lift = 0;
      let rot = 0;
      let tail = Math.sin(tq * 3 + f.index) * 0.12;
      if (!frozen && !reducedMotion) {
        f.nextFlop -= dtMs;
        if (f.nextFlop <= 0 && f.flopT < 0) {
          f.flopT = 0;
          f.nextFlop =
            balance.anim.fishFlopMinMs +
            Math.random() * (balance.anim.fishFlopMaxMs - balance.anim.fishFlopMinMs);
          this.onFlop?.(f.index, base.x + f.offset.x, base.y + f.offset.y - 10);
        }
      }
      if (f.flopT >= 0) {
        f.flopT += frozen ? 0 : dtMs;
        const k = f.flopT / 420;
        if (k >= 1) f.flopT = -1;
        else {
          const kq = Math.floor(k * 6) / 6; // «на двойках»
          lift = -Math.sin(Math.PI * kq) * 14;
          rot = Math.sin(Math.PI * 2 * kq) * 0.35;
          tail = Math.sin(kq * Math.PI * 4) * 0.7;
        }
      }
      const x = base.x + f.offset.x;
      const y = base.y + f.offset.y;
      f.rig.root.setPosition(x, y + lift);
      f.rig.root.setRotation(rot * f.facing);
      f.rig.root.setScale(f.facing * FISH_SCALE, FISH_SCALE);
      f.rig.root.setDepth(y);
      f.rig.tail.setRotation(tail);
      f.rig.fin.setRotation(tail * -0.4);
      f.shade.root.setPosition(x + light.shadow.x * (1 + lift / -40), y + light.shadow.y);
      f.shade.root.setRotation(rot * f.facing);
      f.shade.root.setScale(f.facing * FISH_SCALE, FISH_SCALE);
      f.shade.tail.setRotation(tail);
      f.shade.root.setAlpha(light.shadowAlpha);
      for (const ch of f.shade.root.list) (ch as Phaser.GameObjects.Image).setTint(light.shadowTint);
    }
  }

  destroy(): void {
    for (const f of this.fish) {
      f.rig.root.destroy();
      f.shade.root.destroy();
    }
  }
}
