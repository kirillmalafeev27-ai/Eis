import { palette } from '../../config/palette';
import {
  type Path,
  type Pt,
  type Rng,
  blobPath,
  ctx2d,
  cutEdge,
  makeCanvas,
  mix,
  paperFill,
  rgba,
  scissorCut,
  shade,
  tracePath,
  translatePath,
} from '../../shared/paperKit';

/**
 * Стоящие бумажные фигурки берегов (7.5.6–7.5.7, 7.5.12): сосны, избушка, сани,
 * сугробы, ворона. Начало координат каждой — середина основания.
 */
export interface Standing {
  canvas: HTMLCanvasElement;
  /** Доля ширины/высоты, где основание (origin для спрайта). */
  ox: number;
  oy: number;
}

function softShadowUnder(ctx: CanvasRenderingContext2D, p: Path, sun: Pt, s: number, k = 3): void {
  ctx.save();
  ctx.filter = `blur(${2 * s}px)`;
  tracePath(ctx, translatePath(p, -sun.x * k * s, -sun.y * k * s));
  ctx.fillStyle = rgba(palette.shadow, 0.32);
  ctx.fill();
  ctx.restore();
  ctx.filter = 'none';
}

/** Сосна (7.5.6): ярусы зубчатых треугольников со снежными шапками. */
export function pine(rng: Rng, s: number, sun: Pt, size: number): Standing {
  const h = (170 + size * 60) * s;
  const w = (96 + size * 30) * s;
  const pad = 8 * s;
  const c = makeCanvas(w + pad * 2, h + pad);
  const ctx = ctx2d(c);
  const cx = c.width / 2;
  const base = c.height - 2 * s;
  // ствол
  const trunk: Path = scissorCut(
    rng,
    [
      { x: cx - 6 * s, y: base },
      { x: cx - 4 * s, y: base - 34 * s },
      { x: cx + 4 * s, y: base - 34 * s },
      { x: cx + 6 * s, y: base },
    ],
    0.6 * s,
    5 * s,
  );
  paperFill(ctx, trunk, palette.wood.shade, rng, { tone: 0.04, blotches: 1 });
  const tiers = 4 + (size > 0.5 ? 1 : 0);
  const crownTop = base - h + 6 * s;
  const crownBot = base - 22 * s;
  for (let t = 0; t < tiers; t++) {
    const k0 = t / tiers;
    const k1 = (t + 1) / tiers;
    const yTop = crownTop + (crownBot - crownTop) * k0 * 0.86;
    const yBot = crownTop + (crownBot - crownTop) * k1;
    const half = (w / 2) * (0.32 + 0.68 * k1) * (0.92 + rng() * 0.12);
    // зубчатый нижний край яруса
    const teeth = 5 + Math.floor(half / (9 * s));
    const tier: Path = [{ x: cx + (rng() - 0.5) * 3 * s, y: yTop - (t === 0 ? 10 * s : 0) }];
    for (let i = 0; i <= teeth; i++) {
      const u = i / teeth;
      const x = cx + half - 2 * half * u;
      const dip = i % 2 ? -7 * s * (0.6 + rng() * 0.6) : 0;
      tier.push({ x, y: yBot + dip + (rng() - 0.5) * 2 * s });
    }
    const p = scissorCut(rng, tier, 1 * s, 6 * s);
    softShadowUnder(ctx, p, sun, s, 4);
    paperFill(ctx, p, mix(palette.pine.base, palette.pine.shade, rng() * 0.25), rng, {
      tone: 0.04,
      blotches: 2,
      grain: 0.07,
    });
    // свет со стороны солнца — светлая половина яруса
    ctx.save();
    tracePath(ctx, p);
    ctx.clip();
    const lit: Path = [
      { x: cx, y: yTop - 12 * s },
      { x: cx + sun.x * half * 2.2, y: yBot + 10 * s },
      { x: cx, y: yBot + 10 * s },
    ];
    tracePath(ctx, lit);
    ctx.fillStyle = rgba(palette.pine.light, 0.75);
    ctx.fill();
    ctx.restore();
    cutEdge(ctx, p, sun, { light: 0.35, dark: 0.25, width: 1.6 * s });
    // снежная шапка на ярусе
    const snow: Path = [];
    const sw = half * (0.55 + rng() * 0.3);
    const sy = yTop + (yBot - yTop) * 0.18;
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      snow.push({
        x: cx - sw + 2 * sw * u,
        y: sy + Math.abs(u - 0.5) * (yBot - yTop) * 0.7 + (rng() - 0.3) * 2 * s,
      });
    }
    for (let i = n; i >= 0; i--) {
      const u = i / n;
      snow.push({
        x: cx - sw + 2 * sw * u,
        y: sy + Math.abs(u - 0.5) * (yBot - yTop) * 0.7 + (5 + rng() * 5) * s * (1 - Math.abs(u - 0.5)),
      });
    }
    const sp = scissorCut(rng, snow, 0.8 * s, 4 * s);
    paperFill(ctx, sp, palette.snow.base, rng, { tone: 0.02, blotches: 0, grain: 0.04 });
    cutEdge(ctx, sp, sun, { light: 0.9, dark: 0.2, width: 1.3 * s });
  }
  // снег у подножия
  const foot = scissorCut(rng, blobPath(rng, cx, base - 3 * s, 24 * s, 6 * s, 16, 0.25), 0.8 * s, 4 * s);
  paperFill(ctx, foot, palette.snow.base, rng, { tone: 0.02, blotches: 0 });
  cutEdge(ctx, foot, sun, { light: 0.7, dark: 0.2, width: 1.2 * s });
  return { canvas: c, ox: 0.5, oy: (base - 1 * s) / c.height };
}

/** Избушка (7.5.7): бревенчатый сруб под снежной крышей, тёплое окно, труба. */
export function hut(rng: Rng, s: number, sun: Pt): Standing & { window: Pt; chimney: Pt } {
  const W = 170 * s;
  const H = 170 * s;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const cx = W / 2;
  const base = H - 6 * s;
  const wallW = 108 * s;
  const wallH = 62 * s;
  const wallTop = base - wallH;
  // труба (за крышей)
  const chimX = cx + 26 * s;
  const chim: Path = scissorCut(
    rng,
    [
      { x: chimX - 8 * s, y: wallTop - 58 * s },
      { x: chimX + 8 * s, y: wallTop - 58 * s },
      { x: chimX + 8 * s, y: wallTop - 20 * s },
      { x: chimX - 8 * s, y: wallTop - 20 * s },
    ],
    0.6 * s,
    5 * s,
  );
  paperFill(ctx, chim, mix(palette.wood.shade, '#6b6f78', 0.5), rng, { tone: 0.05, blotches: 1 });
  const chimSnow = scissorCut(
    rng,
    blobPath(rng, chimX, wallTop - 59 * s, 11 * s, 4 * s, 12, 0.2),
    0.6 * s,
    4 * s,
  );
  paperFill(ctx, chimSnow, palette.snow.base, rng, { tone: 0.02, blotches: 0 });
  // стены — брёвна
  const wall: Path = [
    { x: cx - wallW / 2, y: wallTop },
    { x: cx + wallW / 2, y: wallTop },
    { x: cx + wallW / 2, y: base },
    { x: cx - wallW / 2, y: base },
  ];
  softShadowUnder(ctx, wall, sun, s, 4);
  const logs = 6;
  for (let i = 0; i < logs; i++) {
    const y0 = wallTop + (wallH / logs) * i;
    const log: Path = scissorCut(
      rng,
      [
        { x: cx - wallW / 2 - 4 * s, y: y0 + 1 * s },
        { x: cx + wallW / 2 + 4 * s, y: y0 + (rng() - 0.5) * 1.5 * s },
        { x: cx + wallW / 2 + 4 * s, y: y0 + wallH / logs },
        { x: cx - wallW / 2 - 4 * s, y: y0 + wallH / logs + (rng() - 0.5) * 1.5 * s },
      ],
      0.6 * s,
      6 * s,
    );
    paperFill(ctx, log, mix(palette.wood.base, palette.wood.shade, i % 2 ? 0.15 : 0), rng, {
      tone: 0.05,
      blotches: 2,
    });
    ctx.save();
    tracePath(ctx, log);
    ctx.clip();
    ctx.fillStyle = rgba(palette.wood.shade, 0.55);
    ctx.fillRect(cx - wallW / 2 - 4 * s, y0 + wallH / logs - 2.2 * s, wallW + 8 * s, 2.2 * s);
    ctx.restore();
    // торцы брёвен
    for (const ex of [cx - wallW / 2 - 2 * s, cx + wallW / 2 + 2 * s]) {
      ctx.beginPath();
      ctx.arc(ex, y0 + wallH / logs / 2, wallH / logs / 2 - 0.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = mix(palette.wood.base, '#e9c79a', 0.45);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, y0 + wallH / logs / 2, wallH / logs / 4, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(palette.wood.shade, 0.6);
      ctx.lineWidth = 0.8 * s;
      ctx.stroke();
    }
  }
  // дверь
  const door: Path = scissorCut(
    rng,
    [
      { x: cx - 34 * s, y: base - 44 * s },
      { x: cx - 14 * s, y: base - 44 * s },
      { x: cx - 14 * s, y: base },
      { x: cx - 34 * s, y: base },
    ],
    0.5 * s,
    4 * s,
  );
  paperFill(ctx, door, palette.wood.shade, rng, { tone: 0.04, blotches: 1 });
  ctx.fillStyle = rgba(palette.windowLight, 0.9);
  ctx.beginPath();
  ctx.arc(cx - 18 * s, base - 22 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();
  // окно — тёплый свет (единственный тёплый источник сцены)
  const win: Pt = { x: cx + 20 * s, y: base - 34 * s };
  const ww = 26 * s;
  const wh = 22 * s;
  const frame: Path = [
    { x: win.x - ww / 2 - 4 * s, y: win.y - wh / 2 - 4 * s },
    { x: win.x + ww / 2 + 4 * s, y: win.y - wh / 2 - 4 * s },
    { x: win.x + ww / 2 + 4 * s, y: win.y + wh / 2 + 4 * s },
    { x: win.x - ww / 2 - 4 * s, y: win.y + wh / 2 + 4 * s },
  ];
  paperFill(ctx, frame, shade(palette.wood.shade, -0.15), rng, { tone: 0.03, blotches: 0 });
  const glass: Path = [
    { x: win.x - ww / 2, y: win.y - wh / 2 },
    { x: win.x + ww / 2, y: win.y - wh / 2 },
    { x: win.x + ww / 2, y: win.y + wh / 2 },
    { x: win.x - ww / 2, y: win.y + wh / 2 },
  ];
  const g = ctx.createRadialGradient(win.x, win.y, 1, win.x, win.y, ww * 0.75);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.55, palette.windowLight);
  g.addColorStop(1, shade(palette.windowLight, -0.15));
  tracePath(ctx, glass);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = shade(palette.wood.shade, -0.15);
  ctx.fillRect(win.x - 1.4 * s, win.y - wh / 2, 2.8 * s, wh);
  ctx.fillRect(win.x - ww / 2, win.y - 1.4 * s, ww, 2.8 * s);
  // снег на подоконнике
  const sill = scissorCut(
    rng,
    blobPath(rng, win.x, win.y + wh / 2 + 4 * s, ww * 0.62, 3.2 * s, 12, 0.2),
    0.5 * s,
    3 * s,
  );
  paperFill(ctx, sill, palette.snow.base, rng, { tone: 0.02, blotches: 0 });
  // крыша — толстая снежная подушка с голубой тенью
  const roofL = cx - wallW / 2 - 16 * s;
  const roofR = cx + wallW / 2 + 16 * s;
  const peak = wallTop - 52 * s;
  const roof: Path = [
    { x: cx, y: peak },
    { x: roofR + 4 * s, y: wallTop + 6 * s },
    { x: roofR - 4 * s, y: wallTop + 14 * s },
    { x: roofL + 4 * s, y: wallTop + 14 * s },
    { x: roofL - 4 * s, y: wallTop + 6 * s },
  ];
  const roofCut = scissorCut(rng, roof, 1.2 * s, 6 * s);
  // скат под снегом — тёмное дерево торцом
  const eave: Path = translatePath(roofCut, 0, 5 * s);
  paperFill(ctx, eave, palette.wood.shade, rng, { tone: 0.03, blotches: 0 });
  softShadowUnder(ctx, roofCut, sun, s, 4);
  paperFill(ctx, roofCut, palette.snow.base, rng, { tone: 0.025, blotches: 3, grain: 0.05 });
  ctx.save();
  tracePath(ctx, roofCut);
  ctx.clip();
  ctx.filter = `blur(${4 * s}px)`;
  const shadeSide: Path = [
    { x: cx + 4 * s, y: peak + 6 * s },
    { x: roofR + 10 * s, y: wallTop + 10 * s },
    { x: cx + 6 * s, y: wallTop + 20 * s },
  ];
  tracePath(ctx, shadeSide);
  ctx.fillStyle = rgba(palette.snow.shade, 0.95);
  ctx.fill();
  ctx.restore();
  ctx.filter = 'none';
  cutEdge(ctx, roofCut, sun, { light: 1, dark: 0.2, width: 2 * s });
  // сосульки по краю крыши
  for (let x = roofL + 6 * s; x < roofR - 6 * s; x += (7 + rng() * 7) * s) {
    const len = (4 + rng() * 9) * s;
    const ic: Path = [
      { x: x - 2 * s, y: wallTop + 13 * s },
      { x: x + 2 * s, y: wallTop + 13 * s },
      { x: x + 0.3 * s, y: wallTop + 13 * s + len },
    ];
    tracePath(ctx, ic);
    ctx.fillStyle = rgba(palette.thinIce.base, 0.95);
    ctx.fill();
  }
  // сугроб у стены
  const drift = scissorCut(
    rng,
    blobPath(rng, cx + 6 * s, base - 1 * s, wallW * 0.62, 9 * s, 22, 0.3),
    1 * s,
    5 * s,
  );
  paperFill(ctx, drift, palette.snow.base, rng, { tone: 0.02, blotches: 1 });
  cutEdge(ctx, drift, sun, { light: 0.9, dark: 0.18, width: 1.4 * s });
  return {
    canvas: c,
    ox: 0.5,
    oy: (base - 2 * s) / H,
    window: { x: win.x / W, y: win.y / H },
    chimney: { x: chimX / W, y: (wallTop - 60 * s) / H },
  };
}

/** Мягкий ореол тёплого окна (8.1.3): заранее размытый, кладётся аддитивно. */
export function glowHalo(s: number, radius: number, color: string, core = 0.9): HTMLCanvasElement {
  const r = radius * s;
  const c = makeCanvas(r * 2, r * 2);
  const ctx = ctx2d(c);
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(color, core));
  g.addColorStop(0.25, rgba(color, core * 0.45));
  g.addColorStop(0.6, rgba(color, core * 0.12));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Санки у избушки (7.5.7). */
export function sled(rng: Rng, s: number, sun: Pt): Standing {
  const W = 92 * s;
  const H = 48 * s;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const base = H - 4 * s;
  // полозья
  ctx.strokeStyle = palette.wood.shade;
  ctx.lineWidth = 3.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(10 * s, base - 2 * s);
  ctx.lineTo(W - 20 * s, base - 2 * s);
  ctx.quadraticCurveTo(W - 6 * s, base - 2 * s, W - 8 * s, base - 16 * s);
  ctx.stroke();
  for (const x of [22 * s, 46 * s, 66 * s]) {
    ctx.beginPath();
    ctx.moveTo(x, base - 2 * s);
    ctx.lineTo(x, base - 14 * s);
    ctx.lineWidth = 2.4 * s;
    ctx.stroke();
  }
  const seat: Path = scissorCut(
    rng,
    [
      { x: 12 * s, y: base - 20 * s },
      { x: W - 16 * s, y: base - 20 * s },
      { x: W - 18 * s, y: base - 13 * s },
      { x: 14 * s, y: base - 13 * s },
    ],
    0.5 * s,
    5 * s,
  );
  paperFill(ctx, seat, palette.wood.base, rng, { tone: 0.05, blotches: 1 });
  cutEdge(ctx, seat, sun, { light: 0.6, dark: 0.25, width: 1.3 * s });
  const sn = scissorCut(rng, blobPath(rng, 36 * s, base - 22 * s, 18 * s, 4 * s, 12, 0.3), 0.5 * s, 3 * s);
  paperFill(ctx, sn, palette.snow.base, rng, { tone: 0.02, blotches: 0 });
  return { canvas: c, ox: 0.5, oy: base / H };
}

/** Сугроб-подушка (декор берега). */
export function snowDrift(rng: Rng, s: number, sun: Pt): Standing {
  const W = (60 + rng() * 40) * s;
  const H = 30 * s;
  const c = makeCanvas(W + 8 * s, H + 8 * s);
  const ctx = ctx2d(c);
  const p = scissorCut(
    rng,
    blobPath(rng, c.width / 2, c.height - 12 * s, W / 2, 10 * s, 20, 0.3),
    1 * s,
    5 * s,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, c.width, c.height - 12 * s);
  ctx.clip();
  softShadowUnder(ctx, p, sun, s, 3);
  paperFill(ctx, p, palette.snow.base, rng, { tone: 0.02, blotches: 1 });
  cutEdge(ctx, p, sun, { light: 0.9, dark: 0.2, width: 1.4 * s });
  ctx.restore();
  return { canvas: c, ox: 0.5, oy: (c.height - 12 * s) / c.height };
}

/** Тень пролетающей вороны (7.5.12): виден только силуэт. */
export function crowShadow(s: number): HTMLCanvasElement {
  const W = 120 * s;
  const H = 70 * s;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  ctx.filter = `blur(${2.5 * s}px)`;
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.42);
  ctx.bezierCurveTo(W * 0.38, H * 0.18, W * 0.18, H * 0.12, W * 0.04, H * 0.3);
  ctx.bezierCurveTo(W * 0.2, H * 0.32, W * 0.32, H * 0.44, W * 0.42, H * 0.56);
  ctx.lineTo(W * 0.46, H * 0.86);
  ctx.lineTo(W * 0.54, H * 0.86);
  ctx.lineTo(W * 0.58, H * 0.56);
  ctx.bezierCurveTo(W * 0.68, H * 0.44, W * 0.8, H * 0.32, W * 0.96, H * 0.3);
  ctx.bezierCurveTo(W * 0.82, H * 0.12, W * 0.62, H * 0.18, W * 0.5, H * 0.42);
  ctx.fill();
  return c;
}
