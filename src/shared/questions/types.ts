/** Источник вопросов серии (раздел 12): игра получает вопросы и не знает, откуда они. */
export interface Question {
  id: string;
  /** Текст задания. */
  prompt: string;
  promptLang: 'de' | 'ru';
  /** 2–4 варианта. */
  options: string[];
  optionsLang: 'de' | 'ru';
  correctIndex: number;
}

export interface QuestionProvider {
  next(): Promise<Question>;
  report(r: { id: string; correct: boolean; timeMs: number }): void;
}
