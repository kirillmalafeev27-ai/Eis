/**
 * Палитра «Льдин» (раздел 7.2). Единственное место, где живут цвета игры.
 * Цвета закреплены за смыслом: розовый — только рыба, тёплый жёлтый свет — только окно
 * избушки и блики, тёмная синева намокания — только тающие льдины.
 */
export const palette = {
  page: '#1d3a6b', // тёмно-синяя бумага просветов
  pageFibers: '#2b4f86',
  card: '#fbfaf5', // бумажные карточки панелей
  caption: '#ffe36e', // жёлтые бумажки-подписи
  tape: '#f3efe2', // полоска скотча
  shadow: '#0d1f3c', // цвет падающих теней днём (с прозрачностью)
  shadowDusk: '#2a1e4f', // цвет теней на закате

  // вода
  water: { deep: '#14507a', mid: '#1f6f9a', light: '#3f97c2', foam: '#d8f0fa' },

  // лёд
  thinIce: { base: '#a8d8ea', shade: '#7fbcd3', bubbles: '#e3f5fb' },
  thickIce: {
    base: '#eef8fc',
    side: '#b4dae8',
    sideDark: '#86b9cd',
    snow: '#ffffff',
    snowShade: '#cfe6f3',
  },
  crack: { gap: '#0f3a5c', fiber: '#ffffff' },
  wet: '#4a7290', // намокание — только тающие льдины

  // берега
  snow: { base: '#f7fbff', shade: '#c9dff0' },
  pine: { base: '#1f5c55', shade: '#16443f', light: '#2f7a70' },
  wood: { base: '#8a5a3a', shade: '#5e3c26' },
  reed: '#9a8a5a',
  windowLight: '#ffd56b', // тёплый свет — только окно избушки
  smoke: '#e7eef5',

  // рыба — единственный розовый
  fish: { base: '#ff5c8a', belly: '#ffd0dc', fin: '#e23d6d', eye: '#1b1b2a' },

  // герой — тот же искатель серии, в зимнем
  hero: {
    coat: '#f2b33d',
    coatShade: '#c98a1f',
    scarf: '#ff6a1a',
    hat: '#1f6f78',
    pompom: '#fbfaf5',
    mittens: '#1f6f78',
    boots: '#5a3a26',
    skin: '#f2c094',
    basket: '#b07a45',
    basketShade: '#7e5430',
  },

  sunGlint: '#fffbe0',
  // следы лежат на светлом льду, поэтому «безопасно» — тёмно-синий, а не белый
  hints: { safe: '#24408f', risky: '#d9600b', fail: '#e8322f', arc: '#ffffff' },
  warmth: { full: '#ff7a3d', empty: '#cfe6f3' }, // деления термометра тепла
  good: '#3ddc84',
  bad: '#ff4d4d',
} as const;

/** '#rrggbb' → 0xrrggbb для Phaser. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

/** '#rrggbb' → [r, g, b] в диапазоне 0–255. */
export function rgb(color: string): [number, number, number] {
  const n = hex(color);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
