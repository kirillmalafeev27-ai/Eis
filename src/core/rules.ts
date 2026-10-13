import { balance } from '../config/balance';
import type { DenyReason, GameAction, GameEvent, LandKind } from './events';
import { crackStageFractions, heroAvailableMs, heroFloeEndsAt } from './floes';
import { farBankCells, isFloe, isSolid, withCell } from './grid';
import { findJump } from './jumps';
import { gridWithWetSunk, meltCandidates, meltIntervalMs, meltStrength, meltWarnMs } from './melt';
import { type Route, type RouteEnv, type RouteStep, findRoute, hasFairRoute, hasRouteToFarBank, stepRisk } from './routes';
import { freshFloeMs } from './risk';
import { rngStep } from './rng';
import { type GameState, caughtFish, draftState, starsFor } from './state';

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Единственный способ изменить состояние (13.3.2). Детерминирован: одинаковые сид
 * и журнал действий дают одинаковый результат.
 */
export function reduce(state: GameState, action: GameAction): ReduceResult {
  const s = draftState(state);
  const ev: GameEvent[] = [];
  switch (action.type) {
    case 'TICK':
      tick(s, action.dt, ev);
      break;
    case 'ANSWER':
      answer(s, action.correct, action.timeMs, ev);
      break;
    case 'SET_TARGET':
      setTarget(s, action.cell, ev);
      break;
    case 'CANCEL_TARGET':
      if (s.status === 'playing' && !s.paused && s.hero.target !== null) {
        s.hero.target = null;
        s.route = null;
        ev.push({ type: 'TARGET', cell: null });
      }
      break;
    case 'PAUSE':
      s.paused = true;
      break;
    case 'RESUME':
      s.paused = false;
      break;
  }
  return { state: s, events: ev };
}

/** Применить несколько действий подряд. */
export function reduceAll(state: GameState, actions: readonly GameAction[]): ReduceResult {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = reduce(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

// ───────────────────────────── запросы к состоянию ─────────────────────────────

export function routeEnv(s: GameState): RouteEnv {
  return {
    grid: s.grid,
    level: s.level,
    pace: s.pace,
    start: s.hero.cell,
    pips: s.hero.pips,
    startAvailableMs: heroAvailableMs(s),
    sinkInMs: (cell) => (s.sinkAt[cell] >= 0 ? Math.max(0, s.sinkAt[cell] - s.time) : Infinity),
  };
}

/** Сколько зарядов нужно на следующий прыжок: по маршруту или один (готовый прыжок). */
export function pipsNeeded(s: GameState): number {
  return s.route && s.route.length ? s.route[0].cost : 1;
}

/** Готовый прыжок без цели (2.2.5): заряд накоплен, ждём выбора льдины. */
export function isReady(s: GameState): boolean {
  return s.status === 'playing' && s.hero.target === null && s.hero.pips >= 1;
}

/** Маршрут к любой клетке без установки цели — для подсказок наведения и ботов. */
export function previewRoute(s: GameState, target: number | readonly number[]): Route | null {
  return findRoute(routeEnv(s), target);
}

/** Клетка дальнего берега с самым дешёвым маршрутом — для кнопки «К берегу». */
export function bestFarBankTarget(s: GameState): number | null {
  const r = findRoute(routeEnv(s), farBankCells(s.grid));
  return r ? r.target : null;
}

export function meltStrengthOf(s: GameState): number {
  return meltStrength(s.time, s.level, s.pace);
}

// ───────────────────────────── действия ─────────────────────────────

function answer(s: GameState, correct: boolean, timeMs: number, ev: GameEvent[]): void {
  if (s.status !== 'playing' || s.paused) return;
  s.stats.answers++;
  s.stats.times = [...s.stats.times, timeMs];
  if (!correct) {
    s.stats.wrong++;
    ev.push({ type: 'WRONG' });
    return;
  }
  s.stats.correct++;
  const need = pipsNeeded(s);
  if (s.hero.pips < need) {
    s.hero.pips++;
    ev.push({ type: 'PIP', pips: s.hero.pips, need });
  }
  // Заряды поменяли риск первого прыжка: маршрут пересчитывается до прыжка.
  refreshRoute(s, ev, true);
  tryJump(s, ev);
}

function setTarget(s: GameState, cell: number, ev: GameEvent[]): void {
  if (s.status !== 'playing' || s.paused) return;
  if (!Number.isInteger(cell) || cell < 0 || cell >= s.grid.cells.length) {
    deny(ev, 'tooFar', cell);
    return;
  }
  if (cell === s.hero.cell) {
    if (s.hero.target !== null) {
      s.hero.target = null;
      s.route = null;
      ev.push({ type: 'TARGET', cell: null });
    }
    return;
  }
  if (!isSolid(s.grid.cells[cell])) {
    deny(ev, 'water', cell);
    return;
  }
  const r = findRoute(routeEnv(s), cell);
  if (!r) {
    deny(ev, 'noRoute', cell);
    return;
  }
  s.hero.target = cell;
  s.route = r.steps;
  ev.push({ type: 'TARGET', cell });
  tryJump(s, ev);
}

function deny(ev: GameEvent[], reason: DenyReason, cell: number): void {
  ev.push({ type: 'DENIED', reason, cell });
}

/** Прыжок выполняется, как только зарядов хватает на следующий прыжок маршрута (2.2.6). */
function tryJump(s: GameState, ev: GameEvent[]): void {
  if (s.status !== 'playing' || s.hero.target === null || !s.route || !s.route.length) return;
  const step = s.route[0];
  if (s.hero.pips < step.cost) return;
  doJump(s, step, ev);
}

function doJump(s: GameState, step: RouteStep, ev: GameEvent[]): void {
  const from = s.hero.cell;
  const floeLeftMs = heroAvailableMs(s);
  ev.push({ type: 'JUMP', from, to: step.to, long: step.long });
  s.stats.jumps++;
  if (step.long) s.stats.longJumps++;
  s.hero.cell = step.to;
  s.hero.pips = 0;

  // Покинутая льдина раскалывается и тонет; берега не тонут (2.2.9).
  const leftKind = s.grid.cells[from];
  if (isFloe(leftKind)) {
    ev.push({ type: 'FLOE_LEFT_SUNK', cell: from, kind: leftKind === 'thick' ? 'thick' : 'thin', debris: s.debris[from] });
    setCell(s, from, 'water');
    s.debris[from] = false;
    s.wetStart[from] = -1;
    s.sinkAt[from] = -1;
  }

  land(s, step.to, floeLeftMs, ev);
  if (s.status !== 'playing') return;

  if (s.hero.target === s.hero.cell) {
    s.hero.target = null;
    s.route = null;
  } else {
    refreshRoute(s, ev, true);
  }
  checkTrapped(s, ev);
}

function land(s: GameState, cell: number, floeLeftMs: number, ev: GameEvent[]): void {
  const kind = s.grid.cells[cell];
  if (kind === 'far') {
    ev.push({ type: 'LANDED', cell, kind: 'far' });
    escape(s, cell, floeLeftMs, ev);
    return;
  }
  if (kind === 'near') {
    s.hero.floeStart = null;
    s.hero.floeDuration = 0;
    s.hero.crackStage = 0;
    s.hero.countdown = 0;
    ev.push({ type: 'LANDED', cell, kind: 'near' });
    return;
  }
  const landKind: LandKind = s.debris[cell] ? 'debris' : kind === 'thick' ? 'thick' : 'thin';
  startFloeTimer(s, kind === 'thick' ? 'thick' : 'thin');
  ev.push({ type: 'LANDED', cell, kind: landKind });
  for (let i = 0; i < s.fish.length; i++) {
    const f = s.fish[i];
    if (f.cell === cell && f.status === 'waiting') {
      f.status = 'caught';
      ev.push({ type: 'FISH_CAUGHT', cell, fish: i, count: caughtFish(s) });
    }
  }
}

function startFloeTimer(s: GameState, kind: 'thin' | 'thick'): void {
  s.hero.floeStart = s.time;
  s.hero.floeDuration = freshFloeMs(kind, s.level, s.pace.tMedMs);
  s.hero.crackStage = 0;
  s.hero.countdown = 0;
}

function escape(s: GameState, cell: number, floeLeftMs: number, ev: GameEvent[]): void {
  s.status = 'won';
  s.endTime = s.time;
  s.hero.target = null;
  s.route = null;
  s.hero.floeStart = null;
  const fish = caughtFish(s);
  ev.push({ type: 'ESCAPED', cell, fish, stars: starsFor(true, fish), timeMs: s.time, floeLeftMs });
}

function lose(s: GameState, cause: 'cold' | 'trapped', ev: GameEvent[]): void {
  s.status = 'lost';
  s.cause = cause;
  s.endTime = s.time;
  ev.push(cause === 'cold' ? { type: 'OUT_OF_WARMTH' } : { type: 'TRAPPED' });
}

/** Падение (2.3.4): минус деление тепла, герой выбирается на обломок в той же клетке. */
function fall(s: GameState, cause: 'crack' | 'melt', ev: GameEvent[]): void {
  const cell = s.hero.cell;
  s.hero.warmth -= 1;
  s.hero.falls += 1;
  if (cause === 'crack') s.stats.fallsCrack++;
  else s.stats.fallsMelt++;
  ev.push({ type: 'FELL', cause, warmthLeft: s.hero.warmth, cell });
  setCell(s, cell, 'thin');
  s.debris[cell] = true;
  s.wetStart[cell] = -1;
  s.sinkAt[cell] = -1;
  if (s.hero.warmth <= 0) {
    s.hero.floeStart = null;
    lose(s, 'cold', ev);
    return;
  }
  startFloeTimer(s, 'thin');
}

function setCell(s: GameState, cell: number, kind: 'water' | 'thin' | 'thick'): void {
  s.grid = withCell(s.grid, cell, kind);
}

// ───────────────────────────── время ─────────────────────────────

/**
 * Шаг времени кадра ограничен (2.7.3) — это делает вид через clampFrameDt; сам редуктор
 * честно обрабатывает любой шаг: все события внутри него — по порядку времени.
 */
export function clampFrameDt(frameDtMs: number): number {
  return Math.max(0, Math.min(frameDtMs, balance.rules.maxFrameDtMs));
}

function tick(s: GameState, rawDt: number, ev: GameEvent[]): void {
  if (s.status !== 'playing' || s.paused) return;
  const dt = Math.max(0, rawDt);
  const end = s.time + dt;
  let changed = false;
  for (let guard = 0; guard < 100000 && s.status === 'playing'; guard++) {
    const due = nextDue(s);
    if (due > end) break;
    s.time = Math.max(s.time, due);
    if (processDue(s, ev)) changed = true;
  }
  if (s.status !== 'playing') return;
  s.time = end;
  refreshRoute(s, ev, changed);
  // Маршрут мог смениться на прыжок, на который зарядов уже хватает (2.2.6).
  tryJump(s, ev);
}

const STAGES = crackStageFractions();

/** Ближайший момент, когда что-то произойдёт само (для событийной симуляции). */
export function nextScheduledTime(s: GameState): number {
  return nextDue(s);
}

function nextDue(s: GameState): number {
  let t = s.melt.nextAt;
  const floeStart = s.hero.floeStart;
  if (floeStart !== null) {
    const endAt = heroFloeEndsAt(s);
    if (s.hero.crackStage < STAGES.length) {
      t = Math.min(t, floeStart + s.hero.floeDuration * STAGES[s.hero.crackStage]);
    }
    const nextN = s.hero.countdown === 0 ? Math.round(balance.rules.countdownFromMs / 1000) : s.hero.countdown - 1;
    if (nextN >= 1) t = Math.min(t, endAt - nextN * 1000);
    t = Math.min(t, endAt);
  }
  for (let c = 0; c < s.sinkAt.length; c++) if (s.sinkAt[c] >= 0 && s.sinkAt[c] < t) t = s.sinkAt[c];
  return t;
}

/** Обработать всё, что наступило к s.time. Возвращает true, если мир изменился. */
function processDue(s: GameState, ev: GameEvent[]): boolean {
  let changed = false;

  // 1. Намокшие льдины тонут.
  for (let c = 0; c < s.sinkAt.length && s.status === 'playing'; c++) {
    if (s.sinkAt[c] >= 0 && s.sinkAt[c] <= s.time) {
      sinkWet(s, c, ev);
      changed = true;
    }
  }
  if (s.status !== 'playing') return true;

  // 2. Таймер льдины под героем: стадии трещин, отсчёт, развал.
  const start = s.hero.floeStart;
  if (start !== null) {
    while (s.hero.crackStage < STAGES.length && s.time >= start + s.hero.floeDuration * STAGES[s.hero.crackStage]) {
      s.hero.crackStage++;
      ev.push({ type: 'CRACK_STAGE', stage: s.hero.crackStage as 1 | 2 | 3 | 4, cell: s.hero.cell });
    }
    const endAt = heroFloeEndsAt(s);
    const remaining = endAt - s.time;
    const firstN = Math.round(balance.rules.countdownFromMs / 1000);
    for (let n = s.hero.countdown === 0 ? firstN : s.hero.countdown - 1; n >= 1; n--) {
      if (remaining <= n * 1000 && remaining > 0) {
        s.hero.countdown = n;
        ev.push({ type: 'COUNTDOWN', n, cell: s.hero.cell });
      } else break;
    }
    if (s.time >= endAt) {
      fall(s, 'crack', ev);
      changed = true;
      if (s.status !== 'playing') return true;
      checkTrapped(s, ev);
      if (s.status !== 'playing') return true;
    }
  }

  // 3. Событие таяния.
  if (s.time >= s.melt.nextAt) {
    if (meltEvent(s, ev)) changed = true;
  }

  if (changed) checkTrapped(s, ev);
  return changed;
}

function sinkWet(s: GameState, cell: number, ev: GameEvent[]): void {
  s.wetStart[cell] = -1;
  s.sinkAt[cell] = -1;
  const underHero = s.hero.cell === cell;
  ev.push({ type: 'MELT_SUNK', cell, underHero });
  for (let i = 0; i < s.fish.length; i++) {
    const f = s.fish[i];
    if (f.cell === cell && f.status === 'waiting') {
      f.status = 'lost';
      s.stats.fishLost++;
      ev.push({ type: 'FISH_LOST', cell, fish: i });
    }
  }
  if (underHero) {
    fall(s, 'melt', ev);
  } else {
    setCell(s, cell, 'water');
    s.debris[cell] = false;
    if (s.hero.target === cell) {
      s.hero.target = null;
      s.route = null;
      ev.push({ type: 'TARGET', cell: null });
    }
  }
}

/** Событие таяния (2.4): взвешенный выбор среди честных кандидатов. */
function meltEvent(s: GameState, ev: GameEvent[]): boolean {
  const strength = meltStrength(s.time, s.level, s.pace);
  s.melt.nextAt += meltIntervalMs(strength, s.level, s.pace);
  const cands = meltCandidates(s, strength);
  const base = gridWithWetSunk(s);
  while (cands.length) {
    let total = 0;
    for (const c of cands) total += c.weight;
    const r = rngStep(s.rng);
    s.rng = r.state;
    let pick = r.value * total;
    let idx = 0;
    for (; idx < cands.length - 1; idx++) {
      pick -= cands[idx].weight;
      if (pick < 0) break;
    }
    const cell = cands[idx].cell;
    if (hasFairRoute(withCell(base, cell, 'water'), s.hero.cell, s.level, s.pace)) {
      s.wetStart[cell] = s.time;
      s.sinkAt[cell] = s.time + meltWarnMs(s.pace);
      s.melt.events++;
      ev.push({ type: 'MELT_WARN', cell, sinkAt: s.sinkAt[cell] });
      return true;
    }
    cands.splice(idx, 1);
  }
  s.melt.skipped++;
  return false;
}

/** Тупик (2.6.3): нет вообще никакого маршрута к дальнему берегу — поражение сразу. */
function checkTrapped(s: GameState, ev: GameEvent[]): void {
  if (s.status !== 'playing') return;
  if (!hasRouteToFarBank(s.grid, s.hero.cell)) lose(s, 'trapped', ev);
}

// ───────────────────────────── маршрут ─────────────────────────────

/**
 * Маршрут пересчитывается после событий и когда меняется риск одного из его прыжков
 * (время на льдине убывает, срок намокания подходит) — иначе берётся сохранённый.
 */
function refreshRoute(s: GameState, ev: GameEvent[], force: boolean): void {
  const target = s.hero.target;
  if (target === null || s.status !== 'playing') {
    s.route = null;
    return;
  }
  if (!isSolid(s.grid.cells[target])) {
    s.hero.target = null;
    s.route = null;
    ev.push({ type: 'TARGET', cell: null });
    return;
  }
  if (!force && s.route && !routeStale(s)) return;
  const r = findRoute(routeEnv(s), target);
  if (!r) {
    s.hero.target = null;
    s.route = null;
    ev.push({ type: 'TARGET', cell: null });
    return;
  }
  s.route = r.steps;
}

function routeStale(s: GameState): boolean {
  const route = s.route;
  if (!route || !route.length) return true;
  if (route[0].from !== s.hero.cell) return true;
  const env = routeEnv(s);
  for (const step of route) {
    if (!findJump(s.grid, step.from, step.to)) return true;
    if (stepRisk(env, step).level !== step.risk.level) return true;
  }
  return false;
}

/** Текущие риски шагов маршрута (для следов: цвет меняется по ходу таймера). */
export function routeRisks(s: GameState): RouteStep[] {
  if (!s.route) return [];
  const env = routeEnv(s);
  return s.route.map((step) => ({ ...step, risk: stepRisk(env, step) }));
}
