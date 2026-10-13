import { ru } from '../../i18n/ru';
import { button, el } from '../dom';

/**
 * Обучение при первом запуске (11.5.7): подсказка в бумажном пузыре героя.
 * Пока пузырь на экране, игра стоит.
 */
export class TutorialBubble {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement, text: string, at: { x: number; y: number }, onClose: () => void) {
    const ok = button(ru.tutorial.ok, 'paper-btn-small paper-btn-primary', onClose);
    this.root = el('div', 'tut', { role: 'dialog', 'aria-live': 'assertive' }, [el('div', 'tut-bubble', {}, [el('p', '', {}, [text]), ok])]);
    parent.appendChild(this.root);
    const host = parent.getBoundingClientRect();
    const bubble = this.root.firstElementChild as HTMLElement;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const x = Math.max(8, Math.min(host.width - w - 8, at.x - host.left - w * 0.25));
    const above = at.y - host.top - h - 26;
    const y = above > 8 ? above : Math.min(host.height - h - 8, at.y - host.top + 26);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    bubble.classList.toggle('tail-down', above > 8);
    bubble.style.setProperty('--tail-x', `${Math.max(16, Math.min(w - 16, at.x - host.left - x))}px`);
    ok.focus({ preventScroll: true });
  }

  destroy(): void {
    this.root.remove();
  }
}
