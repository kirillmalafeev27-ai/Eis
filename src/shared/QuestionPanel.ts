import type { Question, QuestionProvider } from './questions/types';

/**
 * Панель вопроса серии (11.2): шапка (её заполняет игра), задание на жёлтой бумажке,
 * 2–4 варианта-фишки. Время ответа — performance.now() от момента, когда вопрос стал
 * активным, до клика, без пауз (12.5). Следующий вопрос загружается заранее (12.4).
 */
export type PanelMode = 'off' | 'intro' | 'active' | 'ready' | 'paused';

export interface QuestionPanelStrings {
  getReady: string;
  group: string;
  option: (i: number, text: string) => string;
  readyHint: string;
}

export interface QuestionPanelTiming {
  doubleTapGuardMs: number;
  correctGlowMs: number;
  flipMs: number;
  wrongFeedbackMs: number;
  fontMaxPx: number;
  fontMinPx: number;
}

export interface AnswerInfo {
  question: Question;
  index: number;
  correct: boolean;
  timeMs: number;
}

export class QuestionPanel {
  readonly el: HTMLElement;
  /** Шапка: её содержимое рисует игра (заряды, подпись). */
  readonly header: HTMLElement;
  /** Угол для слова ошибки («HOPPLA!»). */
  readonly corner: HTMLElement;

  private readonly sheet: HTMLElement;
  private readonly task: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly options: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly intro: HTMLElement;
  private chips: HTMLButtonElement[] = [];

  private mode: PanelMode = 'off';
  private current: Question | null = null;
  private upcoming: Promise<Question> | null = null;
  private busy = false;
  private activatedAt = 0;
  private stoppedAt = 0;
  private stoppedTotal = 0;
  private clockRunning = false;
  private timers: number[] = [];
  private reducedMotion = false;
  private destroyed = false;
  /** Звуки панели: шорох верного ответа, «бонк» ошибки, перелистывание (9.2, 10.2). */
  onSound: ((name: 'correct' | 'wrong' | 'flip') => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly provider: QuestionProvider,
    private readonly strings: QuestionPanelStrings,
    private readonly timing: QuestionPanelTiming,
    private readonly onAnswer: (a: AnswerInfo) => void,
  ) {
    this.el = div('qp');
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', strings.group);
    this.header = div('qp-header', this.el);
    const body = div('qp-body', this.el);
    this.sheet = div('qp-sheet', body);
    this.task = div('qp-task', this.sheet);
    div('qp-tape', this.task);
    this.prompt = div('qp-prompt', this.task);
    this.prompt.setAttribute('aria-live', 'polite');
    this.options = div('qp-options', this.sheet);
    this.hint = div('qp-hint', body);
    this.hint.textContent = strings.readyHint;
    this.intro = div('qp-intro', body);
    this.intro.textContent = strings.getReady;
    this.corner = div('qp-corner', this.el);
    parent.appendChild(this.el);
    this.el.dataset.mode = 'off';
    this.upcoming = provider.next();
    window.addEventListener('resize', this.fit);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.el.classList.toggle('qp-calm', on);
  }

  setReadyHint(text: string): void {
    this.hint.textContent = text;
  }

  getMode(): PanelMode {
    return this.mode;
  }

  /** Для тестов: индекс верного варианта текущего вопроса или −1. */
  debugCorrectIndex(): number {
    return this.current && !this.busy ? this.current.correctIndex : -1;
  }

  /** Сменить режим. Часы ответа идут только в режиме 'active'. */
  setMode(mode: PanelMode): void {
    if (this.destroyed || mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.el.dataset.mode = mode;
    if (mode === 'active') {
      if (!this.current && !this.busy) void this.showNext(prev === 'intro' || prev === 'off');
      else this.resumeClock();
    } else {
      this.stopClock();
    }
    this.updateChips();
  }

  /** Клавиши 1–4. Возвращает true, если нажатие что-то сделало. */
  pressKey(n: number): boolean {
    const chip = this.chips[n - 1];
    if (!chip) return false;
    return this.choose(n - 1, chip);
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.timers) window.clearTimeout(t);
    window.removeEventListener('resize', this.fit);
    this.el.remove();
  }

  // ───────────────────────────── внутреннее ─────────────────────────────

  private later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.push(id);
  }

  private resumeClock(): void {
    if (this.clockRunning || !this.current || this.busy) return;
    this.clockRunning = true;
    if (this.stoppedAt) this.stoppedTotal += performance.now() - this.stoppedAt;
    this.stoppedAt = 0;
  }

  private stopClock(): void {
    if (!this.clockRunning) return;
    this.clockRunning = false;
    this.stoppedAt = performance.now();
  }

  private async showNext(instant: boolean): Promise<void> {
    this.busy = true;
    const next = await (this.upcoming ?? this.provider.next());
    if (this.destroyed) return;
    this.upcoming = this.provider.next();
    const swap = () => {
      this.render(next);
      this.current = next;
      this.busy = false;
      this.activatedAt = performance.now();
      this.stoppedTotal = 0;
      this.stoppedAt = 0;
      this.clockRunning = false;
      if (this.mode === 'active') this.resumeClock();
      else this.stoppedAt = performance.now();
      this.updateChips();
    };
    if (instant || this.reducedMotion) {
      swap();
      return;
    }
    // Перелистывание бумаги: старый лист уходит, новый появляется за flipMs.
    this.onSound?.('flip');
    this.sheet.classList.add('qp-flip-out');
    this.later(this.timing.flipMs / 2, () => {
      this.sheet.classList.remove('qp-flip-out');
      swap();
      this.sheet.classList.add('qp-flip-in');
      this.later(this.timing.flipMs / 2, () => this.sheet.classList.remove('qp-flip-in'));
    });
  }

  private render(q: Question): void {
    this.prompt.textContent = q.prompt;
    this.prompt.lang = q.promptLang;
    this.options.innerHTML = '';
    this.options.dataset.count = String(q.options.length);
    this.chips = q.options.map((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qp-chip';
      b.setAttribute('aria-label', this.strings.option(i, text));
      const key = document.createElement('span');
      key.className = 'qp-key';
      key.textContent = String(i + 1);
      key.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span');
      t.className = 'qp-text';
      t.lang = q.optionsLang;
      t.textContent = text;
      b.append(key, t);
      b.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        b.classList.add('is-pressed');
      });
      const release = () => b.classList.remove('is-pressed');
      b.addEventListener('pointerup', release);
      b.addEventListener('pointerleave', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('click', () => this.choose(i, b));
      this.options.appendChild(b);
      return b;
    });
    this.fit();
  }

  /** Ужать шрифт задания и фишек, если текст не помещается (11.2.2). */
  private readonly fit = (): void => {
    const max = this.timing.fontMaxPx;
    const min = this.timing.fontMinPx;
    let size = max;
    this.prompt.style.fontSize = `${size}px`;
    while (
      size > min &&
      (this.prompt.scrollWidth > this.prompt.clientWidth + 1 ||
        this.prompt.scrollHeight > this.prompt.clientHeight + 1)
    ) {
      size -= 1;
      this.prompt.style.fontSize = `${size}px`;
    }
    for (const chip of this.chips) {
      const t = chip.querySelector('.qp-text') as HTMLElement;
      let s = Math.min(22, max);
      t.style.fontSize = `${s}px`;
      // Сначала ужимаем так, чтобы самое длинное слово встало целиком
      // (Lebensmittelgeschäft); рвать слово по слогам — только если не вышло и так.
      t.style.overflowWrap = 'normal';
      t.style.hyphens = 'manual';
      while (s > min - 2 && (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)) {
        s -= 1;
        t.style.fontSize = `${s}px`;
      }
      t.style.overflowWrap = '';
      t.style.hyphens = '';
    }
  };

  private updateChips(): void {
    const enabled = this.mode === 'active' && !this.busy && !!this.current;
    for (const c of this.chips) {
      c.disabled = !enabled;
      c.tabIndex = enabled ? 0 : -1;
    }
  }

  private choose(i: number, chip: HTMLButtonElement): boolean {
    if (this.mode !== 'active' || this.busy || !this.current) return false;
    const now = performance.now();
    // Защита от двойного тапа (2.7.4).
    if (now - this.activatedAt < this.timing.doubleTapGuardMs) return false;
    const q = this.current;
    const timeMs = Math.max(0, now - this.activatedAt - this.stoppedTotal);
    const correct = i === q.correctIndex;
    this.busy = true;
    this.current = null;
    this.clockRunning = false;
    this.updateChips();
    this.provider.report({ id: q.id, correct, timeMs });
    this.onAnswer({ question: q, index: i, correct, timeMs });
    this.onSound?.(correct ? 'correct' : 'wrong');
    if (correct) {
      chip.classList.add('is-correct');
      this.later(this.timing.correctGlowMs, () => void this.showNext(false));
    } else {
      chip.classList.add('is-wrong');
      this.chips[q.correctIndex]?.classList.add('is-right');
      this.el.classList.add('qp-oops');
      this.later(this.timing.wrongFeedbackMs, () => {
        this.el.classList.remove('qp-oops');
        void this.showNext(false);
      });
    }
    return true;
  }
}

function div(cls: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}
