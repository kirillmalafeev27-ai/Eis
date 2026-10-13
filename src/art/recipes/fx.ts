import { palette } from '../../config/palette';
import {
  type Path,
  type Pt,
  type Rng,
  blobPath,
  bootPrint,
  ctx2d,
  makeCanvas,
  paperFill,
  rgba,
  scissorCut,
  silhouetteShadow,
  snowflake,
  tracePath,
} from '../../shared/paperKit';

/**
 * Подсказки, блики и частицы (7.5.11, 7.5.13). Следы маршрута лежат на светлом льду,
 * поэтому «безопасно» — тёмно-синий. Уровни риска различимы и без цвета:
 * сплошной след, пунктирный, с трещиной (7.7.5).
 */
export type PrintStyle = 'safe' | 'risky' | 'fail' | 'route';

export function footprint(rng: Rng, s: number, style: PrintStyle): HTMLCanvasElement {
  const size = 50 * s;
  const pad = 9 * s;
  const W = size * 0.7 + pad * 2;
  const H = size * 1.1 + pad * 2;
  const art = makeCanvas(W, H);
  const ctx = ctx2d(art);
  const [sole, heel] = bootPrint(ctx, W / 2, H / 2 - size * 0.02, size, 0, false);
  const color =
    style === 'safe'
      ? palette.hints.safe
      : style === 'risky'
        ? palette.hints.risky
        : style === 'fail'
          ? palette.hints.fail
          : palette.shadow;
  const parts: Path[] = [scissorCut(rng, sole, 0.5 * s, 3 * s), scissorCut(rng, heel, 0.5 * s, 3 * s)];
  // Белая бумажная подложка — след читается и на тонком, и на толстом льду (7.7.5).
  for (const p of parts) {
    tracePath(ctx, p);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = '#fbfaf5';
    ctx.stroke();
  }
  if (style === 'risky') {
    // Пунктирный след: светлая середина и прерывистый толстый контур.
    for (const p of parts) {
      tracePath(ctx, p);
      ctx.fillStyle = rgba(palette.hints.risky, 0.18);
      ctx.fill();
      tracePath(ctx, p);
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.lineWidth = 4.2 * s;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    for (const p of parts) paperFill(ctx, p, color, rng, { tone: 0.05, blotches: 1, grain: 0.07 });
    // протектор — светлые полоски поперёк подошвы
    ctx.save();
    tracePath(ctx, parts[0]);
    ctx.clip();
    ctx.strokeStyle = rgba('#ffffff', style === 'route' ? 0.3 : 0.22);
    ctx.lineWidth = 2 * s;
    for (let k = -3; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 - size * 0.35, H / 2 + k * size * 0.085 - size * 0.12);
      ctx.lineTo(W / 2 + size * 0.35, H / 2 + k * size * 0.085 - size * 0.16);
      ctx.stroke();
    }
    ctx.restore();
    if (style === 'route') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const p of parts) {
        tracePath(ctx, p);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (style === 'fail') {
      // Трещина через след — белый зигзаг с тёмной щелью.
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const x = W / 2 + (i % 2 ? 7 : -7) * s + (rng() - 0.5) * 2 * s;
        const y = pad + ((H - pad * 2) * i) / steps;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4.2 * s;
      ctx.stroke();
      ctx.strokeStyle = palette.crack.gap;
      ctx.lineWidth = 1.6 * s;
      ctx.stroke();
    }
  }
  // мягкая тень под бумажным следом
  const sh = silhouetteShadow(art, 1.8 * s, palette.shadow);
  const out = makeCanvas(sh.width, sh.height);
  const o = ctx2d(out);
  o.globalAlpha = 0.4;
  o.drawImage(sh, 1.5 * s, 2.5 * s);
  o.globalAlpha = 1;
  o.drawImage(art, (sh.width - W) / 2, (sh.height - H) / 2);
  return out;
}

/** Точка пунктирной дуги длинного прыжка. */
export function arcDot(s: number): HTMLCanvasElement {
  const r = 4.2 * s;
  const c = makeCanvas(r * 2 + 4 * s, r * 2 + 4 * s);
  const ctx = ctx2d(c);
  ctx.beginPath();
  ctx.arc(c.width / 2 + 0.8 * s, c.height / 2 + 1.2 * s, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(palette.shadow, 0.35);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.hints.arc;
  ctx.fill();
  return c;
}

/** Снежинка-заряд над героем. */
export function pip(s: number, on: boolean): HTMLCanvasElement {
  const r = 11 * s;
  const c = makeCanvas(r * 2 + 8 * s, r * 2 + 8 * s);
  const ctx = ctx2d(c);
  const cx = c.width / 2;
  const cy = c.height / 2;
  if (on) {
    snowflake(ctx, cx + 1 * s, cy + 1.5 * s, r, rgba(palette.shadow, 0.45), true);
    snowflake(ctx, cx, cy, r, '#ffffff', true);
  } else {
    snowflake(ctx, cx, cy, r, rgba('#ffffff', 0.45), false);
  }
  return c;
}

/** Четырёхлучевая искра (7.5.11): тонкие лучи крестом и мягкая сердцевина. */
export function glint(s: number): HTMLCanvasElement {
  const r = 16 * s;
  const c = makeCanvas(r * 2, r * 2);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r * 0.45);
  g.addColorStop(0, rgba(palette.sunGlint, 1));
  g.addColorStop(1, rgba(palette.sunGlint, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = palette.sunGlint;
  ctx.beginPath();
  ctx.ellipse(r, r, r * 0.96, 1.4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r, r, 1.4 * s, r * 0.96, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(r, r, r * 0.5, 0.9 * s, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r, r, r * 0.5, 0.9 * s, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export function softDot(s: number, radius: number, color: string, alpha = 1): HTMLCanvasElement {
  const r = radius * s;
  const c = makeCanvas(r * 2, r * 2);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.5, rgba(color, alpha * 0.5));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Светлый штрих бликов на воде. */
export function streak(s: number): HTMLCanvasElement {
  const w = 46 * s;
  const h = 6 * s;
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, rgba(palette.sunGlint, 0));
  g.addColorStop(0.5, rgba(palette.sunGlint, 0.95));
  g.addColorStop(1, rgba(palette.sunGlint, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export function snowPuff(rng: Rng, s: number): HTMLCanvasElement {
  const c = makeCanvas(14 * s, 14 * s);
  const ctx = ctx2d(c);
  const p = blobPath(rng, 7 * s, 7 * s, 5.5 * s, 5 * s, 10, 0.3);
  paperFill(ctx, p, palette.snow.base, rng, { tone: 0.02, blotches: 0, grain: 0.03 });
  return c;
}

export function drop(s: number): HTMLCanvasElement {
  const c = makeCanvas(8 * s, 11 * s);
  const ctx = ctx2d(c);
  ctx.beginPath();
  ctx.moveTo(4 * s, 0);
  ctx.quadraticCurveTo(8 * s, 7 * s, 4 * s, 11 * s);
  ctx.quadraticCurveTo(0, 7 * s, 4 * s, 0);
  ctx.fillStyle = palette.water.foam;
  ctx.fill();
  return c;
}

export function chip(rng: Rng, s: number, sun: Pt): HTMLCanvasElement {
  const c = makeCanvas(14 * s, 14 * s);
  const ctx = ctx2d(c);
  const p: Path = [
    { x: 2 * s, y: 3 * s + rng() * 3 * s },
    { x: 12 * s, y: 2 * s + rng() * 3 * s },
    { x: 7 * s + rng() * 4 * s, y: 12 * s },
  ];
  paperFill(ctx, p, palette.thinIce.base, rng, { tone: 0.04, blotches: 0 });
  tracePath(ctx, p);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2 * s;
  ctx.stroke();
  void sun;
  return c;
}

export function ring(s: number, radius: number, width: number, color: string): HTMLCanvasElement {
  const r = radius * s;
  const c = makeCanvas(r * 2 + width * s * 2, r * 2 + width * s * 2);
  const ctx = ctx2d(c);
  ctx.beginPath();
  ctx.ellipse(c.width / 2, c.height / 2, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * s;
  ctx.stroke();
  return c;
}

export function bubble(s: number): HTMLCanvasElement {
  const r = 4 * s;
  const c = makeCanvas(r * 2 + 2 * s, r * 2 + 2 * s);
  const ctx = ctx2d(c);
  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, r, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(palette.water.foam, 0.95);
  ctx.lineWidth = 1.4 * s;
  ctx.stroke();
  ctx.fillStyle = rgba(palette.water.foam, 0.25);
  ctx.fill();
  return c;
}

/** Текстура виньетки для запасного пути без фильтров (8.5). */
export function vignetteTexture(size: number): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, rgba(palette.shadow, 0));
  g.addColorStop(1, rgba(palette.shadow, 0.65));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
