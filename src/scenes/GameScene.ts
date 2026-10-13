import Phaser from 'phaser';

/** Сцена мира. Только читает состояние и реагирует на события (0.3). */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14507a');
  }
}
