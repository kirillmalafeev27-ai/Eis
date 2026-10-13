import { balance } from '../../config/balance';
import { ru } from '../../i18n/ru';
import { button, el, focusFirst } from '../dom';
import { fishSvg } from '../icons';

/**
 * Итоги (11.5.5): три бумажные карточки появляются по очереди — снимок кадра, корзина
 * с рыбой, звёзды и статистика. Кнопки «Ещё раз» и «Дальше».
 */
export interface ResultsData {
  won: boolean;
  knapp: boolean;
  stars: number;
  fish: number;
  timeMs: number;
  jumps: number;
  longJumps: number;
  falls: number;
  correct: number;
  wrong: number;
  medianMs: number;
  recordMs: number | null;
  recordStars: number;
  newRecord: boolean;
  cause: 'cold' | 'trapped' | null;
  levelLabel: string;
  hasNext: boolean;
}

export class ResultsScreen {
  readonly root: HTMLElement;
  private timers: number[] = [];

  constructor(
    parent: HTMLElement,
    d: ResultsData,
    snapshot: HTMLImageElement | null,
    handlers: { again: () => void; next: () => void; levels: () => void; count: (i: number) => void },
    reducedMotion: boolean,
  ) {
    const photo = el('div', 'res-card res-photo', {}, [
      el('span', 'card-tape'),
      snapshot ? snapshot : el('div', 'res-photo-empty'),
      el('div', 'res-caption', {}, [ru.level(d.levelLabel)]),
    ]);
    if (snapshot) {
      snapshot.className = 'res-photo-img';
      snapshot.alt = ru.results.snapshot;
    }
    const slots = [0, 1, 2].map((i) => {
      const s = el('div', 'res-fish');
      s.innerHTML = fishSvg(i < d.fish ? 'is-caught' : '');
      return s;
    });
    const basket = el('div', 'res-card res-basket', {}, [
      el('h3', '', {}, [ru.results.basket]),
      el('div', 'res-basket-art', {}, [el('div', 'res-basket-weave'), el('div', 'res-fish-row', {}, slots)]),
      el('div', 'res-fish-count', {}, [ru.results.fishCount(d.fish)]),
    ]);
    const stars = [0, 1, 2].map((i) =>
      el('span', i < d.stars ? 'res-star is-on' : 'res-star', { 'aria-hidden': 'true' }, ['★']),
    );
    const rows: [string, string][] = [
      [ru.results.time, ru.results.seconds(d.timeMs)],
      [ru.results.jumps, String(d.jumps)],
      [ru.results.longJumps, String(d.longJumps)],
      [ru.results.falls, String(d.falls)],
      [ru.results.correct, String(d.correct)],
      [ru.results.wrong, String(d.wrong)],
      [ru.results.median, ru.results.seconds(d.medianMs)],
    ];
    if (d.recordMs !== null)
      rows.push([ru.results.record, `${'★'.repeat(d.recordStars)} ${ru.results.seconds(d.recordMs)}`]);
    const title = d.won ? (d.knapp ? ru.results.knapp : ru.results.won) : ru.results.lost;
    const stats = el('div', 'res-card res-stats', {}, [
      el('h2', '', {}, [title]),
      el('div', 'res-stars', { 'aria-label': ru.stars(d.stars) }, stars),
      d.newRecord ? el('div', 'res-record', {}, [ru.results.newRecord]) : null,
      d.cause
        ? el('p', 'res-cause', {}, [d.cause === 'cold' ? ru.results.causeCold : ru.results.causeTrapped])
        : null,
      el(
        'dl',
        'res-table',
        {},
        rows.flatMap(([k, v]) => [el('dt', '', {}, [k]), el('dd', '', {}, [v])]),
      ),
      el('div', 'row', {}, [
        button(ru.results.again, d.won ? '' : 'paper-btn-primary', handlers.again),
        d.hasNext ? button(ru.results.next, d.won ? 'paper-btn-primary' : '', handlers.next) : null,
        button(ru.levels, 'paper-btn-small', handlers.levels),
      ]),
    ]);
    this.root = el(
      'div',
      'screen screen-results',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      [el('div', 'res-cards', {}, [photo, basket, stats])],
    );
    parent.appendChild(this.root);
    const cards = [photo, basket, stats];
    const step = reducedMotion ? 0 : balance.anim.resultCardDelayMs;
    cards.forEach((c, i) => {
      c.classList.add('is-hidden');
      this.later(step * i + 30, () => c.classList.remove('is-hidden'));
    });
    // Подсчёт: рыбы по одной «прилетают» с растущей высотой звука (9.2).
    for (let i = 0; i < d.fish; i++) {
      slots[i].classList.add('is-waiting');
      this.later(step * 2 + 120 + i * balance.anim.countMs, () => {
        slots[i].classList.remove('is-waiting');
        slots[i].classList.add('is-pop');
        handlers.count(i);
      });
    }
    stars.forEach((s, i) => {
      if (i >= d.stars) return;
      s.classList.add('is-waiting');
      this.later(step * 3 + 150 + i * 180, () => {
        s.classList.remove('is-waiting');
        s.classList.add('is-pop');
      });
    });
    this.later(step * 2 + 40, () => focusFirst(stats));
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.root.remove();
  }
}
