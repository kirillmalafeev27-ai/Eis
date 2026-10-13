import { palette } from '../../config/palette';
import {
  type Path,
  type Pt,
  type Rng,
  applyGrain,
  ctx2d,
  cutEdge,
  makeCanvas,
  mix,
  paperFill,
  rgba,
  shade,
  tracePath,
} from '../../shared/paperKit';

/**
 * Вода (7.5.1): не запекается целиком — это три слоя синей бумаги с волнистым краем,
 * каждый — бесшовная полоса, которая едет по течению со своей скоростью.
 * Плитка 4 × 2 клетки; течение — вдоль x.
 */
export const WATER_TILE = { w: 4, h: 2 };

function periodicWave(rng: Rng, W: number, amp: number): (x: number) => number {
  const ks = [1, 2, 3, 5].map((k) => ({
    k,
    a: (amp * (0.25 + rng() * 0.75)) / k ** 0.6,
    p: rng() * Math.PI * 2,
  }));
  return (x) => ks.reduce((s, t) => s + t.a * Math.sin((2 * Math.PI * t.k * x) / W + t.p), 0);
}

/** Сегмент бумажной полосы: линза между двумя волнистыми краями с сужающимися концами. */
function bandSegment(
  rng: Rng,
  x0: number,
  len: number,
  y: number,
  thick: number,
  W: number,
  amp: number,
): Path {
  const top = periodicWave(rng, W, amp);
  const bot = periodicWave(rng, W, amp * 0.7);
  const n = Math.max(8, Math.round(len / 6));
  const up: Pt[] = [];
  const down: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + len * t;
    const taper = Math.pow(Math.sin(Math.PI * t), 0.55);
    const jitter = (rng() - 0.5) * 0.9;
    up.push({ x, y: y + top(x) - (thick / 2) * taper + jitter });
    down.push({ x, y: y + bot(x) + (thick / 2) * taper + jitter * 0.5 });
  }
  return [...up, ...down.reverse()];
}

/** Нарисовать путь с повтором по краям плитки — для бесшовности. */
function wrapDraw(W: number, H: number, path: Path, draw: (p: Path) => void, margin = 4): void {
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      const moved = path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      const minX = Math.min(...moved.map((p) => p.x));
      const maxX = Math.max(...moved.map((p) => p.x));
      const minY = Math.min(...moved.map((p) => p.y));
      const maxY = Math.max(...moved.map((p) => p.y));
      if (maxX < -margin || minX > W + margin || maxY < -margin || minY > H + margin) continue;
      draw(moved);
    }
  }
}

export function waterDeep(rng: Rng, s: number): HTMLCanvasElement {
  const W = Math.round(128 * WATER_TILE.w * s);
  const H = Math.round(128 * WATER_TILE.h * s);
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  ctx.fillStyle = palette.water.deep;
  ctx.fillRect(0, 0, W, H);
  // Длинные мягкие полосы темнее и светлее — глубина и течение.
  for (let i = 0; i < 14; i++) {
    const y = rng() * H;
    const len = (0.4 + rng() * 0.6) * W;
    const x0 = rng() * W;
    const thick = (6 + rng() * 18) * s;
    const seg = bandSegment(rng, x0, len, y, thick, W, 6 * s);
    const dark = rng() < 0.6;
    wrapDraw(W, H, seg, (p) => {
      tracePath(ctx, p);
      ctx.fillStyle = rgba(dark ? shade(palette.water.deep, -0.25) : palette.water.mid, dark ? 0.35 : 0.22);
      ctx.fill();
    });
  }
  applyGrain(ctx, W, H, 0.12, 96);
  return c;
}

export function waterMid(rng: Rng, s: number, sun: Pt): HTMLCanvasElement {
  const W = Math.round(128 * WATER_TILE.w * s);
  const H = Math.round(128 * WATER_TILE.h * s);
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const rows = 6;
  const bands: { path: Path; tone: string }[] = [];
  for (let r = 0; r < rows; r++) {
    const yBase = ((r + 0.5) / rows) * H + (rng() - 0.5) * 10 * s;
    let x = rng() * W;
    let covered = 0;
    while (covered < W * 0.78) {
      const len = (90 + rng() * 210) * s;
      const thick = (9 + rng() * 11) * s;
      const path = bandSegment(rng, x, len, yBase + (rng() - 0.5) * 6 * s, thick, W, 5 * s);
      bands.push({ path, tone: mix(palette.water.mid, palette.water.light, rng() * 0.18) });
      x += len + (24 + rng() * 80) * s;
      covered += len;
    }
  }
  // Мягкие тени всех полос на глубокую воду — одним размытием на всю плитку (размытие
  // на каждую полосу в разы дороже). Поле с запасом, чтобы размытие у краёв тоже было бесшовным.
  const blur = 2.5 * s;
  const pad = Math.ceil(blur * 3 + 4 * s);
  const shadowLayer = makeCanvas(W + pad * 2, H + pad * 2);
  const sctx = ctx2d(shadowLayer);
  sctx.translate(pad - sun.x * 3 * s, pad - sun.y * 3 * s);
  sctx.fillStyle = palette.shadow;
  for (const b of bands) {
    wrapDraw(
      W,
      H,
      b.path,
      (p) => {
        tracePath(sctx, p);
        sctx.fill();
      },
      pad,
    );
  }
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(shadowLayer, -pad, -pad);
  ctx.restore();
  for (const b of bands) {
    wrapDraw(W, H, b.path, (p) => {
      paperFill(ctx, p, b.tone, rng, { tone: 0.03, blotches: 1, grain: 0.07 });
      cutEdge(ctx, p, sun, { light: 0.55, dark: 0.18, width: 1.6 * s });
    });
  }
  return c;
}

export function waterLight(rng: Rng, s: number, sun: Pt): HTMLCanvasElement {
  const W = Math.round(128 * WATER_TILE.w * s);
  const H = Math.round(128 * WATER_TILE.h * s);
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const count = 26;
  for (let i = 0; i < count; i++) {
    const len = (26 + rng() * 70) * s;
    const thick = (2.5 + rng() * 4) * s;
    const seg = bandSegment(rng, rng() * W, len, rng() * H, thick, W, 2 * s);
    const foamy = rng() < 0.22;
    wrapDraw(W, H, seg, (p) => {
      paperFill(ctx, p, foamy ? palette.water.foam : palette.water.light, rng, {
        tone: 0.03,
        blotches: 0,
        grain: 0.05,
      });
      if (!foamy) cutEdge(ctx, p, sun, { light: 0.7, dark: 0.1, width: 1.2 * s });
    });
  }
  return c;
}

/** Плавающая льдинка-обрывок (7.5.1, 7.5.12). */
export function waterBit(
  rng: Rng,
  s: number,
  sun: Pt,
  blob: (rng: Rng, cx: number, cy: number, r: number) => Path,
): HTMLCanvasElement {
  const r = (7 + rng() * 9) * s;
  const pad = 6 * s;
  const size = Math.ceil(r * 2 + pad * 2);
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const path = blob(rng, size / 2, size / 2, r);
  // тёмная кромка на воде
  ctx.save();
  ctx.translate(-sun.x * 2 * s, -sun.y * 2 * s);
  tracePath(ctx, path);
  ctx.fillStyle = rgba(palette.shadow, 0.35);
  ctx.fill();
  ctx.restore();
  paperFill(ctx, path, rng() < 0.5 ? palette.thinIce.base : palette.thickIce.base, rng, {
    tone: 0.04,
    blotches: 1,
  });
  cutEdge(ctx, path, sun, { light: 0.8, dark: 0.2, width: 1.4 * s });
  return c;
}

/** Повернуть холст на 90° по часовой — вертикальный вариант плитки для ландшафта. */
export function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.height, src.width);
  const ctx = ctx2d(c);
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}
