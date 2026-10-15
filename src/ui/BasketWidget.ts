import { ru } from '../i18n/ru';
import { fishSvg } from './icons';

/**
 * Плашка с корзиной (11.3): три ячейки для рыбы, бумажный термометр тепла и кнопки
 * «К берегу» и «Стоять». Лежит над ближним берегом, никогда — над льдинами.
 */
export class BasketWidget {
  readonly el: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly marks: HTMLElement[] = [];
  readonly shoreBtn: HTMLButtonElement;
  readonly standBtn: HTMLButtonElement;
  private fish = -1;
  private warmth = -1;
  private total = 0;
  private readonly tube: HTMLElement;

  constructor(parent: HTMLElement, totalWarmth: number, onShore: () => void, onStand: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'basket';
    const art = document.createElement('div');
    art.className = 'basket-art';
    art.setAttribute('role', 'img');
    const weave = document.createElement('div');
    weave.className = 'basket-weave';
    art.appendChild(weave);
    const row = document.createElement('div');
    row.className = 'basket-slots';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('div');
      s.className = 'basket-slot';
      s.innerHTML = fishSvg();
      row.appendChild(s);
      this.slots.push(s);
    }
    art.appendChild(row);
    const thermo = document.createElement('div');
    thermo.className = 'thermo';
    thermo.setAttribute('role', 'img');
    const bulb = document.createElement('div');
    bulb.className = 'thermo-bulb';
    const tube = document.createElement('div');
    tube.className = 'thermo-tube';
    this.tube = tube;
    thermo.append(tube, bulb);
    const buttons = document.createElement('div');
    buttons.className = 'basket-buttons';
    this.shoreBtn = button(ru.toShore, 'H', onShore);
    this.standBtn = button(ru.stand, '␣', onStand);
    buttons.append(this.shoreBtn, this.standBtn);
    const top = document.createElement('div');
    top.className = 'basket-top';
    top.append(art, thermo);
    this.el.append(top, buttons);
    parent.appendChild(this.el);
    this.thermo = thermo;
    this.art = art;
    this.setTotal(totalWarmth);
  }

  /**
   * Сколько делений в термометре. Сверх обычных трёх — «тёплый шарф» (balance.assist): эти
   * деления связаны полосками цвета шарфа героя.
   */
  setTotal(total: number, base = total): void {
    if (total === this.total) return;
    this.total = total;
    this.tube.innerHTML = '';
    this.marks.length = 0;
    for (let i = 0; i < total; i++) {
      const m = document.createElement('div');
      m.className = i >= base ? 'thermo-mark is-scarf' : 'thermo-mark';
      this.tube.appendChild(m);
      this.marks.push(m);
    }
    this.thermo.dataset.marks = String(total);
    this.warmth = -1;
  }

  private readonly thermo: HTMLElement;
  private readonly art: HTMLElement;

  set(fish: number, warmth: number, total: number): void {
    if (fish !== this.fish) {
      this.slots.forEach((s, i) => s.classList.toggle('is-caught', i < fish));
      this.art.setAttribute('aria-label', `${ru.basket}: ${ru.results.fishCount(fish)}`);
      this.fish = fish;
    }
    if (warmth !== this.warmth) {
      const lost = this.warmth > warmth && this.warmth >= 0;
      this.marks.forEach((m, i) => {
        const on = i < warmth;
        if (!on && m.classList.contains('is-on') && lost) {
          m.classList.add('is-lost');
          window.setTimeout(() => m.classList.remove('is-lost'), 700);
        }
        m.classList.toggle('is-on', on);
      });
      this.thermo.setAttribute('aria-label', ru.warmthLeft(warmth, total));
      this.warmth = warmth;
    }
  }

  /** Центр ячейки рыбы в координатах страницы — чтобы рыба прилетела по дуге. */
  slotRect(i: number): DOMRect | null {
    return this.slots[i]?.getBoundingClientRect() ?? null;
  }

  setEnabled(on: boolean): void {
    this.shoreBtn.disabled = !on;
    this.standBtn.disabled = !on;
  }

  destroy(): void {
    this.el.remove();
  }
}

function button(text: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'paper-btn paper-btn-small';
  b.innerHTML = `<span>${text}</span><kbd aria-hidden="true">${key}</kbd>`;
  b.addEventListener('click', onClick);
  return b;
}
