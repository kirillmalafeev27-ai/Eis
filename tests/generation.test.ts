import { describe, expect, it } from 'vitest';
import { EXERCISE_FORMATS } from '../server/generation/exerciseFormats';
import { buildExercisePrompt } from '../server/generation/exercisePrompt';
import { minOptionWords, validateBatch, validateQuestion } from '../server/generation/exerciseValidation';
import {
  GRAMMAR_RULES,
  getTopicFormats,
  renderTopicBlock,
  resolveTopic,
} from '../server/generation/grammarRules';
import { parseTextExercises } from '../server/generation/textFormat';
import { GRAMMAR_TOPICS } from '../src/shared/questions/topics';

/**
 * Движок генерации, перенесённый из Morskoy: те же проверки, что в его test/exercise-rules.test.js
 * и test/text-format.test.js.
 */

describe('правила тем', () => {
  it('каждая тема клиента находит набор правил', () => {
    const unresolved = GRAMMAR_TOPICS.filter((topic) => !resolveTopic(topic));
    expect(unresolved).toEqual([]);
  });

  it('каждый набор правил полон и ссылается на известные форматы', () => {
    for (const [topic, entry] of Object.entries(GRAMMAR_RULES)) {
      for (const field of ['rule', 'design', 'traps', 'avoid'] as const) {
        expect(entry[field].length, `${topic}: ${field}`).toBeGreaterThan(40);
      }
      expect(entry.formats.length, `${topic}: форматов`).toBeGreaterThanOrEqual(3);
      for (const id of entry.formats) expect(EXERCISE_FORMATS[id], `${topic}: ${id}`).toBeTruthy();
    }
  });

  it('у каждого формата пример с существующим верным вариантом', () => {
    for (const [id, format] of Object.entries(EXERCISE_FORMATS)) {
      const example = format.example;
      expect(example.options, id).toHaveLength(4);
      expect(example.options[example.correct], id).toBeTruthy();
      expect(new Set(example.options).size, id).toBe(4);
    }
  });

  it('транслитерация и синонимы находят тему', () => {
    expect(resolveTopic('Praeteritum')).toBe('Präteritum');
    expect(resolveTopic('Relativsaetze')).toBe('Relativsätze');
    expect(resolveTopic('Pronomen im Dativ')).toBe('Pronomen in Dativ');
    expect(resolveTopic('Pronomen')).toBe('Pronomen');
    expect(resolveTopic('Gedicht schreiben')).toBeNull();
  });

  it('renderTopicBlock выдаёт все четыре раздела', () => {
    const block = renderTopicBlock('Praeteritum');
    expect(block).toMatch(/GRAMMATIK "Präteritum"/);
    expect(block).toMatch(/AUFGABENDESIGN/);
    expect(block).toMatch(/GUTE FALSCHE OPTIONEN/);
    expect(block).toMatch(/VERBOTEN/);
  });
});

describe('правило субстанции', () => {
  it('«Infinitiv mit zu» не допускает простого пропуска', () => {
    expect(getTopicFormats('Infinitiv mit zu')).not.toContain('luecke');
    expect(minOptionWords('Infinitiv mit zu', false)).toBe(3);
  });

  it('задание на служебное слово отклоняется', () => {
    const result = validateQuestion(
      {
        format: 'luecke',
        text: 'Выбери правильный вариант.',
        display: 'Er versucht, den Bahnhof ___ finden.',
        options: ['zu', '–', 'zum', 'um zu'],
        correct: 0,
      },
      { grammarTopic: 'Infinitiv mit zu' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Füllwort/);
  });

  it('то же задание с выбором целых предложений принимается', () => {
    const result = validateQuestion(
      {
        format: 'satzvarianten',
        text: 'Выбери грамматически правильный вариант.',
        display: 'Sein Zug fährt um sechs. (vorhaben – früh aufstehen)',
        options: [
          'Er hat vor, morgen früh aufzustehen.',
          'Er hat vor, morgen früh zu aufstehen.',
          'Er hat vor, morgen früh aufstehen zu.',
          'Er hat vor, morgen früh aufstehen.',
        ],
        correct: 0,
        correctAnswer: 'Er hat vor, morgen früh aufzustehen.',
      },
      { grammarTopic: 'Infinitiv mit zu' },
    );
    expect(result.ok).toBe(true);
  });

  it('варианты из одного слова допустимы, где целевое явление — одно слово', () => {
    const result = validateQuestion(
      {
        format: 'dialog',
        text: 'Выбери подходящий вариант.',
        display: '___ ich zehn Jahre alt war, ist meine Familie nach Berlin gezogen.',
        options: ['Als', 'Wenn', 'Wann', 'Während'],
        correct: 0,
      },
      { grammarTopic: 'als vs. wenn' },
    );
    expect(result.ok).toBe(true);
  });

  it('индекс, противоречащий correctAnswer, исправляется по тексту', () => {
    const result = validateQuestion(
      {
        text: 'Выбери.',
        display: 'Anna hat ___ einen Blumenstrauß geschenkt.',
        options: [
          'ihrer neuen Kollegin',
          'ihre neue Kollegin',
          'ihrer neue Kollegin',
          'ihren neuen Kollegen',
        ],
        correct: 3,
        correctAnswer: 'ihrer neuen Kollegin',
      },
      { grammarTopic: 'Dativ' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.question.correct).toBe(0);
  });

  it('сломанные задания не проходят', () => {
    const context = { grammarTopic: 'Präsens' };
    const cases: [unknown, RegExp][] = [
      [{ text: 'a', display: 'b', options: ['x', 'y', 'z'], correct: 0 }, /statt 4/],
      [{ text: 'a', display: 'b', options: ['x', 'x', 'y', 'z'], correct: 0 }, /doppelte/],
      [{ text: 'a', display: 'b', options: ['w', 'x', 'y', 'z'], correct: 9 }, /correct-Index/],
      [{ text: 'a', display: 'Er geht...', options: ['w', 'x', 'y', 'z'], correct: 0 }, /abgeschnitten/],
      [{ text: 'a', display: 'b', options: ['w ___', 'x', 'y', 'z'], correct: 0 }, /Lücke/],
    ];
    for (const [raw, pattern] of cases) {
      const result = validateQuestion(raw, context);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(pattern);
    }
  });

  it('блок теряет дубли и ограничивает один формат', () => {
    const make = (n: number) => ({
      format: 'satzvarianten',
      text: 'Выбери.',
      display: `Aufgabe Nummer ${n} mit genug Kontext für einen ganzen Satz.`,
      options: [
        `Er hat vor, am ${n}. Mai früh aufzustehen.`,
        `Er hat vor, am ${n}. Mai früh zu aufstehen.`,
        `Er hat vor, am ${n}. Mai früh aufstehen zu.`,
        `Er hat vor, am ${n}. Mai früh aufstehen.`,
      ],
      correct: 0,
    });
    const batch = [make(1), make(1), make(2), make(3), make(4), make(5), make(6)];
    const result = validateBatch(batch, { grammarTopic: 'Infinitiv mit zu', count: 10 });
    expect(result.rejected).toContain('Aufgabe doppelt');
    expect(result.questions).toHaveLength(6);
    expect(result.formatCounts.satzvarianten).toBe(4);
  });
});

describe('промпт', () => {
  it('несёт тему, уровень, форматы и запреты', () => {
    const prompt = buildExercisePrompt({
      level: 'B1',
      grammarTopic: 'Infinitiv mit zu',
      lexicalTopic: 'Reisen und Urlaub',
      count: 10,
    });
    expect(prompt).toMatch(/GRAMMATIKTHEMA: Infinitiv mit zu/);
    expect(prompt).toMatch(/NIVEAU B1/);
    expect(prompt).toMatch(/Reisen und Urlaub/);
    expect(prompt).toMatch(/SUBSTANZ DER OPTIONEN/);
    expect(prompt).toMatch(/DECKUNGSTEST/);
    expect(prompt).toMatch(/FORMAT "satzvarianten"/);
    expect(prompt).not.toMatch(/FORMAT "luecke"/);
  });

  it('слот Wortstellung требует форматов с целыми предложениями', () => {
    const prompt = buildExercisePrompt({
      level: 'A2',
      grammarTopic: 'Dativ',
      isWortstellung: true,
      count: 10,
    });
    expect(prompt).toMatch(/FORMAT "wortstellung"/);
    expect(prompt).toMatch(/Inversion/);
  });

  it('уже выданные задания попадают в запрет повторов, не больше двенадцати', () => {
    const exclude = Array.from({ length: 20 }, (_, i) => `Satz ${i}.`);
    const prompt = buildExercisePrompt({ level: 'A2', grammarTopic: 'Dativ', exclude, output: 'text' });
    expect(prompt).toMatch(/SCHON VERWENDET/);
    expect(prompt).toContain('- Satz 19.');
    expect(prompt).not.toContain('- Satz 7.');
    expect(prompt).toMatch(/LÖSUNGEN/);
  });
});

/** Так выглядит ответ модели в текстовом формате. */
const MODEL_ANSWER = `AUFGABEN
1. Format: satzvarianten
Anweisung: Выбери грамматически правильный вариант.
Aufgabe: Sein Zug fährt um sechs. (vorhaben – früh aufstehen)
A) Er hat vor, morgen früh aufzustehen.
B) Er hat vor, morgen früh zu aufstehen.
C) Er hat vor, morgen früh aufstehen zu.
D) Er hat vor, morgen früh aufstehen.

2. Format: verbindung
Anweisung: Соедини два предложения в одно.
Aufgabe: Verbinde: "Der Turm ist sehr alt." + "Man kann den Turm vom Bahnhof aus sehen."
A) Der Turm, der man vom Bahnhof aus sehen kann, ist sehr alt.
B) Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.
C) Der Turm, dem man vom Bahnhof aus sehen kann, ist sehr alt.
D) Der Turm, den man kann vom Bahnhof aus sehen, ist sehr alt.

LÖSUNGEN
1: A = Er hat vor, morgen früh aufzustehen.
2: B = Der Turm, den man vom Bahnhof aus sehen kann, ist sehr alt.`;

describe('текстовый формат с ключом ответов', () => {
  it('читаются формат, инструкция и строка ключа', () => {
    const parsed = parseTextExercises(MODEL_ANSWER, 10);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].format).toBe('satzvarianten');
    expect(parsed[0].text).toBe('Выбери грамматически правильный вариант.');
    expect(parsed[0].display).toMatch(/Sein Zug fährt um sechs/);
    expect(parsed[0].options).toHaveLength(4);
    expect(parsed[0].correct).toBe(0);
    expect(parsed[1].format).toBe('verbindung');
    expect(parsed[1].correct).toBe(1);
    expect(parsed[1].options[1]).toBe(parsed[1].correctAnswer);
  });

  it('без ключа ответов ничего не берётся', () => {
    expect(parseTextExercises(MODEL_ANSWER.slice(0, MODEL_ANSWER.indexOf('LÖSUNGEN')), 10)).toEqual([]);
  });

  it('ключ, не совпадающий с заданием, отсеивается проверкой', () => {
    const broken = MODEL_ANSWER.replace(
      '1: A = Er hat vor, morgen früh aufzustehen.',
      '1: A = Ein Satz, der so gar nicht in den Optionen steht.',
    );
    const { questions, rejected } = validateBatch(parseTextExercises(broken, 10), {
      grammarTopic: 'Infinitiv mit zu',
      count: 10,
    });
    expect(questions).toHaveLength(1);
    expect(rejected.some((reason) => /correctAnswer/.test(reason))).toBe(true);
  });

  it('разобранные задания проходят проверку блока', () => {
    const { questions, rejected } = validateBatch(parseTextExercises(MODEL_ANSWER, 10), {
      grammarTopic: 'Infinitiv mit zu',
      count: 10,
    });
    expect(rejected).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0].correct).toBe(0);
  });
});
