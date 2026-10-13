import type { Theme } from './themes/theme';

/**
 * Общая раскладка серии (11.1): панель мира и панель вопроса, портрет и ландшафт,
 * просветы, safe-area. Стиль — только через тему (CSS-переменные), здесь — геометрия.
 */
export type Orientation = 'portrait' | 'landscape';

export interface LayoutConfig {
  portraitQuestionShare: number;
  portraitQuestionMin: number;
  portraitQuestionMax: number;
  landscapeQuestionShare: number;
  landscapeQuestionMin: number;
  landscapeQuestionMax: number;
  landscapeRatio: number;
  gap: number;
  /** Абсолютный минимум панели вопроса, если миру не хватает места на минимальную клетку. */
  questionFloor: number;
}

/** Что нужно миру: размер в клетках и минимальная клетка (CSS px). */
export interface WorldNeeds {
  /** Клеток по горизонтали и вертикали в портрете (в ландшафте мир повёрнут). */
  portrait: { w: number; h: number };
  landscape: { w: number; h: number };
  minCell: number;
  /** Отступ карточки вокруг канвы (CSS px). */
  inset: number;
}

export interface LayoutInfo {
  orientation: Orientation;
  width: number;
  height: number;
  questionSize: number;
}

export interface Layout {
  root: HTMLElement;
  worldPanel: HTMLElement;
  worldCard: HTMLElement;
  worldHost: HTMLElement;
  worldOverlay: HTMLElement;
  questionPanel: HTMLElement;
  questionCard: HTMLElement;
  screens: HTMLElement;
  info(): LayoutInfo;
  setWorldNeeds(needs: WorldNeeds | null): void;
  onChange(cb: (info: LayoutInfo) => void): () => void;
  refresh(): void;
  destroy(): void;
}

function el(tag: string, cls: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export function createLayout(container: HTMLElement, theme: Theme, cfg: LayoutConfig): Layout {
  const root = el('div', 'series-root');
  root.dataset.theme = theme.name;
  theme.apply(root);
  const frame = el('div', 'series-layout', root);
  const worldPanel = el('section', 'series-panel series-panel-world', frame);
  worldPanel.setAttribute('aria-label', 'Река');
  el('div', 'series-card-shadow', worldPanel);
  const worldCard = el('div', 'series-card series-card-world', worldPanel);
  worldCard.dataset.tornDepth = '3.4';
  const worldHost = el('div', 'series-world-host', worldCard);
  const worldOverlay = el('div', 'series-world-overlay', worldCard);
  const questionPanel = el('section', 'series-panel series-panel-question', frame);
  el('div', 'series-card-shadow', questionPanel);
  const questionCard = el('div', 'series-card series-card-question', questionPanel);
  questionCard.dataset.tornDepth = '3';
  const screens = el('div', 'series-screens', root);
  container.appendChild(root);

  let needs: WorldNeeds | null = null;
  let current: LayoutInfo = { orientation: 'portrait', width: 0, height: 0, questionSize: 0 };
  const listeners = new Set<(info: LayoutInfo) => void>();
  let seed = 1;

  const compute = () => {
    const rect = frame.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 2 || H < 2) return;
    const landscape = W / H >= cfg.landscapeRatio;
    const gap = cfg.gap;
    let q: number;
    if (landscape) {
      q = Math.max(cfg.landscapeQuestionMin, Math.min(cfg.landscapeQuestionMax, W * cfg.landscapeQuestionShare));
      if (needs) {
        const need = needs.landscape.w * needs.minCell + needs.inset * 2;
        const avail = W - q - gap;
        if (avail < need) q = Math.max(cfg.questionFloor, W - gap - need);
      }
      q = Math.min(q, W * 0.5);
    } else {
      q = Math.max(cfg.portraitQuestionMin, Math.min(cfg.portraitQuestionMax, H * cfg.portraitQuestionShare));
      if (needs) {
        const need = needs.portrait.h * needs.minCell + needs.inset * 2;
        const avail = H - q - gap;
        if (avail < need) q = Math.max(cfg.questionFloor, H - gap - need);
      }
      q = Math.min(q, H * 0.55);
    }
    q = Math.round(q);
    root.dataset.orient = landscape ? 'landscape' : 'portrait';
    root.style.setProperty('--q-size', `${q}px`);
    root.style.setProperty('--gap', `${gap}px`);
    const changed =
      current.orientation !== (landscape ? 'landscape' : 'portrait') ||
      Math.abs(current.width - W) > 0.5 ||
      Math.abs(current.height - H) > 0.5 ||
      current.questionSize !== q;
    current = { orientation: landscape ? 'landscape' : 'portrait', width: W, height: H, questionSize: q };
    if (theme.decorateCard) {
      theme.decorateCard(worldCard, seed * 7 + 1);
      theme.decorateCard(questionCard, seed * 7 + 2);
    }
    if (changed) for (const cb of listeners) cb(current);
  };

  const ro = new ResizeObserver(() => compute());
  ro.observe(frame);
  ro.observe(worldCard);
  ro.observe(questionCard);
  compute();

  return {
    root,
    worldPanel,
    worldCard,
    worldHost,
    worldOverlay,
    questionPanel,
    questionCard,
    screens,
    info: () => current,
    setWorldNeeds(n) {
      needs = n;
      compute();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    refresh() {
      seed++;
      compute();
    },
    destroy() {
      ro.disconnect();
      listeners.clear();
      root.remove();
    },
  };
}
