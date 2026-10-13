import { ru } from '../../i18n/ru';
import { tips } from '../../i18n/tips.ru';
import { el } from '../dom';

/** Экран загрузки (11.5.8): бумажная карточка «Lädt…» с одним из фактов. */
export class LoadingScreen {
  readonly root: HTMLElement;
  private readonly bar: HTMLElement;

  constructor(parent: HTMLElement) {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    this.bar = el('div', 'load-bar-fill');
    this.root = el('div', 'screen screen-loading', { role: 'status', 'aria-live': 'polite' }, [
      el('div', 'paper-card load-card', {}, [
        el('div', 'load-title', { lang: 'de' }, [ru.loading]),
        el('div', 'load-bar', {}, [this.bar]),
        el('p', 'load-tip', {}, [tip]),
      ]),
    ]);
    parent.appendChild(this.root);
  }

  progress(k: number): void {
    this.bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, k))})`;
  }

  destroy(): void {
    this.root.classList.add('is-leaving');
    window.setTimeout(() => this.root.remove(), 260);
  }
}
