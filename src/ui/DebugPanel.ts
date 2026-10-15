import { heroAvailableMs } from '../core/floes';
import { meltStrengthOf } from '../core/rules';
import type { GameState } from '../core/state';
import { button, el } from './dom';

/**
 * Отладочная панель (13.7, только dev): FPS, сид, T_med, p, сила ледохода, время до таяния,
 * таймеры льдин числами, маршрут, кнопки «заморозить таяние», «бесконечное тепло»,
 * «состарить льдину на 50%», «сила ледохода 1.0», «тест контраста».
 */
export interface DebugActions {
  freezeMelt: () => void;
  infiniteWarmth: () => void;
  ageFloe: () => void;
  strengthMax: () => void;
  contrast: () => void;
}

export class DebugPanel {
  private readonly root: HTMLElement;
  private readonly out: HTMLElement;
  private last = 0;

  constructor(parent: HTMLElement, a: DebugActions) {
    this.out = el('pre', 'dbg-out');
    this.root = el('div', 'dbg', {}, [
      this.out,
      el('div', 'dbg-btns', {}, [
        button('заморозить таяние', 'paper-btn-small', a.freezeMelt),
        button('бесконечное тепло', 'paper-btn-small', a.infiniteWarmth),
        button('состарить льдину на 50%', 'paper-btn-small', a.ageFloe),
        button('сила ледохода 1.0', 'paper-btn-small', a.strengthMax),
        button('тест контраста', 'paper-btn-small', a.contrast),
      ]),
    ]);
    parent.appendChild(this.root);
  }

  update(s: GameState | null, fps: number): void {
    const now = performance.now();
    if (now - this.last < 200) return;
    this.last = now;
    if (!s) {
      this.out.textContent = `FPS ${fps.toFixed(0)}`;
      return;
    }
    const wet: string[] = [];
    s.sinkAt.forEach((t, c) => {
      if (t >= 0) wet.push(`${c}:${((t - s.time) / 1000).toFixed(1)}с`);
    });
    const avail = heroAvailableMs(s);
    this.out.textContent = [
      `FPS ${fps.toFixed(0)}  сид ${s.seed}`,
      `T_эфф ${(s.pace.tMedMs / 1000).toFixed(2)} с  p ${s.pace.p.toFixed(2)}` +
        (s.pace.medianMs
          ? `  (медиана ${(s.pace.medianMs / 1000).toFixed(1)} с, σ ${s.pace.sigma?.toFixed(2)})`
          : ''),
      `сила ${meltStrengthOf(s).toFixed(2)}  до таяния ${((s.melt.nextAt - s.time) / 1000).toFixed(1)} с`,
      `льдина героя: ${Number.isFinite(avail) ? (avail / 1000).toFixed(1) + ' с' : 'берег'}  стадия ${s.hero.crackStage}`,
      `намокают: ${wet.join(' ') || '—'}`,
      `маршрут: ${s.route ? s.route.map((r) => `${r.to}${r.long ? 'L' : ''}·${r.risk.level[0]}`).join(' → ') : '—'}`,
      `тепло ${s.hero.warmth}  заряды ${s.hero.pips}  время ${(s.time / 1000).toFixed(1)} с`,
    ].join('\n');
  }

  destroy(): void {
    this.root.remove();
  }
}
