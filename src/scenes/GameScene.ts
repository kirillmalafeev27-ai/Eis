import Phaser from 'phaser';
import type { ArtFactory } from '../art/ArtFactory';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import type { Round } from '../game/Round';
import type { Orientation } from '../render/orientation';
import { type WorldOptions, WorldView } from '../render/WorldView';

/** Хозяин сцены — приложение: ведёт время раунда и получает касания мира. */
export interface SceneHost {
  frame(dtMs: number): void;
  tapCell(a: number, l: number): void;
  tapOutside(): void;
  showHints(): boolean;
}

/**
 * Сцена мира. Только читает состояние и реагирует на события (0.3); время раунда
 * двигает хозяин из update(), ввод уходит хозяину. Слой 6 рисует вторая камера
 * с теми же прокруткой и зумом, но без цветовой обработки (7.6).
 */
export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  private art!: ArtFactory;
  private view: WorldView | null = null;
  private round: Round | null = null;
  private attractState: GameState | null = null;
  private orient: Orientation | null = null;
  private unsubscribe: (() => void) | null = null;
  private overlayCam!: Phaser.Cameras.Scene2D.Camera;
  private reserveCss = 0;
  private dpr = 1;
  private minCellCss = 36;
  private base = { zoom: 1, cx: 0, cy: 0 };
  private fx = { dx: 0, dy: 0, zoom: 1 };

  constructor() {
    super('game');
  }

  create(): void {
    this.art = this.registry.get('art') as ArtFactory;
    this.cameras.main.setBackgroundColor('#14507a');
    this.overlayCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'overlay');
    this.overlayCam.setBackgroundColor('rgba(0,0,0,0)');
    this.scale.on('resize', this.fit, this);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.orient || !this.host) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const cell = this.orient.cellAt(wp.x, wp.y);
      if (cell) this.host.tapCell(cell.a, cell.l);
      else this.host.tapOutside();
    });
    this.game.events.emit('scene-ready', this);
  }

  get artFactory(): ArtFactory {
    return this.art;
  }

  setHost(host: SceneHost): void {
    this.host = host;
  }

  private build(state: GameState, opts: WorldOptions): WorldView {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.view?.destroy();
    const view = new WorldView(this, this.art, state, opts, this.cameras.main);
    const l = view.layers;
    this.cameras.main.ignore(l.overlay);
    this.overlayCam.ignore([l.water, l.rims, l.floes, l.shadows, l.standing, l.atmosphere]);
    this.view = view;
    return view;
  }

  showRound(round: Round, orient: Orientation, opts: WorldOptions): void {
    this.round = round;
    this.attractState = null;
    const view = this.build(round.state, opts);
    this.unsubscribe = round.on((events: GameEvent[], state: GameState) => view.onEvents(events, state));
    this.setOrientation(orient);
  }

  /** Заставка меню: живая река в золотой час без раунда (11.5). */
  showAttract(state: GameState, orient: Orientation, opts: WorldOptions): void {
    this.round = null;
    this.attractState = state;
    const view = this.build(state, opts);
    view.attract = true;
    this.setOrientation(orient);
  }

  get world(): WorldView | null {
    return this.view;
  }

  setWorldOptions(opts: Partial<WorldOptions>): void {
    this.view?.setOptions(opts);
  }

  startCue(): void {
    this.view?.start();
  }

  setOrientation(orient: Orientation): void {
    this.orient = orient;
    const s = this.round?.state ?? this.attractState;
    if (this.view && s) this.view.setOrientation(orient, s);
    this.fit();
  }

  /** Плашка с корзиной лежит над ближним берегом: мир сдвигается, чтобы она не легла на лёд. */
  setReserve(reserveCss: number, dpr: number, minCellCss: number): void {
    this.reserveCss = reserveCss;
    this.dpr = dpr;
    this.minCellCss = minCellCss;
    this.fit();
  }

  /** Вписать реку в панель целиком (11.1.5): зум = CSS-размер клетки × DPR / 128 (13.5.3). */
  private fit(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setSize(W, H);
    this.overlayCam.setSize(W, H);
    const o = this.orient;
    if (!o) return;
    const b = o.bounds;
    const c = o.cell;
    let zoom = Math.min(W / b.w, H / b.h);
    let view = { x: b.x, y: b.y, w: b.w, h: b.h };
    const reserve = this.reserveCss * this.dpr;
    if (reserve > 0) {
      const portrait = o.orient === 'portrait';
      const g = o.gridSize;
      const m = o.margins;
      const spanAcross = portrait ? g.h + m.far * c : g.w + m.far * c;
      const spanFlow = portrait ? b.w : b.h;
      const availAcross = (portrait ? H : W) - reserve;
      const availFlow = portrait ? W : H;
      const z = Math.min(availAcross / spanAcross, availFlow / spanFlow);
      const nearNeeded = reserve / z;
      if (z * c >= this.minCellCss * this.dpr && nearNeeded >= m.near * c) {
        zoom = z;
        view = portrait
          ? { x: b.x, y: -m.far * c, w: b.w, h: spanAcross + nearNeeded }
          : { x: -nearNeeded, y: b.y, w: spanAcross + nearNeeded, h: b.h };
      }
    }
    this.base = { zoom, cx: view.x + view.w / 2, cy: view.y + view.h / 2 };
    this.applyCamera();
  }

  private applyCamera(): void {
    for (const cam of [this.cameras.main, this.overlayCam]) {
      cam.setZoom(this.base.zoom * this.fx.zoom);
      cam.centerOn(this.base.cx + this.fx.dx, this.base.cy + this.fx.dy);
    }
  }

  /** Центр клетки в координатах страницы — для тестов и полёта рыбы в корзину. */
  worldToClient(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = (x - cam.worldView.x) * cam.zoom;
    const sy = (y - cam.worldView.y) * cam.zoom;
    return { x: rect.left + (sx / this.scale.width) * rect.width, y: rect.top + (sy / this.scale.height) * rect.height };
  }

  cellToClient(a: number, l: number): { x: number; y: number } | null {
    if (!this.orient) return null;
    const p = this.orient.toWorld(a, l);
    return this.worldToClient(p.x, p.y);
  }

  override update(_time: number, delta: number): void {
    this.host?.frame(delta);
    const s = this.round?.state ?? this.attractState;
    if (this.view && s) {
      this.fx = this.view.update(delta, s, this.host?.showHints() ?? true);
      this.applyCamera();
    }
  }
}
