import { levels } from '../../config/levels';
import { ru } from '../../i18n/ru';
import type { Progress } from '../../game/persist';
import { button, el, focusFirst } from '../dom';

/** Выбор уровня (11.5.2): бумажные карточки со звёздами; закрытые уровни затемнены. */
export class LevelsScreen {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, progress: Progress, onPick: (id: number) => void, onBack: () => void) {
    const cards = levels.map((lv) => {
      const p = progress.levels[String(lv.id)];
      const open = lv.id <= progress.unlocked;
      const stars = p?.stars ?? 0;
      const card = el(
        'button',
        `level-card${open ? '' : ' is-locked'}`,
        { type: 'button', 'aria-label': `${ru.level(lv.label)}${open ? `, ${ru.stars(stars)}` : `, ${ru.locked}`}` },
        [
          el('span', 'level-num', {}, [lv.label]),
          el('span', 'level-stars', { 'aria-hidden': 'true' }, [
            ...[0, 1, 2].map((i) => el('span', i < stars ? 'st st-on' : 'st', {}, ['★'])),
          ]),
          p?.bestTimeMs ? el('span', 'level-time', {}, [ru.results.seconds(p.bestTimeMs)]) : null,
        ],
      );
      if (open) card.addEventListener('click', () => onPick(lv.id));
      else card.disabled = true;
      return card;
    });
    this.root = el('div', 'levels', {}, [
      el('h2', 'levels-title', {}, [ru.levels]),
      el('div', 'levels-grid', {}, cards),
      el('div', 'levels-foot', {}, [button(ru.back, 'paper-btn-small', onBack)]),
    ]);
    parent.appendChild(this.root);
    focusFirst(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
