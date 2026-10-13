import Phaser from 'phaser';
import { balance } from '../config/balance';
import { levelById, levels } from '../config/levels';
import { palette } from '../config/palette';
import type { GameEvent } from '../core/events';
import { index, isSolid } from '../core/grid';
import { nextSeed } from '../core/levelGen';
import { bestFarBankTarget, isReady, pipsNeeded } from '../core/rules';
import { type GameState, caughtFish } from '../core/state';
import { ru } from '../i18n/ru';
import { Orientation } from '../render/orientation';
import { BootScene } from '../scenes/BootScene';
import { GameScene, type SceneHost } from '../scenes/GameScene';
import { sfxDe } from '../i18n/sfx.de';
import type { WorldOptions } from '../render/WorldView';
import { type Layout, createLayout } from '../shared/layout';
import { PaceTracker } from '../shared/pace';
import { QuestionPanel } from '../shared/QuestionPanel';
import type { QuestionProvider } from '../shared/questions/types';
import { type KeyValueStorage, localStorageWithPrefix } from '../shared/storage';
import { paperTheme } from '../shared/themes/paper';
import { BasketWidget } from '../ui/BasketWidget';
import { JumpHeader } from '../ui/JumpHeader';
import { Round } from './Round';

export interface FinishResult {
  level: number;
  won: boolean;
  fish: 0 | 1 | 2 | 3;
  stars: 0 | 1 | 2 | 3;
  timeMs: number;
  falls: number;
  cause?: 'cold' | 'trapped';
}

export interface IceOptions {
  questions: QuestionProvider;
  storage?: KeyValueStorage;
  level?: number;
  onFinish?: (r: FinishResult) => void;
}

type Phase = 'boot' | 'intro' | 'play' | 'over';

/** Приложение «Льдин»: раскладка, канва, панель вопроса, раунд и ввод. */
export class App implements SceneHost {
  readonly layout: Layout;
  readonly storage: KeyValueStorage;
  readonly pace: PaceTracker;
  private readonly game: Phaser.Game;
  private scene: GameScene | null = null;
  private readonly panel: QuestionPanel;
  private readonly header: JumpHeader;
  private readonly basket: BasketWidget;
  private round: Round | null = null;
  private phase: Phase = 'boot';
  private introLeft = 0;
  private userPaused = false;
  private autoPaused = false;
  private levelId: number;
  private seed = (Date.now() & 0x7fffffff) >>> 0;
  private overlay: HTMLElement | null = null;
  private readonly ro: ResizeObserver;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    container: HTMLElement,
    private readonly opts: IceOptions,
  ) {
    this.storage = opts.storage ?? localStorageWithPrefix('ice:');
    this.pace = new PaceTracker(this.storage, balance.pace);
    this.levelId = opts.level ?? 1;
    this.layout = createLayout(container, paperTheme, { ...balance.layout, questionFloor: 240 });

    this.panel = new QuestionPanel(
      this.layout.questionCard,
      opts.questions,
      { getReady: ru.getReady, group: ru.questionGroup, option: ru.optionLabel, readyHint: ru.readyPick },
      {
        doubleTapGuardMs: balance.questions.doubleTapGuardMs,
        correctGlowMs: balance.questions.correctGlowMs,
        flipMs: balance.questions.flipMs,
        wrongFeedbackMs: balance.rules.wrongFeedbackMs,
        fontMaxPx: balance.questions.fontMaxPx,
        fontMinPx: balance.questions.fontMinPx,
      },
      (a) => this.onAnswer(a.correct, a.timeMs),
    );
    this.header = new JumpHeader(this.panel.header);
    this.basket = new BasketWidget(
      this.layout.worldOverlay,
      balance.rules.warmth,
      () => this.toShore(),
      () => this.stand(),
    );

    const dpr = this.dpr();
    const size = this.hostSize();
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.layout.worldHost,
      backgroundColor: palette.water.deep,
      banner: false,
      disableContextMenu: true,
      autoFocus: false,
      input: { keyboard: false },
      scale: { mode: Phaser.Scale.NONE, width: size.w * dpr, height: size.h * dpr, zoom: 1 / dpr },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scene: [BootScene, GameScene],
    });
    this.game.events.once('scene-ready', (scene: GameScene) => {
      this.scene = scene;
      scene.setHost(this);
      this.startRound(this.levelId);
    });

    this.ro = new ResizeObserver(() => this.resizeCanvas());
    this.ro.observe(this.layout.worldHost);
    this.cleanups.push(this.layout.onChange(() => this.applyOrientation()));

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));
    const onVis = () => {
      if (document.hidden) this.setAutoPause(true);
    };
    document.addEventListener('visibilitychange', onVis);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
    const onBlur = () => this.setAutoPause(true);
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));
  }

  // ───────────────────────────── раунд ─────────────────────────────

  startRound(levelId: number): void {
    this.closeOverlay();
    this.levelId = levelId;
    const level = levelById(levelId);
    this.seed = nextSeed(this.seed);
    const round = new Round(level, this.seed, this.pace.snapshot());
    this.round = round;
    round.on((events, state, prev) => this.onRoundEvents(events, state, prev));
    this.phase = 'intro';
    this.introLeft = balance.anim.introMs;
    this.userPaused = false;
    this.autoPaused = false;
    this.layout.setWorldNeeds(this.worldNeeds());
    this.scene?.showRound(round, this.makeOrientation(), this.worldOptions());
    this.syncUi();
    this.updateReserve();
  }

  private worldOptions(): WorldOptions {
    const level = levelById(this.levelId);
    return {
      hints: level.hints,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      lowQuality: false,
      filters: true,
      word: (w) => sfxDe[w],
      sound: () => undefined,
      fishToBasket: () => undefined,
    };
  }

  showHints(): boolean {
    return this.phase === 'play';
  }

  private worldNeeds() {
    const level = levelById(this.levelId);
    const m = this.margins();
    return {
      portrait: Orientation.cellsNeeded('portrait', level.rows + 2, level.length, m),
      landscape: Orientation.cellsNeeded('landscape', level.rows + 2, level.length, m),
      minCell: balance.layout.minCellCss,
      inset: 7,
    };
  }

  private margins() {
    return { near: balance.layout.marginNear, far: balance.layout.marginFar, side: balance.layout.marginSide };
  }

  private makeOrientation(): Orientation {
    const level = levelById(this.levelId);
    return new Orientation(this.layout.info().orientation, level.rows + 2, level.length, balance.layout.cellPx, this.margins());
  }

  private applyOrientation(): void {
    if (!this.round || !this.scene) return;
    // Поворот экрана посреди раунда: уровень не перегенерируется (11.1.6).
    this.scene.setOrientation(this.makeOrientation());
    this.updateReserve();
  }

  /** Сколько места вдоль ближнего берега занимает плашка с корзиной (CSS px). */
  private updateReserve(): void {
    if (!this.scene) return;
    const host = this.layout.worldHost.getBoundingClientRect();
    const b = this.basket.el.getBoundingClientRect();
    const portrait = this.layout.info().orientation === 'portrait';
    const reserve = portrait ? host.bottom - b.top : b.right - host.left;
    this.scene.setReserve(Math.max(0, reserve + 4), this.dpr(), balance.layout.minCellCss);
  }

  frame(dtMs: number): void {
    const round = this.round;
    if (!round) return;
    if (this.phase === 'intro') {
      if (!this.isPaused()) this.introLeft -= dtMs;
      if (this.introLeft <= 0) {
        this.phase = 'play';
        this.scene?.startCue();
        this.syncUi();
      }
      return;
    }
    if (this.phase === 'play') round.frame(dtMs);
    this.syncUi();
  }

  private onAnswer(correct: boolean, timeMs: number): void {
    if (!this.round || this.phase !== 'play') return;
    this.pace.record(timeMs, correct);
    this.round.dispatch({ type: 'ANSWER', correct, timeMs });
    if (correct) this.header.pulse();
  }

  private onRoundEvents(events: GameEvent[], state: GameState, _prev: GameState): void {
    for (const e of events) {
      if (e.type === 'ESCAPED' || e.type === 'OUT_OF_WARMTH' || e.type === 'TRAPPED') this.finish(state);
    }
  }

  private finish(state: GameState): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const won = state.status === 'won';
    const fish = caughtFish(state) as 0 | 1 | 2 | 3;
    const stars = (won ? (fish >= 3 ? 3 : fish >= 2 ? 2 : 1) : 0) as 0 | 1 | 2 | 3;
    this.opts.onFinish?.({
      level: this.levelId,
      won,
      fish,
      stars,
      timeMs: state.endTime ?? state.time,
      falls: state.hero.falls,
      cause: state.cause ?? undefined,
    });
    this.syncUi();
    this.showResults(state, won, stars);
  }

  // ───────────────────────────── ввод ─────────────────────────────

  tapCell(a: number, l: number): void {
    if (this.phase === 'intro') {
      this.introLeft = 0;
      return;
    }
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused()) return;
    const s = round.state;
    const cell = index(s.grid, a, l);
    if (cell === s.hero.cell) {
      this.stand();
      return;
    }
    if (s.grid.cells[cell] === 'far' && isSolid(s.grid.cells[cell])) {
      this.toShore();
      return;
    }
    round.dispatch({ type: 'SET_TARGET', cell });
  }

  tapOutside(): void {
    if (this.phase === 'intro') this.introLeft = 0;
  }

  toShore(): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused()) return;
    const t = bestFarBankTarget(round.state);
    if (t === null) round.dispatch({ type: 'SET_TARGET', cell: -1 });
    else round.dispatch({ type: 'SET_TARGET', cell: t });
  }

  stand(): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused()) return;
    round.dispatch({ type: 'CANCEL_TARGET' });
  }

  private arrow(dx: number, dy: number, long: boolean): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused()) return;
    const s = round.state;
    const o = this.makeOrientation();
    const d = o.screenDirToRiver(dx, dy);
    const k = long ? 2 : 1;
    const a = Math.floor(s.hero.cell / s.grid.length) + d.da * k;
    const l = (s.hero.cell % s.grid.length) + d.dl * k;
    if (a < 0 || a >= s.grid.height || l < 0 || l >= s.grid.length) {
      round.dispatch({ type: 'SET_TARGET', cell: -1 });
      return;
    }
    round.dispatch({ type: 'SET_TARGET', cell: index(s.grid, a, l) });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key;
    if (k >= '1' && k <= '4') {
      if (this.panel.pressKey(Number(k))) e.preventDefault();
      return;
    }
    switch (k) {
      case 'ArrowUp':
        this.arrow(0, -1, e.shiftKey);
        break;
      case 'ArrowDown':
        this.arrow(0, 1, e.shiftKey);
        break;
      case 'ArrowLeft':
        this.arrow(-1, 0, e.shiftKey);
        break;
      case 'ArrowRight':
        this.arrow(1, 0, e.shiftKey);
        break;
      case 'h':
      case 'H':
      case 'р':
      case 'Р':
        this.toShore();
        break;
      case ' ':
        if (this.phase === 'intro') this.introLeft = 0;
        else this.stand();
        break;
      case 'p':
      case 'P':
      case 'з':
      case 'З':
      case 'Escape':
        this.togglePause();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // ───────────────────────────── пауза ─────────────────────────────

  private isPaused(): boolean {
    return this.userPaused || this.autoPaused;
  }

  togglePause(): void {
    if (this.phase === 'over') return;
    if (this.isPaused()) {
      this.userPaused = false;
      this.autoPaused = false;
    } else this.userPaused = true;
    this.applyPause();
  }

  private setAutoPause(on: boolean): void {
    if (this.phase === 'over' || !this.round) return;
    this.autoPaused = on;
    this.applyPause();
  }

  private applyPause(): void {
    const round = this.round;
    if (!round) return;
    const paused = this.isPaused();
    if (paused && !round.state.paused) round.dispatch({ type: 'PAUSE' });
    if (!paused && round.state.paused) round.dispatch({ type: 'RESUME' });
    if (paused) this.showPause();
    else this.closeOverlay();
    this.syncUi();
  }

  // ───────────────────────────── интерфейс ─────────────────────────────

  private syncUi(): void {
    const round = this.round;
    if (!round) return;
    const s = round.state;
    const intro = this.phase === 'intro';
    const ready = isReady(s);
    if (this.phase === 'over') this.panel.setMode('off');
    else if (this.isPaused()) this.panel.setMode('paused');
    else if (intro) this.panel.setMode('intro');
    else this.panel.setMode(ready ? 'ready' : 'active');
    this.header.set(s.hero.pips, pipsNeeded(s), ready, s.hero.target !== null, intro);
    this.basket.set(caughtFish(s), s.hero.warmth, balance.rules.warmth);
    this.basket.setEnabled(this.phase === 'play' && !this.isPaused());
  }

  private showPause(): void {
    this.closeOverlay();
    const o = document.createElement('div');
    o.className = 'screen screen-pause';
    o.innerHTML = `<div class="paper-card pause-card"><h2>${ru.paused}</h2><p>${ru.pausedHint}</p><button class="paper-btn" type="button">${ru.resume}</button></div>`;
    o.querySelector('button')?.addEventListener('click', () => this.togglePause());
    this.layout.screens.appendChild(o);
    this.overlay = o;
  }

  private showResults(state: GameState, won: boolean, stars: number): void {
    this.closeOverlay();
    const o = document.createElement('div');
    o.className = 'screen screen-results';
    const title = won ? ru.results.won : ru.results.lost;
    const cause = state.cause === 'cold' ? ru.results.causeCold : state.cause === 'trapped' ? ru.results.causeTrapped : '';
    o.innerHTML = `<div class="paper-card result-card"><h2>${title}</h2>
      <p class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
      <p>${ru.results.time}: ${ru.results.seconds(state.endTime ?? state.time)} · ${ru.results.basket}: ${ru.results.fishCount(caughtFish(state))}</p>
      ${cause ? `<p>${cause}</p>` : ''}
      <div class="row"><button class="paper-btn again" type="button">${ru.results.again}</button>
      ${won && this.levelId < levels.length ? `<button class="paper-btn next" type="button">${ru.results.next}</button>` : ''}</div></div>`;
    o.querySelector('.again')?.addEventListener('click', () => this.startRound(this.levelId));
    o.querySelector('.next')?.addEventListener('click', () => this.startRound(this.levelId + 1));
    this.layout.screens.appendChild(o);
    this.overlay = o;
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  // ───────────────────────────── канва ─────────────────────────────

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, balance.layout.maxDpr);
  }

  private hostSize(): { w: number; h: number } {
    const r = this.layout.worldHost.getBoundingClientRect();
    return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
  }

  private resizeCanvas(): void {
    const s = this.hostSize();
    const d = this.dpr();
    if (Math.abs(this.game.scale.zoom - 1 / d) > 1e-6) this.game.scale.setZoom(1 / d);
    this.game.scale.resize(s.w * d, s.h * d);
    this.updateReserve();
  }

  /** Тестовый и отладочный доступ (только dev или ?test): Playwright играет через него. */
  debugApi() {
    return {
      state: () => this.round?.state ?? null,
      phase: () => this.phase,
      panelMode: () => this.panel.getMode(),
      correctIndex: () => this.panel.debugCorrectIndex(),
      press: (n: number) => this.panel.pressKey(n),
      tapCell: (a: number, l: number) => this.tapCell(a, l),
      toShore: () => this.toShore(),
      skipIntro: () => {
        this.introLeft = 0;
      },
      start: (level: number) => this.startRound(level),
      orientation: () => this.layout.info().orientation,
      cellToClient: (a: number, l: number) => this.scene?.cellToClient(a, l) ?? null,
      view: () => this.scene?.world?.debugInfo() ?? null,
      // Отладка (13.7): только dev-сборка и тесты.
      ageFloe: (k: number) => this.debugMutate((s) => {
        if (s.hero.floeStart !== null) s.hero.floeStart -= s.hero.floeDuration * k;
      }),
      shiftTime: (ms: number) => this.debugMutate((s) => {
        s.time += ms;
        if (s.hero.floeStart !== null) s.hero.floeStart += ms;
        s.wetStart = s.wetStart.map((v) => (v >= 0 ? v + ms : v));
        s.sinkAt = s.sinkAt.map((v) => (v >= 0 ? v + ms : v));
        s.melt = { ...s.melt, nextAt: s.melt.nextAt + ms };
      }),
      freezeMelt: () => this.debugMutate((s) => {
        s.melt = { ...s.melt, nextAt: Infinity };
      }),
      infiniteWarmth: () => this.debugMutate((s) => {
        s.hero = { ...s.hero, warmth: 999 };
      }),
      wetCell: (cell: number, ms: number) => this.debugMutate((s) => {
        s.wetStart = s.wetStart.map((v, i) => (i === cell ? s.time : v));
        s.sinkAt = s.sinkAt.map((v, i) => (i === cell ? s.time + ms : v));
      }, [{ type: 'MELT_WARN', cell, sinkAt: 0 }]),
    };
  }

  /** Изменить состояние в обход редуктора — только для отладочной панели. */
  private debugMutate(fn: (s: GameState) => void, events: GameEvent[] = []): void {
    const round = this.round;
    if (!round) return;
    const s = { ...round.state, hero: { ...round.state.hero } };
    fn(s);
    const prev = round.state;
    round.state = s;
    const fixed = events.map((e) => (e.type === 'MELT_WARN' ? { ...e, sinkAt: s.sinkAt[e.cell] } : e));
    if (fixed.length) this.scene?.world?.onEvents(fixed, s);
    void prev;
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.ro.disconnect();
    this.panel.destroy();
    this.basket.destroy();
    this.game.destroy(true);
    this.layout.destroy();
  }
}
