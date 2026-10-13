import type Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import type { WorldLayers } from './layers';

/**
 * Сочность (9.1): слова-звуки из бумаги, брызги, снег, круги по воде, тряска, удар-зум
 * и хит-стоп. Ничто не блокирует ввод и не задерживает таймеры: всё это только картинка.
 */
interface Word {
  img: Phaser.GameObjects.Image;
  born: number;
}

export class Juice {
  private words: Word[] = [];
  private readonly emitters: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private shakeLeft = 0;
  private shakePx = 0;
  private punchLeft = 0;
  private hitStopLeft = 0;
  private time = 0;
  reducedMotion = false;
  lowQuality = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
  ) {
    const mk = (name: string, key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => {
      const r = art.ref(key);
      const e = scene.add.particles(0, 0, r.texture, { frame: r.frame, emitting: false, ...cfg });
      layers.atmosphere.add(e);
      this.emitters[name] = e;
    };
    const s = art.s;
    mk('splash', K.p.drop, {
      lifespan: 520,
      speed: { min: 60, max: 190 },
      angle: { min: 200, max: 340 },
      gravityY: 520,
      scale: { start: 1 / s, end: 0.5 / s },
      alpha: { start: 1, end: 0 },
      rotate: { min: -40, max: 40 },
    });
    mk('snow', K.p.snow, {
      lifespan: 480,
      speed: { min: 40, max: 120 },
      angle: { min: 180, max: 360 },
      gravityY: 260,
      scale: { start: 0.9 / s, end: 0.3 / s },
      alpha: { start: 1, end: 0 },
    });
    mk('chips', K.p.chip, {
      lifespan: 600,
      speed: { min: 50, max: 130 },
      angle: { min: 0, max: 360 },
      gravityY: 300,
      scale: { start: 0.9 / s, end: 0.4 / s },
      rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 },
    });
    mk('bubbles', K.p.bubble, {
      lifespan: 900,
      speedY: { min: -40, max: -15 },
      speedX: { min: -12, max: 12 },
      scale: { start: 0.6 / s, end: 1.2 / s },
      alpha: { start: 0.9, end: 0 },
    });
    mk('steam', K.p.steam, {
      lifespan: 1100,
      speedY: { min: -26, max: -12 },
      speedX: { min: 6, max: 18 },
      scale: { start: 0.5 / s, end: 1.4 / s },
      alpha: { start: 0.55, end: 0 },
    });
    mk('drip', K.p.drop, {
      lifespan: 520,
      speedY: { min: 20, max: 60 },
      gravityY: 320,
      scale: { start: 0.55 / s, end: 0.4 / s },
      alpha: { start: 0.9, end: 0 },
    });
  }

  burst(
    name: 'splash' | 'snow' | 'chips' | 'bubbles' | 'steam' | 'drip',
    x: number,
    y: number,
    n: number,
  ): void {
    const e = this.emitters[name];
    if (!e) return;
    const count = Math.max(1, Math.round(this.lowQuality ? n / 2 : n));
    if (
      this.totalAlive() + count >
      (this.lowQuality ? balance.quality.maxParticles / 2 : balance.quality.maxParticles)
    )
      return;
    e.explode(count, x, y);
  }

  private totalAlive(): number {
    let n = 0;
    for (const e of Object.values(this.emitters)) n += e.getAliveParticleCount();
    return n;
  }

  /** Круги по воде. */
  ripple(x: number, y: number, size = 1): void {
    const r = this.art.ref(K.p.ripple);
    for (let i = 0; i < 2; i++) {
      const img = this.scene.add.image(x, y, r.texture, r.frame).setScale((0.3 * size) / this.art.s);
      img.setAlpha(0.85);
      this.layers.rims.add(img);
      this.scene.tweens.add({
        targets: img,
        scale: (1.25 * size) / this.art.s,
        alpha: 0,
        delay: i * 140,
        duration: 700,
        ease: 'Sine.Out',
        onComplete: () => img.destroy(),
      });
    }
  }

  /**
   * Слово-звук (9.1.4): появляется над событием со смещением вверх и за 200 мс уходит
   * с героя и соседних льдин. Одновременно не больше трёх.
   */
  word(
    text: string,
    x: number,
    y: number,
    cell: number,
    opts: { small?: boolean; still?: boolean } = {},
  ): void {
    const ref = this.art.word(text, opts.small ? 34 : 46);
    while (this.words.length >= balance.anim.maxWords) {
      const old = this.words.shift();
      old?.img.destroy();
    }
    const img = this.scene.add.image(x, y, ref.texture, ref.frame);
    img.setOrigin(0.5, 0.5);
    this.layers.overlay.add(img);
    const base = 1 / this.art.s;
    const w: Word = { img, born: this.time };
    this.words.push(w);
    const life = balance.anim.wordLifeMs;
    if (opts.still) {
      img.setScale(base * 0.9);
      img.setAlpha(0);
      this.scene.tweens.add({ targets: img, alpha: 1, duration: 80 });
      this.scene.tweens.add({
        targets: img,
        alpha: 0,
        delay: life * 0.55,
        duration: life * 0.3,
        onComplete: () => this.drop(w),
      });
      return;
    }
    const rise = cell * 1.15;
    if (this.reducedMotion) {
      img.setScale(base);
      img.setPosition(x, y - rise);
      img.setAlpha(0);
      this.scene.tweens.add({ targets: img, alpha: 1, duration: 120 });
    } else {
      img.setScale(base * 0.45);
      img.setRotation((Math.random() - 0.5) * 0.18);
      // «Шлёпается»: перелёт и оседание, и за 200 мс — прочь с героя.
      this.scene.tweens.add({ targets: img, scale: base, duration: 180, ease: 'Back.Out' });
      this.scene.tweens.add({
        targets: img,
        y: y - rise,
        duration: balance.anim.wordCoverMs,
        ease: 'Quad.Out',
      });
    }
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      y: `-=${cell * 0.25}`,
      delay: life * 0.6,
      duration: life * 0.4,
      ease: 'Sine.In',
      onComplete: () => this.drop(w),
    });
  }

  private drop(w: Word): void {
    w.img.destroy();
    this.words = this.words.filter((x) => x !== w);
  }

  shake(px: number, ms: number = balance.anim.shakeMs): void {
    if (this.reducedMotion) return;
    this.shakePx = Math.max(this.shakePx * (this.shakeLeft > 0 ? 1 : 0), px);
    this.shakeLeft = ms;
  }

  punch(): void {
    if (this.reducedMotion) return;
    this.punchLeft = balance.anim.punchMs;
  }

  hitStop(): void {
    this.hitStopLeft = balance.anim.hitStopMs;
  }

  /** Хит-стоп замораживает только картинку мира (9.1.2). */
  get frozen(): boolean {
    return this.hitStopLeft > 0;
  }

  update(dtMs: number): { dx: number; dy: number; zoom: number } {
    this.time += dtMs;
    this.hitStopLeft = Math.max(0, this.hitStopLeft - dtMs);
    let dx = 0;
    let dy = 0;
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dtMs;
      const k = Math.max(0, this.shakeLeft / balance.anim.shakeMs);
      dx = (Math.random() * 2 - 1) * this.shakePx * k;
      dy = (Math.random() * 2 - 1) * this.shakePx * k;
    }
    let zoom = 1;
    if (this.punchLeft > 0) {
      this.punchLeft -= dtMs;
      const k = Math.max(0, this.punchLeft / balance.anim.punchMs);
      zoom = 1 + (balance.anim.punchZoom - 1) * Math.sin(Math.PI * (1 - k));
    }
    return { dx, dy, zoom };
  }

  destroy(): void {
    for (const w of this.words) w.img.destroy();
    for (const e of Object.values(this.emitters)) e.destroy();
  }
}
