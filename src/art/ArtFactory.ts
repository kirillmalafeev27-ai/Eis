import type Phaser from 'phaser';
import { balance } from '../config/balance';
import { palette } from '../config/palette';
import { type Pt, type Rng, blobPath, mulberry32, paperWord, silhouetteShadow } from '../shared/paperKit';
import { AtlasBuilder } from './atlas';
import { BIT_VARIANTS, DEBRIS_VARIANTS, DRIFT_VARIANTS, FLOE_VARIANTS, K, PINE_VARIANTS } from './manifest';
import { type BankSpec, bankCanvas, bridge, reed } from './recipes/banks';
import {
  type Part,
  basketTail,
  fishBody,
  fishFin,
  fishTail,
  heroArm,
  heroBasket,
  heroBody,
  heroDrip,
  heroHat,
  heroHead,
  heroIcicles,
  heroLeg,
  heroScarf,
  heroScarfTail,
} from './recipes/characters';
import {
  arcDot,
  bubble,
  chip,
  drop,
  footprint,
  glint,
  pip,
  ring,
  snowPuff,
  softDot,
  streak,
  vignetteTexture,
} from './recipes/fx';
import { type FloeArt, debrisFloe, floeFoam, floeRim, thickFloe, thinFloe } from './recipes/ice';
import { type Standing, crowShadow, glowHalo, hut, pine, sled, snowDrift } from './recipes/scenery';
import { rotate90, waterBit, waterDeep, waterLight, waterMid } from './recipes/water';

/**
 * Генерация всего процедурного арта при запуске (7.3): Canvas 2D → атласы → текстуры Phaser.
 * Тени не запекаются: у каждого объекта отдельный размытый силуэт (7.3.5).
 */
export interface FrameRef {
  texture: string;
  frame: string | undefined;
  /** Точка привязки (шарнир, основание) в долях кадра. */
  ox: number;
  oy: number;
}

/** Солнце для запечённых кромок: сверху слева (единичный вектор НА солнце). */
export const BAKED_SUN: Pt = { x: -0.6, y: -0.8 };

const ATLAS = 'art-atlas';

export class ArtFactory {
  /** Масштаб текстур: пикселей текстуры на пиксель мира (128 на клетку → 1). */
  readonly s: number;
  private readonly refs = new Map<string, FrameRef>();
  private readonly floes = new Map<string, FloeArt>();
  private atlas: AtlasBuilder | null = null;
  private readonly words = new Map<string, FrameRef>();
  private bankSerial = 0;
  readonly hutInfo = { window: { x: 0.6, y: 0.7 }, chimney: { x: 0.65, y: 0.2 } };
  generationMs = 0;

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    quality: 'high' | 'low',
  ) {
    this.s = (quality === 'low' ? balance.layout.cellPxLow : balance.layout.cellPx) / balance.layout.cellPx;
  }

  /** Сгенерировать всё; между группами отдаёт кадр, чтобы экран загрузки жил. */
  async generate(onProgress?: (k: number) => void): Promise<void> {
    const t0 = performance.now();
    const s = this.s;
    const sun = BAKED_SUN;
    const atlas = new AtlasBuilder(2048);
    this.atlas = atlas;
    const pending: [string, HTMLCanvasElement, number, number][] = [];
    const put = (key: string, c: HTMLCanvasElement, ox = 0.5, oy = 0.5) => {
      atlas.add(key, c);
      pending.push([key, c, ox, oy]);
    };
    const putStanding = (key: string, st: Standing, blur = 3) => {
      put(key, st.canvas, st.ox, st.oy);
      const sh = silhouetteShadow(st.canvas, blur * s, '#ffffff');
      const padX = (sh.width - st.canvas.width) / 2;
      const padY = (sh.height - st.canvas.height) / 2;
      put(K.shadow(key), sh, (st.ox * st.canvas.width + padX) / sh.width, (st.oy * st.canvas.height + padY) / sh.height);
    };
    const putPart = (key: string, p: Part) => {
      put(key, p.canvas, p.pivot.x, p.pivot.y);
      // Размытый силуэт детали — для тени, которая повторяет позу (7.3.5).
      const sh = silhouetteShadow(p.canvas, 1.8 * s, '#ffffff');
      const padX = (sh.width - p.canvas.width) / 2;
      const padY = (sh.height - p.canvas.height) / 2;
      put(K.shadow(key), sh, (p.pivot.x * p.canvas.width + padX) / sh.width, (p.pivot.y * p.canvas.height + padY) / sh.height);
    };
    const steps: (() => void)[] = [];

    // Льдины: 8 тонких, 8 толстых, 4 обломка, у каждой — кромка и пена.
    const floeOrigin = (64 * s) / (144 * s);
    const addFloe = (key: string, make: (rng: Rng) => FloeArt, seed: number) => {
      steps.push(() => {
        const rng = mulberry32(seed);
        const art = make(rng);
        this.floes.set(key, art);
        put(key, art.canvas, 0.5, floeOrigin);
        const rim = floeRim(art, s);
        put(K.rim(key), rim, 0.5, (64 * s + (rim.height - art.canvas.height) / 2) / rim.height);
        const foam = floeFoam(rng, art, s);
        put(K.foam(key), foam, 0.5, (64 * s + 16 * s) / foam.height);
      });
    };
    for (let i = 0; i < FLOE_VARIANTS; i++) addFloe(K.thin(i), (r) => thinFloe(r, s, sun), 1000 + i);
    for (let i = 0; i < FLOE_VARIANTS; i++) addFloe(K.thick(i), (r) => thickFloe(r, s, sun), 2000 + i);
    for (let i = 0; i < DEBRIS_VARIANTS; i++) addFloe(K.debris(i), (r) => debrisFloe(r, s, sun), 3000 + i);

    // Вода: три слоя для течения вдоль x и повёрнутые — для ландшафта.
    steps.push(() => {
      const rot: Pt = { x: sun.y, y: -sun.x }; // солнце, повёрнутое на −90°: после поворота холста оно снова сверху слева
      this.addCanvasTexture(K.waterDeep, waterDeep(mulberry32(11), s));
      this.addCanvasTexture(K.waterMid, waterMid(mulberry32(12), s, sun));
      this.addCanvasTexture(K.waterLight, waterLight(mulberry32(13), s, sun));
      this.addCanvasTexture(K.waterDeepV, rotate90(waterDeep(mulberry32(11), s)));
      this.addCanvasTexture(K.waterMidV, rotate90(waterMid(mulberry32(12), s, rot)));
      this.addCanvasTexture(K.waterLightV, rotate90(waterLight(mulberry32(13), s, rot)));
      for (let i = 0; i < BIT_VARIANTS; i++) {
        put(K.bit(i), waterBit(mulberry32(400 + i), s, sun, (rng, cx, cy, r) => blobPath(rng, cx, cy, r * 1.3, r, 12, 0.35)));
      }
    });

    // Сосны, избушка, сани, сугробы, камыш, мостки, ворона.
    steps.push(() => {
      for (let i = 0; i < PINE_VARIANTS; i++) putStanding(K.pine(i), pine(mulberry32(500 + i), s, sun, i / (PINE_VARIANTS - 1)), 4);
      const h = hut(mulberry32(600), s, sun);
      this.hutInfo.window = h.window;
      this.hutInfo.chimney = h.chimney;
      putStanding(K.hut, h, 5);
      put(K.windowGlow, glowHalo(s, 40, palette.windowLight, 0.95));
      put(K.hutGlow, glowHalo(s, 110, palette.windowLight, 0.45));
      putStanding(K.sled, sled(mulberry32(601), s, sun), 2.5);
      for (let i = 0; i < DRIFT_VARIANTS; i++) putStanding(K.drift(i), snowDrift(mulberry32(610 + i), s, sun), 3);
      for (let i = 0; i < 3; i++) {
        const r = reed(mulberry32(620 + i), s, sun);
        putStanding(K.reed(i), { canvas: r, ox: 0.5, oy: 1 }, 2);
      }
      const b = bridge(mulberry32(630), s, sun);
      put(K.bridge, b, 0.5, 0.5);
      put(K.bridgeV, rotate90(bridge(mulberry32(630), s, { x: sun.y, y: -sun.x })), 0.5, 0.5);
      put(K.crow, crowShadow(s));
    });

    // Герой: части на шарнирах.
    steps.push(() => {
      const rng = mulberry32(700);
      putPart(K.hero.legL, heroLeg(rng, s, sun));
      putPart(K.hero.legR, heroLeg(rng, s, sun));
      putPart(K.hero.body, heroBody(rng, s, sun));
      putPart(K.hero.basket, heroBasket(rng, s, sun));
      for (let i = 0; i < 3; i++) putPart(K.hero.tail(i), basketTail(rng, s, sun));
      putPart(K.hero.armL, heroArm(rng, s, sun, true));
      putPart(K.hero.armR, heroArm(rng, s, sun, false));
      putPart(K.hero.head, heroHead(mulberry32(701), s, sun, false));
      putPart(K.hero.headCold, heroHead(mulberry32(701), s, sun, true));
      putPart(K.hero.hat, heroHat(rng, s, sun));
      putPart(K.hero.icicles, heroIcicles(rng, s));
      putPart(K.hero.scarf, heroScarf(rng, s, sun));
      putPart(K.hero.scarfTail, heroScarfTail(rng, s, sun));
      putPart(K.hero.drip, heroDrip(s));
      // Рыба.
      putPart(K.fishBody, fishBody(mulberry32(710), s, sun));
      putPart(K.fishTail, fishTail(mulberry32(711), s, sun));
      putPart(K.fishFin, fishFin(mulberry32(712), s, sun));
    });

    // Подсказки, блики, частицы.
    steps.push(() => {
      put(K.print('safe'), footprint(mulberry32(800), s, 'safe'));
      put(K.print('risky'), footprint(mulberry32(801), s, 'risky'));
      put(K.print('fail'), footprint(mulberry32(802), s, 'fail'));
      put(K.printRoute, footprint(mulberry32(803), s, 'route'));
      put(K.arcDot, arcDot(s));
      put(K.pipOn, pip(s, true));
      put(K.pipOff, pip(s, false));
      put(K.glint, glint(s));
      put(K.glintSoft, softDot(s, 18, palette.sunGlint, 0.7));
      put(K.streak, streak(s));
      put(K.p.snow, snowPuff(mulberry32(810), s));
      put(K.p.drop, drop(s));
      put(K.p.chip, chip(mulberry32(811), s, sun));
      put(K.p.bubble, bubble(s));
      put(K.p.steam, softDot(s, 9, '#ffffff', 0.75));
      put(K.p.smoke, softDot(s, 16, palette.smoke, 0.8));
      put(K.p.ripple, ring(s, 26, 2.2, palette.water.foam));
      put(K.p.splash, softDot(s, 6, palette.water.foam, 1));
      this.addCanvasTexture(K.vignette, vignetteTexture(256));
    });

    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      onProgress?.((i + 1) / (steps.length + 1));
      await nextFrame();
    }
    // Регистрация атласа в Phaser: одна текстура на страницу, кадры — по ключам.
    atlas.pages.forEach((page, pi) => {
      const key = `${ATLAS}-${pi}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.addCanvas(key, page);
      if (!tex) return;
      for (const [k, , ox, oy] of pending) {
        const f = atlas.frames.get(k);
        if (!f || f.page !== pi) continue;
        tex.add(k, 0, f.x, f.y, f.w, f.h);
        this.refs.set(k, { texture: key, frame: k, ox, oy });
      }
    });
    onProgress?.(1);
    this.generationMs = performance.now() - t0;
  }

  private addCanvasTexture(key: string, c: HTMLCanvasElement): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, c);
    this.refs.set(key, { texture: key, frame: undefined, ox: 0.5, oy: 0.5 });
  }

  /** Кадр по ключу манифеста. Загруженная PNG под тем же ключом имеет приоритет (7.3.2). */
  ref(key: string): FrameRef {
    const own = this.refs.get(key);
    if (own && own.frame === undefined) return own;
    if (!own && this.textures.exists(key)) return { texture: key, frame: undefined, ox: 0.5, oy: 0.5 };
    if (own) return own;
    throw new Error(`Нет текстуры ${key}`);
  }

  has(key: string): boolean {
    return this.refs.has(key) || this.textures.exists(key);
  }

  /** Данные льдины (контуры) для трещин, намокания и кусков. */
  floe(key: string): FloeArt | undefined {
    return this.floes.get(key);
  }

  /** Холст кадра (для обрезки кусков льдины при расколе). */
  canvasOf(key: string): HTMLCanvasElement | null {
    return this.atlas?.extract(key) ?? null;
  }

  /** Берег — большая текстура для раунда (портрет; для ландшафта повёрнута). */
  bank(spec: BankSpec, seed: number, rotated: boolean): FrameRef {
    const key = `bank-${spec.side}-${++this.bankSerial}`;
    const sun = rotated ? { x: BAKED_SUN.y, y: -BAKED_SUN.x } : BAKED_SUN;
    const c = bankCanvas(mulberry32(seed), this.s, sun, spec);
    this.addCanvasTexture(key, rotated ? rotate90(c) : c);
    return this.ref(key);
  }

  releaseTexture(key: string): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.refs.delete(key);
  }

  /** Слово-звук: вырезанные буквы разных цветов (7.4), кэш по тексту. */
  word(text: string, size = 46): FrameRef {
    const id = `word:${text}:${size}`;
    const hit = this.words.get(id);
    if (hit) return hit;
    const colors = [palette.caption, palette.hero.scarf, palette.hero.hat, palette.hints.safe, palette.warmth.full];
    const c = paperWord(text, { colors, font: "'Fredoka', 'Rubik', sans-serif", size: size * this.s, shadow: palette.shadow });
    this.addCanvasTexture(id, c);
    const ref = this.ref(id);
    this.words.set(id, ref);
    return ref;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
