import { ru } from '../../i18n/ru';
import { button, el, focusFirst } from '../dom';

/** Пауза (11.5.4): карточка поверх размытого мира; вопрос в это время не виден. */
export class PauseScreen {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, onResume: () => void, onSettings: () => void, onMenu: () => void) {
    this.root = el(
      'div',
      'screen screen-pause',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': ru.paused },
      [
        el('div', 'paper-card pause-card', {}, [
          el('div', 'card-tape'),
          el('h2', '', {}, [ru.paused]),
          el('p', '', {}, [ru.pausedHint]),
          el('div', 'row col', {}, [
            button(ru.resume, 'paper-btn-primary', onResume),
            button(ru.settings, '', onSettings),
            button(ru.toMenu, 'paper-btn-small', onMenu),
          ]),
        ]),
      ],
    );
    parent.appendChild(this.root);
    focusFirst(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
