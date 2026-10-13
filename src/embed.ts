import { App, type FinishResult, type IceOptions } from './game/App';
import './ui/paper.css';

export type { FinishResult, IceOptions };

export interface MountedIce {
  destroy(): void;
}

/**
 * Встраивание «Льдин» (13.4): mountIce(container, options) → { destroy }.
 * По умолчанию хранилище — localStorage с префиксом `ice:`; темп — общий ключ `series:pace`.
 */
export function mountIce(container: HTMLElement, options: IceOptions): MountedIce {
  const app = new App(container, options);
  const test = import.meta.env.DEV || new URLSearchParams(location.search).has('test');
  if (test) (window as unknown as { __ice: unknown }).__ice = app.debugApi();
  return { destroy: () => app.destroy() };
}
