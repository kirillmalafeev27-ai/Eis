import type { Question, QuestionProvider } from './types';

/**
 * Локальный банк вопросов для разработки (12.1): варианты перемешиваются при показе,
 * вопрос не повторяется раньше чем через 10 показов, ошибочный возвращается через 4–6.
 */
export interface LocalBankOptions {
  noRepeatWithin: number;
  retryWrongMin: number;
  retryWrongMax: number;
  random?: () => number;
}

export class LocalBankProvider implements QuestionProvider {
  private shown = 0;
  private lastShown = new Map<string, number>();
  private retries: { id: string; at: number }[] = [];
  private readonly byId = new Map<string, Question>();
  private readonly rand: () => number;
  readonly reports: { id: string; correct: boolean; timeMs: number }[] = [];

  constructor(
    private readonly bank: readonly Question[],
    private readonly opts: LocalBankOptions,
  ) {
    for (const q of bank) this.byId.set(q.id, q);
    this.rand = opts.random ?? Math.random;
  }

  async next(): Promise<Question> {
    return this.pick();
  }

  /** Синхронный выбор — для предзагрузки и тестов. */
  pick(): Question {
    this.shown++;
    const due = this.retries.findIndex((r) => r.at <= this.shown);
    let q: Question | undefined;
    if (due >= 0) {
      q = this.byId.get(this.retries[due].id);
      this.retries.splice(due, 1);
    }
    if (!q) {
      const fresh = this.bank.filter((x) => {
        const last = this.lastShown.get(x.id);
        return last === undefined || this.shown - last > this.opts.noRepeatWithin;
      });
      const pool = fresh.length ? fresh : this.bank;
      q = pool[Math.floor(this.rand() * pool.length)];
    }
    this.lastShown.set(q.id, this.shown);
    return this.shuffled(q);
  }

  report(r: { id: string; correct: boolean; timeMs: number }): void {
    this.reports.push(r);
    if (!r.correct) {
      const gap =
        this.opts.retryWrongMin +
        Math.floor(this.rand() * (this.opts.retryWrongMax - this.opts.retryWrongMin + 1));
      this.retries.push({ id: r.id, at: this.shown + gap });
    }
  }

  private shuffled(q: Question): Question {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
  }
}
