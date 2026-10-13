import { palette } from '../../config/palette';
import { applyGrain, ctx2d, makeCanvas, mulberry32, rgba, tornPolygon } from '../paperKit';
import type { Theme } from './theme';

/**
 * Тема «бумага» (11.1.4): тёмно-синий просвет с волокнами, белые карточки с рваным краем
 * и мягкой тенью, жёлтые подписи со скотчем. Цвета берутся только из палитры.
 */
function fiberDataUrl(base: string, fibers: string, size: number, seed: number, strength: number): string {
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(seed);
  // длинные волокна цвета pageFibers — бесшовно (рисуем со сдвигами)
  const n = Math.round(size * size * 0.0026);
  for (let i = 0; i < n; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 6 + rng() * 22;
    const ang = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * 1.4;
    ctx.strokeStyle = rgba(fibers, 0.35 + rng() * 0.5);
    ctx.lineWidth = 0.6 + rng() * 0.9;
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
  applyGrain(ctx, size, size, strength, 128);
  return c.toDataURL('image/png');
}

let cached: Record<string, string> | null = null;

function textures(): Record<string, string> {
  if (cached) return cached;
  cached = {
    page: fiberDataUrl(palette.page, palette.pageFibers, 320, 11, 0.16),
    card: fiberDataUrl(palette.card, '#e9e6da', 256, 23, 0.07),
    caption: fiberDataUrl(palette.caption, '#f4cf45', 192, 37, 0.08),
  };
  return cached;
}

export const paperTheme: Theme = {
  name: 'paper',
  apply(root) {
    const t = textures();
    const s = root.style;
    root.classList.add('theme-paper');
    s.setProperty('--page', palette.page);
    s.setProperty('--page-fibers', palette.pageFibers);
    s.setProperty('--card', palette.card);
    s.setProperty('--caption', palette.caption);
    s.setProperty('--tape', palette.tape);
    s.setProperty('--shadow', palette.shadow);
    s.setProperty('--ink', palette.shadow);
    s.setProperty('--ink-soft', rgba(palette.shadow, 0.62));
    s.setProperty('--good', palette.good);
    s.setProperty('--bad', palette.bad);
    s.setProperty('--fish', palette.fish.base);
    s.setProperty('--fish-belly', palette.fish.belly);
    s.setProperty('--warm-full', palette.warmth.full);
    s.setProperty('--warm-empty', palette.warmth.empty);
    s.setProperty('--scarf', palette.hero.scarf);
    s.setProperty('--hat', palette.hero.hat);
    s.setProperty('--snow-shade', palette.snow.shade);
    s.setProperty('--water-deep', palette.water.deep);
    s.setProperty('--water-mid', palette.water.mid);
    s.setProperty('--basket', palette.hero.basket);
    s.setProperty('--basket-shade', palette.hero.basketShade);
    s.setProperty('--window', palette.windowLight);
    s.setProperty('--shadow-soft', rgba(palette.shadow, 0.34));
    s.setProperty('--shadow-hard', rgba(palette.shadow, 0.55));
    s.setProperty('--tape-a', rgba(palette.tape, 0.72));
    s.setProperty('--page-tex', `url(${t.page})`);
    s.setProperty('--card-tex', `url(${t.card})`);
    s.setProperty('--caption-tex', `url(${t.caption})`);
  },
  decorateCard(card, seed) {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (w < 4 || h < 4) return;
    const depth = Number(card.dataset.tornDepth ?? 3.2);
    const pts = tornPolygon(mulberry32(seed), w, h, depth, Number(card.dataset.tornStep ?? 9));
    const clip = `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`;
    card.style.clipPath = clip;
    // Тень — отдельный неподвижный слой за карточкой: фильтр на предке живой канвы
    // пересчитывался бы каждый кадр.
    const shadow = card.previousElementSibling as HTMLElement | null;
    if (shadow && shadow.classList.contains('series-card-shadow')) shadow.style.clipPath = clip;
  },
};
