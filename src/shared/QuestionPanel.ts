import type { Question, QuestionProvider } from './questions/types';

/**
 * Панель вопроса серии (11.2): шапка (её заполняет игра), задание на жёлтой бумажке,
 * 2–4 варианта-фишки. Время ответа — performance.now() от момента, когда вопрос стал
 * активным, до клика, без пауз (12.5). Следующий вопрос загружается заранее (12.4).
 *
 * Задания генератора (формат Morskoy) приходят с инструкцией по-русски, немецким материалом и
 * четырьмя вариантами, часто — целыми предложениями. Такие варианты стоят столбиком во всю ширину
 * с текстом по левому краю: так четыре предложения, которые отличаются одной деталью, легко
 * сравнить. Шрифт задания и вариантов подбирается вместе, пока всё не встанет в панель.
 */

/** Ниже этого шрифт фишки не ужимается даже ради самого длинного ответа. */
const HARD_MIN_PX = 11;
/** Шрифт вариантов в заданиях генератора: с какого начинаем и ниже какого не ужимаем. */
const SHEET_FONT_MAX_PX = 20;
const SHEET_FONT_MIN_PX = 12;
/** С этого размера раскладка задания уплотняется, прежде чем ужимать шрифт дальше. */
const DENSE_FROM_PX = 14;
export type PanelMode = 'off' | 'intro' | 'active' | 'ready' | 'paused';

export interface QuestionPanelStrings {
  getReady: string;
  group: string;
  option: (i: number, text: string) => string;
  readyHint: string;
  /** Кнопка повтора фразы в аудировании. */
  listen: string;
}

export interface QuestionPanelTiming {
  doubleTapGuardMs: number;
  correctGlowMs: number;
  flipMs: number;
  wrongFeedbackMs: number;
  /** То же для заданий генератора (с инструкцией): предложение нужно успеть прочитать. */
  wrongFeedbackGeneratedMs: number;
  fontMaxPx: number;
  fontMinPx: number;
}

export interface AnswerInfo {
  question: Question;
  index: number;
  correct: boolean;
  timeMs: number;
}

/** Озвучка фразы аудирования (shared/questions/speech.ts). */
export interface PanelSpeaker {
  speak(text: string): void;
  stop(): void;
}

/**
 * Варианты-предложения — столбиком. Порог по числу слов: в банке нет вариантов длиннее двух слов,
 * поэтому его вопросы остаются в сетке 2 × 2, как в плане (11.2.4).
 */
export function isLongOptions(options: readonly string[]): boolean {
  return options.some((o) => {
    const words = o.trim().split(/\s+/).length;
    return words >= 4 || (words >= 3 && o.replace(/\u00ad/g, '').length > 24);
  });
}

/**
 * Строки задания: переносы из задания сохраняются, а мини-диалог «— Реплика? — Ответ.» в одну
 * строку тоже делится — каждая реплика с новой строки.
 */
export function promptLines(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => {
      const t = line.trim();
      const dash = /^([—–-])\s/.exec(t)?.[1];
      return dash ? t.split(new RegExp(`\\s+(?=${dash}\\s)`)) : [t];
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

export class QuestionPanel {
  readonly el: HTMLElement;
  /** Шапка: её содержимое рисует игра (заряды, подпись). */
  readonly header: HTMLElement;
  /** Угол для слова ошибки («HOPPLA!»). */
  readonly corner: HTMLElement;

  private readonly sheet: HTMLElement;
  private readonly task: HTMLElement;
  private readonly instruction: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly listen: HTMLButtonElement;
  private readonly options: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly intro: HTMLElement;
  private chips: HTMLButtonElement[] = [];

  private mode: PanelMode = 'off';
  private current: Question | null = null;
  private upcoming: Promise<Question> | null = null;
  private upcomingReady = false;
  private upcomingQuestion: Question | null = null;
  private busy = false;
  private activatedAt = 0;
  private stoppedAt = 0;
  private stoppedTotal = 0;
  private clockRunning = false;
  private timers: number[] = [];
  private reducedMotion = false;
  private destroyed = false;
  private speaker: PanelSpeaker | null = null;
  private autoSpeak: () => boolean = () => true;
  /** Фраза текущего вопроса уже прозвучала сама. */
  private spoken = false;
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
    this.instruction = div('qp-instruction', this.task);
    this.instruction.lang = 'ru';
    this.instruction.hidden = true;
    this.prompt = div('qp-prompt', this.task);
    this.prompt.setAttribute('aria-live', 'polite');
    this.listen = document.createElement('button');
    this.listen.type = 'button';
    this.listen.className = 'qp-listen';
    this.listen.hidden = true;
    this.listen.textContent = `▶ ${strings.listen}`;
    this.listen.addEventListener('click', () => this.say());
    this.task.appendChild(this.listen);
    this.options = div('qp-options', this.sheet);
    this.sheet.addEventListener('scroll', () => this.markScrollEnd(), { passive: true });
    this.hint = div('qp-hint', body);
    this.hint.textContent = strings.readyHint;
    this.intro = div('qp-intro', body);
    this.intro.textContent = strings.getReady;
    this.corner = div('qp-corner', this.el);
    parent.appendChild(this.el);
    this.el.dataset.mode = 'off';
    this.preload();
    window.addEventListener('resize', this.fit);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    this.el.classList.toggle('qp-calm', on);
  }

  setReadyHint(text: string): void {
    this.hint.textContent = text;
  }

  /** Подпись вместо вопроса во время интро и пока первый вопрос ещё готовится. */
  setIntroText(text: string): void {
    this.intro.textContent = text;
  }

  /** Озвучка аудирования: фраза звучит сама, когда вопрос становится активным, если auto(). */
  setSpeaker(speaker: PanelSpeaker | null, auto: () => boolean): void {
    this.speaker?.stop();
    this.speaker = speaker;
    this.autoSpeak = auto;
  }

  getMode(): PanelMode {
    return this.mode;
  }

  /** Готов ли вопрос к показу: на экране или уже загружен (иначе раунд ждёт, 12.4). */
  isReady(): boolean {
    return (this.current !== null && !this.busy) || this.upcomingReady;
  }

  /**
   * Какой вопрос сейчас перед игроком или следующим на очереди: задание генератора (формат
   * Morskoy, с инструкцией) или вопрос банка. null — ещё не загружен. Темп раунда берётся
   * по этому виду (shared/pace.ts).
   */
  peekKind(): 'generated' | 'bank' | null {
    const q = this.current ?? this.upcomingQuestion;
    if (!q) return null;
    return q.instruction ? 'generated' : 'bank';
  }

  /** Источник сменил темы: заранее загруженный вопрос больше не годится. */
  reload(): void {
    if (this.destroyed) return;
    if (!this.busy) this.current = null;
    this.preload();
    this.updateChips();
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
      else {
        // Панель была скрыта (меню, уровни): размеры могли смениться — подогнать заново.
        if (prev === 'off' && this.current) this.fit();
        this.resumeClock();
        this.maybeSpeak();
      }
    } else {
      this.stopClock();
      this.speaker?.stop();
    }
    this.updateChips();
  }

  /** Для тестов раскладки: сразу показать данный вопрос (без отчёта поставщику). */
  debugShow(q: Question): void {
    this.render(q);
    this.current = q;
    this.busy = false;
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
    this.speaker?.stop();
    this.el.remove();
  }

  // ───────────────────────────── внутреннее ─────────────────────────────

  private preload(): void {
    const next = this.provider.next();
    this.upcoming = next;
    this.upcomingReady = false;
    this.upcomingQuestion = null;
    void next.then((q) => {
      if (this.upcoming !== next) return;
      this.upcomingReady = true;
      this.upcomingQuestion = q;
    });
  }

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
    if (!this.upcoming) this.preload();
    const next = await (this.upcoming as Promise<Question>);
    if (this.destroyed) return;
    this.preload();
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
      this.maybeSpeak();
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

  /** Фраза аудирования звучит один раз сама, как только вопрос стал активным. */
  private maybeSpeak(): void {
    const q = this.current;
    if (!q?.audioText || this.spoken || this.busy || this.mode !== 'active') return;
    if (!this.autoSpeak()) return;
    this.spoken = true;
    this.speaker?.speak(q.audioText);
  }

  /** Кнопка «Слушать»: повторить фразу. На паузе вопрос спрятан — и звука нет. */
  private say(): void {
    const q = this.current;
    if (!q?.audioText || this.mode === 'paused' || this.mode === 'off') return;
    this.spoken = true;
    this.speaker?.speak(q.audioText);
  }

  private render(q: Question): void {
    this.speaker?.stop();
    this.spoken = false;
    // Задания генератора — с инструкцией; их раскладка подбирается целиком (fitSheet).
    const generated = !!q.instruction;
    this.el.classList.toggle('qp-generated', generated);
    this.sheet.dataset.fit = generated ? 'sheet' : 'items';
    this.sheet.dataset.layout = isLongOptions(q.options) ? 'column' : 'grid';
    this.sheet.classList.remove('qp-scroll', 'qp-dense');
    this.sheet.scrollTop = 0;
    this.instruction.textContent = q.instruction ?? '';
    this.instruction.hidden = !q.instruction;
    const audio = !!q.audioText;
    this.task.classList.toggle('qp-task-audio', audio);
    this.listen.hidden = !audio;
    this.listen.setAttribute(
      'aria-label',
      audio ? `${this.strings.listen}: ${q.prompt}` : this.strings.listen,
    );
    // Текст — только textContent: задания приходят от модели и не должны стать разметкой.
    const lines = promptLines(q.prompt);
    this.prompt.classList.toggle('qp-dialog', lines.length > 1);
    this.prompt.replaceChildren(
      ...lines.map((line) => {
        const s = document.createElement('span');
        s.className = 'qp-line';
        s.textContent = line;
        return s;
      }),
    );
    this.prompt.lang = q.promptLang;
    this.prompt.hidden = audio;
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
    if (this.sheet.dataset.fit === 'sheet') {
      this.fitSheet();
      return;
    }
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
    const range = document.createRange();
    let common = Infinity;
    for (const chip of this.chips) {
      const t = chip.querySelector('.qp-text') as HTMLElement;
      let s = Math.min(22, max);
      const set = () => (t.style.fontSize = `${s}px`);
      // Ширина текста дробная, а scrollWidth округлён: слово шире рамки на долю пикселя
      // считалось бы поместившимся. Меряем сам текст.
      const tooWide = () => {
        range.selectNodeContents(t);
        return range.getBoundingClientRect().width > t.getBoundingClientRect().width - 0.5;
      };
      set();
      // 1. Самое длинное слово (Lebensmittelgeschäft) должно встать в строку целиком, без
      //    переноса: строгая проверка, иначе браузер перенесёт последнюю букву на строку,
      //    которую обрежет край фишки.
      t.style.overflowWrap = 'normal';
      t.style.hyphens = 'manual';
      while (s > min - 2 && (tooWide() || t.scrollHeight > t.clientHeight)) {
        s -= 1;
        set();
      }
      t.style.overflowWrap = '';
      t.style.hyphens = '';
      // 2. Если не вышло — переносим по слогам (мягкие переносы, hyphens) и ужимаем дальше,
      //    пока текст не встанет по высоте: лучше мелко, чем обрезанный ответ.
      while (s > HARD_MIN_PX && (t.scrollHeight > t.clientHeight || tooWide())) {
        s -= 1;
        set();
      }
      common = Math.min(common, s);
    }
    // Один размер на все фишки: размер шрифта не должен подсказывать ответ.
    for (const chip of this.chips) {
      const t = chip.querySelector('.qp-text') as HTMLElement;
      t.style.fontSize = `${common}px`;
    }
  };

  /**
   * Задание генератора: один шаг шрифта на всё сразу (инструкция, материал, варианты), сверху
   * вниз, пока лист не перестанет переполняться. С DENSE_FROM_PX поля и межстрочные интервалы
   * становятся плотнее — сначала они, потом ещё меньший шрифт. Если не встало и на минимуме —
   * лист прокручивается: лучше прокрутка, чем обрезанное предложение.
   */
  private fitSheet(): void {
    const texts = this.chips.map((c) => c.querySelector('.qp-text') as HTMLElement);
    const apply = (s: number, dense: boolean) => {
      this.sheet.classList.toggle('qp-dense', dense);
      this.prompt.style.fontSize = `${Math.min(this.timing.fontMaxPx, s + 2)}px`;
      this.instruction.style.fontSize = `${Math.max(11, Math.min(15, s - 4))}px`;
      for (const t of texts) t.style.fontSize = `${s}px`;
    };
    const over = (e: HTMLElement) => e.scrollHeight > e.clientHeight + 1;
    const overflows = () =>
      over(this.sheet) || over(this.options) || over(this.prompt) || texts.some((t) => over(t));
    this.sheet.classList.remove('qp-scroll');
    let s = SHEET_FONT_MAX_PX;
    let dense = false;
    apply(s, dense);
    while (overflows()) {
      if (!dense && s <= DENSE_FROM_PX) dense = true;
      else if (s > SHEET_FONT_MIN_PX) s--;
      else break;
      apply(s, dense);
    }
    if (overflows()) this.sheet.classList.add('qp-scroll');
    this.markScrollEnd();
  }

  private markScrollEnd(): void {
    const end = this.sheet.scrollTop + this.sheet.clientHeight >= this.sheet.scrollHeight - 2;
    this.sheet.classList.toggle('qp-scroll-end', end);
  }

  private updateChips(): void {
    const enabled = this.mode === 'active' && !this.busy && !!this.current;
    for (const c of this.chips) {
      c.disabled = !enabled;
      c.tabIndex = enabled ? 0 : -1;
    }
    this.listen.disabled = !this.current || this.mode === 'paused' || this.mode === 'off';
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
      const showMs = q.instruction ? this.timing.wrongFeedbackGeneratedMs : this.timing.wrongFeedbackMs;
      this.later(showMs, () => {
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
