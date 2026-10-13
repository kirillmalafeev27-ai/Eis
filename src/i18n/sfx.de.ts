/**
 * Слова-звуки (9.3): немецкие, как во всей серии — погружение в язык и традиция немецких
 * комиксов. Язык слов можно переключить в настройках.
 */
export type SfxWord =
  | 'start'
  | 'hop'
  | 'knack'
  | 'stapf'
  | 'hui'
  | 'knirsch'
  | 'drei'
  | 'zwei'
  | 'eins'
  | 'blubb'
  | 'tropf'
  | 'schwupp'
  | 'tschuess'
  | 'zappel'
  | 'hoppla'
  | 'zuweit'
  | 'ohoh'
  | 'krach'
  | 'platsch'
  | 'brrr'
  | 'bibber'
  | 'zukalt'
  | 'geschafft'
  | 'knapp'
  | 'wumm';

export const sfxDe: Record<SfxWord, string> = {
  start: "AUF GEHT'S!",
  hop: 'HOPP!',
  knack: 'KNACK!',
  stapf: 'STAPF!',
  hui: 'HUI!',
  knirsch: 'KNIRSCH…',
  drei: 'DREI!',
  zwei: 'ZWEI!',
  eins: 'EINS!',
  blubb: 'BLUBB!',
  tropf: 'TROPF…',
  schwupp: 'SCHWUPP!',
  tschuess: 'TSCHÜSS!',
  zappel: 'ZAPPEL!',
  hoppla: 'HOPPLA!',
  zuweit: 'ZU WEIT!',
  ohoh: 'OH-OH!',
  krach: 'KRACH!',
  platsch: 'PLATSCH!',
  brrr: 'BRRR!',
  bibber: 'BIBBER…',
  zukalt: 'ZU KALT!',
  geschafft: 'GESCHAFFT!',
  knapp: 'KNAPP!',
  wumm: 'WUMM…',
};

/** Русская версия слов-звуков для переключателя в настройках. */
export const sfxRu: Record<SfxWord, string> = {
  start: 'ПОЕХАЛИ!',
  hop: 'ХОП!',
  knack: 'КРАК!',
  stapf: 'ТОП!',
  hui: 'УИИ!',
  knirsch: 'ХРУСТ…',
  drei: 'ТРИ!',
  zwei: 'ДВА!',
  eins: 'ОДИН!',
  blubb: 'БУЛЬК!',
  tropf: 'КАП…',
  schwupp: 'ШМЫГ!',
  tschuess: 'ПОКА!',
  zappel: 'ШЛЁП!',
  hoppla: 'ОПА!',
  zuweit: 'ДАЛЕКО!',
  ohoh: 'ОЙ-ОЙ!',
  krach: 'ТРЕСК!',
  platsch: 'ПЛЮХ!',
  brrr: 'БРРР!',
  bibber: 'ДРОЖЬ…',
  zukalt: 'ХОЛОДНО!',
  geschafft: 'ПОЛУЧИЛОСЬ!',
  knapp: 'ЕЛЕ-ЕЛЕ!',
  wumm: 'БУММ…',
};
