import { balance } from '../config/balance';
import { hex, palette } from '../config/palette';
import { mix } from '../shared/paperKit';

/**
 * Солнце и тени (8.2): вектор в экранных координатах, от ориентации реки не зависит.
 * При силе ледохода 0 солнце сверху слева, при силе 1 — низко слева; тени удлиняются,
 * густеют и из холодно-синих становятся фиолетовыми.
 */
export interface Light {
  strength: number;
  /** Единичный вектор НА солнце (экран, y вниз). */
  sun: { x: number; y: number };
  /** Смещение тени стоящего объекта в пикселях мира (от солнца). */
  shadow: { x: number; y: number };
  shadowAlpha: number;
  shadowTint: number;
}

export function lightFor(strength: number, cellPx: number): Light {
  const L = balance.light;
  const k = Math.max(0, Math.min(1, strength));
  const ang = L.sunAngleDay + (L.sunAngleDusk - L.sunAngleDay) * k;
  const sun = { x: Math.cos(ang), y: Math.sin(ang) };
  const len = (L.shadowLenMin + (L.shadowLenMax - L.shadowLenMin) * k) * cellPx;
  return {
    strength: k,
    sun,
    shadow: { x: -sun.x * len, y: -sun.y * len },
    shadowAlpha: L.shadowAlphaMin + (L.shadowAlphaMax - L.shadowAlphaMin) * k,
    shadowTint: hex(mix(palette.shadow, palette.shadowDusk, k)),
  };
}
