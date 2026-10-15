import { type Plugin, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { type Handler, QuizService, createQuizHandler } from './server/api.ts';

/**
 * API вопросов (генерация через ИИ, озвучка) прямо в `npm run dev` и `npm run preview`: тот же
 * обработчик, что в боевом server/index.ts. Ключи берутся из окружения или из .env.local.
 */
function quizApi(): Plugin {
  let handler: Handler | null = null;
  const use: Handler = (req, res, next) => (handler ? handler(req, res, next) : next?.());
  return {
    name: 'eis-quiz-api',
    configResolved(config) {
      const env = { ...loadEnv(config.mode, config.root, ''), ...process.env };
      handler = createQuizHandler(new QuizService({ env }));
    },
    configureServer(server) {
      server.middlewares.use(use);
    },
    configurePreviewServer(server) {
      server.middlewares.use(use);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [quizApi()],
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
