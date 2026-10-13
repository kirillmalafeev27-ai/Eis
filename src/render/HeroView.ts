import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import { type WorldLayers, artImage, setArt } from './layers';
import type { Light } from './light';

/**
 * Герой (7.5.9): тот же искатель серии в зимнем. Части на шарнирах, позы сменяются
 * «на двойках» — 12 раз в секунду, отрывисто и с характером; движение по дуге — плавное.
 * Тень — тот же риг из размытых силуэтов, смещённый от солнца.
 */
interface Pose {
  lean: number;
  squash: number;
  lift: number;
  bodyRot: number;
  headRot: number;
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  scarf: number;
  jitter: number;
}

/** Герой чуть крупнее клетки-нормы, чтобы читался на телефоне. */
const HERO_SCALE = 1.15;

const REST: Pose = { lean: 0, squash: 1, lift: 0, bodyRot: 0, headRot: 0, armL: 0.15, armR: -0.1, legL: 0, legR: 0, scarf: 0, jitter: 0 };

type Mode = 'idle' | 'jump' | 'fall' | 'win' | 'cold' | 'trapped';

/** Положение шарниров (лицом вправо), мировые единицы; ноль — между ступнями. */
const RIG = {
  legL: { x: -6, y: -24 },
  legR: { x: 5, y: -24 },
  body: { x: 0, y: -19 },
  basket: { x: -15, y: -24 },
  tails: [
    { x: -24, y: -52, r: -0.35 },
    { x: -16, y: -54, r: -0.05 },
    { x: -9, y: -52, r: 0.25 },
  ],
  armL: { x: -11, y: -50 },
  armR: { x: 10, y: -50 },
  scarf: { x: 1, y: -55 },
  scarfTail: { x: -4, y: -56 },
  head: { x: 2, y: -56 },
  hat: { x: 1, y: -20 },
  icicles: { x: 1, y: -18 },
};

interface Rig {
  root: Phaser.GameObjects.Container;
  legL: Phaser.GameObjects.Image;
  legR: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  basket: Phaser.GameObjects.Image;
  tails: Phaser.GameObjects.Image[];
  armL: Phaser.GameObjects.Image;
  armR: Phaser.GameObjects.Image;
  scarf: Phaser.GameObjects.Image;
  scarfTail: Phaser.GameObjects.Image;
  headGroup: Phaser.GameObjects.Container;
  head: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  icicles: Phaser.GameObjects.Image;
}

export class HeroView {
  private readonly rig: Rig;
  private readonly shade: Rig;
  private readonly contact: Phaser.GameObjects.Image;
  private mode: Mode = 'idle';
  private modeT = 0;
  private time = 0;
  private facing = 1;
  private pos = { x: 0, y: 0 };
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private jumpMs = 1;
  private long = false;
  private landSquash = 0;
  private hatFloat: Phaser.GameObjects.Image | null = null;
  // состояние «самочувствия»
  thin = false;
  crackStage = 0;
  ready = false;
  warmth: number = balance.rules.warmth;
  private tailsShown = 0;
  private winPath: { x: number; y: number }[] = [];
  onStep: ((kind: 'land' | 'splash' | 'climb', x: number, y: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
  ) {
    this.shade = this.build(true);
    this.rig = this.build(false);
    this.contact = artImage(scene, art, K.glintSoft);
    this.layers.shadows.add(this.contact);
    this.layers.shadows.add(this.shade.root);
    this.layers.standing.add(this.rig.root);
    this.applyCondition();
  }

  private build(shadow: boolean): Rig {
    const k = (key: string) => (shadow ? K.shadow(key) : key);
    const img = (key: string, x: number, y: number) => {
      const i = artImage(this.scene, this.art, k(key), x, y);
      return i;
    };
    const legL = img(K.hero.legL, RIG.legL.x, RIG.legL.y);
    const legR = img(K.hero.legR, RIG.legR.x, RIG.legR.y);
    const basket = img(K.hero.basket, RIG.basket.x, RIG.basket.y);
    const tails = RIG.tails.map((t, i) => img(K.hero.tail(i), t.x, t.y).setRotation(t.r).setVisible(false));
    const armL = img(K.hero.armL, RIG.armL.x, RIG.armL.y);
    const body = img(K.hero.body, RIG.body.x, RIG.body.y);
    const scarfTail = img(K.hero.scarfTail, RIG.scarfTail.x, RIG.scarfTail.y);
    const scarf = img(K.hero.scarf, RIG.scarf.x, RIG.scarf.y);
    const head = img(K.hero.head, 0, 0);
    const hat = img(K.hero.hat, RIG.hat.x, RIG.hat.y);
    const icicles = img(K.hero.icicles, RIG.icicles.x, RIG.icicles.y).setVisible(false);
    const headGroup = this.scene.add.container(RIG.head.x, RIG.head.y, [head, icicles, hat]);
    const armR = img(K.hero.armR, RIG.armR.x, RIG.armR.y);
    const root = this.scene.add.container(0, 0, [armL, basket, ...tails, legL, legR, body, scarfTail, scarf, headGroup, armR]);
    return { root, legL, legR, body, basket, tails, armL, armR, scarf, scarfTail, headGroup, head, hat, icicles };
  }

  // ───────────────────────────── команды ─────────────────────────────

  place(x: number, y: number): void {
    this.pos = { x, y };
    if (this.mode !== 'jump') this.from = this.to = { x, y };
  }

  setFacingToward(x: number): void {
    if (Math.abs(x - this.pos.x) > 4) this.facing = x < this.pos.x ? -1 : 1;
  }

  /** Прыжок: присед на 2 кадра, дуга, растяжка в полёте, приплющивание при приземлении. */
  jump(from: { x: number; y: number }, to: { x: number; y: number }, long: boolean): void {
    // Если прыжок созрел во время падения, вид обрывает его и показывает прыжок (2.3.5).
    this.hatFloat?.destroy();
    this.hatFloat = null;
    this.from = this.mode === 'jump' ? { ...this.pos } : from;
    this.to = to;
    this.long = long;
    this.jumpMs = long ? balance.anim.longJumpMs : balance.anim.jumpMs;
    if (Math.abs(to.x - from.x) > 4) this.facing = to.x < from.x ? -1 : 1;
    this.setMode('jump');
  }

  /** Падение: всплеск, из воды торчит шапка, герой выкарабкивается на обломок (400 мс). */
  fall(): void {
    this.setMode('fall');
    this.onStep?.('splash', this.pos.x, this.pos.y);
    this.hatFloat?.destroy();
    this.hatFloat = artImage(this.scene, this.art, K.hero.hat, this.pos.x, this.pos.y + 2);
    this.layers.standing.add(this.hatFloat);
    this.hatFloat.setDepth(this.pos.y + 1);
  }

  win(path: { x: number; y: number }[]): void {
    this.winPath = path;
    this.setMode('win');
  }

  lose(kind: 'cold' | 'trapped'): void {
    this.setMode(kind === 'cold' ? 'cold' : 'trapped');
  }

  setTails(n: number): void {
    this.tailsShown = n;
    this.applyCondition();
  }

  setWarmth(w: number): void {
    this.warmth = w;
    this.applyCondition();
  }

  private applyCondition(): void {
    for (const r of [this.rig, this.shade]) {
      r.tails.forEach((t, i) => t.setVisible(i < this.tailsShown));
      // После второго падения — сосульки на шапке и синий нос (6, 7.5.9).
      r.icicles.setVisible(this.warmth <= 1);
    }
    setArt(this.rig.head, this.art, this.warmth <= 1 ? K.hero.headCold : K.hero.head);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
  }

  /** Где сейчас голова — для пара изо рта и слов. */
  headPoint(): { x: number; y: number } {
    return { x: this.rig.root.x + 8 * this.facing * HERO_SCALE, y: this.rig.root.y - 70 * HERO_SCALE };
  }

  mouthPoint(): { x: number; y: number } {
    return { x: this.rig.root.x + 16 * this.facing * HERO_SCALE, y: this.rig.root.y - 66 * HERO_SCALE };
  }

  basketPoint(): { x: number; y: number } {
    return { x: this.rig.root.x - 15 * this.facing * HERO_SCALE, y: this.rig.root.y - 52 * HERO_SCALE };
  }

  get x(): number {
    return this.rig.root.x;
  }

  get y(): number {
    return this.rig.root.y;
  }

  isBusy(): boolean {
    return this.mode === 'jump' || this.mode === 'fall';
  }

  // ───────────────────────────── кадр ─────────────────────────────

  update(dtMs: number, light: Light, reducedMotion: boolean, frozen: boolean): void {
    if (!frozen) {
      this.time += dtMs;
      this.modeT += dtMs;
    }
    let x = this.pos.x;
    let y = this.pos.y;
    let pose: Pose;
    const tq = Math.floor((this.time / 1000) * balance.anim.posesPerSecond) / balance.anim.posesPerSecond;
    switch (this.mode) {
      case 'jump': {
        const crouchMs = (balance.anim.crouchFrames * 1000) / (balance.anim.posesPerSecond * 2);
        const t = this.modeT;
        if (t < crouchMs) {
          pose = { ...REST, squash: 0.84, lean: 0.12 * this.facing, armL: 0.7, armR: 0.6 };
          x = this.from.x;
          y = this.from.y;
        } else {
          const k = Math.min(1, (t - crouchMs) / Math.max(1, this.jumpMs - crouchMs));
          const h = (this.long ? 0.62 : 0.36) * 128;
          x = this.from.x + (this.to.x - this.from.x) * k;
          y = this.from.y + (this.to.y - this.from.y) * k - Math.sin(Math.PI * k) * h;
          pose = this.long
            ? { ...REST, squash: 1.1, armL: 1.9, armR: -1.9, legL: 0.5, legR: -0.4, scarf: -0.6 }
            : { ...REST, squash: 1.08, armL: 1.2, armR: -0.9, legL: 0.35, legR: -0.3, scarf: -0.4 };
          if (k >= 1) {
            this.pos = { ...this.to };
            this.landSquash = 1;
            this.setMode('idle');
            this.onStep?.('land', this.to.x, this.to.y);
          }
        }
        break;
      }
      case 'fall': {
        const t = this.modeT;
        const climb = balance.anim.fallClimbMs;
        if (t < 260) {
          // ушёл под воду — видна только шапка
          pose = { ...REST, squash: 0.25, lift: 30 };
          this.rig.root.setAlpha(0);
        } else if (t < 260 + climb) {
          const k = (t - 260) / climb;
          pose = { ...REST, squash: 0.6 + 0.4 * k, armL: 2.4 - k * 2, armR: -2.2 + k * 2, lean: -0.15 * this.facing };
          this.rig.root.setAlpha(1);
          if (this.hatFloat) {
            this.hatFloat.destroy();
            this.hatFloat = null;
            this.onStep?.('climb', x, y);
          }
        } else if (t < 260 + climb + 300) {
          // отряхивается
          const shake = Math.sin(tq * 60) * 0.18;
          pose = { ...REST, lean: shake, armL: 0.5 + shake, armR: -0.4 - shake, headRot: -shake };
        } else {
          this.setMode('idle');
          pose = this.idlePose(tq, reducedMotion);
        }
        break;
      }
      case 'win': {
        const t = this.modeT;
        const path = this.winPath;
        if (t < 900 || path.length < 2) {
          // машет
          pose = { ...REST, armR: -2.6 + Math.sin(tq * 14) * 0.45, armL: 0.3, headRot: -0.1 };
        } else {
          const k = Math.min(1, (t - 900) / 1100);
          const a = path[0];
          const b = path[path.length - 1];
          x = a.x + (b.x - a.x) * k;
          y = a.y + (b.y - a.y) * k;
          this.facing = b.x < a.x ? -1 : 1;
          const step = Math.sin(tq * 20);
          pose = { ...REST, lean: 0.15 * this.facing, legL: step * 0.6, legR: -step * 0.6, armL: -step * 0.8, armR: step * 0.8, lift: Math.abs(step) * -3 };
          if (k >= 1) this.pos = { ...b };
          else this.pos = { x, y };
        }
        break;
      }
      case 'cold': {
        // сидит на обломке, кутается в шарф, зуб на зуб не попадает
        pose = { ...REST, squash: 0.78, armL: -1.1, armR: 1.0, headRot: 0.12, jitter: reducedMotion ? 0 : 1.2, scarf: 0.3 };
        break;
      }
      case 'trapped': {
        // разводит руками
        pose = { ...REST, armL: 1.6, armR: -1.6, headRot: 0.15 * Math.sin(tq * 3), lean: 0 };
        break;
      }
      default:
        pose = this.idlePose(tq, reducedMotion);
    }
    // Приплющивание при приземлении — короткая пружина.
    if (this.landSquash > 0) {
      pose.squash *= 1 - 0.18 * this.landSquash;
      this.landSquash = Math.max(0, this.landSquash - dtMs / 160);
    }
    this.applyPose(this.rig, pose, x, y, tq);
    this.applyPose(this.shade, pose, x + light.shadow.x, y + light.shadow.y, tq);
    this.shade.root.setAlpha(this.mode === 'fall' && this.modeT < 260 ? 0 : light.shadowAlpha);
    this.tintShadow(light.shadowTint);
    this.rig.root.setDepth(y);
    this.contact.setPosition(x, y + 1);
    this.contact.setScale(0.9 / this.art.s, 0.32 / this.art.s);
    this.contact.setTint(light.shadowTint);
    this.contact.setAlpha(this.mode === 'jump' ? 0.15 : 0.45);
    if (this.hatFloat) {
      this.hatFloat.y = this.pos.y + Math.sin(this.time / 120) * 2;
    }
  }

  private idlePose(tq: number, reducedMotion: boolean): Pose {
    const calm = reducedMotion ? 0.4 : 1;
    if (this.crackStage >= 3) {
      // размахивает руками и смотрит вниз
      const w = Math.sin(tq * 16);
      return { ...REST, armL: 1.6 + w * 0.9, armR: -1.6 - w * 0.9, headRot: 0.32, lean: w * 0.05 * calm, jitter: 0.6 * calm };
    }
    if (this.ready) {
      // притоптывает и смотрит на игрока
      const st = Math.floor(tq * 4) % 2;
      return { ...REST, legL: st ? -0.25 : 0, legR: st ? 0 : 0.25, lift: st ? -2 * calm : 0, headRot: -0.12, armR: -0.4 };
    }
    if (this.thin) {
      // пружинит, руки в стороны
      const b = Math.sin(tq * 9);
      return { ...REST, squash: 1 + b * 0.035 * calm, armL: 1.15 + b * 0.12, armR: -1.1 - b * 0.12, lean: Math.sin(tq * 2.3) * 0.04 * calm };
    }
    // балансирует и переминается
    const shift = Math.sin(tq * 2.1);
    const pose: Pose = { ...REST, lean: shift * 0.035 * calm, armL: 0.18 + shift * 0.08, armR: -0.12 - shift * 0.08, headRot: Math.sin(tq * 1.3) * 0.05 };
    if (this.warmth <= 1) pose.jitter = reducedMotion ? 0 : 0.9; // дрожит
    return pose;
  }

  private applyPose(r: Rig, p: Pose, x: number, y: number, tq: number): void {
    const key = Math.round(tq * 1000);
    const jitter = p.jitter ? (((key * 7919) % 7) / 3 - 1) * p.jitter : 0;
    r.root.setPosition(x + jitter, y + p.lift);
    r.root.setScale((HERO_SCALE * this.facing) / Math.sqrt(p.squash), HERO_SCALE * p.squash);
    r.root.setRotation(p.lean);
    r.body.setRotation(p.bodyRot);
    r.headGroup.setRotation(p.headRot);
    r.armL.setRotation(p.armL);
    r.armR.setRotation(p.armR);
    r.legL.setRotation(p.legL);
    r.legR.setRotation(p.legR);
    const flutter = Math.sin(tq * 11) * 0.22 + Math.sin(tq * 4.3) * 0.1;
    r.scarfTail.setRotation(p.scarf + flutter);
  }

  private tintShadow(tint: number): void {
    const walk = (c: Phaser.GameObjects.Container) => {
      for (const ch of c.list) {
        if (ch instanceof Phaser.GameObjects.Container) walk(ch);
        else (ch as Phaser.GameObjects.Image).setTint(tint);
      }
    };
    walk(this.shade.root);
  }

  destroy(): void {
    this.rig.root.destroy();
    this.shade.root.destroy();
    this.contact.destroy();
    this.hatFloat?.destroy();
  }
}
