import { ru } from '../../i18n/ru';
import { el } from '../dom';

/** Подпись интро (11.5.3): жёлтая бумажка со скотчем над миром. Тап — пропустить. */
export class IntroCaption {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, onSkip: () => void, note?: string) {
    this.root = el('div', 'intro-caption', { role: 'note' }, [
      el('div', 'caption-sticker', {}, [el('span', 'card-tape'), ru.introCaption]),
      note ? el('div', 'caption-sticker caption-note', {}, [note]) : null,
      el('div', 'intro-skip', {}, [ru.skipHint]),
    ]);
    this.root.addEventListener('pointerdown', onSkip);
    parent.appendChild(this.root);
  }

  destroy(): void {
    this.root.classList.add('is-leaving');
    window.setTimeout(() => this.root.remove(), 220);
  }
}
