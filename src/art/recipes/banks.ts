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
  stack,
  tracePath,
  translatePath,
} from '../../shared/paperKit';

/**
 * Берега (7.5.6–7.5.7): заснеженная бумага в несколько слоёв. Холст рисуется для портрета —
 * горизонтальная полоса вдоль течения; для ландшафта его поворачивают.
 * Координаты: x — вдоль течения, клетка 0 начинается на `extra` клеток правее края холста.
 */
export interface BankSpec {
  side: 'near' | 'far';
  /** L — клеток вдоль течения. */
  length: number;
  /** Сколько клеток холста за пределами реки с каждой стороны. */
  extra: number;
  /** Глубина полосы в клетках: строка берега + поле. */
  depth: number;
  /** Колонка мостков (только ближний берег). */
  bridgeL?: number;
}

export function bankCanvas(rng: Rng, s: number, sun: Pt, spec: BankSpec): HTMLCanvasElement {
  const C = 128 * s;
  const W = Math.round((spec.length + spec.extra * 2) * C);
  const H = Math.round(spec.depth * C);
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const near = spec.side === 'near';
  // Кромка у воды: у ближнего берега сверху, у дальнего — снизу (там видны слои-обрыв).
  const edgeY = near ? 8 * s : H - 14 * s;
  const wave = (x: number) =>
    Math.sin(x / (61 * s)) * 3.2 * s + Math.sin(x / (23 * s) + 1.3) * 1.6 * s + Math.sin(x / (137 * s) + 0.4) * 4 * s;
  const edge: Pt[] = [];
  for (let x = -10 * s; x <= W + 10 * s; x += 7 * s) edge.push({ x, y: edgeY + wave(x) + (rng() - 0.5) * 1.2 * s });
  const body: Path = near ? [...edge, { x: W + 10 * s, y: H + 10 * s }, { x: -10 * s, y: H + 10 * s }] : [{ x: -10 * s, y: -10 * s }, { x: W + 10 * s, y: -10 * s }, ...edge.slice().reverse()];
  const snow = scissorCut(rng, body, 1.2 * s, 7 * s);

  if (!near) {
    // Обрыв дальнего берега: слои снега и льда по нижнему краю, нижние темнее.
    stack(ctx, snow, 3, 4.5 * s, [palette.snow.shade, shade(palette.snow.shade, -0.1), shade(palette.thickIce.sideDark, -0.05)], rng);
  } else {
    // Мягкая тень ближнего берега на воду (кромка приподнята над водой).
    ctx.save();
    ctx.filter = `blur(${3 * s}px)`;
    tracePath(ctx, translatePath(snow, -sun.x * 3 * s, -sun.y * 3 * s));
    ctx.fillStyle = rgba(palette.shadow, 0.3);
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
  }
  paperFill(ctx, snow, palette.snow.base, rng, { tone: 0.035, blotches: 9, grain: 0.06 });
  cutEdge(ctx, snow, sun, { light: 1, dark: 0.18, width: 2.2 * s });

  // Сугробы: подушки бумаги с голубой тенью со стороны от солнца.
  const drifts = Math.round((W / C) * 0.9);
  for (let i = 0; i < drifts; i++) {
    const x = rng() * W;
    const yMid = near ? edgeY + (0.35 + rng() * 0.6) * (H - edgeY) : (0.08 + rng() * 0.55) * edgeY;
    const rx = (22 + rng() * 40) * s;
    const ry = (8 + rng() * 12) * s;
    const p = scissorCut(rng, blobPath(rng, x, yMid, rx, ry, 22, 0.25), 1 * s, 6 * s);
    ctx.save();
    ctx.filter = `blur(${3 * s}px)`;
    tracePath(ctx, translatePath(p, -sun.x * 5 * s, -sun.y * 5 * s));
    ctx.fillStyle = rgba(palette.snow.shade, 0.85);
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
    paperFill(ctx, p, mix(palette.snow.base, '#ffffff', 0.5), rng, { tone: 0.02, blotches: 1, grain: 0.05 });
    cutEdge(ctx, p, sun, { light: 0.9, dark: 0.12, width: 1.6 * s });
  }

  // Следы на снегу: от края холста к мосткам (ближний) или от избушки к воде (дальний).
  const printColor = rgba(palette.snow.shade, 0.95);
  const trail = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / (17 * s)));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t + Math.sin(t * 7) * 6 * s;
      const y = y0 + (y1 - y0) * t;
      const side = i % 2 ? 1 : -1;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const ox = Math.cos(ang + Math.PI / 2) * 5 * s * side;
      const oy = Math.sin(ang + Math.PI / 2) * 5 * s * side;
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = printColor;
      ctx.fill();
      ctx.restore();
    }
  };
  if (near && spec.bridgeL !== undefined) {
    const bx = (spec.bridgeL + spec.extra + 0.5) * C;
    trail(bx - 2.2 * C, H - 4 * s, bx, edgeY + 0.75 * C);
  } else if (!near) {
    const hx = (spec.length * 0.62 + spec.extra) * C;
    trail(hx, H * 0.15, hx - 0.4 * C, edgeY - 0.25 * C);
  }
  // Вороньи следы — трезубцы.
  for (let i = 0; i < 2; i++) {
    let x = rng() * W;
    let y = near ? edgeY + (0.3 + rng() * 0.5) * C : edgeY - (0.4 + rng() * 0.5) * C;
    const ang = rng() * Math.PI * 2;
    for (let k = 0; k < 7; k++) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (rng() - 0.5) * 0.4);
      ctx.strokeStyle = rgba(palette.snow.shade, 1);
      ctx.lineWidth = 1.2 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -5 * s);
      ctx.moveTo(0, 0);
      ctx.lineTo(-3 * s, -4 * s);
      ctx.moveTo(0, 0);
      ctx.lineTo(3 * s, -4 * s);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 2.5 * s);
      ctx.stroke();
      ctx.restore();
      x += Math.cos(ang) * 9 * s + (k % 2 ? 3 : -3) * s;
      y += Math.sin(ang) * 9 * s;
    }
  }
  return c;
}

/** Деревянные мостки (7.5.6): несколько досок на снегу, чуть заходят на воду. */
export function bridge(rng: Rng, s: number, sun: Pt): HTMLCanvasElement {
  const w = 96 * s;
  const h = 132 * s;
  const c = makeCanvas(w + 12 * s, h + 12 * s);
  const ctx = ctx2d(c);
  const planks = 5;
  const pw = (w - 8 * s) / planks;
  // две балки
  for (const bx of [w * 0.22, w * 0.78]) {
    const beam: Path = scissorCut(rng, [
      { x: bx - 4 * s, y: 4 * s },
      { x: bx + 4 * s, y: 4 * s },
      { x: bx + 4 * s, y: h },
      { x: bx - 4 * s, y: h },
    ], 0.6 * s, 5 * s);
    paperFill(ctx, translatePath(beam, 6 * s, 6 * s), palette.wood.shade, rng, { tone: 0.03, blotches: 1 });
  }
  for (let i = 0; i < 6; i++) {
    const y = 8 * s + i * (h - 16 * s) / 6;
    const ph = (h - 16 * s) / 6 - 3 * s;
    const plank: Path = scissorCut(rng, [
      { x: 6 * s + (rng() - 0.5) * 3 * s, y: y },
      { x: w + (rng() - 0.5) * 3 * s, y: y + (rng() - 0.5) * 2 * s },
      { x: w + (rng() - 0.5) * 3 * s, y: y + ph },
      { x: 6 * s + (rng() - 0.5) * 3 * s, y: y + ph + (rng() - 0.5) * 2 * s },
    ], 0.8 * s, 6 * s);
    ctx.save();
    ctx.filter = `blur(${1.5 * s}px)`;
    tracePath(ctx, translatePath(plank, -sun.x * 2.5 * s, -sun.y * 2.5 * s));
    ctx.fillStyle = rgba(palette.shadow, 0.35);
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
    paperFill(ctx, plank, mix(palette.wood.base, palette.wood.shade, rng() * 0.3), rng, { tone: 0.05, blotches: 2 });
    // волокна дерева
    ctx.save();
    tracePath(ctx, plank);
    ctx.clip();
    for (let k = 0; k < 4; k++) {
      const yy = y + rng() * ph;
      ctx.strokeStyle = rgba(palette.wood.shade, 0.45);
      ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      ctx.moveTo(6 * s, yy);
      ctx.bezierCurveTo(w * 0.3, yy + (rng() - 0.5) * 3 * s, w * 0.7, yy + (rng() - 0.5) * 3 * s, w, yy);
      ctx.stroke();
    }
    ctx.restore();
    // снег на доске
    if (rng() < 0.55) {
      const sx = 10 * s + rng() * (w - 30 * s);
      const sn = blobPath(rng, sx, y + ph * 0.45, (8 + rng() * 10) * s, ph * 0.38, 12, 0.3);
      paperFill(ctx, sn, palette.snow.base, rng, { tone: 0.02, blotches: 0 });
    }
    cutEdge(ctx, plank, sun, { light: 0.55, dark: 0.25, width: 1.4 * s });
    void pw;
  }
  return c;
}

/** Камыш (7.5.6): пучок жёлтых бумажных стеблей с метёлками. */
export function reed(rng: Rng, s: number, sun: Pt): HTMLCanvasElement {
  const w = 44 * s;
  const h = 64 * s;
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const stems = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < stems; i++) {
    const x0 = w / 2 + (rng() - 0.5) * 16 * s;
    const lean = (rng() - 0.5) * 16 * s;
    const top = 6 * s + rng() * 16 * s;
    const stem: Path = [
      { x: x0 - 1.4 * s, y: h },
      { x: x0 + lean - 0.8 * s, y: top },
      { x: x0 + lean + 0.8 * s, y: top },
      { x: x0 + 1.4 * s, y: h },
    ];
    paperFill(ctx, stem, mix(palette.reed, palette.wood.base, rng() * 0.25), rng, { tone: 0.04, blotches: 0, grain: 0.04 });
    if (rng() < 0.7) {
      const head = blobPath(rng, x0 + lean, top + 5 * s, 2.6 * s, 7 * s, 10, 0.2);
      paperFill(ctx, head, palette.wood.base, rng, { tone: 0.04, blotches: 0 });
      cutEdge(ctx, head, sun, { light: 0.4, dark: 0.2, width: 1 * s });
    }
    // узкий лист
    if (rng() < 0.6) {
      const ly = h - (12 + rng() * 20) * s;
      const dir = rng() < 0.5 ? -1 : 1;
      const leaf: Path = [
        { x: x0, y: ly },
        { x: x0 + dir * 14 * s, y: ly - 10 * s },
        { x: x0 + dir * 16 * s, y: ly - 9 * s },
        { x: x0 + dir * 2 * s, y: ly + 2 * s },
      ];
      paperFill(ctx, leaf, shade(palette.reed, 0.08), rng, { tone: 0.04, blotches: 0 });
    }
  }
  return c;
}
