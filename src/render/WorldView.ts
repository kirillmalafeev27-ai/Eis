import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import { K } from '../art/manifest';
import { balance } from '../config/balance';
import type { HintMode } from '../config/levels';
import type { GameEvent } from '../core/events';
import { aOf, isFloe, lOf } from '../core/grid';
import { isReady, meltStrengthOf } from '../core/rules';
import type { GameState } from '../core/state';
import type { SfxWord } from '../i18n/sfx.de';
import { BankView } from './BankView';
import { FishView } from './FishView';
import { FloeView } from './FloeView';
import { HeroView } from './HeroView';
import { HintsView } from './HintsView';
import { Juice } from './juice';
import { type WorldLayers, artImage, cellHash, createLayers, destroyLayers } from './layers';
import { type Light, lightFor } from './light';
import type { Orientation } from './orientation';
import { SunAndGrade } from './SunAndGrade';
import { WaterView } from './WaterView';

export type SoundName =
  | 'hop'
  | 'hui'
  | 'landThin'
  | 'landThick'
  | 'crack1'
  | 'crack2'
  | 'crack3'
  | 'split'
  | 'tick'
  | 'sinkSmall'
  | 'drip'
  | 'blubb'
  | 'catch'
  | 'fishLost'
  | 'flop'
  | 'denied'
  | 'trapped'
  | 'krach'
  | 'splash'
  | 'shiver'
  | 'cold'
  | 'win'
  | 'rumble'
  | 'start';

export interface WorldOptions {
  hints: HintMode;
  reducedMotion: boolean;
  lowQuality: boolean;
  filters: boolean;
  word: (w: SfxWord) => string;
  sound: (name: SoundName, worldX: number) => void;
  /** Рыба поймана: точка в мире, откуда она летит в DOM-корзину. */
  fishToBasket: (index: number, worldX: number, worldY: number) => void;
}

/**
 * Мир «Льдин»: вода, льдины, берега, герой, рыбы, подсказки, свет и сочность.
 * Только читает состояние и реагирует на события (0.3).
 */
export class WorldView {
  readonly layers: WorldLayers;
  private readonly water: WaterView;
  private readonly floes: FloeView;
  private readonly banks: BankView;
  readonly hero: HeroView;
  private readonly fish: FishView;
  private readonly hints: HintsView;
  readonly juice: Juice;
  readonly grade: SunAndGrade;
  private orient: Orientation | null = null;
  private light: Light;
  private time = 0;
  private lastZappel = -Infinity;
  private nextRumble = 0;
  private nextCrow = 0;
  private nextBreath = 0;
  private nextDrip = 0;
  private crow: Phaser.GameObjects.Image | null = null;
  private glints: {
    img: Phaser.GameObjects.Image;
    phase: number;
    speed: number;
    cell: number;
    dx: number;
    dy: number;
    water: boolean;
  }[] = [];
  private flash: Phaser.GameObjects.Rectangle | null = null;
  private lastFlashAt = -Infinity;
  private ended = false;
  attract = false;
  /** Сила ледохода для заставки и теста контраста; null — по времени раунда. */
  forcedStrength: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtFactory,
    private state: GameState,
    private opts: WorldOptions,
    camera: Phaser.Cameras.Scene2D.Camera,
  ) {
    this.layers = createLayers(scene);
    this.light = lightFor(0, balance.layout.cellPx);
    this.water = new WaterView(scene, art, this.layers.water, opts.lowQuality);
    this.floes = new FloeView(scene, art, this.layers, state.seed);
    this.banks = new BankView(scene, art, this.layers, state.seed, opts.lowQuality);
    this.hero = new HeroView(scene, art, this.layers);
    this.fish = new FishView(scene, art, this.layers, state, state.seed);
    this.hints = new HintsView(scene, art, this.layers, opts.hints);
    this.juice = new Juice(scene, art, this.layers);
    this.juice.reducedMotion = opts.reducedMotion;
    this.juice.lowQuality = opts.lowQuality;
    this.grade = new SunAndGrade(scene, art, this.layers, camera);
    this.grade.setMode(opts.filters);
    this.nextRumble = balance.anim.rumbleMinMs;
    this.nextCrow = balance.anim.crowMinGapMs * (0.4 + Math.random() * 0.6);
    this.hero.onStep = (kind, x, y) => {
      if (kind === 'splash') {
        this.juice.burst('splash', x, y - 8, 16);
        this.juice.ripple(x, y, 1.3);
      } else if (kind === 'climb') {
        this.juice.burst('splash', x, y - 10, 6);
      }
    };
    this.fish.onFlop = (i, x, y) => {
      const f = this.state.fish[i];
      if (!f || f.status !== 'waiting') return;
      this.opts.sound('flop', x);
      if (this.nearWater(f.cell)) this.juice.burst('splash', x, y + 6, 4);
      if (this.time - this.lastZappel >= balance.anim.zappelMinGapMs && !this.attract) {
        this.lastZappel = this.time;
        this.say('zappel', x, y - 10, f.cell, true);
      }
    };
    this.buildGlints();
  }

  setOptions(opts: Partial<WorldOptions>): void {
    this.opts = { ...this.opts, ...opts };
    if (opts.hints) this.hints.setMode(opts.hints);
    if (opts.reducedMotion !== undefined) this.juice.reducedMotion = opts.reducedMotion;
    if (opts.filters !== undefined) this.grade.setMode(opts.filters);
  }

  setOrientation(o: Orientation, s: GameState): void {
    this.orient = o;
    this.state = s;
    this.water.setOrientation(o);
    this.floes.setOrientation(o, s);
    this.banks.setOrientation(o, s);
    this.fish.setOrientation(o);
    this.hints.setOrientation(o);
    const p = this.cellPoint(s, s.hero.cell);
    this.hero.place(p.x, p.y);
    this.placeGlints();
  }

  private cellPoint(s: GameState, cell: number): { x: number; y: number } {
    const surf = this.floes.surfaceAt(cell);
    if (surf) return surf;
    const o = this.orient;
    if (!o) return { x: 0, y: 0 };
    return o.toWorld(aOf(s.grid, cell), lOf(s.grid, cell));
  }

  private nearWater(cell: number): boolean {
    const g = this.state.grid;
    const a = aOf(g, cell);
    const l = lOf(g, cell);
    for (const [da, dl] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const aa = a + da;
      const ll = l + dl;
      if (aa < 0 || ll < 0 || aa >= g.height || ll >= g.length) continue;
      if (g.cells[aa * g.length + ll] === 'water') return true;
    }
    return false;
  }

  private say(w: SfxWord, x: number, y: number, _cell: number, small = false): void {
    if (!this.orient) return;
    this.juice.word(this.opts.word(w), x, y, this.orient.cell, { small });
  }

  /** Слово у ног героя (отсчёт). */
  private sayAtFeet(w: SfxWord): void {
    if (!this.orient) return;
    this.juice.word(this.opts.word(w), this.hero.x, this.hero.y + this.orient.cell * 0.18, this.orient.cell, {
      small: true,
      still: true,
    });
  }

  // ───────────────────────────── события ─────────────────────────────

  onEvents(events: GameEvent[], s: GameState): void {
    this.state = s;
    const o = this.orient;
    if (!o) return;
    const c = o.cell;
    for (const e of events) {
      switch (e.type) {
        case 'JUMP': {
          const from = { x: this.hero.x, y: this.hero.y };
          const to = this.cellPoint(s, e.to);
          this.hero.jump(from, to, e.long);
          this.opts.sound(e.long ? 'hui' : 'hop', from.x);
          this.say(e.long ? 'hui' : 'hop', from.x, from.y - c * 0.55, e.from);
          break;
        }
        case 'LANDED': {
          this.floes.landed(e.cell, e.kind);
          const p = this.cellPoint(s, e.cell);
          if (e.kind === 'thin' || e.kind === 'debris') {
            this.opts.sound('landThin', p.x);
            this.juice.shake(balance.anim.shakeThinPx);
            this.juice.ripple(p.x, p.y + 10, 1);
            this.say('knack', p.x, p.y - c * 0.6, e.cell, true);
          } else if (e.kind === 'thick') {
            this.opts.sound('landThick', p.x);
            this.juice.burst('snow', p.x, p.y - 4, 10);
            this.say('stapf', p.x, p.y - c * 0.6, e.cell, true);
          }
          break;
        }
        case 'FLOE_LEFT_SUNK': {
          const p = this.cellPoint(s, e.cell);
          this.floes.sink(e.cell, 'left');
          this.juice.ripple(p.x, p.y, 0.9);
          this.juice.burst('bubbles', p.x, p.y, 5);
          this.opts.sound('sinkSmall', p.x);
          break;
        }
        case 'CRACK_STAGE': {
          this.floes.crackStage(e.cell, e.stage);
          const p = this.cellPoint(s, e.cell);
          this.opts.sound(
            e.stage >= 4 ? 'split' : e.stage === 3 ? 'crack3' : e.stage === 2 ? 'crack2' : 'crack1',
            p.x,
          );
          if (e.stage >= 3) this.juice.burst('chips', p.x, p.y, e.stage >= 4 ? 10 : 6);
          if (e.stage === 3) this.say('knirsch', p.x, p.y - c * 0.6, e.cell, true);
          break;
        }
        case 'COUNTDOWN': {
          this.sayAtFeet(e.n >= 3 ? 'drei' : e.n === 2 ? 'zwei' : 'eins');
          this.opts.sound('tick', this.hero.x);
          break;
        }
        case 'MELT_WARN': {
          this.floes.wet(e.cell, s.wetStart[e.cell], e.sinkAt);
          const p = this.cellPoint(s, e.cell);
          this.opts.sound('drip', p.x);
          this.juice.burst('drip', p.x, p.y - 10, 4);
          this.say('tropf', p.x, p.y - c * 0.5, e.cell, true);
          break;
        }
        case 'MELT_SUNK': {
          const p = this.cellPoint(s, e.cell);
          this.floes.sink(e.cell, 'melt');
          this.juice.burst('bubbles', p.x, p.y, 9);
          this.juice.ripple(p.x, p.y, 1.1);
          this.opts.sound('blubb', p.x);
          this.say('blubb', p.x, p.y - c * 0.5, e.cell, true);
          break;
        }
        case 'FISH_CAUGHT': {
          const to = this.hero.basketPoint();
          const p = this.cellPoint(s, e.cell);
          this.juice.hitStop();
          this.juice.punch();
          this.opts.sound('catch', p.x);
          this.say('schwupp', p.x, p.y - c * 0.6, e.cell);
          const count = e.count;
          this.fish.caught(e.fish, to, () => this.hero.setTails(count));
          this.opts.fishToBasket(e.fish, p.x, p.y - 20);
          break;
        }
        case 'FISH_LOST': {
          const p = this.cellPoint(s, e.cell);
          this.fish.lost(e.fish);
          this.juice.burst('splash', p.x, p.y, 8);
          this.opts.sound('fishLost', p.x);
          this.say('tschuess', p.x, p.y - c * 0.5, e.cell, true);
          break;
        }
        case 'FELL': {
          const p = { x: this.hero.x, y: this.hero.y };
          if (e.cause === 'crack') this.floes.sink(e.cell, 'break');
          this.hero.fall();
          this.hero.setWarmth(e.warmthLeft);
          this.juice.shake(balance.anim.shakeFallPx);
          this.opts.sound('krach', p.x);
          this.say('krach', p.x, p.y - c * 0.5, e.cell);
          this.scene.time.delayedCall(220, () => {
            this.opts.sound('splash', p.x);
            this.say('platsch', p.x, p.y - c * 0.55, e.cell);
          });
          if (e.warmthLeft > 0) {
            this.scene.time.delayedCall(720, () => {
              this.opts.sound('shiver', p.x);
              this.say('brrr', p.x, p.y - c * 0.55, e.cell, true);
            });
          }
          break;
        }
        case 'OUT_OF_WARMTH': {
          this.ended = true;
          this.hero.lose('cold');
          this.scene.time.delayedCall(900, () => {
            this.opts.sound('cold', this.hero.x);
            this.say('bibber', this.hero.x, this.hero.y - c * 0.6, s.hero.cell, true);
          });
          this.scene.time.delayedCall(1500, () =>
            this.say('zukalt', this.hero.x, this.hero.y - c * 0.6, s.hero.cell),
          );
          break;
        }
        case 'TRAPPED': {
          this.ended = true;
          this.hero.lose('trapped');
          this.opts.sound('trapped', this.hero.x);
          this.say('ohoh', this.hero.x, this.hero.y - c * 0.6, s.hero.cell);
          break;
        }
        case 'ESCAPED': {
          this.ended = true;
          const knapp = e.floeLeftMs < balance.rules.knappMs;
          const door = this.banks.hutDoor();
          const land = this.cellPoint(s, e.cell);
          this.scene.time.delayedCall(balance.anim.jumpMs + 30, () => {
            this.hero.win(door ? [land, door] : [land]);
            this.banks.flashWindow();
          });
          this.opts.sound('win', land.x);
          this.say(knapp ? 'knapp' : 'geschafft', land.x, land.y - c * 0.6, e.cell);
          break;
        }
        case 'DENIED': {
          this.denyFlash(e.cell);
          this.opts.sound('denied', this.hero.x);
          this.say('zuweit', this.hero.x, this.hero.y - c * 0.6, s.hero.cell, true);
          break;
        }
        case 'PIP':
          this.hints.pipGained();
          break;
        default:
          break;
      }
    }
    this.floes.sync(s);
  }

  /** Недоступная клетка на миг подсвечивается (не чаще 3 вспышек в секунду, 11.6.2). */
  private denyFlash(cell: number): void {
    const o = this.orient;
    if (!o || cell < 0 || cell >= this.state.grid.cells.length) return;
    if (this.time - this.lastFlashAt < 1000 / balance.anim.flashMaxPerSecond) return;
    this.lastFlashAt = this.time;
    const p = o.toWorld(aOf(this.state.grid, cell), lOf(this.state.grid, cell));
    this.flash?.destroy();
    this.flash = this.scene.add.rectangle(
      p.x,
      p.y,
      o.cell * 0.9,
      o.cell * 0.9,
      0xffffff,
      this.opts.reducedMotion ? 0.25 : 0.45,
    );
    this.layers.overlay.add(this.flash);
    const f = this.flash;
    this.scene.tweens.add({
      targets: f,
      alpha: 0,
      duration: balance.anim.deniedFlashMs,
      onComplete: () => f.destroy(),
    });
  }

  /** Центры объектов для теста контраста: вода, тонкая и толстая льдина, рыба (8.4). */
  contrastPoints(): {
    water: { x: number; y: number };
    thin: { x: number; y: number };
    thick: { x: number; y: number };
    fish: { x: number; y: number };
  } | null {
    const o = this.orient;
    if (!o) return null;
    const s = this.state;
    const find = (kind: string, avoid: number[]) => {
      for (let a = 2; a < s.grid.height - 1; a++)
        for (let l = 1; l < s.grid.length - 1; l++) {
          const c = a * s.grid.length + l;
          if (s.grid.cells[c] === kind && !avoid.includes(c)) return c;
        }
      return -1;
    };
    const fishCells = s.fish.map((f) => f.cell);
    const water = find('water', []);
    const thin = find('thin', fishCells);
    const thick = find('thick', fishCells);
    const at = (c: number) => this.floes.surfaceAt(c) ?? o.toWorld(aOf(s.grid, c), lOf(s.grid, c));
    const fp = this.fish.bodyPoint(0);
    if (water < 0 || thin < 0 || thick < 0 || !fp) return null;
    const th = at(thin);
    return {
      water: at(water),
      thin: { x: th.x - 18, y: th.y + 14 },
      thick: { x: at(thick).x, y: at(thick).y - 6 },
      fish: fp,
    };
  }

  debugInfo() {
    return { floes: this.floes.debugInfo(), hero: { x: this.hero.x, y: this.hero.y } };
  }

  /** Точки пролёта камеры в интро (11.5.3): от героя на мостках к окну избушки. */
  introPoints(): { from: { x: number; y: number }; to: { x: number; y: number } } {
    return { from: { x: this.hero.x, y: this.hero.y }, to: { ...this.banks.windowPoint } };
  }

  /** Старт раунда: герой на мостках поправляет корзину, «AUF GEHT'S!». */
  start(): void {
    const c = this.orient?.cell ?? 128;
    this.opts.sound('start', this.hero.x);
    this.say('start', this.hero.x, this.hero.y - c * 0.7, this.state.hero.cell);
  }

  // ───────────────────────────── кадр ─────────────────────────────

  update(dtMs: number, s: GameState, showHints: boolean): { dx: number; dy: number; zoom: number } {
    this.state = s;
    this.time += dtMs;
    const strength = this.forcedStrength ?? (this.attract ? 0.45 : meltStrengthOf(s));
    this.light = lightFor(strength, balance.layout.cellPx);
    const fx = this.juice.update(dtMs);
    const frozen = this.juice.frozen;
    const rm = this.opts.reducedMotion;
    this.water.update(frozen ? 0 : dtMs, strength, rm);
    this.floes.update(dtMs, s, this.light, rm, frozen);
    this.banks.update(dtMs, this.light, rm);
    // Герой стоит на льдине своей клетки и покачивается вместе с ней.
    if (!this.hero.isBusy() && !this.ended) {
      const p = this.cellPoint(s, s.hero.cell);
      this.hero.place(p.x, p.y);
      const next = s.route && s.route.length ? s.route[0].to : s.hero.target;
      if (next !== null && next !== undefined) this.hero.setFacingToward(this.cellPoint(s, next).x);
    }
    const kind = s.grid.cells[s.hero.cell];
    this.hero.thin = isFloe(kind) && (kind === 'thin' || s.debris[s.hero.cell]);
    this.hero.crackStage = s.hero.floeStart !== null ? s.hero.crackStage : 0;
    this.hero.ready = isReady(s);
    this.hero.update(dtMs, this.light, rm, frozen);
    this.fish.update(dtMs, s, this.light, (cell) => this.floes.surfaceAt(cell), rm, frozen);
    this.hints.update(
      dtMs,
      s,
      (cell) => this.floes.surfaceAt(cell),
      { x: this.hero.x, y: this.hero.y, head: this.hero.headPoint() },
      showHints && !this.attract,
      rm,
    );
    this.grade.update(strength);
    this.updateGlints(dtMs, strength);
    this.ambientEvents(dtMs, s, strength);
    return fx;
  }

  private ambientEvents(dtMs: number, s: GameState, strength: number): void {
    const o = this.orient;
    if (!o) return;
    const playing = s.status === 'playing' && !s.paused;
    // Далёкий ледоход: раз в 15–25 с с силы 0.4 (9.2).
    if (playing && strength >= balance.anim.rumbleFromStrength) {
      this.nextRumble -= dtMs;
      if (this.nextRumble <= 0) {
        this.nextRumble =
          balance.anim.rumbleMinMs + Math.random() * (balance.anim.rumbleMaxMs - balance.anim.rumbleMinMs);
        this.water.shudder();
        this.opts.sound('rumble', o.gridSize.w * Math.random());
        const far = o.toWorld(s.grid.height - 1.4, s.grid.length * (0.2 + Math.random() * 0.6));
        this.juice.word(this.opts.word('wumm'), far.x, far.y, o.cell * 0.35, { small: true, still: true });
      }
    }
    // Изредка над рекой пролетает ворона — видна только её тень (7.5.12).
    this.nextCrow -= dtMs;
    if (this.nextCrow <= 0 && !this.crow) {
      this.nextCrow =
        balance.anim.crowMinGapMs + Math.random() * (balance.anim.crowMaxGapMs - balance.anim.crowMinGapMs);
      this.flyCrow();
    }
    // Пар изо рта на закате, капли после первого падения.
    if (strength >= 0.7 && !this.attract) {
      this.nextBreath -= dtMs;
      if (this.nextBreath <= 0) {
        this.nextBreath = 1500 + Math.random() * 700;
        const m = this.hero.mouthPoint();
        this.juice.burst('steam', m.x, m.y, 3);
      }
    }
    if (s.hero.warmth < balance.rules.warmth && !this.hero.isBusy()) {
      this.nextDrip -= dtMs;
      if (this.nextDrip <= 0) {
        this.nextDrip = 650 + Math.random() * 500;
        this.juice.burst('drip', this.hero.x + (Math.random() - 0.5) * 20, this.hero.y - 30, 1);
      }
    }
  }

  private flyCrow(): void {
    const o = this.orient;
    if (!o) return;
    const b = o.bounds;
    const crow = artImage(this.scene, this.art, K.crow);
    crow.setTint(this.light.shadowTint);
    crow.setAlpha(this.light.shadowAlpha * 0.9);
    this.layers.shadows.add(crow);
    this.crow = crow;
    const y0 = b.y + b.h * (0.25 + Math.random() * 0.5);
    const y1 = y0 + (Math.random() - 0.5) * b.h * 0.3;
    crow.setPosition(b.x - 120, y0);
    this.scene.tweens.add({
      targets: crow,
      x: b.x + b.w + 120,
      y: y1,
      duration: balance.anim.crowFlightMs,
      onUpdate: () => crow.setScale(1 / this.art.s, (0.85 + Math.sin(this.time / 90) * 0.15) / this.art.s),
      onComplete: () => {
        crow.destroy();
        this.crow = null;
      },
    });
  }

  // ───────────────────────────── блики ─────────────────────────────

  private buildGlints(): void {
    const n = this.opts.lowQuality ? balance.light.glintCountLow : balance.light.glintCount;
    for (let i = 0; i < n; i++) {
      const water = i % 3 === 0;
      const img = artImage(this.scene, this.art, water ? K.streak : K.glint);
      img.setBlendMode(Phaser.BlendModes.ADD);
      img.setAlpha(0);
      this.layers.atmosphere.add(img);
      this.glints.push({
        img,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.4,
        cell: -1,
        dx: 0,
        dy: 0,
        water,
      });
    }
  }

  private placeGlints(): void {
    const s = this.state;
    const thick: number[] = [];
    const banks: number[] = [];
    s.grid.cells.forEach((k, c) => {
      if (k === 'thick') thick.push(c);
      else if (k === 'near' || k === 'far') banks.push(c);
    });
    this.glints.forEach((g, i) => {
      if (g.water) {
        g.cell = Math.floor(cellHash(s.seed, i, 91) * s.grid.cells.length);
      } else {
        const pool = i % 2 && thick.length ? thick : banks;
        g.cell = pool[Math.floor(cellHash(s.seed, i, 93) * pool.length)] ?? 0;
      }
      g.dx = (cellHash(s.seed, i, 95) - 0.5) * 70;
      g.dy = (cellHash(s.seed, i, 97) - 0.5) * 50 - (g.water ? -40 : 10);
    });
  }

  private updateGlints(dtMs: number, strength: number): void {
    const o = this.orient;
    if (!o) return;
    void dtMs;
    // День — частые искры на снегу; золотой час — вода в золотых бликах (8.3).
    const snowK = 1 - Math.min(1, strength / 0.6) * 0.6;
    const waterK = Math.max(0, 1 - Math.abs(strength - 0.5) / 0.35);
    const calm = this.opts.reducedMotion;
    for (const g of this.glints) {
      if (g.cell < 0) continue;
      const kind = this.state.grid.cells[g.cell];
      if (!g.water && kind === 'water') {
        g.img.setAlpha(0);
        continue;
      }
      const base =
        this.floes.surfaceAt(g.cell) ?? o.toWorld(aOf(this.state.grid, g.cell), lOf(this.state.grid, g.cell));
      const t = this.time / 1000;
      const tw = calm ? 0.5 : Math.max(0, Math.sin(t * g.speed * 2.2 + g.phase));
      const a = Math.pow(tw, 6) * (g.water ? waterK * 0.85 : snowK);
      g.img.setPosition(base.x + g.dx + (g.water ? Math.sin(t * 0.7 + g.phase) * 20 : 0), base.y + g.dy);
      g.img.setAlpha(a);
      g.img.setScale((g.water ? 0.9 : 0.35 + 0.35 * tw) / this.art.s);
    }
  }

  destroy(): void {
    this.water.destroy();
    this.floes.destroy();
    this.banks.destroy();
    this.hero.destroy();
    this.fish.destroy();
    this.hints.destroy();
    this.juice.destroy();
    this.grade.destroy();
    this.crow?.destroy();
    for (const g of this.glints) g.img.destroy();
    this.flash?.destroy();
    destroyLayers(this.layers);
  }
}
