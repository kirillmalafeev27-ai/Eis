import { ctx2d, makeCanvas } from '../shared/paperKit';

/**
 * Простая полочная упаковка холстов в страницы атласа. Меньше текстур на GPU —
 * меньше переключений при отрисовке и равномерная фильтрация.
 */
export interface Packed {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class AtlasBuilder {
  readonly pages: HTMLCanvasElement[] = [];
  readonly frames = new Map<string, Packed>();
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;
  private readonly pad = 2;

  constructor(private readonly size = 2048) {
    this.newPage();
  }

  private newPage(): void {
    this.pages.push(makeCanvas(this.size, this.size));
    this.shelfY = 0;
    this.shelfH = 0;
    this.cursorX = 0;
  }

  add(key: string, src: HTMLCanvasElement): void {
    const w = src.width + this.pad * 2;
    const h = src.height + this.pad * 2;
    if (w > this.size || h > this.size) throw new Error(`Текстура ${key} больше страницы атласа`);
    if (this.cursorX + w > this.size) {
      this.shelfY += this.shelfH;
      this.shelfH = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + h > this.size) this.newPage();
    const page = this.pages.length - 1;
    ctx2d(this.pages[page]).drawImage(src, this.cursorX + this.pad, this.shelfY + this.pad);
    this.frames.set(key, {
      page,
      x: this.cursorX + this.pad,
      y: this.shelfY + this.pad,
      w: src.width,
      h: src.height,
    });
    this.cursorX += w;
    this.shelfH = Math.max(this.shelfH, h);
  }

  /** Холст кадра из атласа (для обрезки кусков льдины при расколе). */
  extract(key: string): HTMLCanvasElement | null {
    const f = this.frames.get(key);
    if (!f) return null;
    const c = makeCanvas(f.w, f.h);
    ctx2d(c).drawImage(this.pages[f.page], f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    return c;
  }
}
