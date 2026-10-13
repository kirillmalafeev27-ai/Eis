import Phaser from 'phaser';

/** Генерация текстур под экраном загрузки (7.3). На этапе 0 — пустая. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.scene.start('game');
  }
}
