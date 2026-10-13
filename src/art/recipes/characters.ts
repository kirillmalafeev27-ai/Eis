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
 * Герой и рыба (7.5.8–7.5.9): фигурки перекладки — части на «шарнирах-кнопках».
 * Каждая часть — свой холст; `pivot` — доля ширины/высоты, где шарнир.
 * Герой нарисован лицом вправо; влево его разворачивает вид.
 */
export interface Part {
  canvas: HTMLCanvasElement;
  pivot: Pt;
}

const P = 6; // поле вокруг детали, мировые единицы

function part(w: number, h: number, s: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; o: number } {
  const c = makeCanvas((w + P * 2) * s, (h + P * 2) * s);
  return { c, ctx: ctx2d(c), o: P * s };
}

/** Кнопка-шарнир: маленький латунный кружок. */
function brad(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 2.1 * s, 0, Math.PI * 2);
  ctx.fillStyle = mix(palette.hero.basket, '#e8d7a8', 0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 0.6 * s, y - 0.6 * s, 0.8 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

function piece(ctx: CanvasRenderingContext2D, path: Path, color: string, rng: Rng, sun: Pt, s: number, light = 0.6): void {
  ctx.save();
  ctx.filter = `blur(${1.2 * s}px)`;
  tracePath(ctx, translatePath(path, -sun.x * 1.8 * s, -sun.y * 1.8 * s));
  ctx.fillStyle = rgba(palette.shadow, 0.3);
  ctx.fill();
  ctx.restore();
  ctx.filter = 'none';
  paperFill(ctx, path, color, rng, { tone: 0.035, blotches: 2, grain: 0.07 });
  cutEdge(ctx, path, sun, { light, dark: 0.22, width: 1.4 * s });
}

/** Нога в сапоге; шарнир — бедро (верх). */
export function heroLeg(rng: Rng, s: number, sun: Pt): Part {
  const w = 16;
  const h = 26;
  const { c, ctx, o } = part(w, h, s);
  const shin: Path = scissorCut(rng, [
    { x: o + 3 * s, y: o },
    { x: o + 12 * s, y: o },
    { x: o + 12.5 * s, y: o + 18 * s },
    { x: o + 3 * s, y: o + 18 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, shin, shade(palette.hero.hat, -0.35), rng, sun, s, 0.35);
  const boot: Path = scissorCut(rng, [
    { x: o + 2 * s, y: o + 12 * s },
    { x: o + 13 * s, y: o + 12 * s },
    { x: o + 13.5 * s, y: o + 20 * s },
    { x: o + 16 * s, y: o + 22 * s },
    { x: o + 16 * s, y: o + 26 * s },
    { x: o + 1.5 * s, y: o + 26 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, boot, palette.hero.boots, rng, sun, s, 0.4);
  // отворот сапога
  ctx.fillStyle = shade(palette.hero.boots, 0.15);
  ctx.fillRect(o + 2 * s, o + 12 * s, 11.5 * s, 2.4 * s);
  return { canvas: c, pivot: { x: (o + 7.5 * s) / c.width, y: (o + 1.5 * s) / c.height } };
}

/** Куртка-туловище; шарнир — середина пояса. */
export function heroBody(rng: Rng, s: number, sun: Pt): Part {
  const w = 42;
  const h = 40;
  const { c, ctx, o } = part(w, h, s);
  const coat: Path = scissorCut(rng, [
    { x: o + 9 * s, y: o + 2 * s },
    { x: o + 33 * s, y: o + 2 * s },
    { x: o + 38 * s, y: o + 14 * s },
    { x: o + 42 * s, y: o + 36 * s },
    { x: o + 21 * s, y: o + 40 * s },
    { x: o + 0 * s, y: o + 36 * s },
    { x: o + 4 * s, y: o + 14 * s },
  ], 0.7 * s, 5 * s);
  piece(ctx, coat, palette.hero.coat, rng, sun, s, 0.7);
  // тень складки со стороны от солнца
  ctx.save();
  tracePath(ctx, coat);
  ctx.clip();
  const fold: Path = [
    { x: o + 27 * s, y: o },
    { x: o + 46 * s, y: o },
    { x: o + 46 * s, y: o + 44 * s },
    { x: o + 24 * s, y: o + 44 * s },
  ];
  ctx.filter = `blur(${2 * s}px)`;
  tracePath(ctx, fold);
  ctx.fillStyle = rgba(palette.hero.coatShade, 0.75);
  ctx.fill();
  ctx.filter = 'none';
  // пояс-подол и карман
  ctx.fillStyle = rgba(palette.hero.coatShade, 0.9);
  ctx.fillRect(o, o + 33 * s, 44 * s, 3 * s);
  ctx.strokeStyle = rgba(palette.hero.coatShade, 0.9);
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(o + 24 * s, o + 22 * s);
  ctx.lineTo(o + 33 * s, o + 22 * s);
  ctx.stroke();
  ctx.restore();
  // пуговицы
  for (const y of [14, 24]) {
    ctx.beginPath();
    ctx.arc(o + 19 * s, o + y * s, 1.7 * s, 0, Math.PI * 2);
    ctx.fillStyle = palette.hero.boots;
    ctx.fill();
  }
  brad(ctx, o + 13 * s, o + 36 * s, s);
  brad(ctx, o + 29 * s, o + 36 * s, s);
  return { canvas: c, pivot: { x: (o + 21 * s) / c.width, y: (o + 36 * s) / c.height } };
}

/** Плетёная корзина за спиной; шарнир — середина дна. */
export function heroBasket(rng: Rng, s: number, sun: Pt): Part {
  const w = 30;
  const h = 30;
  const { c, ctx, o } = part(w, h, s);
  const b: Path = scissorCut(rng, [
    { x: o, y: o + 4 * s },
    { x: o + 30 * s, y: o + 4 * s },
    { x: o + 27 * s, y: o + 30 * s },
    { x: o + 3 * s, y: o + 30 * s },
  ], 0.6 * s, 4 * s);
  piece(ctx, b, palette.hero.basket, rng, sun, s, 0.5);
  ctx.save();
  tracePath(ctx, b);
  ctx.clip();
  ctx.strokeStyle = rgba(palette.hero.basketShade, 0.85);
  ctx.lineWidth = 1.3 * s;
  for (let y = o + 8 * s; y < o + 30 * s; y += 4.2 * s) {
    ctx.beginPath();
    for (let x = o; x <= o + 30 * s; x += 3 * s) ctx.lineTo(x, y + Math.sin(x / (1.5 * s)) * 0.9 * s);
    ctx.stroke();
  }
  for (let x = o + 3 * s; x < o + 30 * s; x += 5 * s) {
    ctx.beginPath();
    ctx.moveTo(x, o + 4 * s);
    ctx.lineTo(x + 0.5 * s, o + 30 * s);
    ctx.stroke();
  }
  ctx.restore();
  // ободок
  const rim: Path = scissorCut(rng, [
    { x: o - 1 * s, y: o + 2 * s },
    { x: o + 31 * s, y: o + 2 * s },
    { x: o + 31 * s, y: o + 6.5 * s },
    { x: o - 1 * s, y: o + 6.5 * s },
  ], 0.4 * s, 4 * s);
  piece(ctx, rim, palette.hero.basketShade, rng, sun, s, 0.4);
  return { canvas: c, pivot: { x: (o + 15 * s) / c.width, y: (o + 30 * s) / c.height } };
}

/** Хвост пойманной рыбы, торчащий из корзины; шарнир — основание. */
export function basketTail(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(12, 14, s);
  const t: Path = scissorCut(rng, [
    { x: o + 5 * s, y: o + 14 * s },
    { x: o + 7 * s, y: o + 14 * s },
    { x: o + 7.5 * s, y: o + 7 * s },
    { x: o + 12 * s, y: o },
    { x: o + 6 * s, y: o + 3.5 * s },
    { x: o, y: o },
    { x: o + 4.5 * s, y: o + 7 * s },
  ], 0.4 * s, 3 * s);
  piece(ctx, t, palette.fish.base, rng, sun, s, 0.6);
  return { canvas: c, pivot: { x: (o + 6 * s) / c.width, y: (o + 14 * s) / c.height } };
}

/** Рука в рукаве с варежкой; шарнир — плечо. */
export function heroArm(rng: Rng, s: number, sun: Pt, back: boolean): Part {
  const { c, ctx, o } = part(12, 28, s);
  const sleeve: Path = scissorCut(rng, [
    { x: o + 1 * s, y: o },
    { x: o + 11 * s, y: o },
    { x: o + 11.5 * s, y: o + 19 * s },
    { x: o + 0.5 * s, y: o + 19 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, sleeve, back ? palette.hero.coatShade : palette.hero.coat, rng, sun, s, 0.55);
  const mitten: Path = scissorCut(rng, blobPath(rng, o + 6 * s, o + 22.5 * s, 6 * s, 6 * s, 14, 0.12), 0.4 * s, 3 * s);
  piece(ctx, mitten, back ? shade(palette.hero.mittens, -0.15) : palette.hero.mittens, rng, sun, s, 0.45);
  // большой палец
  const thumb = blobPath(rng, o + 11 * s, o + 20.5 * s, 2.4 * s, 3 * s, 10, 0.1);
  paperFill(ctx, thumb, palette.hero.mittens, rng, { tone: 0.03, blotches: 0 });
  brad(ctx, o + 6 * s, o + 3.5 * s, s);
  return { canvas: c, pivot: { x: (o + 6 * s) / c.width, y: (o + 3.5 * s) / c.height } };
}

/** Голова; шарнир — шея. `cold` — синий нос после второго падения. */
export function heroHead(rng: Rng, s: number, sun: Pt, cold: boolean): Part {
  const { c, ctx, o } = part(32, 32, s);
  const face = scissorCut(rng, blobPath(rng, o + 16 * s, o + 16 * s, 14.5 * s, 15 * s, 26, 0.05), 0.5 * s, 4 * s);
  piece(ctx, face, palette.hero.skin, rng, sun, s, 0.55);
  // ухо со стороны затылка
  const ear = blobPath(rng, o + 4 * s, o + 17 * s, 3 * s, 4 * s, 10, 0.1);
  paperFill(ctx, ear, shade(palette.hero.skin, -0.08), rng, { tone: 0.03, blotches: 0 });
  // глаза-точки
  for (const ex of [19.5, 26.5]) {
    ctx.beginPath();
    ctx.arc(o + ex * s, o + 15 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fillStyle = palette.fish.eye;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(o + (ex + 0.5) * s, o + 14.4 * s, 0.6 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  // нос — бумажный кружок; синий от холода
  const nose = blobPath(rng, o + 29.5 * s, o + 19.5 * s, 3.2 * s, 2.8 * s, 12, 0.08);
  piece(ctx, nose, cold ? palette.water.light : shade(palette.hero.skin, -0.12), rng, sun, s, 0.5);
  // улыбка
  ctx.strokeStyle = rgba(palette.fish.eye, 0.8);
  ctx.lineWidth = 1.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (cold) {
    for (let i = 0; i < 4; i++) ctx.lineTo(o + (19 + i * 2.2) * s, o + (25 + (i % 2) * 1.2) * s);
  } else ctx.arc(o + 22.5 * s, o + 22.5 * s, 3.5 * s, 0.25 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  return { canvas: c, pivot: { x: (o + 15 * s) / c.width, y: (o + 30 * s) / c.height } };
}

/** Вязаная шапка с помпоном; шарнир — середина отворота. */
export function heroHat(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(34, 30, s);
  const cap: Path = scissorCut(rng, [
    { x: o + 2 * s, y: o + 26 * s },
    { x: o + 4 * s, y: o + 13 * s },
    { x: o + 12 * s, y: o + 6 * s },
    { x: o + 22 * s, y: o + 6 * s },
    { x: o + 30 * s, y: o + 13 * s },
    { x: o + 32 * s, y: o + 26 * s },
  ], 0.6 * s, 4 * s);
  piece(ctx, cap, palette.hero.hat, rng, sun, s, 0.5);
  // рубчик вязки
  ctx.save();
  tracePath(ctx, cap);
  ctx.clip();
  ctx.strokeStyle = rgba(shade(palette.hero.hat, 0.25), 0.55);
  ctx.lineWidth = 1.1 * s;
  for (let x = o; x < o + 36 * s; x += 3.4 * s) {
    ctx.beginPath();
    ctx.moveTo(x, o + 8 * s);
    ctx.lineTo(x + 1 * s, o + 26 * s);
    ctx.stroke();
  }
  ctx.restore();
  const band: Path = scissorCut(rng, [
    { x: o, y: o + 20 * s },
    { x: o + 34 * s, y: o + 20 * s },
    { x: o + 34 * s, y: o + 28 * s },
    { x: o, y: o + 28 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, band, shade(palette.hero.hat, 0.12), rng, sun, s, 0.5);
  const pom = scissorCut(rng, blobPath(rng, o + 17 * s, o + 5 * s, 6.5 * s, 6 * s, 16, 0.18), 0.8 * s, 3 * s);
  piece(ctx, pom, palette.hero.pompom, rng, sun, s, 0.8);
  return { canvas: c, pivot: { x: (o + 17 * s) / c.width, y: (o + 26 * s) / c.height } };
}

/** Сосульки на шапке после второго падения. */
export function heroIcicles(rng: Rng, s: number): Part {
  const { c, ctx, o } = part(34, 12, s);
  for (let x = o + 2 * s; x < o + 32 * s; x += (4 + rng() * 3) * s) {
    const len = (4 + rng() * 7) * s;
    ctx.beginPath();
    ctx.moveTo(x - 1.6 * s, o);
    ctx.lineTo(x + 1.6 * s, o);
    ctx.lineTo(x + 0.2 * s, o + len);
    ctx.closePath();
    ctx.fillStyle = rgba(palette.thinIce.base, 0.95);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x - 0.9 * s, o, 0.7 * s, len * 0.6);
  }
  return { canvas: c, pivot: { x: (o + 17 * s) / c.width, y: o / c.height } };
}

/** Шарф на шее; шарнир — середина. */
export function heroScarf(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(34, 10, s);
  const wrap: Path = scissorCut(rng, [
    { x: o, y: o + 2 * s },
    { x: o + 34 * s, y: o + 1 * s },
    { x: o + 33 * s, y: o + 9.5 * s },
    { x: o + 1 * s, y: o + 10 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, wrap, palette.hero.scarf, rng, sun, s, 0.6);
  ctx.save();
  tracePath(ctx, wrap);
  ctx.clip();
  ctx.fillStyle = rgba(shade(palette.hero.scarf, -0.2), 0.6);
  for (let x = o + 4 * s; x < o + 34 * s; x += 8 * s) ctx.fillRect(x, o, 3 * s, 12 * s);
  ctx.restore();
  return { canvas: c, pivot: { x: (o + 17 * s) / c.width, y: (o + 5 * s) / c.height } };
}

/** Развевающийся конец шарфа — отдельный кусок; шарнир — у шеи. */
export function heroScarfTail(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(26, 10, s);
  const t: Path = scissorCut(rng, [
    { x: o + 26 * s, y: o + 1 * s },
    { x: o + 4 * s, y: o + 2 * s },
    { x: o, y: o + 0 * s },
    { x: o + 1 * s, y: o + 5 * s },
    { x: o, y: o + 10 * s },
    { x: o + 5 * s, y: o + 8 * s },
    { x: o + 26 * s, y: o + 8 * s },
  ], 0.5 * s, 4 * s);
  piece(ctx, t, palette.hero.scarf, rng, sun, s, 0.6);
  ctx.strokeStyle = rgba(shade(palette.hero.scarf, -0.25), 0.7);
  ctx.lineWidth = 1 * s;
  for (const y of [3.5, 6.2]) {
    ctx.beginPath();
    ctx.moveTo(o + 4 * s, o + y * s);
    ctx.lineTo(o + 24 * s, o + y * s);
    ctx.stroke();
  }
  return { canvas: c, pivot: { x: (o + 25 * s) / c.width, y: (o + 4.5 * s) / c.height } };
}

/** Капля с промокшего героя. */
export function heroDrip(s: number): Part {
  const { c, ctx, o } = part(6, 9, s);
  ctx.beginPath();
  ctx.moveTo(o + 3 * s, o);
  ctx.quadraticCurveTo(o + 6 * s, o + 6 * s, o + 3 * s, o + 9 * s);
  ctx.quadraticCurveTo(o, o + 6 * s, o + 3 * s, o);
  ctx.fillStyle = palette.water.light;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(o + 2 * s, o + 4 * s, 1 * s, 2 * s);
  return { canvas: c, pivot: { x: 0.5, y: 0 } };
}

// ───────────────────────────── рыба ─────────────────────────────

/** Тело розовой рыбы: светлое брюхо, глаз-точка; шарнир — середина брюха (основание). */
export function fishBody(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(46, 24, s);
  const body: Path = scissorCut(rng, [
    { x: o + 46 * s, y: o + 12 * s },
    { x: o + 40 * s, y: o + 4 * s },
    { x: o + 28 * s, y: o + 1 * s },
    { x: o + 14 * s, y: o + 3 * s },
    { x: o + 3 * s, y: o + 9 * s },
    { x: o, y: o + 12 * s },
    { x: o + 3 * s, y: o + 16 * s },
    { x: o + 14 * s, y: o + 22 * s },
    { x: o + 30 * s, y: o + 23 * s },
    { x: o + 41 * s, y: o + 19 * s },
  ], 0.6 * s, 4 * s);
  piece(ctx, body, palette.fish.base, rng, sun, s, 0.7);
  ctx.save();
  tracePath(ctx, body);
  ctx.clip();
  const belly: Path = [
    { x: o, y: o + 14 * s },
    { x: o + 20 * s, y: o + 15 * s },
    { x: o + 44 * s, y: o + 14 * s },
    { x: o + 44 * s, y: o + 26 * s },
    { x: o, y: o + 26 * s },
  ];
  paperFill(ctx, scissorCut(rng, belly, 0.6 * s, 4 * s), palette.fish.belly, rng, { tone: 0.03, blotches: 1 });
  // чешуя — полукружья
  ctx.strokeStyle = rgba(palette.fish.fin, 0.55);
  ctx.lineWidth = 1 * s;
  for (let x = o + 14 * s; x < o + 36 * s; x += 5 * s) {
    for (let y = o + 6 * s; y < o + 14 * s; y += 4.5 * s) {
      ctx.beginPath();
      ctx.arc(x + ((y / s) % 2) * 2 * s, y, 2.4 * s, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
  }
  ctx.restore();
  // жабра и глаз
  ctx.strokeStyle = rgba(palette.fish.fin, 0.9);
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  ctx.arc(o + 34 * s, o + 12 * s, 6 * s, -0.55 * Math.PI, 0.55 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(o + 39.5 * s, o + 9 * s, 2.3 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(o + 40 * s, o + 9 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = palette.fish.eye;
  ctx.fill();
  return { canvas: c, pivot: { x: (o + 23 * s) / c.width, y: (o + 22 * s) / c.height } };
}

/** Хвост рыбы на шарнире. */
export function fishTail(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(18, 22, s);
  const t: Path = scissorCut(rng, [
    { x: o + 18 * s, y: o + 9 * s },
    { x: o + 18 * s, y: o + 13 * s },
    { x: o + 4 * s, y: o + 22 * s },
    { x: o + 7 * s, y: o + 11 * s },
    { x: o + 4 * s, y: o },
  ], 0.5 * s, 3 * s);
  piece(ctx, t, palette.fish.fin, rng, sun, s, 0.55);
  ctx.strokeStyle = rgba(shade(palette.fish.fin, -0.2), 0.7);
  ctx.lineWidth = 0.8 * s;
  for (const y of [5, 11, 17]) {
    ctx.beginPath();
    ctx.moveTo(o + 16 * s, o + 11 * s);
    ctx.lineTo(o + 6 * s, o + y * s);
    ctx.stroke();
  }
  return { canvas: c, pivot: { x: (o + 17 * s) / c.width, y: (o + 11 * s) / c.height } };
}

/** Спинной плавник на шарнире. */
export function fishFin(rng: Rng, s: number, sun: Pt): Part {
  const { c, ctx, o } = part(16, 9, s);
  const f: Path = scissorCut(rng, [
    { x: o, y: o + 9 * s },
    { x: o + 5 * s, y: o + 1 * s },
    { x: o + 16 * s, y: o },
    { x: o + 14 * s, y: o + 9 * s },
  ], 0.4 * s, 3 * s);
  piece(ctx, f, palette.fish.fin, rng, sun, s, 0.5);
  return { canvas: c, pivot: { x: (o + 8 * s) / c.width, y: (o + 9 * s) / c.height } };
}
