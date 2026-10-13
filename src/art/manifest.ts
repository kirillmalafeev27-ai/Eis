/**
 * Ключи всех текстур (7.3.2). Код сцен ссылается только на эти ключи: чтобы заменить
 * процедурный арт рисованным, достаточно загрузить PNG под теми же ключами.
 */
export const FLOE_VARIANTS = 8;
export const DEBRIS_VARIANTS = 4;
export const PINE_VARIANTS = 4;
export const DRIFT_VARIANTS = 3;
export const BIT_VARIANTS = 6;

export const K = {
  thin: (i: number) => `floe-thin-${i}`,
  thick: (i: number) => `floe-thick-${i}`,
  debris: (i: number) => `floe-debris-${i}`,
  /** Тёмная кромка льдины на воде — силуэт той же формы. */
  rim: (key: string) => `${key}-rim`,
  /** Пена из обрывков вокруг льдины. */
  foam: (key: string) => `${key}-foam`,
  waterDeep: 'water-deep',
  waterMid: 'water-mid',
  waterLight: 'water-light',
  waterDeepV: 'water-deep-v',
  waterMidV: 'water-mid-v',
  waterLightV: 'water-light-v',
  bit: (i: number) => `water-bit-${i}`,
  pine: (i: number) => `pine-${i}`,
  hut: 'hut',
  hutGlow: 'hut-glow',
  windowGlow: 'window-glow',
  sled: 'sled',
  drift: (i: number) => `drift-${i}`,
  reed: (i: number) => `reed-${i}`,
  bridge: 'bridge',
  bridgeV: 'bridge-v',
  crow: 'crow-shadow',
  /** Силуэт тени стоящего объекта. */
  shadow: (key: string) => `${key}-sh`,
  fishBody: 'fish-body',
  fishTail: 'fish-tail',
  fishFin: 'fish-fin',
  fishWhole: 'fish-whole',
  hero: {
    legL: 'hero-leg-l',
    legR: 'hero-leg-r',
    body: 'hero-body',
    basket: 'hero-basket',
    tail: (i: number) => `hero-tail-${i}`,
    armL: 'hero-arm-l',
    armR: 'hero-arm-r',
    head: 'hero-head',
    headCold: 'hero-head-cold',
    hat: 'hero-hat',
    icicles: 'hero-icicles',
    scarf: 'hero-scarf',
    scarfTail: 'hero-scarf-tail',
    drip: 'hero-drip',
    whole: 'hero-whole',
  },
  print: (risk: 'safe' | 'risky' | 'fail') => `print-${risk}`,
  printRoute: 'print-route',
  arcDot: 'arc-dot',
  pipOn: 'pip-on',
  pipOff: 'pip-off',
  glint: 'glint',
  glintSoft: 'glint-soft',
  streak: 'water-streak',
  p: {
    snow: 'p-snow',
    drop: 'p-drop',
    chip: 'p-chip',
    bubble: 'p-bubble',
    steam: 'p-steam',
    smoke: 'p-smoke',
    ripple: 'p-ripple',
    splash: 'p-splash',
  },
  vignette: 'vignette',
  pixel: 'pixel',
} as const;
