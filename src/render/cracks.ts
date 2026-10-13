import { palette } from '../config/palette';
import {
  type Path,
  type Pt,
  type Rng,
  ctx2d,
  fiberCore,
  makeCanvas,
  pathBounds,
  rgba,
  tear,
  tracePath,
} from '../shared/paperKit';

/**
 * Трещины (7.5.4): разрывы растут из точки приземления; в разрыве — тёмная вода,
 * по краям белое волокно. Стадии 25/50/75%: волосок → ветвление → широкие разрывы,
 * на 90% льдина распадается на 2–3 куска. Разрывы — язык только таймера под героем.
 */
export interface CrackLine {
  pts: Pt[];
  stage: number;
  main: boolean;
  angle: number;
}

export function crackGeometry(rng: Rng, top: Path, center: Pt, s: number): CrackLine[] {
  const b = pathBounds(top);
  const reach = Math.max(b.w, b.h) * 0.75;
  const lines: CrackLine[] = [];
  const mains = 3 + (rng() < 0.5 ? 1 : 0);
  const base = rng() * Math.PI * 2;
  for (let i = 0; i < mains; i++) {
    const ang = base + (i / mains) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    const end = { x: center.x + Math.cos(ang) * reach, y: center.y + Math.sin(ang) * reach };
    const pts = tear(rng, center, end, 5 * s, 4 * s);
    const cut = Math.floor(pts.length * (0.32 + rng() * 0.15));
    // Стадия 1 — волосок у точки приземления, стадия 2 — до края.
    lines.push({ pts: pts.slice(0, cut + 1), stage: 1, main: true, angle: ang });
    lines.push({ pts: pts.slice(cut), stage: 2, main: true, angle: ang });
    // Ветвления — стадия 2, мелкие — стадия 3.
    const branches = 1 + Math.floor(rng() * 2);
    for (let k = 0; k < branches; k++) {
      const at = pts[Math.floor(pts.length * (0.3 + rng() * 0.5))];
      const ba = ang + (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6);
      const len = reach * (0.18 + rng() * 0.22);
      lines.push({
        pts: tear(rng, at, { x: at.x + Math.cos(ba) * len, y: at.y + Math.sin(ba) * len }, 3 * s, 3 * s),
        stage: k === 0 ? 2 : 3,
        main: false,
        angle: ba,
      });
    }
  }
  return lines;
}

/** Нарисовать трещины до стадии `stage` на холсте наложения, в пределах контура льдины. */
export function drawCracks(c: HTMLCanvasElement, top: Path, lines: CrackLine[], stage: number, rng: Rng, s: number): void {
  const ctx = ctx2d(c);
  ctx.clearRect(0, 0, c.width, c.height);
  if (stage <= 0) return;
  ctx.save();
  tracePath(ctx, top);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    if (line.stage > stage) continue;
    const wide = stage >= 3 && line.main;
    const w = (wide ? 4.2 : line.main ? (stage >= 2 ? 1.9 : 1.3) : 1.2) * s;
    // белая волокнистая кромка вдоль разрыва
    if (stage >= 2 || line.main) fiberCore(ctx, line.pts, rng, w + 2.6 * s);
    ctx.beginPath();
    line.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = palette.crack.gap;
    ctx.lineWidth = w;
    ctx.stroke();
    if (wide) {
      // глубина разрыва: чуть светлее по оси — вода в щели
      ctx.strokeStyle = rgba(palette.water.mid, 0.75);
      ctx.lineWidth = w * 0.35;
      ctx.stroke();
    }
  }
  // сколы по краю на третьей стадии
  if (stage >= 3) {
    for (const line of lines) {
      if (!line.main || line.stage !== 2) continue;
      const p = line.pts[line.pts.length - 1];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 * s, 0, Math.PI * 2);
      ctx.fillStyle = rgba(palette.crack.gap, 0.85);
      ctx.fill();
      ctx.strokeStyle = palette.crack.fiber;
      ctx.lineWidth = 1.4 * s;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Разрезать льдину (вместе с трещинами) на 2–3 куска по главным разрывам.
 * Возвращает холсты кусков того же размера, что исходный, и направление разлёта.
 */
export function cutPieces(
  floe: HTMLCanvasElement,
  overlay: HTMLCanvasElement | null,
  lines: CrackLine[],
  center: Pt,
  rng: Rng,
  s: number,
  count = 3,
): { canvas: HTMLCanvasElement; dir: Pt }[] {
  const mains = lines.filter((l) => l.main && l.stage === 2).sort((a, b) => a.angle - b.angle);
  const chosen = mains.length > count ? mains.filter((_, i) => i % Math.ceil(mains.length / count) === 0).slice(0, count) : mains;
  if (chosen.length < 2) return [];
  const merged = makeCanvas(floe.width, floe.height);
  const m = ctx2d(merged);
  m.drawImage(floe, 0, 0);
  if (overlay) m.drawImage(overlay, 0, 0);
  const R = Math.max(floe.width, floe.height) * 1.5;
  const pieces: { canvas: HTMLCanvasElement; dir: Pt }[] = [];
  const full = (line: CrackLine): Pt[] => {
    const first = lines.find((l) => l.main && l.stage === 1 && l.angle === line.angle);
    const pts = [...(first ? first.pts : [center]), ...line.pts];
    const last = pts[pts.length - 1];
    return [...pts, { x: center.x + Math.cos(line.angle) * R, y: center.y + Math.sin(line.angle) * R }, last];
  };
  for (let i = 0; i < chosen.length; i++) {
    const a = chosen[i];
    const b = chosen[(i + 1) % chosen.length];
    const a0 = a.angle;
    let a1 = b.angle;
    if (a1 <= a0) a1 += Math.PI * 2;
    const poly: Pt[] = [...full(a)];
    for (let k = 1; k < 8; k++) {
      const t = a0 + ((a1 - a0) * k) / 8;
      poly.push({ x: center.x + Math.cos(t) * R, y: center.y + Math.sin(t) * R });
    }
    poly.push(...full(b).slice().reverse());
    const c = makeCanvas(floe.width, floe.height);
    const ctx = ctx2d(c);
    ctx.save();
    tracePath(ctx, poly);
    ctx.clip();
    ctx.drawImage(merged, 0, 0);
    ctx.restore();
    // белая сердцевина по краям разлома
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    fiberCore(ctx, full(a).slice(0, -2), rng, 2.6 * s);
    fiberCore(ctx, full(b).slice(0, -2), rng, 2.6 * s);
    ctx.restore();
    const mid = (a0 + a1) / 2;
    pieces.push({ canvas: c, dir: { x: Math.cos(mid), y: Math.sin(mid) } });
  }
  return pieces;
}
