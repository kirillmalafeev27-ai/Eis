import Phaser from 'phaser';
import { ArtFactory } from '../art/ArtFactory';

/**
 * Генерация текстур под экраном загрузки (7.3.7). Сначала ждём шрифты, иначе текст
 * на канве нарисуется запасным шрифтом (7.3.6). Прогресс уходит в игру событием.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  async create(): Promise<void> {
    const quality = (this.registry.get('quality') as 'high' | 'low' | undefined) ?? 'high';
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load("700 46px 'Fredoka'"),
          document.fonts.load("600 20px 'Rubik'"),
          document.fonts.load("800 28px 'Rubik'"),
        ]),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {
      /* шрифты не загрузились — рисуем запасным */
    }
    const words = (this.registry.get('words') as string[] | undefined) ?? [];
    const art = new ArtFactory(this.textures, quality, words);
    await art.generate((k) => this.game.events.emit('boot-progress', k));
    this.registry.set('art', art);
    this.game.events.emit('boot-done', art.generationMs);
    this.scene.start('game');
  }
}
