import { ru } from '../../i18n/ru';
import type { AiStatus } from '../../shared/questions/AiQuestionProvider';
import {
  CEFR_LEVELS,
  type CefrLevel,
  GRAMMAR_GROUPS,
  LEXICAL_TOPICS,
  MAX_GRAMMAR_TOPICS,
  type QuizConfig,
} from '../../shared/questions/topics';
import { button, el, focusFirst } from '../dom';

/**
 * Выбор тем вопросов — шаги меню Morskoy в одной карточке: уровень, лексическая тема,
 * грамматические темы (до пяти, они чередуются), слот Wortstellung и аудирование.
 */
export class QuizScreen {
  readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    initial: QuizConfig | null,
    status: Promise<AiStatus>,
    onDone: (config: QuizConfig) => void,
    onBank: () => void,
    onCancel: () => void,
  ) {
    const t = ru.quiz;
    const cur: QuizConfig = initial
      ? { ...initial, grammarTopics: [...initial.grammarTopics] }
      : { level: 'A2', lexicalTopic: null, grammarTopics: [], wortstellung: false, listening: false };

    const statusNote = el('p', 'set-note quiz-status', { role: 'status' }, [t.checking]);
    void status.then((s) => {
      statusNote.textContent = !s.available ? t.noServer : !s.generationConfigured ? t.noKey : '';
    });

    /** Группа кнопок-радио. */
    const radio = <T extends string | null>(
      label: string,
      options: [T, string][],
      value: () => T,
      set: (v: T) => void,
      cls: string,
    ) => {
      const group = el('div', cls, { role: 'radiogroup', 'aria-label': label });
      const buttons = options.map(([v, text]) => {
        const b = el('button', 'quiz-tag', { type: 'button', role: 'radio' }, [text]);
        b.addEventListener('click', () => {
          set(v);
          sync();
        });
        group.appendChild(b);
        return { b, v };
      });
      const sync = () => {
        for (const { b, v } of buttons) {
          const on = v === value();
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', String(on));
        }
      };
      sync();
      return group;
    };

    const levelGroup = radio<CefrLevel>(
      t.level,
      CEFR_LEVELS.map((l) => [l, `${l} · ${t.levels[l]}`]),
      () => cur.level,
      (v) => (cur.level = v),
      'quiz-tags quiz-levels',
    );

    const lexicalGroup = radio<string | null>(
      t.lexical,
      [[null, t.lexicalAny], ...LEXICAL_TOPICS.map((x): [string, string] => [x, x])],
      () => cur.lexicalTopic,
      (v) => (cur.lexicalTopic = v),
      'quiz-tags',
    );
    lexicalGroup.lang = 'de';

    // Грамматика: несколько тем, не больше MAX_GRAMMAR_TOPICS.
    const grammarTitle = el('h3', 'quiz-title');
    const topicButtons: { b: HTMLButtonElement; topic: string }[] = [];
    const grammarGroups = GRAMMAR_GROUPS.map((g) => {
      const tags = el('div', 'quiz-tags', { lang: 'de' });
      for (const topic of g.topics) {
        const b = el('button', 'quiz-tag', { type: 'button' }, [topic]);
        b.addEventListener('click', () => {
          const i = cur.grammarTopics.indexOf(topic);
          if (i >= 0) cur.grammarTopics.splice(i, 1);
          else if (cur.grammarTopics.length < MAX_GRAMMAR_TOPICS) cur.grammarTopics.push(topic);
          syncGrammar();
        });
        tags.appendChild(b);
        topicButtons.push({ b, topic });
      }
      return el('div', 'quiz-group', {}, [el('div', 'quiz-group-title', {}, [t.groups[g.id] ?? g.id]), tags]);
    });

    const check = (label: string, value: () => boolean, set: (v: boolean) => void) => {
      const input = el('input', 'set-check', { type: 'checkbox', 'aria-label': label });
      input.addEventListener('change', () => {
        set(input.checked);
        syncGrammar();
      });
      const hint = el('span', 'quiz-check-hint');
      const row = el('label', 'set-row set-row-check quiz-check', {}, [
        input,
        el('span', 'set-label', {}, [label, el('br'), hint]),
      ]);
      return { row, input, hint, sync: () => (input.checked = value()) };
    };
    const word = check(
      t.wortstellung,
      () => cur.wortstellung,
      (v) => (cur.wortstellung = v),
    );
    const listen = check(
      t.listening,
      () => cur.listening,
      (v) => (cur.listening = v),
    );
    listen.hint.textContent = t.listeningHint;

    const need = el('p', 'set-note quiz-need');
    const done = button(t.done, 'paper-btn-primary', () =>
      onDone({ ...cur, grammarTopics: [...cur.grammarTopics] }),
    );

    const syncGrammar = () => {
      const n = cur.grammarTopics.length;
      grammarTitle.textContent = t.grammar(n, MAX_GRAMMAR_TOPICS);
      for (const { b, topic } of topicButtons) {
        const on = cur.grammarTopics.includes(topic);
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !on && n >= MAX_GRAMMAR_TOPICS;
      }
      if (!n) cur.wortstellung = false;
      word.input.disabled = !n;
      word.hint.textContent = t.wortstellungHint(cur.grammarTopics[0] ?? null);
      word.sync();
      listen.sync();
      const ok = n > 0 || cur.listening;
      done.disabled = !ok;
      need.textContent = ok ? '' : t.needTopic;
    };
    syncGrammar();

    this.root = el('div', 'screen screen-settings screen-quiz', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t.title,
    });
    this.root.appendChild(
      el('div', 'paper-card settings-card quiz-card', {}, [
        el('span', 'card-tape'),
        el('h2', '', {}, [t.title]),
        el('p', 'quiz-intro', {}, [t.intro]),
        statusNote,
        el('h3', 'quiz-title', {}, [t.level]),
        levelGroup,
        el('h3', 'quiz-title', {}, [t.lexical]),
        lexicalGroup,
        grammarTitle,
        ...grammarGroups,
        word.row,
        listen.row,
        need,
        el('div', 'row quiz-buttons', {}, [
          done,
          button(t.bank, '', onBank),
          button(t.cancel, 'paper-btn-small', onCancel),
        ]),
      ]),
    );
    parent.appendChild(this.root);
    const picked = levelGroup.querySelector<HTMLElement>('.is-on');
    if (picked) picked.focus({ preventScroll: true });
    else focusFirst(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
