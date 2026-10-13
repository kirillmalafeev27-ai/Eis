import Phaser from 'phaser';
import { type SfxName, presets } from '../audio/presets';
import { balance } from '../config/balance';
import { type HintMode, levelById, levels } from '../config/levels';
import { palette } from '../config/palette';
import type { GameEvent } from '../core/events';
import { index } from '../core/grid';
import { generateLevel, nextSeed } from '../core/levelGen';
import { bestFarBankTarget, isReady, meltStrengthOf, pipsNeeded } from '../core/rules';
import { type GameState, caughtFish, createState, median, starsFor } from '../core/state';
import { ru } from '../i18n/ru';
import { type SfxWord, sfxDe, sfxRu } from '../i18n/sfx.de';
import { Orientation } from '../render/orientation';
import type { SoundName, WorldOptions } from '../render/WorldView';
import { BootScene } from '../scenes/BootScene';
import { GameScene, type SceneHost } from '../scenes/GameScene';
import { Mixer } from '../shared/audio/mixer';
import { type Layout, createLayout } from '../shared/layout';
import { PaceTracker } from '../shared/pace';
import { QuestionPanel } from '../shared/QuestionPanel';
import type { QuestionProvider } from '../shared/questions/types';
import { type KeyValueStorage, localStorageWithPrefix } from '../shared/storage';
import { paperTheme } from '../shared/themes/paper';
import { BasketWidget } from '../ui/BasketWidget';
import { DebugPanel } from '../ui/DebugPanel';
import { setGradeOverride } from '../render/SunAndGrade';
import { flyFish } from '../ui/FishFlight';
import { JumpHeader } from '../ui/JumpHeader';
import { IntroCaption } from '../ui/screens/IntroCaption';
import { LevelsScreen } from '../ui/screens/LevelsScreen';
import { LoadingScreen } from '../ui/screens/LoadingScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { PauseScreen } from '../ui/screens/PauseScreen';
import { type ResultsData, ResultsScreen } from '../ui/screens/ResultsScreen';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { TutorialBubble } from '../ui/screens/TutorialBubble';
import {
  type Progress,
  type Settings,
  effectiveHints,
  isBetter,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from './persist';
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

/** Типичный размер плашки с корзиной (CSS px): высота в портрете, ширина в ландшафте. */
const HUD_FALLBACK = { h: 62, w: 150 };
type Phase = 'boot' | 'menu' | 'levels' | 'intro' | 'play' | 'finale' | 'results' | 'contrast';
type TutorialKey = 'start' | 'thin' | 'wet' | 'fall';

const SOUND_MAP: Record<SoundName, SfxName[]> = {
  hop: ['hop'],
  hui: ['hui'],
  landThin: ['landThin'],
  landThick: ['landThick'],
  crack1: ['crack1'],
  crack2: ['crack2'],
  crack3: ['crack3'],
  split: ['split'],
  tick: ['tick'],
  sinkSmall: ['sinkSmall'],
  drip: ['drip'],
  blubb: ['blubb'],
  catch: ['catchSlap', 'catchChime'],
  fishLost: ['fishLost'],
  flop: ['flop'],
  denied: ['denied'],
  trapped: ['trapped'],
  krach: ['krach'],
  splash: ['splash'],
  shiver: ['shiver'],
  cold: ['cold'],
  win: ['win1', 'win2', 'win3', 'win4'],
  rumble: ['rumble'],
  start: ['start'],
};

/**
 * Приложение «Льдин»: раскладка, канва, панель вопроса, экраны, звук, сохранение
 * и раунды. Логика — в ядре, картинка — в сцене; здесь только связи между ними.
 */
export class App implements SceneHost {
  readonly layout: Layout;
  readonly storage: KeyValueStorage;
  readonly pace: PaceTracker;
  private readonly game: Phaser.Game;
  private scene: GameScene | null = null;
  private readonly panel: QuestionPanel;
  private readonly header: JumpHeader;
  private readonly basket: BasketWidget;
  private readonly mixer: Mixer;
  private settings: Settings;
  private progress: Progress;
  private round: Round | null = null;
  private phase: Phase = 'boot';
  private introLeft = 0;
  private finaleLeft = 0;
  private userPaused = false;
  private autoPaused = false;
  private tutorialOpen = false;
  private levelId: number;
  private seed = (Date.now() & 0x7fffffff) >>> 0;
  private shownFish = 0;
  private snapshot: HTMLImageElement | null = null;
  private lastResult: ResultsData | null = null;
  private readonly test: boolean;
  private readonly params: URLSearchParams;
  // экраны
  private loading: LoadingScreen | null = null;
  private menu: MenuScreen | null = null;
  private levelsScreen: LevelsScreen | null = null;
  private pauseScreen: PauseScreen | null = null;
  private resultsScreen: ResultsScreen | null = null;
  private settingsScreen: SettingsScreen | null = null;
  private tutorial: TutorialBubble | null = null;
  private introCaption: IntroCaption | null = null;
  private debug: DebugPanel | null = null;
  // качество
  private fpsLow = 0;
  private fpsTimer = 0;
  private readonly ro: ResizeObserver;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    container: HTMLElement,
    private readonly opts: IceOptions,
  ) {
    this.params = new URLSearchParams(location.search);
    this.test = this.params.has('test');
    this.storage = opts.storage ?? localStorageWithPrefix('ice:');
    this.pace = new PaceTracker(this.storage, balance.pace);
    this.settings = loadSettings(this.storage);
    this.progress = loadProgress(this.storage);
    this.levelId = opts.level ?? 1;
    this.mixer = new Mixer({
      sfx: this.settings.sfx,
      ambient: this.settings.ambient,
      muted: this.settings.muted,
    });
    this.layout = createLayout(container, paperTheme, { ...balance.layout, questionFloor: 240 });
    this.layout.root.dataset.phase = 'boot';

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
    this.panel.onSound = (name) =>
      this.sfx(name === 'correct' ? ['correct', 'click'] : name === 'wrong' ? ['wrong'] : ['flip']);
    this.panel.setReducedMotion(this.reducedMotion());
    this.layout.root.classList.toggle('is-calm', this.reducedMotion());
    this.header = new JumpHeader(this.panel.header);
    this.basket = new BasketWidget(
      this.layout.worldOverlay,
      balance.rules.warmth,
      () => this.toShore(),
      () => this.stand(),
    );

    this.loading = new LoadingScreen(this.layout.screens);
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
      callbacks: {
        preBoot: (game) => game.registry.set('quality', this.settings.quality),
      },
    });
    this.game.events.on('boot-progress', (k: number) => this.loading?.progress(k));
    this.game.events.once('scene-ready', (scene: GameScene) => {
      this.scene = scene;
      scene.setHost(this);
      this.loading?.destroy();
      this.loading = null;
      this.afterBoot();
    });

    this.ro = new ResizeObserver(() => this.resizeCanvas());
    this.ro.observe(this.layout.worldHost);
    this.cleanups.push(this.layout.onChange(() => this.applyOrientation()));

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));
    const onVis = () => {
      if (document.hidden) this.setAutoPause();
    };
    document.addEventListener('visibilitychange', onVis);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
    const onBlur = () => this.setAutoPause();
    window.addEventListener('blur', onBlur);
    this.cleanups.push(() => window.removeEventListener('blur', onBlur));
    // AudioContext — по первому жесту (10.6); до этого тишина без ошибок.
    const unlock = () => this.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    this.cleanups.push(() => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    });
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMedia = () => this.applySettings();
    media?.addEventListener?.('change', onMedia);
    this.cleanups.push(() => media?.removeEventListener?.('change', onMedia));
  }

  private afterBoot(): void {
    if (this.params.get('scene') === 'contrast' && (import.meta.env.DEV || this.test)) {
      this.showContrast(Number(this.params.get('strength') ?? 0.5));
      return;
    }
    if (this.opts.level !== undefined || (this.test && this.params.has('level')))
      this.startRound(this.levelId);
    else this.showMenu();
  }

  // ───────────────────────────── меню и уровни ─────────────────────────────

  private setPhase(p: Phase): void {
    this.phase = p;
    this.layout.root.dataset.phase = p;
  }

  private showMenu(): void {
    this.closeScreens();
    this.round = null;
    this.setPhase('menu');
    this.panel.setMode('off');
    this.showAttract();
    this.menu = new MenuScreen(
      this.layout.worldOverlay,
      this.layout.questionCard,
      () => {
        this.unlockAudio();
        this.showLevels();
      },
      () => this.openSettings(),
    );
  }

  private showLevels(): void {
    this.closeScreens();
    this.round = null;
    this.setPhase('levels');
    this.panel.setMode('off');
    if (!this.scene?.world?.attract) this.showAttract();
    this.levelsScreen = new LevelsScreen(
      this.layout.questionCard,
      this.progress,
      (id) => {
        this.unlockAudio();
        this.startRound(id);
      },
      () => this.showMenu(),
    );
  }

  /** Заставка: живая река в золотой час, герой с корзиной на льдине (11.5.1). */
  private showAttract(): void {
    if (!this.scene) return;
    const level = levelById(3);
    const gen = generateLevel(level, 0xa77ac7, balance.pace.defaultTmedMs);
    const s = createState(
      level,
      gen,
      { tMedMs: balance.pace.defaultTmedMs, p: balance.pace.defaultP },
      0xa77ac7,
    );
    // Герой стоит на толстой льдине посреди реки, в корзине две рыбы.
    const mid = Math.floor(level.rows / 2) + 1;
    let cell = s.hero.cell;
    for (let l = 0; l < level.length; l++) {
      const c = index(s.grid, mid, (Math.floor(level.length / 2) + l) % level.length);
      if (s.grid.cells[c] === 'thick' && !s.fish.some((f) => f.cell === c)) {
        cell = c;
        break;
      }
    }
    const state: GameState = {
      ...s,
      hero: { ...s.hero, cell },
      fish: s.fish.map((f, i) => ({ ...f, status: i < 2 ? 'caught' : 'waiting' })),
    };
    this.levelId = 3;
    this.layout.setWorldNeeds(this.worldNeeds());
    this.scene.showAttract(state, this.makeOrientation(), this.worldOptions(level.hints));
    this.scene.world?.hero.setTails(2);
    this.updateReserve();
  }

  // ───────────────────────────── раунд ─────────────────────────────

  startRound(levelId: number): void {
    this.closeScreens();
    this.levelId = Math.max(1, Math.min(levels.length, levelId));
    const level = levelById(this.levelId);
    this.seed = nextSeed(this.seed);
    const round = new Round(level, this.seed, this.pace.snapshot());
    if (round.gen.relax > 0 && import.meta.env.DEV) console.warn(...round.gen.warnings);
    this.round = round;
    round.on((events, state) => this.onRoundEvents(events, state));
    this.setPhase('intro');
    this.introLeft = balance.anim.introMs;
    this.userPaused = false;
    this.autoPaused = false;
    this.shownFish = 0;
    this.snapshot = null;
    this.layout.setWorldNeeds(this.worldNeeds(true));
    this.scene?.showRound(round, this.makeOrientation(), this.worldOptions(level.hints));
    this.updateReserve();
    // Интро (11.5.3): камера проходит от берега к берегу, подпись, всё стоит.
    if (!this.reducedMotion()) this.scene?.playIntro(balance.anim.introMs);
    this.introCaption = new IntroCaption(this.layout.worldOverlay, () => this.skipIntro());
    this.mixer.ambientStart();
    this.syncUi();
  }

  private skipIntro(): void {
    if (this.phase === 'intro') this.introLeft = 0;
  }

  private worldOptions(levelHints: HintMode): WorldOptions {
    const low = this.settings.quality === 'low';
    return {
      hints: effectiveHints(levelHints, this.settings.hints),
      reducedMotion: this.reducedMotion(),
      lowQuality: low,
      filters: !low && !this.params.has('nofilters'),
      word: (w) => this.word(w),
      sound: (name, x) => this.worldSound(name, x),
      fishToBasket: (i, x, y) => this.fishToBasket(i, x, y),
    };
  }

  private word(w: SfxWord): string {
    const text = this.settings.sfxLang === 'ru' ? sfxRu[w] : sfxDe[w];
    this.log('word', text);
    return text;
  }

  /** Журнал звуков и слов для сквозных тестов (только ?test): у события есть отклик. */
  private readonly feedback: string[] = [];

  private log(kind: 'sound' | 'word', name: string): void {
    if (!this.test) return;
    this.feedback.push(`${kind}:${name}`);
    if (this.feedback.length > 200) this.feedback.shift();
  }

  showHints(): boolean {
    return this.phase === 'play' && !this.tutorialOpen;
  }

  /**
   * Сколько клеток нужно миру при минимальной клетке (11.1.5). В раунде плашка с корзиной
   * лежит над ближним берегом (11.3), поэтому поле ближнего берега — не меньше плашки:
   * иначе на маленьком экране она легла бы на лёд.
   */
  private worldNeeds(withHud = false) {
    const level = levelById(this.levelId);
    const m = this.margins();
    const min = balance.layout.minCellCss;
    const current = this.layout.info().orientation;
    const hudNear = (orient: 'portrait' | 'landscape') => {
      if (!withHud) return m.near;
      // Плашка сейчас сложена под текущую ориентацию; для другой — типичный размер.
      const r = orient === current ? this.basket.el.getBoundingClientRect() : null;
      const size = orient === 'portrait' ? r?.height || HUD_FALLBACK.h : r?.width || HUD_FALLBACK.w;
      return Math.max(m.near, (size + 8) / min);
    };
    return {
      portrait: Orientation.cellsNeeded('portrait', level.rows + 2, level.length, {
        ...m,
        near: hudNear('portrait'),
      }),
      landscape: Orientation.cellsNeeded('landscape', level.rows + 2, level.length, {
        ...m,
        near: hudNear('landscape'),
      }),
      minCell: min,
      inset: 7,
    };
  }

  private margins() {
    return {
      near: balance.layout.marginNear,
      far: balance.layout.marginFar,
      side: balance.layout.marginSide,
    };
  }

  private makeOrientation(): Orientation {
    const level = levelById(this.levelId);
    return new Orientation(
      this.layout.info().orientation,
      level.rows + 2,
      level.length,
      balance.layout.cellPx,
      this.margins(),
    );
  }

  private applyOrientation(): void {
    if (!this.scene) return;
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
    const visible = this.phase !== 'menu' && this.phase !== 'levels' && b.width > 0;
    const reserve = !visible ? 0 : portrait ? host.bottom - b.top : b.right - host.left;
    this.scene.setReserve(Math.max(0, reserve + (visible ? 4 : 0)), this.dpr(), balance.layout.minCellCss);
  }

  frame(dtMs: number): void {
    this.watchFps(dtMs);
    this.debug?.update(this.round?.state ?? null, this.game.loop.actualFps);
    const round = this.round;
    if (!round) return;
    if (this.phase === 'intro') {
      if (!this.isPaused()) this.introLeft -= dtMs;
      if (this.introLeft <= 0) this.beginPlay();
      return;
    }
    if (this.phase === 'play' && !this.tutorialOpen) round.frame(dtMs);
    if (this.phase === 'finale') {
      this.finaleLeft -= dtMs;
      if (this.finaleLeft <= 0) this.showResults();
    }
    if (this.phase === 'play') {
      const s = round.state;
      this.mixer.ambientLevel(meltStrengthOf(s));
      this.mixer.duck(s.hero.floeStart !== null && s.hero.crackStage >= 3, balance.audio.duckOnCrack);
    }
    this.syncUi();
  }

  private beginPlay(): void {
    this.introCaption?.destroy();
    this.introCaption = null;
    this.scene?.endIntro();
    this.setPhase('play');
    this.scene?.startCue();
    this.syncUi();
    this.maybeTutorial('start');
  }

  private onAnswer(correct: boolean, timeMs: number): void {
    if (!this.round || this.phase !== 'play') return;
    this.pace.record(timeMs, correct);
    this.round.dispatch({ type: 'ANSWER', correct, timeMs });
    if (correct) this.header.pulse();
  }

  private onRoundEvents(events: GameEvent[], state: GameState): void {
    for (const e of events) {
      switch (e.type) {
        case 'LANDED':
          if (e.kind === 'thin' || e.kind === 'debris') this.maybeTutorial('thin');
          break;
        case 'MELT_WARN':
          this.maybeTutorial('wet');
          break;
        case 'FELL':
          if (e.warmthLeft > 0) this.maybeTutorial('fall');
          break;
        case 'ESCAPED':
        case 'OUT_OF_WARMTH':
        case 'TRAPPED':
          this.finish(state, e.type === 'ESCAPED' ? e.floeLeftMs : Infinity);
          break;
        default:
          break;
      }
    }
  }

  /** Конец раунда: финальная анимация ≤ 2 с, пропускается тапом (2.6.5). */
  private finish(state: GameState, floeLeftMs: number): void {
    if (this.phase === 'finale' || this.phase === 'results') return;
    this.setPhase('finale');
    this.finaleLeft = balance.anim.finaleMaxMs;
    this.mixer.duck(false);
    const won = state.status === 'won';
    const fish = caughtFish(state) as 0 | 1 | 2 | 3;
    const stars = starsFor(won, fish);
    const timeMs = state.endTime ?? state.time;
    const key = String(this.levelId);
    const prev = this.progress.levels[key];
    const better = isBetter(prev, stars, timeMs, won);
    if (better) this.progress.levels[key] = { stars, bestTimeMs: timeMs, won: true };
    else if (!prev) this.progress.levels[key] = { stars: 0, bestTimeMs: null, won: false };
    if (won)
      this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(levels.length, this.levelId + 1));
    saveProgress(this.storage, this.progress);
    const rec = this.progress.levels[key];
    this.lastResult = {
      won,
      knapp: won && floeLeftMs < balance.rules.knappMs,
      stars,
      fish,
      timeMs,
      jumps: state.stats.jumps,
      longJumps: state.stats.longJumps,
      falls: state.hero.falls,
      correct: state.stats.correct,
      wrong: state.stats.wrong,
      medianMs: median(state.stats.times),
      recordMs: rec?.won ? rec.bestTimeMs : null,
      recordStars: rec?.stars ?? 0,
      newRecord: better && !!prev?.won,
      cause: state.cause,
      levelLabel: levelById(this.levelId).label,
      hasNext: this.levelId < levels.length && this.progress.unlocked > this.levelId,
    };
    this.opts.onFinish?.({
      level: this.levelId,
      won,
      fish,
      stars,
      timeMs,
      falls: state.hero.falls,
      cause: state.cause ?? undefined,
    });
    // Снимок кадра — на долю секунды позже, когда герой уже в позе финала.
    window.setTimeout(() => this.scene?.snapshot((img) => (this.snapshot = img)), 380);
    this.syncUi();
  }

  private showResults(): void {
    if (this.phase === 'results' || !this.lastResult) return;
    this.setPhase('results');
    this.syncUi();
    const d = this.lastResult;
    this.resultsScreen = new ResultsScreen(
      this.layout.screens,
      d,
      this.snapshot,
      {
        again: () => this.startRound(this.levelId),
        next: () => this.startRound(this.levelId + 1),
        levels: () => this.showLevels(),
        count: (i) => this.mixer.play('count', presets.count, { jitter: 0, rate: 1 + i * 0.18 }),
      },
      this.reducedMotion(),
    );
  }

  // ───────────────────────────── обучение ─────────────────────────────

  private maybeTutorial(key: TutorialKey): void {
    if (this.progress.tutorial[key] || this.tutorialOpen || this.phase !== 'play') return;
    if (this.test && !this.params.has('tutorial')) return;
    const round = this.round;
    const world = this.scene?.world;
    if (!round || !world || !this.scene) return;
    this.progress.tutorial[key] = true;
    saveProgress(this.storage, this.progress);
    this.tutorialOpen = true;
    // Пока подсказка на экране, игра стоит (11.5.7).
    if (!round.state.paused) round.dispatch({ type: 'PAUSE' });
    const at = this.scene.worldToClient(world.hero.x, world.hero.y - 110);
    this.tutorial = new TutorialBubble(this.layout.screens, ru.tutorial[key], at, () => this.closeTutorial());
    this.syncUi();
  }

  private closeTutorial(): void {
    this.tutorial?.destroy();
    this.tutorial = null;
    this.tutorialOpen = false;
    if (this.round && this.round.state.paused && !this.isPaused()) this.round.dispatch({ type: 'RESUME' });
    this.syncUi();
  }

  // ───────────────────────────── ввод ─────────────────────────────

  tapCell(a: number, l: number): void {
    if (this.phase === 'intro') return this.skipIntro();
    if (this.phase === 'finale') return this.showResults();
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused() || this.tutorialOpen) return;
    const s = round.state;
    const cell = index(s.grid, a, l);
    if (cell === s.hero.cell) return this.stand();
    // Тап по дальнему берегу — то же, что «К берегу» (11.4).
    if (s.grid.cells[cell] === 'far') return this.toShore();
    round.dispatch({ type: 'SET_TARGET', cell });
  }

  tapOutside(): void {
    if (this.phase === 'intro') this.skipIntro();
    else if (this.phase === 'finale') this.showResults();
  }

  toShore(): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused() || this.tutorialOpen) return;
    const t = bestFarBankTarget(round.state);
    round.dispatch({ type: 'SET_TARGET', cell: t ?? -1 });
  }

  stand(): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused() || this.tutorialOpen) return;
    round.dispatch({ type: 'CANCEL_TARGET' });
  }

  private arrow(dx: number, dy: number, long: boolean): void {
    const round = this.round;
    if (!round || this.phase !== 'play' || this.isPaused() || this.tutorialOpen) return;
    const s = round.state;
    const d = this.makeOrientation().screenDirToRiver(dx, dy);
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
    if (k === '`' && (import.meta.env.DEV || this.test)) {
      this.toggleDebug();
      e.preventDefault();
      return;
    }
    // Модальные экраны сами обрабатывают Tab/Enter; Esc закрывает настройки.
    if (this.settingsScreen) {
      if (k === 'Escape') this.closeSettings();
      return;
    }
    if (this.tutorialOpen) {
      if (k === 'Escape' || k === 'Enter' || k === ' ') {
        this.closeTutorial();
        e.preventDefault();
      }
      return;
    }
    if (k >= '1' && k <= '4' && this.phase === 'play' && !this.isPaused()) {
      if (this.panel.pressKey(Number(k))) e.preventDefault();
      return;
    }
    if (this.phase === 'intro' && (k === ' ' || k === 'Enter')) {
      this.skipIntro();
      e.preventDefault();
      return;
    }
    if (this.phase === 'finale' && (k === ' ' || k === 'Enter')) {
      this.showResults();
      e.preventDefault();
      return;
    }
    if (this.phase !== 'play') return;
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
        if (!(e.target instanceof HTMLButtonElement)) this.stand();
        else return;
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
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    if (this.isPaused()) {
      this.userPaused = false;
      this.autoPaused = false;
    } else this.userPaused = true;
    this.applyPause();
  }

  /** Пауза при скрытии вкладки и потере фокуса окна (2.7.1). */
  private setAutoPause(): void {
    if ((this.phase !== 'play' && this.phase !== 'intro') || !this.round || this.isPaused()) return;
    this.autoPaused = true;
    this.applyPause();
  }

  private applyPause(): void {
    const round = this.round;
    if (!round) return;
    const paused = this.isPaused();
    if (paused && !round.state.paused) round.dispatch({ type: 'PAUSE' });
    if (!paused && round.state.paused && !this.tutorialOpen) round.dispatch({ type: 'RESUME' });
    this.pauseScreen?.destroy();
    this.pauseScreen = null;
    if (paused) {
      this.mixer.suspend();
      this.pauseScreen = new PauseScreen(
        this.layout.screens,
        () => this.togglePause(),
        () => this.openSettings(),
        () => {
          this.userPaused = false;
          this.autoPaused = false;
          this.pauseScreen?.destroy();
          this.pauseScreen = null;
          this.mixer.resume();
          this.mixer.ambientStop();
          this.showMenu();
        },
      );
    } else this.mixer.resume();
    this.syncUi();
  }

  // ───────────────────────────── настройки ─────────────────────────────

  private openSettings(): void {
    this.settingsScreen?.destroy();
    const level = this.round ? levelById(this.levelId).hints : null;
    this.settingsScreen = new SettingsScreen(
      this.layout.screens,
      this.settings,
      this.systemReduced(),
      level,
      (s) => {
        this.settings = s;
        saveSettings(this.storage, s);
        this.applySettings();
      },
      () => this.closeSettings(),
    );
  }

  private closeSettings(): void {
    this.settingsScreen?.destroy();
    this.settingsScreen = null;
    const first = this.layout.screens.querySelector<HTMLElement>('.screen button');
    first?.focus({ preventScroll: true });
  }

  private applySettings(): void {
    this.mixer.setVolumes({
      sfx: this.settings.sfx,
      ambient: this.settings.ambient,
      muted: this.settings.muted,
    });
    this.panel.setReducedMotion(this.reducedMotion());
    this.layout.root.classList.toggle('is-calm', this.reducedMotion());
    const level = levelById(this.levelId);
    this.scene?.setWorldOptions({
      hints: effectiveHints(level.hints, this.settings.hints),
      reducedMotion: this.reducedMotion(),
      filters: this.settings.quality !== 'low' && !this.params.has('nofilters'),
      lowQuality: this.settings.quality === 'low',
    });
  }

  private systemReduced(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  /** «Меньше движения»: само по prefers-reduced-motion или вручную (11.6.1). */
  private reducedMotion(): boolean {
    return this.settings.reducedMotion ?? this.systemReduced();
  }

  /** Автопереключение качества: средний FPS три секунды ниже 45 — один раз за сессию (13.6.4). */
  private watchFps(dtMs: number): void {
    if (this.settings.quality === 'low' || this.phase !== 'play' || this.test) return;
    this.fpsTimer += dtMs;
    if (this.fpsTimer < 1000) return;
    this.fpsTimer = 0;
    const fps = this.game.loop.actualFps;
    this.fpsLow = fps < balance.quality.lowFpsThreshold ? this.fpsLow + 1 : 0;
    if (this.fpsLow >= balance.quality.lowFpsSeconds) {
      this.settings = { ...this.settings, quality: 'low', qualityAuto: true };
      saveSettings(this.storage, this.settings);
      this.applySettings();
    }
  }

  // ───────────────────────────── звук ─────────────────────────────

  private unlockAudio(): void {
    this.mixer.unlock();
    if (this.round) this.mixer.ambientStart();
  }

  private sfx(names: SfxName[], pan = 0): void {
    for (const n of names) this.log('sound', n);
    names.forEach((n, i) =>
      this.mixer.play(n, presets[n], {
        pan,
        delay: n.startsWith('win') ? i * 0.11 : n === 'catchChime' ? 0.06 : 0,
      }),
    );
  }

  private worldSound(name: SoundName, worldX: number): void {
    const w = this.scene?.world;
    const cam = this.scene?.cameras.main;
    let pan = 0;
    if (w && cam) pan = ((worldX - cam.worldView.centerX) / Math.max(1, cam.worldView.width)) * 1.6;
    this.sfx(SOUND_MAP[name], pan);
  }

  /** Пойманная рыба прилетает в ячейку корзины по дуге (11.3). */
  private fishToBasket(i: number, worldX: number, worldY: number): void {
    const scene = this.scene;
    const round = this.round;
    if (!scene || !round) return;
    const from = scene.worldToClient(worldX, worldY);
    const slot = Math.min(2, caughtFish(round.state) - 1);
    const rect = this.basket.slotRect(Math.max(0, slot));
    void i;
    if (!rect || this.reducedMotion()) {
      this.shownFish = caughtFish(round.state);
      return;
    }
    flyFish(
      this.layout.screens,
      from,
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      balance.anim.fishFlyMs,
      () => {
        this.shownFish = Math.max(this.shownFish, slot + 1);
      },
    );
  }

  // ───────────────────────────── интерфейс ─────────────────────────────

  private syncUi(): void {
    const round = this.round;
    const playing =
      this.phase === 'play' || this.phase === 'intro' || this.phase === 'finale' || this.phase === 'results';
    if (!round || !playing) {
      this.panel.setMode('off');
      return;
    }
    const s = round.state;
    const intro = this.phase === 'intro';
    const ready = isReady(s);
    if (this.phase === 'finale' || this.phase === 'results') this.panel.setMode('off');
    else if (this.isPaused() || this.tutorialOpen) this.panel.setMode('paused');
    else if (intro) this.panel.setMode('intro');
    else this.panel.setMode(ready ? 'ready' : 'active');
    this.header.set(s.hero.pips, pipsNeeded(s), ready, s.hero.target !== null, intro);
    const caught = caughtFish(s);
    if (this.shownFish > caught) this.shownFish = caught;
    this.basket.set(
      this.reducedMotion() ? caught : Math.min(caught, this.shownFish),
      s.hero.warmth,
      balance.rules.warmth,
    );
    this.basket.setEnabled(this.phase === 'play' && !this.isPaused() && !this.tutorialOpen);
    this.basket.el.classList.toggle('is-ghost', this.basketOverHero());
  }

  /** На маленьких экранах плашка может лечь на берег с героем — тогда она бледнеет. */
  private basketOverHero(): boolean {
    const w = this.scene?.world;
    if (!w || !this.scene) return false;
    const p = this.scene.worldToClient(w.hero.x, w.hero.y - 40);
    const r = this.basket.el.getBoundingClientRect();
    return p.x > r.left - 10 && p.x < r.right + 10 && p.y > r.top - 30 && p.y < r.bottom + 10;
  }

  private closeScreens(): void {
    for (const s of [
      this.menu,
      this.levelsScreen,
      this.pauseScreen,
      this.resultsScreen,
      this.introCaption,
      this.tutorial,
    ])
      s?.destroy();
    this.menu =
      this.levelsScreen =
      this.pauseScreen =
      this.resultsScreen =
      this.introCaption =
      this.tutorial =
        null;
    this.tutorialOpen = false;
  }

  // ───────────────────────────── тест контраста ─────────────────────────────

  /** Тестовая сцена контраста (8.4): вода, тонкая и толстая льдина, рыба при заданной силе. */
  private showContrast(strength: number): void {
    if (!this.scene) return;
    this.setPhase('contrast');
    this.panel.setMode('off');
    const level = levelById(1);
    const gen = generateLevel(level, 99, balance.pace.defaultTmedMs);
    const cells = gen.grid.cells.map((k, i) => {
      const a = Math.floor(i / gen.grid.length);
      if (a === 0 || a === gen.grid.height - 1) return k;
      const l = i % gen.grid.length;
      return (l % 3 === 0 ? 'water' : l % 3 === 1 ? 'thin' : 'thick') as typeof k;
    });
    const grid = { ...gen.grid, cells };
    // Рыба — на тонкой льдине ближе к центру кадра, где виньетка почти не темнит.
    const midA = Math.floor((grid.height - 1) / 2);
    let fishL = 1;
    for (let l = 1; l < grid.length; l += 3)
      if (Math.abs(l - (grid.length - 1) / 2) < Math.abs(fishL - (grid.length - 1) / 2)) fishL = l;
    const fishCell = index(grid, midA, fishL);
    const s = createState(
      level,
      { grid, bridge: gen.bridge, fish: [fishCell] },
      { tMedMs: 5000, p: 0.8 },
      99,
    );
    this.levelId = 1;
    this.layout.setWorldNeeds(this.worldNeeds());
    this.scene.showAttract(s, this.makeOrientation(), { ...this.worldOptions('none'), reducedMotion: true });
    const w = this.scene.world;
    if (w) {
      w.forcedStrength = strength;
      w.still = true;
    }
    this.updateReserve();
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

  private toggleDebug(): void {
    if (this.debug) {
      this.debug.destroy();
      this.debug = null;
      return;
    }
    const api = this.debugApi();
    this.debug = new DebugPanel(this.layout.screens, {
      freezeMelt: api.freezeMelt,
      infiniteWarmth: api.infiniteWarmth,
      ageFloe: () => api.ageFloe(0.5),
      strengthMax: () => {
        const s = this.round?.state;
        if (!s) return;
        const target = (balance.rules.meltStartAnswers + balance.rules.meltRampAnswers) * s.pace.tMedMs;
        if (target > s.time) api.shiftTime(target - s.time);
      },
      contrast: () => {
        location.search = '?scene=contrast&strength=0.5&test';
      },
    });
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
      skipIntro: () => this.skipIntro(),
      start: (level: number) => this.startRound(level),
      menu: () => this.showMenu(),
      levels: () => this.showLevels(),
      orientation: () => this.layout.info().orientation,
      cellToClient: (a: number, l: number) => this.scene?.cellToClient(a, l) ?? null,
      worldToClient: (x: number, y: number) => this.scene?.worldToClient(x, y) ?? null,
      view: () => this.scene?.world?.debugInfo() ?? null,
      genMs: () => this.scene?.artFactory?.generationMs ?? 0,
      genSteps: () => this.scene?.artFactory?.stepMs ?? [],
      genUploadMs: () => this.scene?.artFactory?.uploadMs ?? 0,
      atlasPages: () =>
        this.scene?.artFactory
          ? Object.keys(this.scene.game.textures.list).filter((k) => k.startsWith('art-atlas')).length
          : 0,
      game: () => this.game,
      sample: (pts: { x: number; y: number }[], r: number) =>
        this.scene?.sampleLuminance(pts, r) ?? Promise.resolve([]),
      contrastPoints: () => this.scene?.world?.contrastPoints() ?? null,
      grade: (m: number[] | null) => setGradeOverride(m),
      feedback: () => this.feedback.slice(),
      // Отладка (13.7): только dev-сборка и тесты.
      ageFloe: (k: number) =>
        this.debugMutate((s) => {
          if (s.hero.floeStart !== null) s.hero.floeStart -= s.hero.floeDuration * k;
        }),
      shiftTime: (ms: number) =>
        this.debugMutate((s) => {
          s.time += ms;
          if (s.hero.floeStart !== null) s.hero.floeStart += ms;
          s.wetStart = s.wetStart.map((v) => (v >= 0 ? v + ms : v));
          s.sinkAt = s.sinkAt.map((v) => (v >= 0 ? v + ms : v));
          s.melt = { ...s.melt, nextAt: s.melt.nextAt + ms };
        }),
      freezeMelt: () =>
        this.debugMutate((s) => {
          s.melt = { ...s.melt, nextAt: Infinity };
        }),
      infiniteWarmth: () =>
        this.debugMutate((s) => {
          s.hero = { ...s.hero, warmth: 999 };
        }),
      wetCell: (cell: number, ms: number) =>
        this.debugMutate(
          (s) => {
            s.wetStart = s.wetStart.map((v, i) => (i === cell ? s.time : v));
            s.sinkAt = s.sinkAt.map((v, i) => (i === cell ? s.time + ms : v));
          },
          [{ type: 'MELT_WARN', cell, sinkAt: 0 }],
        ),
    };
  }

  /** Изменить состояние в обход редуктора — только для отладочной панели. */
  private debugMutate(fn: (s: GameState) => void, events: GameEvent[] = []): void {
    const round = this.round;
    if (!round) return;
    const s = { ...round.state, hero: { ...round.state.hero } };
    fn(s);
    round.state = s;
    const fixed = events.map((e) => (e.type === 'MELT_WARN' ? { ...e, sinkAt: s.sinkAt[e.cell] } : e));
    if (fixed.length) this.scene?.world?.onEvents(fixed, s);
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.closeScreens();
    this.settingsScreen?.destroy();
    this.debug?.destroy();
    this.loading?.destroy();
    this.ro.disconnect();
    this.panel.destroy();
    this.basket.destroy();
    this.mixer.destroy();
    this.game.destroy(true);
    this.layout.destroy();
  }
}
