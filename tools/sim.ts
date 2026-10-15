import { balance } from '../src/config/balance';
import { levels } from '../src/config/levels';
import type { BotKind } from './bots';
import { type SimReport, defaultPace, paceConfigFor, simulate } from './simulate';

/**
 * `npm run sim -- --level 3 --runs 2000 [--tmed 5] [--p 0.8] [--sigma 0.5] [--bot balanced] [--seed 1]`
 *   [--mode bank|gen] [--cefr B1] [--history 20] [--warmth 3] [--allowance 1.12]
 * Без --level прогоняются все уровни, без --bot — все три бота. --tmed, --p, --sigma — как
 * отвечает игрок; темп раунда игра выставляет сама по --history его прошлым ответам (0 — первый
 * раунд, значения по умолчанию) учётом темпа --mode: банк или задания генератора уровня --cefr.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg('runs') ?? 500);
const tMedMs = arg('tmed') ? Number(arg('tmed')) * 1000 : defaultPace.tMedMs;
const p = arg('p') ? Number(arg('p')) : defaultPace.p;
const sigma = arg('sigma') ? Number(arg('sigma')) : 0.5;
const mode = (arg('mode') ?? 'bank') as 'bank' | 'gen';
const cefr = arg('cefr') ?? 'B1';
const history = arg('history') !== undefined ? Number(arg('history')) : 20;
const warmth = arg('warmth') ? Number(arg('warmth')) : undefined;
const base = paceConfigFor(mode, cefr);
const opts = {
  paceConfig: arg('allowance') ? { ...base, allowance: Number(arg('allowance')) } : base,
  history,
  warmth,
  wrongShowMs: mode === 'gen' ? balance.questions.wrongFeedbackGeneratedMs : undefined,
};
const seed = Number(arg('seed') ?? 1);
const levelArg = arg('level');
const botArg = arg('bot') as BotKind | undefined;
const chosenLevels = levelArg
  ? levels.filter((l) => String(l.id) === levelArg || l.label === levelArg)
  : levels;
const bots: BotKind[] = botArg ? [botArg] : ['cautious', 'balanced', 'greedy'];

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const rows: string[][] = [
  [
    'ур.',
    'бот',
    'победы',
    'рыб',
    'рыб в победах',
    '★0/★1/★2/★3',
    'падений: трещ/тая',
    'доля таяния',
    'пораж.: холод/тупик/время',
    'длинных',
    'время, с',
  ],
];
const t0 = Date.now();
for (const level of chosenLevels) {
  for (const bot of bots) {
    const r: SimReport = simulate(level, bot, runs, { tMedMs, p, sigma }, seed, opts);
    const falls = r.fallsCrack + r.fallsMelt;
    const losses = r.runs - Math.round(r.winRate * r.runs);
    rows.push([
      level.label,
      bot,
      pct(r.winRate),
      r.avgFish.toFixed(2),
      r.avgFishInWins.toFixed(2),
      r.stars.map((x) => pct(x / r.runs)).join(' / '),
      `${r.fallsCrack.toFixed(2)} / ${r.fallsMelt.toFixed(2)}`,
      falls ? pct(r.fallsMelt / falls) : '—',
      `${r.lossCold} / ${r.lossTrapped} / ${r.lossTimeout}` +
        (losses ? ` (тупик ${pct(r.lossTrapped / losses)})` : ''),
      r.longJumps.toFixed(2),
      r.avgTimeS.toFixed(0),
    ]);
  }
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
console.log(
  `Симуляция: ${runs} раундов на конфигурацию; игрок: T_med = ${tMedMs / 1000} с, σ = ${sigma}, p = ${p}; ` +
    `учёт темпа: ${mode === 'gen' ? `генератор ${cefr}` : 'банк'}, ${history ? `${history} прошлых ответов` : 'первый раунд'}` +
    `${warmth ? `, тепло ${warmth}` : ''}; сид ${seed}`,
);
for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join(' │ '));
console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
