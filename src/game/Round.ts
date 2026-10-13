import type { LevelConfig } from '../config/levels';
import type { GameAction, GameEvent } from '../core/events';
import { generateLevel, type LevelGenResult } from '../core/levelGen';
import type { Pace } from '../core/risk';
import { clampFrameDt, reduce } from '../core/rules';
import { type GameState, createState } from '../core/state';

export type RoundListener = (events: GameEvent[], state: GameState, prev: GameState) => void;

/**
 * Раунд: владеет состоянием и шлёт действия в редуктор. Вид подписан на события
 * и никогда не меняет состояние сам (13.3.4).
 */
export class Round {
  state: GameState;
  readonly gen: LevelGenResult;
  private readonly listeners = new Set<RoundListener>();
  /** Журнал действий — для повторов и отладки (13.3.5). */
  readonly log: GameAction[] = [];

  constructor(
    readonly level: LevelConfig,
    readonly seed: number,
    readonly pace: Pace,
  ) {
    this.gen = generateLevel(level, seed, pace.tMedMs);
    this.state = createState(level, this.gen, pace, seed);
  }

  on(cb: RoundListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispatch(action: GameAction): GameEvent[] {
    const prev = this.state;
    const r = reduce(prev, action);
    this.state = r.state;
    this.log.push(action);
    for (const cb of this.listeners) cb(r.events, this.state, prev);
    return r.events;
  }

  /** Время кадра: шаг ограничен 100 мс (2.7.3), чтобы подвисания не съедали секунды. */
  frame(frameDtMs: number): GameEvent[] {
    if (this.state.status !== 'playing' || this.state.paused) return [];
    return this.dispatch({ type: 'TICK', dt: clampFrameDt(frameDtMs) });
  }
}
