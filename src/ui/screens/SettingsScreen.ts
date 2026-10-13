import type { HintMode } from '../../config/levels';
import { ru } from '../../i18n/ru';
import type { Settings } from '../../game/persist';
import { button, el, focusFirst } from '../dom';

/**
 * Настройки (11.5.6): громкость эффектов и эмбиента, общий выключатель, «меньше движения»,
 * качество графики, подсказки (в пределах уровня), язык слов-звуков.
 */
export class SettingsScreen {
  readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    s: Settings,
    systemReduced: boolean,
    levelHints: HintMode | null,
    onChange: (s: Settings) => void,
    onClose: () => void,
  ) {
    const cur: Settings = { ...s };
    const emit = () => onChange({ ...cur });
    const slider = (label: string, value: number, set: (v: number) => void) => {
      const input = el('input', 'set-range', {
        type: 'range',
        min: '0',
        max: '100',
        step: '5',
        value: String(Math.round(value * 100)),
        'aria-label': label,
      });
      input.addEventListener('input', () => {
        set(Number(input.value) / 100);
        emit();
      });
      return el('label', 'set-row', {}, [el('span', 'set-label', {}, [label]), input]);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void) => {
      const input = el('input', 'set-check', { type: 'checkbox', 'aria-label': label });
      input.checked = value;
      input.addEventListener('change', () => {
        set(input.checked);
        emit();
      });
      return el('label', 'set-row set-row-check', {}, [input, el('span', 'set-label', {}, [label])]);
    };
    const choice = <T extends string>(
      label: string,
      value: T,
      options: [T, string, boolean?][],
      set: (v: T) => void,
    ) => {
      const group = el('div', 'set-choice', { role: 'radiogroup', 'aria-label': label });
      for (const [v, text, disabled] of options) {
        const b = el(
          'button',
          `set-opt${v === value ? ' is-on' : ''}`,
          { type: 'button', role: 'radio', 'aria-checked': String(v === value) },
          [text],
        );
        if (disabled) b.disabled = true;
        b.addEventListener('click', () => {
          set(v);
          group.querySelectorAll('.set-opt').forEach((o) => {
            o.classList.toggle('is-on', o === b);
            o.setAttribute('aria-checked', String(o === b));
          });
          emit();
        });
        group.appendChild(b);
      }
      return el('div', 'set-row set-row-choice', {}, [el('span', 'set-label', {}, [label]), group]);
    };
    const order: HintMode[] = ['none', 'route', 'risk'];
    const cap = levelHints ? order.indexOf(levelHints) : 2;
    const t = ru.settingsScreen;
    this.root = el(
      'div',
      'screen screen-settings',
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': t.title },
      [
        el('div', 'paper-card settings-card', {}, [
          el('span', 'card-tape'),
          el('h2', '', {}, [t.title]),
          toggle(t.sound, !cur.muted, (v) => (cur.muted = !v)),
          slider(t.sfx, cur.sfx, (v) => (cur.sfx = v)),
          slider(t.ambient, cur.ambient, (v) => (cur.ambient = v)),
          toggle(t.reducedMotion, cur.reducedMotion ?? systemReduced, (v) => (cur.reducedMotion = v)),
          choice(
            t.quality,
            cur.quality,
            [
              ['high', t.qualityHigh],
              ['low', t.qualityLow],
            ],
            (v) => (cur.quality = v),
          ),
          choice(
            t.hints,
            cur.hints,
            [
              ['risk', t.hintsRisk, cap < 2],
              ['route', t.hintsRoute, cap < 1],
              ['none', t.hintsNone],
            ],
            (v) => (cur.hints = v),
          ),
          levelHints && cap < 2 ? el('p', 'set-note', {}, [t.hintsLimited]) : null,
          choice(
            t.sfxLanguage,
            cur.sfxLang,
            [
              ['de', t.sfxDe],
              ['ru', t.sfxRu],
            ],
            (v) => (cur.sfxLang = v),
          ),
          el('div', 'row', {}, [button(t.close, 'paper-btn-primary', onClose)]),
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
