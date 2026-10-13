import type Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { BIT_VARIANTS, K } from '../art/manifest';
import { WATER_TILE } from '../art/recipes/water';
import { balance } from '../config/balance';
import { artImage } from './layers';
import type { Orientation } from './orientation';

/**
 * Вода (7.5.1): три слоя бумажных волн, каждый едет по течению со своей скоростью;
 * скорость растёт с силой ледохода — главный фоновый признак того, что река разгоняется.
 * По воде плывут мелкие льдинки.
 */
interface Bit {
  img: Phaser.GameObjects.Image;
  across: number;
  along: number;
  speed: number;
  spin: number;
}

export class WaterView {
  private readonly tiles: Phaser.GameObjects.TileSprite[] = [];
  private readonly bits: Bit[] = [];
  private orient: Orientation | null = null;
  private offset = 0;
  private shiver = 0;
  private rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layer: Phaser.GameObjects.Layer,
    lowQuality: boolean,
  ) {
    const n = lowQuality ? balance.water.floatingBitsLow : balance.water.floatingBits;
    for (let i = 0; i < n; i++) {
      const img = artImage(scene, art, K.bit(i % BIT_VARIANTS));
      img.setAlpha(0.95);
      this.bits.push({ img, across: Math.random(), along: Math.random(), speed: 0.75 + Math.random() * 0.6, spin: (Math.random() - 0.5) * 0.4 });
    }
  }

  setOrientation(o: Orientation): void {
    this.orient = o;
    for (const t of this.tiles) t.destroy();
    this.tiles.length = 0;
    const portrait = o.orient === 'portrait';
    const keys = portrait ? [K.waterDeep, K.waterMid, K.waterLight] : [K.waterDeepV, K.waterMidV, K.waterLightV];
    // Вода покрывает всё видимое поле с запасом.
    const b = o.bounds;
    const pad = o.cell * 6;
    this.rect = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    keys.forEach((key, i) => {
      const r = this.art.ref(key);
      const t = this.scene.add.tileSprite(this.rect.x, this.rect.y, this.rect.w * this.art.s, this.rect.h * this.art.s, r.texture, r.frame);
      t.setOrigin(0, 0);
      t.setScale(1 / this.art.s);
      if (i === 2) t.setAlpha(0.9);
      this.layer.add(t);
      this.tiles.push(t);
    });
    for (const bit of this.bits) this.layer.add(bit.img);
  }

  /** Вода на миг вздрагивает по всему полю (далёкий ледоход, 9.2). */
  shudder(): void {
    this.shiver = 1;
  }

  update(dtMs: number, strength: number, reducedMotion: boolean): void {
    const o = this.orient;
    if (!o) return;
    const dt = dtMs / 1000;
    const speedCells = balance.water.speedMin + (balance.water.speedMax - balance.water.speedMin) * strength;
    this.offset += speedCells * o.cell * dt;
    this.shiver = Math.max(0, this.shiver - dt * 1.6);
    const shake = reducedMotion ? 0 : Math.sin(this.offset * 0.9) * this.shiver * 6;
    const tileW = 128 * WATER_TILE.w * this.art.s;
    const portrait = o.orient === 'portrait';
    this.tiles.forEach((t, i) => {
      const k = balance.water.layerSpeeds[i];
      // Течение «вправо» в портрете и «вниз» в ландшафте: плитка сдвигается навстречу.
      const pos = -((this.offset * k * this.art.s) % (tileW * 8));
      if (portrait) {
        t.tilePositionX = pos;
        t.tilePositionY = shake * (i + 1) * 0.3;
      } else {
        t.tilePositionY = pos;
        t.tilePositionX = shake * (i + 1) * 0.3;
      }
    });
    // Льдинки плывут по течению поверх воды, по всей ширине поля.
    const b = o.bounds;
    const alongSpan = portrait ? b.w + o.cell * 4 : b.h + o.cell * 4;
    const acrossSpan = portrait ? o.gridSize.h : o.gridSize.w;
    for (const bit of this.bits) {
      bit.along += (speedCells * 1.15 * bit.speed * o.cell * dt) / alongSpan;
      if (bit.along > 1) {
        bit.along -= 1;
        bit.across = Math.random();
      }
      const al = (portrait ? b.x : b.y) - o.cell * 2 + bit.along * alongSpan;
      const ac = acrossSpan * (0.08 + bit.across * 0.84);
      if (portrait) bit.img.setPosition(al, ac);
      else bit.img.setPosition(ac, al);
      bit.img.rotation += bit.spin * dt;
    }
  }

  destroy(): void {
    for (const t of this.tiles) t.destroy();
    for (const b of this.bits) b.img.destroy();
  }
}
