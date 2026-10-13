/** Действия и события «Льдин» (13.3). Вид подписан на события и не меняет состояние сам. */

export type GameAction =
  | { type: 'TICK'; dt: number }
  | { type: 'ANSWER'; correct: boolean; timeMs: number }
  | { type: 'SET_TARGET'; cell: number }
  | { type: 'CANCEL_TARGET' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export type LandKind = 'thin' | 'thick' | 'debris' | 'near' | 'far';
export type FallCause = 'crack' | 'melt';
export type DenyReason = 'tooFar' | 'water' | 'noRoute';

export type GameEvent =
  | { type: 'JUMP'; from: number; to: number; long: boolean }
  | { type: 'LANDED'; cell: number; kind: LandKind }
  | { type: 'CRACK_STAGE'; stage: 1 | 2 | 3 | 4; cell: number }
  | { type: 'FLOE_LEFT_SUNK'; cell: number; kind: 'thin' | 'thick'; debris: boolean }
  | { type: 'MELT_WARN'; cell: number; sinkAt: number }
  | { type: 'MELT_SUNK'; cell: number; underHero: boolean }
  | { type: 'FISH_CAUGHT'; cell: number; fish: number; count: number }
  | { type: 'FISH_LOST'; cell: number; fish: number }
  | { type: 'COUNTDOWN'; n: number; cell: number }
  | { type: 'FELL'; cause: FallCause; warmthLeft: number; cell: number }
  | { type: 'OUT_OF_WARMTH' }
  | { type: 'TRAPPED' }
  | { type: 'ESCAPED'; cell: number; fish: number; stars: number; timeMs: number; floeLeftMs: number }
  | { type: 'DENIED'; reason: DenyReason; cell: number }
  // Дополнительно к списку 13.3 — чтобы виду не приходилось сравнивать состояния:
  | { type: 'PIP'; pips: number; need: number }
  | { type: 'WRONG' }
  | { type: 'TARGET'; cell: number | null };
