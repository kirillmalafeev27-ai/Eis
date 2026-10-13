import type Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';

/**
 * Слои и глубина (7.6). Слои 0–5 видит камера мира с цветовой обработкой,
 * слой 6 (следы, дуги, снежинки, слова) — вторая камера с теми же прокруткой и зумом.
 */
export interface WorldLayers {
  water: Phaser.GameObjects.Layer;
  rims: Phaser.GameObjects.Layer;
  floes: Phaser.GameObjects.Layer;
  shadows: Phaser.GameObjects.Layer;
  standing: Phaser.GameObjects.Layer;
  atmosphere: Phaser.GameObjects.Layer;
  overlay: Phaser.GameObjects.Layer;
}

export function createLayers(scene: Phaser.Scene): WorldLayers {
  const mk = (depth: number) => scene.add.layer().setDepth(depth);
  return {
    water: mk(0),
    rims: mk(1),
    floes: mk(2),
    shadows: mk(3),
    standing: mk(4),
    atmosphere: mk(5),
    overlay: mk(6),
  };
}

export function destroyLayers(l: WorldLayers): void {
  for (const layer of Object.values(l)) layer.destroy(true);
}

/** Картинка по ключу манифеста с правильным кадром, точкой привязки и масштабом мира. */
export function artImage(
  scene: Phaser.Scene,
  art: ArtFactory,
  key: string,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  const r = art.ref(key);
  const img = scene.add.image(x, y, r.texture, r.frame);
  img.setOrigin(r.ox, r.oy);
  img.setScale(1 / art.s);
  return img;
}

/** Задать новый кадр той же картинке, сохранив масштаб мира. */
export function setArt(img: Phaser.GameObjects.Image, art: ArtFactory, key: string): void {
  const r = art.ref(key);
  img.setTexture(r.texture, r.frame);
  img.setOrigin(r.ox, r.oy);
}

/** Детерминированный «случай» для клетки: варианты льдин, фазы покачивания. */
export function cellHash(seed: number, cell: number, salt = 0): number {
  let h = (seed ^ (cell * 0x9e3779b1) ^ (salt * 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
