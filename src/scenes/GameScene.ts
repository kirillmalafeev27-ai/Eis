import Phaser from 'phaser';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { GreyView } from '../render/GreyView';
import type { Orientation } from '../render/orientation';
import type { Round } from '../game/Round';

/** Хозяин сцены — приложение: ведёт время раунда и получает касания мира. */
export interface SceneHost {
  frame(dtMs: number): void;
  tapCell(a: number, l: number): void;
  tapOutside(): void;
}

/**
 * Сцена мира. Только читает состояние и реагирует на события (0.3); время раунда
 * двигает хозяин из update(), ввод уходит хозяину.
 */
export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  private view: GreyView | null = null;
  private round: Round | null = null;
  private orient: Orientation | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Полоса под плашкой с корзиной вдоль ближнего берега, в CSS px (11.3). */
  private reserveCss = 0;
  private dpr = 1;
  private minCellCss = 36;

  constructor() {
    super('game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#3c4a5a');
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

  setHost(host: SceneHost): void {
    this.host = host;
  }

  showRound(round: Round, orient: Orientation): void {
    this.clearRound();
    this.round = round;
    this.view = new GreyView(this, round.level.hints);
    this.unsubscribe = round.on((events: GameEvent[], state: GameState) => {
      this.view?.onEvents(events);
      void state;
    });
    this.setOrientation(orient);
  }

  setOrientation(orient: Orientation): void {
    this.orient = orient;
    this.view?.setOrientation(orient);
    this.fit();
  }

  clearRound(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.view?.destroy();
    this.view = null;
    this.round = null;
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
    const cam = this.cameras.main;
    const W = this.scale.width;
    const H = this.scale.height;
    cam.setSize(W, H);
    const o = this.orient;
    if (!o) return;
    const b = o.bounds;
    const c = o.cell;
    let zoom = Math.min(W / b.w, H / b.h);
    let view = { x: b.x, y: b.y, w: b.w, h: b.h };
    const reserve = this.reserveCss * this.dpr;
    if (reserve > 0) {
      // Вариант с полосой под плашку: сетка и дальнее поле — в оставшемся месте.
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
    cam.setZoom(zoom);
    cam.centerOn(view.x + view.w / 2, view.y + view.h / 2);
  }

  /** Центр клетки в координатах страницы — для тестов и полёта рыбы в корзину. */
  cellToClient(a: number, l: number): { x: number; y: number } | null {
    if (!this.orient) return null;
    const p = this.orient.toWorld(a, l);
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = (p.x - cam.worldView.x) * cam.zoom;
    const sy = (p.y - cam.worldView.y) * cam.zoom;
    return { x: rect.left + (sx / this.scale.width) * rect.width, y: rect.top + (sy / this.scale.height) * rect.height };
  }

  override update(_time: number, delta: number): void {
    this.host?.frame(delta);
    if (this.round && this.view) this.view.update(this.round.state);
  }
}
