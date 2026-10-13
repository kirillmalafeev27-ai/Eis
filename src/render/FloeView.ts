import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { DEBRIS_VARIANTS, FLOE_VARIANTS, K } from '../art/manifest';
import { FLOE_CANVAS } from '../art/recipes/ice';
import { balance } from '../config/balance';
import { hex, palette } from '../config/palette';
import { aOf, isFloe, lOf } from '../core/grid';
import { jumpTargets } from '../core/jumps';
import type { GameState } from '../core/state';
import { ctx2d, makeCanvas, mulberry32, wetStain } from '../shared/paperKit';
import { type CrackLine, crackGeometry, cutPieces, drawCracks } from './cracks';
import { type WorldLayers, artImage, cellHash } from './layers';
import type { Light } from './light';
import type { Orientation } from './orientation';

/**
 * Льдины (7.5.2–7.5.5): покачиваются, досягаемые приподняты (тень длиннее),
 * под героем растут трещины, тающие темнеют от краёв. Только читает состояние.
 */
type Kind = 'thin' | 'thick' | 'debris';

interface Floe {
  cell: number;
  kind: Kind;
  key: string;
  body: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  rim: Phaser.GameObjects.Image;
  foam: Phaser.GameObjects.Image;
  phase: number;
  bobAmp: number;
  lift: number;
  sag: number;
  sagVel: number;
  tilt: number;
  wet: WetOverlay | null;
  crack: CrackOverlay | null;
  pieces: Phaser.GameObjects.Image[];
  dying: boolean;
  appear: number;
  /** Своя неправильность экземпляра: поворот, размер, сдвиг в клетке. */
  rot: number;
  size: number;
  ox: number;
  oy: number;
}

interface WetOverlay {
  key: string;
  a: Phaser.GameObjects.Image;
  b: Phaser.GameObjects.Image;
  start: number;
  end: number;
  frames: number;
}

interface CrackOverlay {
  key: string;
  tex: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
  lines: CrackLine[];
  stage: number;
  seed: number;
}

const WET_FRAMES = 6;

export class FloeView {
  private readonly floes = new Map<number, Floe>();
  private orient: Orientation | null = null;
  private serial = 0;
  private reach = new Set<number>();
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private readonly layers: WorldLayers,
    private readonly seed: number,
  ) {}

  setOrientation(o: Orientation, s: GameState): void {
    this.orient = o;
    for (const f of this.floes.values()) this.place(f, true);
    this.sync(s);
  }

  private variantKey(kind: Kind, cell: number): string {
    const h = cellHash(this.seed, cell, kind === 'thick' ? 2 : kind === 'debris' ? 3 : 1);
    if (kind === 'thick') return K.thick(Math.floor(h * FLOE_VARIANTS));
    if (kind === 'debris') return K.debris(Math.floor(h * DEBRIS_VARIANTS));
    return K.thin(Math.floor(h * FLOE_VARIANTS));
  }

  private create(cell: number, kind: Kind, appear: boolean): Floe {
    const key = this.variantKey(kind, cell);
    const foam = artImage(this.scene, this.art, K.foam(key));
    const rim = artImage(this.scene, this.art, K.rim(key));
    const img = artImage(this.scene, this.art, key);
    img.setPosition(0, 0);
    const body = this.scene.add.container(0, 0, [img]);
    this.layers.rims.add(foam);
    this.layers.rims.add(rim);
    this.layers.floes.add(body);
    const f: Floe = {
      cell,
      kind,
      key,
      body,
      img,
      rim,
      foam,
      phase: cellHash(this.seed, cell, 7) * Math.PI * 2,
      bobAmp: kind === 'thick' ? balance.anim.floeBobThickPx : balance.anim.floeBobPx,
      lift: 0,
      sag: 0,
      sagVel: 0,
      tilt: 0,
      wet: null,
      crack: null,
      pieces: [],
      dying: false,
      appear: appear ? 0 : 1,
      rot: (cellHash(this.seed, cell, 11) - 0.5) * (kind === 'thick' ? 0.12 : 0.22),
      size: (kind === 'debris' ? 0.95 : 0.9) + cellHash(this.seed, cell, 13) * 0.1,
      ox: (cellHash(this.seed, cell, 17) - 0.5) * 8,
      oy: (cellHash(this.seed, cell, 19) - 0.5) * 6,
    };
    rim.setRotation(f.rot);
    rim.setScale(f.size / this.art.s);
    foam.setRotation(f.rot);
    foam.setScale(f.size / this.art.s);
    this.floes.set(cell, f);
    this.place(f, true);
    return f;
  }

  private kindOf(s: GameState, cell: number): Kind | null {
    const k = s.grid.cells[cell];
    if (!isFloe(k)) return null;
    if (s.debris[cell]) return 'debris';
    return k === 'thick' ? 'thick' : 'thin';
  }

  /** Привести спрайты к состоянию: появились обломки, исчезли утонувшие льдины. */
  sync(s: GameState): void {
    if (!this.orient) return;
    for (let c = 0; c < s.grid.cells.length; c++) {
      const kind = this.kindOf(s, c);
      const f = this.floes.get(c);
      if (kind && !f) this.create(c, kind, s.time > 0);
      else if (kind && f && f.kind !== kind && !f.dying) {
        this.sink(f, 'quiet');
        this.create(c, kind, true);
      } else if (!kind && f && !f.dying) this.sink(f, 'quiet');
    }
    this.reach = new Set(jumpTargets(s.grid, s.hero.cell).map((j) => j.to));
  }

  // ───────────────────────────── события ─────────────────────────────

  /** Герой приземлился: льдина проседает и качается. */
  landed(cell: number, kind: 'thin' | 'thick' | 'debris' | 'near' | 'far'): void {
    const f = this.floes.get(cell);
    if (!f) return;
    f.sagVel += kind === 'thick' ? 60 : 140;
    this.startCracks(f);
  }

  private startCracks(f: Floe): void {
    this.clearCracks(f);
    const art = this.art.floe(f.key);
    if (!art) return;
    const s = this.art.s;
    const key = `crack-${++this.serial}`;
    const tex = this.scene.textures.createCanvas(key, art.canvas.width, art.canvas.height);
    if (!tex) return;
    const seed = (this.seed ^ (f.cell * 7919) ^ this.serial) >>> 0;
    const center = { x: FLOE_CANVAS.cx * s, y: FLOE_CANVAS.cy * s };
    const lines = crackGeometry(mulberry32(seed), art.top, center, s);
    const img = this.scene.add.image(0, 0, key);
    img.setOrigin(0.5, FLOE_CANVAS.cy / FLOE_CANVAS.h);
    img.setScale(1 / s);
    f.body.add(img);
    f.crack = { key, tex, img, lines, stage: 0, seed };
  }

  private clearCracks(f: Floe): void {
    if (!f.crack) return;
    f.crack.img.destroy();
    this.scene.textures.remove(f.crack.key);
    f.crack = null;
  }

  /** Стадия трещин 1–3 растёт; 4 — раскол на куски, которые чуть расходятся. */
  crackStage(cell: number, stage: number): void {
    const f = this.floes.get(cell);
    if (!f || !f.crack) return;
    const art = this.art.floe(f.key);
    if (!art) return;
    if (stage <= 3) {
      f.crack.stage = stage;
      drawCracks(
        f.crack.tex.canvas,
        art.top,
        f.crack.lines,
        stage,
        mulberry32(f.crack.seed + stage),
        this.art.s,
      );
      f.crack.tex.refresh();
      f.sagVel += 30 * stage;
      return;
    }
    this.split(f, 3, balance.anim.splitDriftPx);
  }

  private split(f: Floe, count: number, drift: number): void {
    if (!f.crack || f.pieces.length) return;
    const src = this.art.canvasOf(f.key);
    if (!src) return;
    const s = this.art.s;
    const center = { x: FLOE_CANVAS.cx * s, y: FLOE_CANVAS.cy * s };
    const pieces = cutPieces(
      src,
      f.crack.tex.canvas,
      f.crack.lines,
      center,
      mulberry32(f.crack.seed + 99),
      s,
      count,
    );
    if (!pieces.length) return;
    f.img.setVisible(false);
    f.crack.img.setVisible(false);
    pieces.forEach((p, i) => {
      const key = `piece-${++this.serial}`;
      this.scene.textures.addCanvas(key, p.canvas);
      const img = this.scene.add.image(0, 0, key);
      img.setOrigin(0.5, FLOE_CANVAS.cy / FLOE_CANVAS.h);
      img.setScale(1 / s);
      img.setData('tex', key);
      f.body.add(img);
      f.pieces.push(img);
      this.scene.tweens.add({
        targets: img,
        x: p.dir.x * drift,
        y: p.dir.y * drift,
        rotation: (i % 2 ? 1 : -1) * 0.05,
        duration: 260,
        ease: 'Back.Out',
      });
    });
  }

  /**
   * Утопить льдину. 'left' — покинутая героем (раскол и уход под воду за 300 мс),
   * 'melt' — растворяется с пузырями, 'break' — развал под героем, 'quiet' — без шума.
   */
  sink(
    f: Floe | number,
    mode: 'left' | 'melt' | 'break' | 'quiet',
    onBubble?: (x: number, y: number) => void,
  ): void {
    const floe = typeof f === 'number' ? this.floes.get(f) : f;
    if (!floe || floe.dying) return;
    floe.dying = true;
    this.floes.delete(floe.cell);
    const dur = mode === 'melt' ? balance.anim.meltSinkMs : mode === 'break' ? 420 : balance.anim.floeSinkMs;
    if ((mode === 'left' || mode === 'break') && !floe.pieces.length) {
      if (!floe.crack) this.startCracks(floe);
      const art = this.art.floe(floe.key);
      if (floe.crack && art) {
        drawCracks(
          floe.crack.tex.canvas,
          art.top,
          floe.crack.lines,
          3,
          mulberry32(floe.crack.seed + 3),
          this.art.s,
        );
        floe.crack.tex.refresh();
      }
      this.split(floe, mode === 'left' ? 2 : 3, mode === 'left' ? 6 : balance.anim.splitDriftPx);
    }
    const targets = floe.pieces.length ? floe.pieces : [floe.img, ...(floe.crack ? [floe.crack.img] : [])];
    const dark = Phaser.Display.Color.ValueToColor(hex(palette.water.mid));
    const white = Phaser.Display.Color.ValueToColor(0xffffff);
    for (const t of targets) {
      const tw = this.scene.tweens.add({
        targets: t,
        scaleY: (1 / this.art.s) * (mode === 'melt' ? 0.92 : 0.55),
        scaleX: (1 / this.art.s) * (mode === 'melt' ? 0.92 : 0.86),
        rotation: t.rotation + (mode === 'melt' ? 0 : (Math.random() - 0.5) * 0.5),
        alpha: 0,
        duration: dur,
        ease: mode === 'melt' ? 'Sine.In' : 'Quad.In',
        onUpdate: () => {
          const k = Math.round(tw.progress * 100);
          const c = Phaser.Display.Color.Interpolate.ColorWithColor(white, dark, 100, k);
          (t as Phaser.GameObjects.Image).setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        },
      });
    }
    this.scene.tweens.add({ targets: [floe.rim, floe.foam], alpha: 0, duration: dur * 0.8 });
    if (onBubble) {
      const p = floe.body;
      onBubble(p.x, p.y);
    }
    this.scene.time.delayedCall(dur + 30, () => this.destroyFloe(floe));
  }

  private destroyFloe(f: Floe): void {
    this.clearCracks(f);
    for (const p of f.pieces) {
      const key = p.getData('tex') as string | undefined;
      p.destroy();
      if (key) this.scene.textures.remove(key);
    }
    if (f.wet) {
      f.wet.a.destroy();
      f.wet.b.destroy();
      this.scene.textures.remove(f.wet.key);
    }
    f.body.destroy();
    f.rim.destroy();
    f.foam.destroy();
  }

  /** Намокание (7.5.5): тёмное пятно растёт от краёв к центру, льдина чуть проседает. */
  wet(cell: number, start: number, end: number): void {
    const f = this.floes.get(cell);
    if (!f || f.wet) return;
    const art = this.art.floe(f.key);
    if (!art) return;
    const w = art.canvas.width;
    const h = art.canvas.height;
    const sheet = makeCanvas(w * WET_FRAMES, h);
    const ctx = ctx2d(sheet);
    const rng = mulberry32(this.seed ^ cell);
    for (let i = 0; i < WET_FRAMES; i++) {
      const frame = makeCanvas(w, h);
      // Пятно ложится и на бока толстой льдины, чтобы намокание было видно целиком.
      wetStain(ctx2d(frame), art.full, (i + 1) / WET_FRAMES, palette.wet, rng);
      wetStain(ctx2d(frame), art.top, (i + 1) / WET_FRAMES, palette.wet, rng);
      ctx.drawImage(frame, i * w, 0);
    }
    const key = `wet-${++this.serial}`;
    const tex = this.scene.textures.addCanvas(key, sheet);
    if (!tex) return;
    for (let i = 0; i < WET_FRAMES; i++) tex.add(String(i), 0, i * w, 0, w, h);
    const mk = () => {
      const img = this.scene.add.image(0, 0, key, '0');
      img.setOrigin(0.5, FLOE_CANVAS.cy / FLOE_CANVAS.h);
      img.setScale(1 / this.art.s);
      img.setAlpha(0);
      f.body.add(img);
      return img;
    };
    f.wet = { key, a: mk(), b: mk(), start, end, frames: WET_FRAMES };
  }

  /** Для отладки и тестов: что сейчас нарисовано на льдинах. */
  debugInfo(): { floes: number; cracks: { cell: number; stage: number; visible: boolean }[]; wet: number[] } {
    const cracks: { cell: number; stage: number; visible: boolean }[] = [];
    const wet: number[] = [];
    for (const f of this.floes.values()) {
      if (f.crack) cracks.push({ cell: f.cell, stage: f.crack.stage, visible: f.crack.img.visible });
      if (f.wet) wet.push(f.cell);
    }
    return { floes: this.floes.size, cracks, wet };
  }

  heroFloePieces(cell: number): boolean {
    return (this.floes.get(cell)?.pieces.length ?? 0) > 0;
  }

  floeAt(cell: number): Floe | undefined {
    return this.floes.get(cell);
  }

  // ───────────────────────────── кадр ─────────────────────────────

  private place(f: Floe, snap: boolean): void {
    const o = this.orient;
    if (!o) return;
    const p = o.toWorld(Math.floor(f.cell / o.length), f.cell % o.length);
    f.body.setPosition(p.x, p.y);
    f.foam.setPosition(p.x, p.y);
    if (snap) f.rim.setPosition(p.x, p.y);
  }

  update(dtMs: number, s: GameState, light: Light, reducedMotion: boolean, frozen: boolean): void {
    const o = this.orient;
    if (!o) return;
    if (!frozen) this.time += dtMs;
    const t = this.time / 1000;
    const dt = Math.min(0.05, dtMs / 1000);
    const lifting = s.status === 'playing';
    for (const f of this.floes.values()) {
      const p = o.toWorld(aOf(s.grid, f.cell), lOf(s.grid, f.cell));
      // Покачивание: тонкие сильнее толстых; на «меньше движения» — тише.
      const amp = reducedMotion ? f.bobAmp * 0.3 : f.bobAmp;
      const bob = Math.sin((t * Math.PI * 2 * 1000) / balance.anim.floeBobMs + f.phase) * amp;
      const roll =
        Math.sin((t * Math.PI * 2 * 1000) / (balance.anim.floeBobMs * 1.37) + f.phase * 1.3) * amp * 0.006;
      // Досягаемые приподняты.
      const wantLift = lifting && this.reach.has(f.cell) ? balance.anim.reachLiftPx : 0;
      f.lift += (wantLift - f.lift) * Math.min(1, dt * 10);
      // Просадка — пружина.
      f.sagVel += (-f.sag * 90 - f.sagVel * 9) * dt;
      f.sag += f.sagVel * dt;
      let wetSag = 0;
      if (f.wet) {
        const k = Math.max(0, Math.min(1, (s.time - f.wet.start) / Math.max(1, f.wet.end - f.wet.start)));
        wetSag = balance.anim.wetSagPx * k;
        const pos = k * f.wet.frames;
        const i0 = Math.min(f.wet.frames - 1, Math.floor(pos));
        const frac = pos - Math.floor(pos);
        f.wet.a.setFrame(String(Math.max(0, i0 - 1)));
        f.wet.a.setAlpha(i0 === 0 ? 0 : 1);
        f.wet.b.setFrame(String(i0));
        f.wet.b.setAlpha(Math.min(1, frac + (i0 === 0 ? 0 : 0)));
        if (k >= 0.999) f.wet.b.setAlpha(1);
      }
      if (f.appear < 1) f.appear = Math.min(1, f.appear + dt * 4);
      const x = p.x + f.ox;
      const y = p.y + f.oy + bob + f.sag + wetSag - f.lift;
      f.body.setPosition(x, y);
      f.body.rotation = roll + f.rot;
      const ap = f.appear;
      f.body.setScale(f.size, f.size * (0.6 + 0.4 * ap));
      if (!f.dying) f.body.setAlpha(0.4 + 0.6 * ap);
      f.foam.setPosition(x, p.y + f.oy + bob * 0.4);
      // Тёмная кромка — с той же стороны, что тени; приподнятая льдина — тень длиннее.
      const rimLen = 0.18 + (f.lift / balance.anim.reachLiftPx) * 0.22;
      f.rim.setPosition(x + light.shadow.x * rimLen + 1.5, y + light.shadow.y * rimLen + 3 + f.lift * 0.6);
      f.rim.setTint(light.shadowTint);
      if (!f.dying) f.rim.setAlpha(0.55 + light.shadowAlpha);
    }
  }

  /** Центр льдины в мире сейчас (с покачиванием) — для героя и эффектов. */
  surfaceAt(cell: number): { x: number; y: number } | null {
    const f = this.floes.get(cell);
    if (!f) return null;
    return { x: f.body.x, y: f.body.y };
  }

  destroy(): void {
    for (const f of this.floes.values()) this.destroyFloe(f);
    this.floes.clear();
  }
}
