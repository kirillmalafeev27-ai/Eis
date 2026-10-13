import Phaser from 'phaser';
import { balance } from './config/balance';
import { palette } from './config/palette';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { createLayout } from './shared/layout';
import { paperTheme } from './shared/themes/paper';
import './ui/paper.css';

export interface MountedIce {
  destroy(): void;
}

/** Встраивание игры (13.4). На этапе 0 — бумажная страница с двумя карточками. */
export function mountIce(container: HTMLElement): MountedIce {
  const layout = createLayout(container, paperTheme, { ...balance.layout, questionFloor: 240 });
  const dpr = () => Math.min(window.devicePixelRatio || 1, balance.layout.maxDpr);
  const size = () => {
    const r = layout.worldHost.getBoundingClientRect();
    return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
  };
  const s0 = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: layout.worldHost,
    backgroundColor: palette.water.deep,
    banner: false,
    disableContextMenu: true,
    autoFocus: false,
    input: { keyboard: false },
    scale: { mode: Phaser.Scale.NONE, width: s0.w * dpr(), height: s0.h * dpr(), zoom: 1 / dpr() },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    scene: [BootScene, GameScene],
  });
  const ro = new ResizeObserver(() => {
    const s = size();
    const d = dpr();
    if (Math.abs(game.scale.zoom - 1 / d) > 1e-6) game.scale.setZoom(1 / d);
    game.scale.resize(s.w * d, s.h * d);
  });
  ro.observe(layout.worldHost);
  return {
    destroy() {
      ro.disconnect();
      game.destroy(true);
      layout.destroy();
    },
  };
}
