import { ru } from '../i18n/ru';
import { snowflakeSvg } from './icons';

/**
 * Шапка панели вопроса (11.2.1): снежинки-заряды, полные и пустые, и подпись
 * «Прыжок — 1 ответ» / «Длинный прыжок — 2 ответа» / «Готов! Выбери льдину».
 */
export class JumpHeader {
  private readonly pips: HTMLElement;
  private readonly label: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    const wrap = document.createElement('div');
    wrap.className = 'jh';
    this.pips = document.createElement('div');
    this.pips.className = 'jh-pips';
    this.label = document.createElement('div');
    this.label.className = 'jh-label';
    wrap.append(this.pips, this.label);
    parent.appendChild(wrap);
  }

  set(pips: number, need: number, ready: boolean, hasTarget: boolean, intro: boolean): void {
    const key = `${pips}|${need}|${ready}|${hasTarget}|${intro}`;
    if (key === this.last) return;
    this.last = key;
    let html = '';
    for (let i = 0; i < need; i++) html += snowflakeSvg(i < pips);
    this.pips.innerHTML = html;
    this.pips.dataset.need = String(need);
    this.label.textContent = intro ? '' : ready ? ru.readyPick : ru.jumpCost(need);
    this.pips.style.visibility = intro ? 'hidden' : 'visible';
    this.label.classList.toggle('jh-ready', ready);
    void hasTarget;
  }

  /** Вспышка новой снежинки при верном ответе. */
  pulse(): void {
    const last = this.pips.querySelector('.sf-on:last-of-type');
    last?.classList.remove('sf-pop');
    void (last as HTMLElement | null)?.offsetWidth;
    last?.classList.add('sf-pop');
  }
}
