import { palette } from '../../config/palette';
import {
  type Path,
  type Pt,
  type Rng,
  blobPath,
  centroid,
  ctx2d,
  cutEdge,
  fiberCore,
  floePath,
  makeCanvas,
  paperFill,
  pathBounds,
  rgba,
  scalePath,
  scissorCut,
  shade,
  silhouetteShadow,
  stack,
  tear,
  tracePath,
  translatePath,
} from '../../shared/paperKit';

/**
 * Льдины (7.5.2–7.5.3). Все текстуры льдин — холст 128 × 144 мировых единиц
 * (× масштаб s) с центром верхней поверхности в (64, 64): так их легко ставить в клетку.
 */
export const FLOE_CANVAS = { w: 128, h: 144, cx: 64, cy: 64 };

export interface FloeArt {
  canvas: HTMLCanvasElement;
  /** Контур верхней поверхности в пикселях холста — для трещин, намокания и кусков. */
  top: Path;
  /** Контур всей льдины с боковыми слоями. */
  full: Path;
  kind: 'thin' | 'thick' | 'debris';
}

function canvasFor(s: number): HTMLCanvasElement {
  return makeCanvas(FLOE_CANVAS.w * s, FLOE_CANVAS.h * s);
}

/** Слить контур верхней поверхности со сдвинутым вниз — силуэт льдины вместе с боками. */
function withSides(top: Path, depth: number): Path {
  const b = pathBounds(top);
  const c = centroid(top);
  return top.map((p) => (p.y > c.y - b.h * 0.05 ? { x: p.x, y: p.y + depth } : p));
}

/** Тонкая льдина (7.5.2): один слой бледно-голубой «стеклянной» бумаги, под ним видна вода. */
export function thinFloe(rng: Rng, s: number, sun: Pt): FloeArt {
  const c = canvasFor(s);
  const ctx = ctx2d(c);
  const cx = FLOE_CANVAS.cx * s;
  const cy = FLOE_CANVAS.cy * s;
  const top = scissorCut(rng, floePath(rng, cx, cy, 55 * s, 0.2), 1.5 * s, 6 * s);
  // Тонкая «подложка» — едва заметный торец 2 px.
  const under = translatePath(top, 0, 2.2 * s);
  tracePath(ctx, under);
  ctx.fillStyle = rgba(palette.thinIce.shade, 0.75);
  ctx.fill();

  // Слой стекла рисуем отдельно и кладём с прозрачностью: сквозь него просвечивает вода.
  const glass = makeCanvas(c.width, c.height);
  const g = ctx2d(glass);
  paperFill(g, top, palette.thinIce.base, rng, { tone: 0.05, blotches: 5, grain: 0.07 });
  g.save();
  tracePath(g, top);
  g.clip();
  // Тёмные «окна», где лёд тоньше и вода ближе.
  for (let i = 0; i < 3; i++) {
    const p = blobPath(
      rng,
      cx + (rng() - 0.5) * 50 * s,
      cy + (rng() - 0.5) * 50 * s,
      (8 + rng() * 14) * s,
      (6 + rng() * 10) * s,
      18,
      0.35,
    );
    g.filter = `blur(${3 * s}px)`;
    tracePath(g, p);
    g.fillStyle = rgba(palette.thinIce.shade, 0.55);
    g.fill();
    g.filter = 'none';
  }
  // Глянец стекла со стороны солнца.
  const gr = g.createLinearGradient(
    cx + sun.x * 60 * s,
    cy + sun.y * 60 * s,
    cx - sun.x * 20 * s,
    cy - sun.y * 20 * s,
  );
  gr.addColorStop(0, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, glass.width, glass.height);
  // Тонкие прожилки.
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    let x = cx + (rng() - 0.5) * 70 * s;
    let y = cy + (rng() - 0.5) * 70 * s;
    let a = rng() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 4 + Math.floor(rng() * 5);
    for (let k = 0; k < steps; k++) {
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a) * 7 * s;
      y += Math.sin(a) * 7 * s;
      g.lineTo(x, y);
    }
    g.strokeStyle = rgba(palette.thinIce.bubbles, 0.6);
    g.lineWidth = (0.7 + rng() * 0.6) * s;
    g.stroke();
  }
  // Пузырьки воздуха.
  for (let i = 0; i < 16; i++) {
    const bx = cx + (rng() - 0.5) * 80 * s;
    const by = cy + (rng() - 0.5) * 80 * s;
    const r = (1.2 + rng() * 2.8) * s;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fillStyle = rgba(palette.thinIce.bubbles, 0.75);
    g.fill();
    g.beginPath();
    g.arc(bx + sun.x * r * 0.35, by + sun.y * r * 0.35, r * 0.4, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fill();
  }
  g.restore();
  ctx.globalAlpha = 0.86;
  ctx.drawImage(glass, 0, 0);
  ctx.globalAlpha = 1;
  cutEdge(ctx, top, sun, { light: 0.9, dark: 0.22, width: 2.2 * s });
  return { canvas: c, top, full: under, kind: 'thin' };
}

/** Толстая льдина (7.5.3): три слоя по нижнему краю, белый верх со снежной шапкой. */
export function thickFloe(rng: Rng, s: number, sun: Pt): FloeArt {
  const c = canvasFor(s);
  const ctx = ctx2d(c);
  const cx = FLOE_CANVAS.cx * s;
  const cy = FLOE_CANVAS.cy * s;
  const top = scissorCut(rng, floePath(rng, cx, cy - 3 * s, 52 * s, 0.15), 1.4 * s, 6 * s);
  const layer = 4.2 * s;
  stack(
    ctx,
    top,
    3,
    layer,
    [palette.thickIce.side, shade(palette.thickIce.side, -0.08), palette.thickIce.sideDark],
    rng,
  );
  paperFill(ctx, top, palette.thickIce.base, rng, { tone: 0.04, blotches: 4, grain: 0.07 });
  cutEdge(ctx, top, sun, { light: 0.95, dark: 0.18, width: 2 * s });

  // Снежная шапка: подушка белой бумаги с голубой тенью.
  const b = pathBounds(top);
  const cap = scissorCut(
    rng,
    blobPath(
      rng,
      cx + (rng() - 0.5) * 8 * s,
      cy - 6 * s + (rng() - 0.5) * 6 * s,
      b.w * (0.33 + rng() * 0.06),
      b.h * (0.29 + rng() * 0.06),
      30,
      0.28,
    ),
    1.2 * s,
    5 * s,
  );
  // мягкая тень под шапкой
  ctx.save();
  tracePath(ctx, top);
  ctx.clip();
  ctx.filter = `blur(${2.5 * s}px)`;
  tracePath(ctx, translatePath(cap, -sun.x * 3 * s, -sun.y * 3 * s));
  ctx.fillStyle = rgba(palette.thickIce.snowShade, 0.9);
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();
  paperFill(ctx, cap, palette.thickIce.snow, rng, { tone: 0.02, blotches: 2, grain: 0.05 });
  // голубая тень на стороне от солнца
  ctx.save();
  tracePath(ctx, cap);
  ctx.clip();
  ctx.filter = `blur(${4 * s}px)`;
  tracePath(ctx, translatePath(scalePath(cap, cx, cy, 1.02), -sun.x * 9 * s, -sun.y * 9 * s));
  ctx.lineWidth = 9 * s;
  ctx.strokeStyle = rgba(palette.thickIce.snowShade, 0.95);
  ctx.stroke();
  ctx.filter = 'none';
  ctx.restore();
  // второй, меньший сугроб на шапке
  if (rng() < 0.7) {
    const bump = scissorCut(
      rng,
      blobPath(
        rng,
        cx + (rng() - 0.5) * 30 * s,
        cy - 10 * s + (rng() - 0.5) * 20 * s,
        (9 + rng() * 7) * s,
        (6 + rng() * 5) * s,
        20,
        0.3,
      ),
      1 * s,
      4 * s,
    );
    paperFill(ctx, bump, palette.thickIce.snow, rng, { tone: 0.02, blotches: 1, grain: 0.04 });
    cutEdge(ctx, bump, sun, { light: 0.6, dark: 0.2, width: 1.5 * s });
  }
  cutEdge(ctx, cap, sun, { light: 1, dark: 0.16, width: 1.8 * s });
  // Запечённые крошечные искорки на снегу (живые блики — отдельные спрайты).
  for (let i = 0; i < 5; i++) {
    const p = { x: cx + (rng() - 0.5) * 40 * s, y: cy - 8 * s + (rng() - 0.5) * 26 * s };
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(p.x - 0.6 * s, p.y - 2.2 * s, 1.2 * s, 4.4 * s);
    ctx.fillRect(p.x - 2.2 * s, p.y - 0.6 * s, 4.4 * s, 1.2 * s);
  }
  return { canvas: c, top, full: withSides(top, layer * 3), kind: 'thick' };
}

/** Обломок (7.5.2): меньше обычной льдины, рваный край и свежие сколы. */
export function debrisFloe(rng: Rng, s: number, sun: Pt): FloeArt {
  const c = canvasFor(s);
  const ctx = ctx2d(c);
  const cx = FLOE_CANVAS.cx * s;
  const cy = FLOE_CANVAS.cy * s;
  const base = floePath(rng, cx, cy, 40 * s, 0.22);
  // Рваный край: каждая сторона — линия разрыва.
  const torn: Path = [];
  for (let i = 0; i < base.length; i++) {
    const a = base[i];
    const b = base[(i + 1) % base.length];
    const seg = tear(rng, a, b, 2.4 * s, 3 * s);
    torn.push(...seg.slice(0, -1));
  }
  const under = translatePath(torn, 0, 2.4 * s);
  tracePath(ctx, under);
  ctx.fillStyle = rgba(palette.thinIce.shade, 0.8);
  ctx.fill();
  const glass = makeCanvas(c.width, c.height);
  const g = ctx2d(glass);
  paperFill(g, torn, palette.thinIce.base, rng, { tone: 0.05, blotches: 3, grain: 0.08 });
  g.save();
  tracePath(g, torn);
  g.clip();
  for (let i = 0; i < 8; i++) {
    const r = (1 + rng() * 2) * s;
    g.beginPath();
    g.arc(cx + (rng() - 0.5) * 56 * s, cy + (rng() - 0.5) * 56 * s, r, 0, Math.PI * 2);
    g.fillStyle = rgba(palette.thinIce.bubbles, 0.8);
    g.fill();
  }
  g.restore();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(glass, 0, 0);
  ctx.globalAlpha = 1;
  cutEdge(ctx, torn, sun, { light: 0.8, dark: 0.25, width: 2 * s });
  // Свежие сколы: белая волокнистая сердцевина вдоль части края.
  const n = torn.length;
  for (let k = 0; k < 3; k++) {
    const start = Math.floor(rng() * n);
    const len = Math.floor(n * (0.08 + rng() * 0.1));
    const seg = Array.from({ length: len }, (_, i) => torn[(start + i) % n]);
    fiberCore(ctx, seg, rng, 1.8 * s);
  }
  return { canvas: c, top: torn, full: under, kind: 'debris' };
}

/** Тёмная кромка льдины на воде (7.5.10): силуэт целиком, мягкий край. */
export function floeRim(art: FloeArt, s: number): HTMLCanvasElement {
  const sil = makeCanvas(art.canvas.width, art.canvas.height);
  const ctx = ctx2d(sil);
  tracePath(ctx, art.full);
  ctx.fillStyle = '#000';
  ctx.fill();
  tracePath(ctx, art.top);
  ctx.fill();
  return silhouetteShadow(sil, 2.2 * s, '#ffffff');
}

/** Пена из обрывков у кромки льдины (7.5.1). Холст шире льдины на 16 единиц с каждой стороны. */
export function floeFoam(rng: Rng, art: FloeArt, s: number): HTMLCanvasElement {
  const pad = 16 * s;
  const c = makeCanvas(art.canvas.width + pad * 2, art.canvas.height + pad * 2);
  const ctx = ctx2d(c);
  const outline = scalePath(art.full, FLOE_CANVAS.cx * s, FLOE_CANVAS.cy * s, 1.1, 1.1);
  // Пена гуще с одной стороны — там, где течение набегает на льдину.
  const side = rng() * Math.PI * 2;
  const cx = FLOE_CANVAS.cx * s;
  const cy = FLOE_CANVAS.cy * s;
  for (let i = 0; i < outline.length; i += 1) {
    const p = outline[i];
    const facing = Math.cos(Math.atan2(p.y - cy, p.x - cx) - side);
    if (rng() > 0.18 + 0.45 * Math.max(0, facing)) continue;
    const r = (1.6 + rng() * 3.6) * s;
    const scrap = blobPath(
      rng,
      p.x + pad + (rng() - 0.5) * 7 * s,
      p.y + pad + (rng() - 0.5) * 7 * s,
      r * (1.3 + rng() * 1.2),
      r,
      9,
      0.45,
    );
    tracePath(ctx, scrap);
    ctx.fillStyle = rgba(palette.water.foam, 0.35 + rng() * 0.45);
    ctx.fill();
  }
  return c;
}
