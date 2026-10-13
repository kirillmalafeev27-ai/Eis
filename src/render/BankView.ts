import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { DRIFT_VARIANTS, K, PINE_VARIANTS } from '../art/manifest';
import { balance } from '../config/balance';
import { aOf, lOf } from '../core/grid';
import type { GameState } from '../core/state';
import { mulberry32 } from '../shared/paperKit';
import { type WorldLayers, artImage } from './layers';
import type { Light } from './light';
import type { Orientation } from './orientation';

/**
 * Берега (7.5.6–7.5.7): ближний — заснеженный, с мостками, камышом и соснами;
 * дальний — сосны, избушка с тёплым окном и дымком, санки, сугробы.
 * К вечеру окно светится ярче — это маяк цели.
 */
interface Prop {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  a: number;
  l: number;
  scale: number;
}

export class BankView {
  private near: Phaser.GameObjects.Image | null = null;
  private far: Phaser.GameObjects.Image | null = null;
  private nearKey = '';
  private farKey = '';
  private bridge: Phaser.GameObjects.Image | null = null;
  private props: Prop[] = [];
  private hut: Prop | null = null;
  private windowGlow: Phaser.GameObjects.Image | null = null;
  private hutGlow: Phaser.GameObjects.Image | null = null;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private orient: Orientation | null = null;
  private time = 0;
  windowPoint = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
    private readonly seed: number,
    private readonly lowQuality: boolean,
  ) {}

  setOrientation(o: Orientation, s: GameState): void {
    this.orient = o;
    this.clear();
    const c = o.cell;
    const L = s.grid.length;
    const H = s.grid.height;
    const extra = 5;
    const depth = 3.6;
    const portrait = o.orient === 'portrait';
    const bridgeL = lOf(s.grid, s.bridge);
    const near = this.art.bank({ side: 'near', length: L, extra, depth, bridgeL }, this.seed ^ 0x51, !portrait);
    const far = this.art.bank({ side: 'far', length: L, extra, depth }, this.seed ^ 0x77, !portrait);
    this.nearKey = near.texture;
    this.farKey = far.texture;
    const canvasH = depth * c;
    this.near = this.scene.add.image(0, 0, near.texture).setOrigin(0, 0).setScale(1 / this.art.s);
    this.far = this.scene.add.image(0, 0, far.texture).setOrigin(0, 0).setScale(1 / this.art.s);
    if (portrait) {
      this.near.setPosition(-extra * c, (H - 1) * c - 8);
      this.far.setPosition(-extra * c, c + 14 - canvasH);
    } else {
      this.near.setPosition(c + 8 - canvasH, -extra * c);
      this.far.setPosition((H - 1) * c - 14, -extra * c);
    }
    this.layers.floes.add(this.near);
    this.layers.floes.add(this.far);

    // Мостки — у клетки старта, чуть заходят на воду.
    const bp = o.toWorld(0.18, bridgeL);
    this.bridge = artImage(this.scene, this.art, portrait ? K.bridge : K.bridgeV, bp.x, bp.y);
    this.layers.floes.add(this.bridge);

    const rng = mulberry32(this.seed ^ 0xbeef);
    const add = (key: string, a: number, l: number, scale = 1, shadow = true) => {
      const img = artImage(this.scene, this.art, key);
      img.setScale(img.scaleX * scale);
      const sh = shadow ? artImage(this.scene, this.art, K.shadow(key)) : null;
      if (sh) {
        sh.setScale(sh.scaleX * scale);
        this.layers.shadows.add(sh);
      }
      this.layers.standing.add(img);
      const prop = { img, shadow: sh, a, l, scale };
      this.props.push(prop);
      return prop;
    };

    // Ближний берег: камыш у воды, пара сосен и сугробы в поле за берегом.
    const nearMarginA = portrait ? -0.25 : -0.3;
    for (let i = 0; i < 4; i++) {
      let l = -1.5 + rng() * (L + 2);
      if (Math.abs(l - bridgeL) < 1.2) l += 2.2;
      add(K.reed(i % 3), 0.3 + rng() * 0.1, l, 0.85 + rng() * 0.3, false);
    }
    const nearPines = [L + 0.6 + rng() * 0.8, -1.4 - rng() * 0.8, L * (0.55 + rng() * 0.3)];
    nearPines.forEach((l, i) => add(K.pine(Math.floor(rng() * PINE_VARIANTS)), nearMarginA - 0.2 - (i === 2 ? 0.3 : 0), l, 0.62 + rng() * 0.2));
    add(K.drift(0), nearMarginA, L * 0.3 + rng(), 1);

    // Дальний берег: сосны вдоль, избушка, санки, сугробы.
    const farA = H - 1 + (portrait ? 0.36 : 0.85);
    const hutL = Math.max(1.2, Math.min(L - 2.2, L * 0.62));
    this.hut = add(K.hut, farA, hutL, 1.5);
    add(K.sled, farA - 0.12, hutL - 1.45, 1.15);
    add(K.drift(1 % DRIFT_VARIANTS), farA - 0.05, hutL + 1.35, 1.3);
    const pineSpots = [-1.8, -0.7, 0.5, hutL - 2.6, hutL + 2.3, L - 0.3, L + 1, L + 2.2];
    for (const l of pineSpots) {
      if (Math.abs(l - hutL) < 1.6) continue;
      add(K.pine(Math.floor(rng() * PINE_VARIANTS)), farA + 0.15 + rng() * 0.3, l + (rng() - 0.5) * 0.4, 0.95 + rng() * 0.4);
    }
    for (let i = 0; i < 3; i++) add(K.reed(i % 3), H - 1 - 0.32, -1 + rng() * (L + 1), 0.8, false);

    // Тёплое окно: ореол кладётся аддитивно, без фильтров (8.1.3).
    this.hutGlow = artImage(this.scene, this.art, K.hutGlow).setBlendMode(Phaser.BlendModes.ADD);
    this.windowGlow = artImage(this.scene, this.art, K.windowGlow).setBlendMode(Phaser.BlendModes.ADD);
    this.layers.atmosphere.add(this.hutGlow);
    this.layers.atmosphere.add(this.windowGlow);

    // Дым из трубы.
    const smokeRef = this.art.ref(K.p.smoke);
    this.smoke = this.scene.add.particles(0, 0, smokeRef.texture, {
      frame: smokeRef.frame,
      lifespan: 3200,
      frequency: this.lowQuality ? 520 : 300,
      speedY: { min: -26, max: -16 },
      speedX: { min: 4, max: 14 },
      scale: { start: 0.35 / this.art.s, end: 1.25 / this.art.s },
      alpha: { start: 0.55, end: 0 },
      maxAliveParticles: this.lowQuality ? 8 : 14,
    });
    this.layers.atmosphere.add(this.smoke);
    this.placeProps();
  }

  private placeProps(): void {
    const o = this.orient;
    if (!o) return;
    for (const p of this.props) {
      const w = o.toWorld(p.a, p.l);
      p.img.setPosition(w.x, w.y);
      p.img.setDepth(w.y);
    }
    if (this.hut && this.windowGlow && this.hutGlow && this.smoke) {
      const h = this.hut.img;
      const info = this.art.hutInfo;
      const left = h.x - h.displayWidth * h.originX;
      const top = h.y - h.displayHeight * h.originY;
      this.windowPoint = { x: left + info.window.x * h.displayWidth, y: top + info.window.y * h.displayHeight };
      this.windowGlow.setPosition(this.windowPoint.x, this.windowPoint.y);
      this.hutGlow.setPosition(this.windowPoint.x, this.windowPoint.y);
      this.smoke.setPosition(left + info.chimney.x * h.displayWidth, top + info.chimney.y * h.displayHeight);
    }
  }

  update(dtMs: number, light: Light, reducedMotion: boolean): void {
    this.time += dtMs;
    for (const p of this.props) {
      if (!p.shadow) continue;
      p.shadow.setPosition(p.img.x + light.shadow.x, p.img.y + light.shadow.y);
      p.shadow.setTint(light.shadowTint);
      p.shadow.setAlpha(light.shadowAlpha);
    }
    // К вечеру окно избушки — самая яркая точка сцены.
    const L = balance.light;
    const k = L.windowGlowMin + (L.windowGlowMax - L.windowGlowMin) * light.strength;
    const flicker = reducedMotion ? 0 : Math.sin(this.time / 170) * 0.03 + Math.sin(this.time / 53) * 0.02;
    this.windowGlow?.setAlpha(Math.min(1, k + flicker));
    this.windowGlow?.setScale((0.9 + 0.5 * light.strength) / this.art.s);
    this.hutGlow?.setAlpha(Math.min(1, 0.12 + 0.75 * light.strength * light.strength + flicker));
    this.hutGlow?.setScale((0.8 + 0.6 * light.strength) / this.art.s);
  }

  /** Окно вспыхивает ярче — победа (9.2). */
  flashWindow(): void {
    if (!this.windowGlow) return;
    this.scene.tweens.add({ targets: this.windowGlow, scale: this.windowGlow.scale * 1.5, yoyo: true, duration: 280, ease: 'Sine.Out' });
  }

  /** Точка у избушки, куда бежит герой после победы. */
  hutDoor(): { x: number; y: number } | null {
    if (!this.hut) return null;
    return { x: this.hut.img.x - this.hut.img.displayWidth * 0.12, y: this.hut.img.y + 2 };
  }

  heroCellPoint(s: GameState, cell: number): { x: number; y: number } | null {
    return this.orient ? this.orient.toWorld(aOf(s.grid, cell), lOf(s.grid, cell)) : null;
  }

  private clear(): void {
    this.near?.destroy();
    this.far?.destroy();
    if (this.nearKey) this.art.releaseTexture(this.nearKey);
    if (this.farKey) this.art.releaseTexture(this.farKey);
    this.bridge?.destroy();
    for (const p of this.props) {
      p.img.destroy();
      p.shadow?.destroy();
    }
    this.props = [];
    this.hut = null;
    this.windowGlow?.destroy();
    this.hutGlow?.destroy();
    this.smoke?.destroy();
    this.windowGlow = this.hutGlow = null;
    this.smoke = null;
  }

  destroy(): void {
    this.clear();
  }
}
