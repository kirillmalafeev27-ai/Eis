/**
 * Бумажный кит серии (7.4): инструменты вырезанной бумаги на Canvas 2D.
 * Мир собирается из плоских кусков цветной бумаги с неровным краем от ножниц,
 * мягких падающих теней и волокна. Контуров тушью нет — формы читаются по тону и теням.
 */
import { type Rng, mulberry32 } from '../core/rng';

export { mulberry32 };
export type { Rng };

export interface Pt {
  x: number;
  y: number;
}
export type Path = Pt[];

export type Ctx = CanvasRenderingContext2D;

// ───────────────────────────── холсты ─────────────────────────────

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('Canvas 2D недоступен');
  return ctx;
}

// ───────────────────────────── цвет ─────────────────────────────

export function parseColor(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Смешать два цвета: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Осветлить (k > 0) или затемнить (k < 0) на долю k. */
export function shade(c: string, k: number): string {
  return k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k);
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = parseColor(c);
  return `rgba(${r},${g},${b},${a})`;
}

// ───────────────────────────── геометрия ─────────────────────────────

export function tracePath(ctx: Ctx, path: Path): void {
  ctx.beginPath();
  if (!path.length) return;
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.closePath();
}

export function translatePath(path: Path, dx: number, dy: number): Path {
  return path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function scalePath(path: Path, cx: number, cy: number, k: number, ky = k): Path {
  return path.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * ky }));
}

export function pathBounds(path: Path): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of path) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function centroid(path: Path): Pt {
  let x = 0;
  let y = 0;
  for (const p of path) {
    x += p.x;
    y += p.y;
  }
  return { x: x / path.length, y: y / path.length };
}

/** Неровный многоугольник-«клякса»: основа для льдин, сугробов, обломков. */
export function blobPath(
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  irregular: number,
): Path {
  const out: Path = [];
  const phase = rng() * Math.PI * 2;
  const wob = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k =
      1 -
      irregular * 0.5 +
      irregular * (0.5 * Math.sin(t * wob + phase) * 0.5 + 0.5 * rng()) +
      irregular * 0.25 * Math.sin(t * (wob + 2) + phase * 1.7);
    out.push({ x: cx + Math.cos(t) * rx * k, y: cy + Math.sin(t) * ry * k });
  }
  return out;
}

/** Многоугольник льдины: скруглённый «квадрат» с рваными сторонами. */
export function floePath(rng: Rng, cx: number, cy: number, half: number, irregular: number): Path {
  const out: Path = [];
  const n = 30;
  const squareness = 2.4 + rng() * 1.6;
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + phase * 0.1;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // суперэллипс: |x|^p + |y|^p = 1
    const r = Math.pow(
      Math.pow(Math.abs(c), squareness) + Math.pow(Math.abs(s), squareness),
      -1 / squareness,
    );
    const k = 1 - irregular * rng() - irregular * 0.5 * Math.max(0, Math.sin(t * 3 + phase));
    out.push({ x: cx + c * r * half * k, y: cy + s * r * half * k });
  }
  return out;
}

/** Подразбить стороны многоугольника на отрезки не длиннее `step`. */
export function subdivide(path: Path, step: number, closed = true): Path {
  const out: Path = [];
  const n = path.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed) out.push(path[n - 1]);
  return out;
}

/**
 * Край «от ножниц» (7.4): прямые короткие резы с лёгким дрожанием и редкими
 * короткими надрезами — как если бы форму вырезали ножницами из бумаги.
 */
export function scissorCut(rng: Rng, path: Path, jitter: number, step = 7): Path {
  const dense = subdivide(path, step);
  const c = centroid(path);
  const out: Path = [];
  for (let i = 0; i < dense.length; i++) {
    const p = dense[i];
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    // Ножницы режут отрезками: дрожание меняется ступенями, а не каждый пиксель.
    const j = (rng() - 0.5) * jitter;
    out.push({ x: p.x + (dx / d) * j, y: p.y + (dy / d) * j });
    if (rng() < 0.035) {
      // короткий надрез внутрь
      const nx = -dx / d;
      const ny = -dy / d;
      const depth = jitter * (1.5 + rng() * 2.5);
      out.push({ x: p.x + nx * depth, y: p.y + ny * depth });
      out.push({ x: p.x + (dx / d) * j * 0.5, y: p.y + (dy / d) * j * 0.5 });
    }
  }
  return out;
}

/** Рваная линия разрыва между двумя точками (7.4). */
export function tear(rng: Rng, from: Pt, to: Pt, roughness: number, step = 4): Pt[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(2, Math.ceil(len / step));
  const nx = -(to.y - from.y) / (len || 1);
  const ny = (to.x - from.x) / (len || 1);
  const out: Pt[] = [];
  let drift = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const edge = Math.sin(Math.PI * t);
    drift = drift * 0.6 + (rng() - 0.5) * roughness;
    const off = drift * edge + (rng() - 0.5) * roughness * 0.35 * edge;
    out.push({ x: from.x + (to.x - from.x) * t + nx * off, y: from.y + (to.y - from.y) * t + ny * off });
  }
  return out;
}

/** Многоугольник с рваным краем для DOM-карточек: точки по периметру w × h. */
export function tornPolygon(rng: Rng, w: number, h: number, depth: number, step = 9): Pt[] {
  const out: Pt[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, inx: number, iny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const d = depth * (0.25 + 0.75 * rng()) * (rng() < 0.08 ? 1.8 : 1);
      out.push({ x: x0 + (x1 - x0) * t + inx * d, y: y0 + (y1 - y0) * t + iny * d });
    }
  };
  edge(0, 0, w, 0, 0, 1);
  edge(w, 0, w, h, -1, 0);
  edge(w, h, 0, h, 0, -1);
  edge(0, h, 0, 0, 1, 0);
  return out;
}

// ───────────────────────────── волокно ─────────────────────────────

const grainCache = new Map<string, HTMLCanvasElement>();

/**
 * Бесшовная текстура волокна (7.4): короткие изогнутые волоски светлее и темнее фона.
 * Накладывается умножением с прозрачностью около 8%. Зерно — 1–2 px.
 */
export function grainTile(rng: Rng, size: number, density = 1): HTMLCanvasElement {
  const key = `${size}:${density}`;
  const hit = grainCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  // мелкий шум
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rng() - 0.5) * 38;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  // волокна — рисуем 9 раз со сдвигами, чтобы плитка была бесшовной
  const fibers = Math.round(size * size * 0.012 * density);
  for (let f = 0; f < fibers; f++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 3 + rng() * 9;
    const ang = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * 0.9;
    const light = rng() < 0.5;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.6 + rng() * 0.5;
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(
          x + ox + Math.cos(ang + bend) * len * 0.5,
          y + oy + Math.sin(ang + bend) * len * 0.5,
          x + ox + Math.cos(ang) * len,
          y + oy + Math.sin(ang) * len,
        );
        ctx.stroke();
      }
    }
  }
  grainCache.set(key, c);
  return c;
}

/** Наложить волокно внутри текущего клипа: умножение с прозрачностью ~8%. */
export function applyGrain(ctx: Ctx, w: number, h: number, alpha = 0.08, size = 96, x = 0, y = 0): void {
  const tile = grainTile(mulberry32(0x9a17), size);
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Волокно поверх непрозрачной части холста. applyGrain смешивает умножением и осветлением,
 * а такие режимы красят и прозрачные пиксели, поэтому после зерна форма восстанавливается
 * по исходной альфе.
 */
export function grainInside(c: HTMLCanvasElement, alpha = 0.08, size = 96): void {
  const shape = makeCanvas(c.width, c.height);
  ctx2d(shape).drawImage(c, 0, 0);
  const ctx = ctx2d(c);
  applyGrain(ctx, c.width, c.height, alpha, size);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(shape, 0, 0);
  ctx.restore();
}

// ───────────────────────────── заливка и кромки ─────────────────────────────

export interface FillOptions {
  /** Разброс тона, по умолчанию ±4%. */
  tone?: number;
  grain?: number;
  /** Крупные пятна тона: сколько. */
  blotches?: number;
}

/** Плоская заливка с разбросом тона ±4% и наложением волокна (7.4). */
export function paperFill(ctx: Ctx, path: Path, color: string, rng: Rng, opts: FillOptions = {}): void {
  const tone = opts.tone ?? 0.04;
  const b = pathBounds(path);
  ctx.save();
  tracePath(ctx, path);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  const blotches = opts.blotches ?? 5;
  for (let i = 0; i < blotches; i++) {
    const x = b.x + rng() * b.w;
    const y = b.y + rng() * b.h;
    const r = (0.25 + rng() * 0.45) * Math.max(b.w, b.h);
    const k = (rng() - 0.5) * 2 * tone;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(k > 0 ? '#ffffff' : '#000000', Math.abs(k)));
    g.addColorStop(1, rgba(k > 0 ? '#ffffff' : '#000000', 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  }
  // Волокно — только в пределах фигуры: узор привязан к холсту, поэтому стыков нет.
  applyGrain(ctx, b.w + 4, b.h + 4, opts.grain ?? 0.08, 96, b.x - 2, b.y - 2);
  ctx.restore();
}

/**
 * Кромка среза (7.4): светлая полоска 1–2 px со стороны солнца и чуть более тёмная —
 * с противоположной. `sun` — направление НА солнце (единичный вектор).
 */
export function cutEdge(
  ctx: Ctx,
  path: Path,
  sun: Pt,
  opts: { light?: number; dark?: number; width?: number } = {},
): void {
  const w = opts.width ?? 2;
  ctx.save();
  tracePath(ctx, path);
  ctx.clip();
  ctx.lineJoin = 'round';
  // Светлая сторона: контур, сдвинутый от солнца, виден у кромок, обращённых к солнцу.
  ctx.translate(-sun.x * w * 0.6, -sun.y * w * 0.6);
  tracePath(ctx, path);
  ctx.strokeStyle = `rgba(255,255,255,${opts.light ?? 0.75})`;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.translate(sun.x * w * 1.2, sun.y * w * 1.2);
  tracePath(ctx, path);
  ctx.strokeStyle = `rgba(10,25,50,${opts.dark ?? 0.22})`;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

/** Видимая толщина (7.4): несколько слоёв со сдвигом вниз, нижние темнее. */
export function stack(ctx: Ctx, path: Path, layers: number, offset: number, tones: string[], rng: Rng): void {
  for (let i = layers; i >= 1; i--) {
    const p = translatePath(path, 0, offset * i);
    const tone = tones[Math.min(tones.length - 1, i - 1)];
    paperFill(ctx, p, tone, rng, { tone: 0.03, blotches: 2, grain: 0.06 });
    // тонкая тёмная линия стыка между слоями
    ctx.save();
    tracePath(ctx, p);
    ctx.clip();
    tracePath(ctx, translatePath(path, 0, offset * (i - 1)));
    ctx.strokeStyle = 'rgba(20,50,80,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

/** Белая волокнистая кромка вдоль разрыва — бумажная сердцевина (7.4). */
export function fiberCore(ctx: Ctx, tearPath: Pt[], rng: Rng, width = 2.2, color = '#ffffff'): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  tearPath.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  // торчащие волоски
  ctx.lineWidth = 0.7;
  for (let i = 1; i < tearPath.length; i++) {
    if (rng() > 0.55) continue;
    const a = tearPath[i - 1];
    const b = tearPath[i];
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const d = Math.hypot(nx, ny) || 1;
    const s = (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 2.5);
    ctx.globalAlpha = 0.6 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + (nx / d) * s + (rng() - 0.5) * 1.5, b.y + (ny / d) * s + (rng() - 0.5) * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Пятно намокания (7.4): растёт от краёв к центру по параметру t ∈ [0, 1].
 * Без canvas-фильтров: заливка формы и «выедание» середины мягкими неровными пятнами.
 */
export function wetStain(ctx: Ctx, path: Path, t: number, color: string, rng: Rng): void {
  if (t <= 0) return;
  const k = Math.min(1, t);
  const b = pathBounds(path);
  const c = centroid(path);
  const R = Math.max(b.w, b.h) * 0.62;
  const layer = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const g = ctx2d(layer);
  tracePath(g, path);
  g.fillStyle = rgba(color, 0.5 + 0.3 * k);
  g.fill();
  // сухая середина сжимается к центру; край неровный — несколько смещённых пятен
  const inner = R * (1 - k) * 0.95;
  if (inner > 1) {
    g.globalCompositeOperation = 'destination-out';
    const lumps = 5;
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * Math.PI * 2 + rng() * 0.8;
      const off = inner * 0.22 * rng();
      const x = c.x + Math.cos(a) * off;
      const y = c.y + Math.sin(a) * off;
      const r = inner * (0.82 + rng() * 0.3);
      const gr = g.createRadialGradient(x, y, r * 0.55, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, layer.width, layer.height);
    }
    g.globalCompositeOperation = 'source-over';
  }
  // тёмные подтёки у самого края
  g.save();
  tracePath(g, path);
  g.clip();
  tracePath(g, path);
  g.strokeStyle = rgba(color, 0.35 + 0.3 * k);
  g.lineWidth = 3 + 6 * k;
  g.stroke();
  g.restore();
  ctx.drawImage(layer, 0, 0);
}

/** Силуэт объекта, залитый цветом тени и заранее размытый (7.4). */
export function silhouetteShadow(src: HTMLCanvasElement, blur: number, color = '#000000'): HTMLCanvasElement {
  const pad = Math.ceil(blur * 2.5);
  const c = makeCanvas(src.width + pad * 2, src.height + pad * 2);
  const ctx = ctx2d(c);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(src, pad, pad);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// ───────────────────────────── слова, пузыри, мелочи ─────────────────────────────

const wordCache = new Map<string, HTMLCanvasElement>();

export interface WordStyle {
  colors: string[];
  font: string;
  size: number;
  shadow: string;
  seed?: number;
}

/**
 * Слово-звук (7.4): каждая буква вырезана из бумаги своего цвета, чуть повёрнута
 * и отбрасывает тень. Кэшируется.
 */
export function paperWord(text: string, style: WordStyle): HTMLCanvasElement {
  const key = `${text}|${style.colors.join(',')}|${style.size}|${style.font}`;
  const hit = wordCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(style.seed ?? hashString(text));
  const size = style.size;
  const font = `700 ${size}px ${style.font}`;
  const measure = ctx2d(makeCanvas(4, 4));
  measure.font = font;
  const letters = [...text];
  const widths = letters.map((ch) => (ch === ' ' ? size * 0.32 : measure.measureText(ch).width));
  const pad = size * 0.4;
  const gap = size * 0.02;
  const total = widths.reduce((a, b) => a + b + gap, 0);
  const c = makeCanvas(total + pad * 2, size * 1.55 + pad);
  const ctx = ctx2d(c);
  let x = pad;
  const baseY = pad * 0.5 + size * 1.05;
  letters.forEach((ch, i) => {
    const w = widths[i];
    if (ch === ' ') {
      x += w + gap;
      return;
    }
    const cx = x + w / 2;
    const rot = (rng() - 0.5) * 0.22;
    const dy = (rng() - 0.5) * size * 0.12;
    const color = style.colors[i % style.colors.length];
    // буква — кусочек бумаги: подложка-«поле» вокруг глифа, как вырезанная ножницами
    const glyph = makeCanvas(w + size * 0.5, size * 1.5);
    const g = ctx2d(glyph);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.strokeStyle = '#fbfaf5';
    g.lineWidth = size * 0.16;
    g.strokeText(ch, glyph.width / 2, size * 1.1);
    g.fillStyle = color;
    g.fillText(ch, glyph.width / 2, size * 1.1);
    // волокно на букве — только на самой букве, а не на прямоугольнике холста
    grainInside(glyph, 0.1, 64);
    const sh = silhouetteShadow(glyph, size * 0.05, style.shadow);
    ctx.save();
    ctx.translate(cx, baseY - size * 0.55 + dy);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(sh, -sh.width / 2 + size * 0.06, -sh.height / 2 + size * 0.09);
    ctx.globalAlpha = 1;
    ctx.drawImage(glyph, -glyph.width / 2, -glyph.height / 2);
    ctx.restore();
    x += w + gap;
  });
  wordCache.set(key, c);
  return c;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Бумажный пузырь реплики (7.4). */
export function bubble(
  ctx: Ctx,
  w: number,
  h: number,
  tail: 'left' | 'right' | 'down',
  rng: Rng,
  fill = '#fbfaf5',
): void {
  const r = Math.min(18, h * 0.3);
  const body: Path = [];
  const pts = 40;
  for (let i = 0; i < pts; i++) {
    const t = (i / pts) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const p = 4;
    const k = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
    body.push({ x: w / 2 + c * k * (w / 2 - r * 0.2), y: h / 2 + s * k * (h / 2 - r * 0.2) });
  }
  const cut = scissorCut(rng, body, 1.2, 6);
  ctx.save();
  tracePath(ctx, cut);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  const tx = tail === 'left' ? w * 0.22 : tail === 'right' ? w * 0.78 : w * 0.5;
  ctx.moveTo(tx - 9, h - 4);
  ctx.lineTo(tx + (tail === 'left' ? -10 : 10), h + 14);
  ctx.lineTo(tx + 9, h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Бумажный след сапога (7.4): подошва с округлым носком, узким подъёмом и отдельным
 * каблуком. Возвращает два контура — подошву и каблук — в координатах (x, y), носок вверх.
 */
export function bootPrint(
  ctx: Ctx,
  x: number,
  y: number,
  size: number,
  angle: number,
  mirror: boolean,
): Path[] {
  void ctx;
  const sole: Path = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // носок шире, к подъёму сужается
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const w = size * (sn < 0 ? 0.3 : 0.23 + 0.04 * sn);
    sole.push({
      x: c * w + (sn < 0 ? size * 0.03 * Math.cos(t * 2) : 0),
      y: -size * 0.12 + sn * size * 0.33,
    });
  }
  const heel: Path = [];
  for (let i = 0; i < 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    heel.push({ x: Math.cos(t) * size * 0.22, y: size * 0.38 + Math.sin(t) * size * 0.14 });
  }
  const tr = (p: Pt): Pt => {
    const px = mirror ? -p.x : p.x;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    return { x: x + px * c - p.y * sn, y: y + px * sn + p.y * c };
  };
  return [sole.map(tr), heel.map(tr)];
}

/** Снежинка-заряд: шесть лучей с веточками (7.4). */
export function snowflake(ctx: Ctx, x: number, y: number, r: number, color: string, filled: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(-r * 0.28, -r * 0.8);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.28, -r * 0.8);
    ctx.stroke();
    ctx.restore();
  }
  if (filled) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
