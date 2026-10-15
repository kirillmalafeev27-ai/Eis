import '@fontsource/rubik/cyrillic-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-ext-400.css';
import '@fontsource/rubik/cyrillic-500.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-ext-500.css';
import '@fontsource/rubik/cyrillic-700.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-ext-700.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/fredoka/latin-ext-700.css';
import { balance } from './config/balance';
import { mountIce } from './embed';
import { AiQuestionProvider } from './shared/questions/AiQuestionProvider';
import { LocalBankProvider } from './shared/questions/LocalBankProvider';
import bank from './shared/questions/bank.de.json';
import type { Question } from './shared/questions/types';

const app = document.getElementById('app');
if (app) {
  const params = new URLSearchParams(location.search);
  const level = params.get('level');
  const q = balance.questions;
  const local = new LocalBankProvider(bank as Question[], {
    noRepeatWithin: q.noRepeatWithin,
    retryWrongMin: q.retryWrongMin,
    retryWrongMax: q.retryWrongMax,
  });
  // Вопросы сочиняет ИИ на сервере игры по выбранным темам; встроенный банк — запасной путь.
  const questions = new AiQuestionProvider({
    fallback: local,
    batchSize: q.aiBatch,
    refillAt: q.aiRefillAt,
    firstWaitMs: q.aiFirstWaitMs,
    nextWaitMs: q.aiNextWaitMs,
    requestTimeoutMs: q.aiRequestTimeoutMs,
    retryWrongMin: q.retryWrongMin,
    retryWrongMax: q.retryWrongMax,
  });
  mountIce(app, { questions, level: level ? Number(level) : undefined });
}
