import { defineConfig } from '@playwright/test';

/**
 * Сквозные тесты (раздел 15): контраст (8.4), прохождение раунда, поворот экрана,
 * раскладка на всех размерах из чек-листа. Собранная игра раздаётся `vite preview`;
 * тесты открывают её с `?test`, где доступен window.__ice.
 */
const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Программный WebGL: тесты одинаково идут и на машине без видеокарты.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    // Тесты не ходят к модели: генерация на сервере выключена, нужное подменяет page.route.
    env: { AITUNNEL_API_KEY: '', OPENAI_API_KEY: '', ELEVENLABS_API_KEY: '' },
  },
});
