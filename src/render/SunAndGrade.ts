import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import { hex, palette } from '../config/palette';
import { mix } from '../shared/paperKit';
import type { WorldLayers } from './layers';

/**
 * Цветовой сценарий дня (8.3): ясный день → золотой час → закат. На камере мира только
 * два фильтра — цветокоррекция и виньетка (8.1). Без фильтров — запасной путь (8.5):
 * полупрозрачный прямоугольник с умножением и текстура виньетки.
 */
type M = number[];

// Матрицы 5 × 4 (смещения — в единицах 0–255). Подобраны так, чтобы разница тонкого
// и толстого льда пережила закат (8.4) — правится цветокоррекция, а не палитра льда.
const DAY: M = [1.06, 0, 0, 0, -5, 0, 1.06, 0, 0, -5, 0, 0, 1.08, 0, -3, 0, 0, 0, 1, 0];
const GOLD: M = [1.07, 0.03, 0, 0, 7, 0.01, 1.0, 0.01, 0, 3, 0, 0.02, 0.93, 0, -2, 0, 0, 0, 1, 0];
const DUSK: M = [0.86, 0.04, 0.02, 0, 2, 0.02, 0.8, 0.02, 0, -2, 0.03, 0.02, 0.88, 0, 6, 0, 0, 0, 1, 0];

function lerpM(a: M, b: M, t: number): M {
  return a.map((v, i) => v + (b[i] - v) * t);
}

export function gradeMatrix(strength: number): M {
  const s = Math.max(0, Math.min(1, strength));
  // Плато ясного дня до 0.15, золотой час к 0.5, закат к 1 — без скачков.
  if (s <= 0.15) return DAY.slice();
  if (s <= 0.5) return lerpM(DAY, GOLD, smooth((s - 0.15) / 0.35));
  return lerpM(GOLD, DUSK, smooth((s - 0.5) / 0.5));
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Цвет умножения для запасного пути. */
function fallbackTint(strength: number): number {
  const s = Math.max(0, Math.min(1, strength));
  const day = '#ffffff';
  const gold = '#fff0d6';
  const dusk = '#e6cfe8';
  return hex(s <= 0.5 ? mix(day, gold, smooth(s / 0.5)) : mix(gold, dusk, smooth((s - 0.5) / 0.5)));
}

export class SunAndGrade {
  private cm: Phaser.Filters.ColorMatrix | null = null;
  private vig: Phaser.Filters.Vignette | null = null;
  private fbRect: Phaser.GameObjects.Rectangle | null = null;
  private fbVig: Phaser.GameObjects.Image | null = null;
  private useFilters = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
  ) {}

  /** Включить фильтры или запасной путь (низкое качество, нет WebGL). */
  setMode(filters: boolean): void {
    this.clear();
    const webgl = this.scene.game.renderer.type === Phaser.WEBGL;
    this.useFilters = filters && webgl;
    if (this.useFilters) {
      this.cm = this.camera.filters.internal.addColorMatrix();
      this.vig = this.camera.filters.external.addVignette(
        0.5,
        0.5,
        balance.light.vignetteRadius,
        balance.light.vignetteStrengthDay,
        hex(palette.shadow),
      );
    } else {
      this.fbRect = this.scene.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0);
      this.fbRect.setBlendMode(Phaser.BlendModes.MULTIPLY);
      const r = this.art.ref(K.vignette);
      this.fbVig = this.scene.add.image(0, 0, r.texture, r.frame).setOrigin(0, 0);
      this.layers.atmosphere.add(this.fbRect);
      this.layers.atmosphere.add(this.fbVig);
    }
  }

  get filtersOn(): boolean {
    return this.useFilters;
  }

  update(strength: number): void {
    if (this.cm) this.cm.colorMatrix.set(gradeMatrix(strength));
    if (this.vig) {
      const L = balance.light;
      this.vig.strength = L.vignetteStrengthDay + (L.vignetteStrengthDusk - L.vignetteStrengthDay) * strength;
      this.vig.setColor(hex(mix(palette.shadow, palette.shadowDusk, strength)));
    }
    if (this.fbRect && this.fbVig) {
      const v = this.camera.worldView;
      this.fbRect.setPosition(v.x - 4, v.y - 4).setSize(v.width + 8, v.height + 8);
      this.fbRect.setFillStyle(fallbackTint(strength), 1);
      this.fbVig.setPosition(v.x, v.y).setDisplaySize(v.width, v.height);
      this.fbVig.setAlpha(0.6 + 0.4 * strength);
    }
  }

  private clear(): void {
    if (this.cm) this.camera.filters.internal.remove(this.cm);
    if (this.vig) this.camera.filters.external.remove(this.vig);
    this.cm = null;
    this.vig = null;
    this.fbRect?.destroy();
    this.fbVig?.destroy();
    this.fbRect = null;
    this.fbVig = null;
  }

  destroy(): void {
    this.clear();
  }
}
