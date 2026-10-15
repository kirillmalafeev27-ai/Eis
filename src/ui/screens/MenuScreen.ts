import { palette } from '../../config/palette';
import { ru } from '../../i18n/ru';
import { paperWord } from '../../shared/paperKit';
import { button, el, focusFirst } from '../dom';

/**
 * Меню-обложка (11.5.1): за ним живая река в золотой час. Название вырезано из бумаги
 * буквами Rubik, подзаголовок — Fredoka, под ним «Auf dünnem Eis».
 */
export class MenuScreen {
  readonly title: HTMLElement;
  readonly card: HTMLElement;

  /** Подпись «Вопросы: B1 · Dativ, Perfekt» — её обновляет игра после выбора тем. */
  private readonly quizLine: HTMLElement | null;

  constructor(
    worldOverlay: HTMLElement,
    questionCard: HTMLElement,
    onPlay: () => void,
    onSettings: () => void,
    quiz?: { summary: string; open: () => void },
  ) {
    const word = paperWord(ru.title, {
      colors: [
        '#ffffff',
        palette.thinIce.base,
        '#ffffff',
        palette.thickIce.snowShade,
        '#ffffff',
        palette.thinIce.bubbles,
      ],
      font: "'Rubik', sans-serif",
      size: 120,
      shadow: palette.shadow,
      seed: 7,
    });
    const img = el('img', 'menu-title-img', { alt: ru.title, src: word.toDataURL() });
    this.title = el('div', 'menu-cover', {}, [
      el('h1', 'menu-title', {}, [img]),
      el('div', 'menu-sub', { lang: 'de' }, [ru.subtitle]),
      el('div', 'menu-tag', { lang: 'de' }, [ru.tagline]),
    ]);
    worldOverlay.appendChild(this.title);
    this.quizLine = quiz ? el('div', 'menu-quiz', { lang: 'de' }, [quiz.summary]) : null;
    this.card = el('div', 'menu-card', {}, [
      el('div', 'menu-hello', {}, [ru.menuHello[0], el('br'), ru.menuHello[1]]),
      el('div', 'menu-hint', {}, [ru.menuHint]),
      this.quizLine,
      el('div', 'menu-buttons', {}, [
        button(ru.play, 'paper-btn-primary paper-btn-big', onPlay),
        // «Вопросы» и «Настройки» — в один ряд, чтобы меню не переросло панель.
        quiz
          ? el('div', 'menu-row', {}, [
              button(ru.quiz.menu, '', quiz.open),
              button(ru.settings, '', onSettings),
            ])
          : button(ru.settings, '', onSettings),
      ]),
      el('div', 'menu-keys', {}, [ru.keys]),
    ]);
    questionCard.appendChild(this.card);
    focusFirst(this.card);
  }

  setQuizSummary(text: string): void {
    if (this.quizLine) this.quizLine.textContent = text;
  }

  destroy(): void {
    this.title.remove();
    this.card.remove();
  }
}
