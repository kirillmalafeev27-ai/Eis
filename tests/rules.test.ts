import { describe, expect, it } from 'vitest';
import { balance } from '../src/config/balance';
import { levels } from '../src/config/levels';
import { gridWithWetSunk } from '../src/core/melt';
import { hasFairRoute } from '../src/core/routes';
import { bestFarBankTarget, clampFrameDt, isReady, pipsNeeded, reduce } from '../src/core/rules';
import { PACE, Runner, at, stateFrom, types } from './helpers';

const THIN_MS = 3.6 * 5000 + 1000; // уровень 1, T_med = 5 с
const THICK_MS = 5.8 * 5000 + 1000;

const BASIC = [
  '# # # # #', // a=5
  '. . . . .', // a=4
  '. O ~ . .', // a=3
  '. . ~ O .', // a=2
  '. . . . .', // a=1
  '= = = = =', // a=0
];

describe('заряды и готовый прыжок (2.2.5–2.2.6)', () => {
  it('без цели копится только один заряд', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    expect(types(r.correct())).toEqual(['PIP']);
    expect(r.s.hero.pips).toBe(1);
    expect(isReady(r.s)).toBe(true);
    expect(types(r.correct())).toEqual([]);
    expect(r.s.hero.pips).toBe(1);
  });

  it('готовый прыжок сразу выполняет обычный прыжок при выборе цели', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    const ev = r.target(1, 1);
    expect(types(ev)).toContain('JUMP');
    expect(r.s.hero.cell).toBe(at(r.s.grid, 1, 1));
    expect(r.s.hero.pips).toBe(0);
  });

  it('для длинного прыжка нужен ещё один верный ответ', () => {
    const r = new Runner(stateFrom(BASIC, { bridge: [0, 3] })).noMelt();
    r.correct();
    r.target(1, 3);
    r.correct();
    r.target(2, 3);
    expect(r.s.grid.cells[r.s.hero.cell]).toBe('thick');
    // С толстой (2,3) — длинный прыжок через полынью (2,2) на (2,1).
    r.correct();
    const ev = r.target(2, 1);
    expect(r.s.route?.[0]).toMatchObject({ long: true, cost: 2 });
    expect(types(ev)).not.toContain('JUMP');
    expect(r.s.hero.pips).toBe(1);
    const ev2 = r.correct();
    expect(ev2.find((e) => e.type === 'JUMP')).toMatchObject({ long: true });
    expect(r.s.hero.cell).toBe(at(r.s.grid, 2, 1));
  });

  it('заряды копятся до цены следующего прыжка, сохраняются при смене цели и обнуляются после прыжка', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.target(3, 1);
    expect(pipsNeeded(r.s)).toBe(1);
    r.correct();
    expect(r.s.hero.cell).toBe(at(r.s.grid, 1, 1));
    expect(r.s.hero.pips).toBe(0);
    r.target(4, 4);
    r.do({ type: 'CANCEL_TARGET' });
    r.correct();
    expect(r.s.hero.pips).toBe(1);
    r.target(4, 4);
    expect(r.s.hero.pips).toBe(0);
  });

  it('неверный ответ не даёт заряда, таймеры идут', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    const t = r.s.time;
    expect(types(r.wrong())).toEqual(['WRONG']);
    expect(r.s.hero.pips).toBe(0);
    r.tick(1000);
    expect(r.s.time).toBe(t + 1000);
  });

  it('прыжок засчитывается в момент последнего заряда, если льдина ещё цела', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    r.target(2, 1);
    r.tick(THIN_MS - 1);
    expect(r.s.hero.falls).toBe(0);
    const ev = r.correct();
    expect(types(ev)[0]).toBe('PIP');
    expect(types(ev)).toContain('JUMP');
    expect(r.s.hero.falls).toBe(0);
  });
});

describe('покинутая льдина тонет, берег — нет (2.2.9)', () => {
  it('льдина становится водой, берег остаётся', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    let ev = r.target(0, 2);
    expect(types(ev)).not.toContain('FLOE_LEFT_SUNK');
    expect(r.s.grid.cells[at(r.s.grid, 0, 1)]).toBe('near');
    r.correct();
    r.target(1, 2);
    r.correct();
    ev = r.target(1, 3);
    expect(ev.find((e) => e.type === 'FLOE_LEFT_SUNK')).toMatchObject({ cell: at(r.s.grid, 1, 2) });
    expect(r.s.grid.cells[at(r.s.grid, 1, 2)]).toBe('water');
  });
});

describe('недоступная цель (2.2.10)', () => {
  it('вода, нет маршрута и вне поля — DENIED', () => {
    const r = new Runner(
      stateFrom(['# # #', '~ ~ ~', '~ ~ ~', '. ~ .', '= = ='], { bridge: [0, 0] }),
    ).noMelt();
    expect(r.target(2, 1).find((e) => e.type === 'DENIED')).toMatchObject({ reason: 'water' });
    expect(r.target(4, 1).find((e) => e.type === 'DENIED')).toMatchObject({ reason: 'noRoute' });
    expect(r.do({ type: 'SET_TARGET', cell: 999 }).find((e) => e.type === 'DENIED')).toMatchObject({
      reason: 'tooFar',
    });
    expect(r.s.hero.target).toBeNull();
  });
});

describe('таймер льдины, трещины, падение и тепло (2.3)', () => {
  it('тонкая держит thinAnswers × T_med + 1 с, стадии на 25/50/75/90%, отсчёт и развал', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    expect(r.s.hero.floeDuration).toBe(THIN_MS);
    const seen: string[] = [];
    let t = 0;
    while (t < THIN_MS + 50) {
      for (const e of r.tick(50)) {
        if (e.type === 'CRACK_STAGE') seen.push(`S${e.stage}@${Math.round(r.s.time)}`);
        if (e.type === 'COUNTDOWN') seen.push(`C${e.n}@${Math.round(r.s.time)}`);
        if (e.type === 'FELL') seen.push(`F@${Math.round(r.s.time)}`);
      }
      t += 50;
    }
    const q = (x: number) => Math.ceil(x / 50) * 50;
    expect(seen).toEqual([
      `S1@${q(THIN_MS * 0.25)}`,
      `S2@${q(THIN_MS * 0.5)}`,
      `S3@${q(THIN_MS * 0.75)}`,
      `C3@${q(THIN_MS - 3000)}`,
      `C2@${q(THIN_MS - 2000)}`,
      `S4@${q(THIN_MS * 0.9)}`,
      `C1@${q(THIN_MS - 1000)}`,
      `F@${q(THIN_MS)}`,
    ]);
  });

  it('толстая держит thickAnswers × T_med + 1 с', () => {
    const r = new Runner(stateFrom(BASIC, { bridge: [0, 3] })).noMelt();
    r.correct();
    r.target(1, 3);
    r.correct();
    r.target(2, 3);
    expect(r.s.grid.cells[r.s.hero.cell]).toBe('thick');
    expect(r.s.hero.floeDuration).toBe(THICK_MS);
  });

  it('падение: минус деление тепла, обломок в той же клетке со свежим таймером, заряды сохраняются', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    r.target(3, 1); // маршрут через (2,1), заряд копится
    r.tick(THIN_MS - 100);
    // готовый заряд к цели нельзя набрать без прыжка — ставим цель на две клетки и ждём падения без ответов
    const cell = r.s.hero.cell;
    const ev = r.tick(200);
    expect(ev.find((e) => e.type === 'FELL')).toMatchObject({ cause: 'crack', warmthLeft: 2, cell });
    expect(r.s.hero.cell).toBe(cell);
    expect(r.s.debris[cell]).toBe(true);
    expect(r.s.grid.cells[cell]).toBe('thin');
    expect(r.s.hero.floeStart).toBeCloseTo(r.s.time - 100, 0);
    expect(r.s.status).toBe('playing');
  });

  it('заряд сохраняется после падения', () => {
    const r = new Runner(stateFrom(BASIC, { bridge: [0, 3] })).noMelt();
    r.correct();
    r.target(1, 3);
    r.correct();
    r.target(2, 3); // толстая
    r.target(2, 1); // длинный прыжок: копим 2 заряда
    r.correct();
    expect(r.s.hero.pips).toBe(1);
    r.tick(THICK_MS + 10);
    expect(r.s.hero.falls).toBe(1);
    expect(r.s.hero.pips).toBe(1);
  });

  it('третье падение — поражение от холода', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    r.tick(THIN_MS + 10);
    r.tick(THIN_MS + 10);
    expect(r.s.hero.warmth).toBe(1);
    const ev = r.tick(THIN_MS + 10);
    expect(types(ev)).toContain('OUT_OF_WARMTH');
    expect(r.s.status).toBe('lost');
    expect(r.s.cause).toBe('cold');
  });

  it('на берегу таймера нет', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.tick(120000, 1000);
    expect(r.s.hero.falls).toBe(0);
  });
});

describe('рыба, звёзды и итог (2.5, 2.6)', () => {
  it('рыба попадает в корзину при приземлении, победа — на дальнем берегу, звёзды по рыбе', () => {
    const r = new Runner(stateFrom(BASIC, { fish: [[1, 1], [2, 1]] })).noMelt();
    r.correct();
    expect(r.target(1, 1).find((e) => e.type === 'FISH_CAUGHT')).toMatchObject({ count: 1 });
    r.correct();
    r.target(2, 1);
    r.correct();
    r.target(3, 1);
    r.correct();
    r.target(4, 1);
    r.correct();
    const ev = r.target(5, 1);
    expect(ev.find((e) => e.type === 'ESCAPED')).toMatchObject({ fish: 2, stars: 2 });
    expect(r.s.status).toBe('won');
  });

  it('тупик заканчивает раунд сразу', () => {
    const r = new Runner(
      stateFrom(['# # #', '~ ~ ~', '~ ~ ~', '~ . ~', '~ . ~', '= = ='], { bridge: [0, 1] }),
    ).noMelt();
    r.correct();
    const ev = r.target(1, 1);
    expect(types(ev)).toContain('TRAPPED');
    expect(r.s.status).toBe('lost');
    expect(r.s.cause).toBe('trapped');
  });

  it('«К берегу» выбирает клетку дальнего берега с самым дешёвым маршрутом', () => {
    const s = stateFrom(BASIC, { bridge: [0, 4] });
    const t = bestFarBankTarget(s);
    expect(t).not.toBeNull();
    expect(s.grid.cells[t as number]).toBe('far');
  });
});

describe('таяние (2.4)', () => {
  it('начинается через meltStartAnswers × T_med и не трогает льдину под героем и в пределах прыжка', () => {
    const r = new Runner(stateFrom(BASIC, { bridge: [0, 0] }));
    r.correct();
    r.target(1, 0);
    expect(types(r.tick(balance.rules.meltStartAnswers * 5000 - 100))).not.toContain('MELT_WARN');
    const ev = r.tick(200);
    const warn = ev.find((e) => e.type === 'MELT_WARN');
    expect(warn).toBeTruthy();
    if (warn?.type !== 'MELT_WARN') return;
    expect(warn.cell).not.toBe(r.s.hero.cell);
    expect([at(r.s.grid, 2, 0), at(r.s.grid, 1, 1), at(r.s.grid, 0, 0)]).not.toContain(warn.cell);
    expect(warn.sinkAt).toBe(balance.rules.meltStartAnswers * 5000 + Math.max(5000, 3000));
  });

  it('намокшая льдина тонет в срок; рыба с неё уплывает', () => {
    const s0 = stateFrom(BASIC, { fish: [[4, 4]] });
    const cell = at(s0.grid, 4, 4);
    const s = { ...s0, sinkAt: s0.sinkAt.map((v, i) => (i === cell ? 1000 : v)), wetStart: s0.wetStart.map((v, i) => (i === cell ? 0 : v)) };
    const r = new Runner(s).noMelt();
    const ev = r.tick(1100);
    expect(types(ev)).toEqual(expect.arrayContaining(['MELT_SUNK', 'FISH_LOST']));
    expect(r.s.grid.cells[cell]).toBe('water');
    expect(r.s.fish[0].status).toBe('lost');
  });

  it('если на тонущей льдине герой — это падение, и он на обломке в той же клетке', () => {
    const r = new Runner(stateFrom(BASIC)).noMelt();
    r.correct();
    r.target(1, 1);
    const cell = r.s.hero.cell;
    r.s = { ...r.s, sinkAt: r.s.sinkAt.map((v, i) => (i === cell ? r.s.time + 500 : v)) };
    const ev = r.tick(600);
    expect(ev.find((e) => e.type === 'FELL')).toMatchObject({ cause: 'melt', warmthLeft: 2 });
    expect(r.s.grid.cells[cell]).toBe('thin');
    expect(r.s.debris[cell]).toBe(true);
  });

  it('льдины с рыбой не тают, пока сила ледохода меньше 0.5', () => {
    // Единственный кандидат вне досягаемости — льдина с рыбой.
    const rows = ['# # #', '. ~ .', '= = ='];
    const r = new Runner(stateFrom(rows, { bridge: [0, 1], fish: [[1, 0]] }));
    // С мостков (0,1) досягаемы (1,1)? это вода — длинный прыжок на (2,1) берег. (1,0) и (1,2) — не соседи мостков.
    const strength05 = (balance.rules.meltStartAnswers + 0.5 * balance.rules.meltRampAnswers) * 5000;
    const before = r.tick(strength05 - 1000, 500).filter((e) => e.type === 'MELT_WARN');
    expect(before.every((e) => e.type === 'MELT_WARN' && e.cell !== at(r.s.grid, 1, 0))).toBe(true);
  });

  it('честность: таяние не выбирает льдину, без которой пропадает честный маршрут', () => {
    // Единственный путь к берегу идёт через (2,1): её таяние запрещено.
    const rows = ['# # #', '~ . ~', '~ . ~', '. . .', '= = ='];
    const r = new Runner(stateFrom(rows, { bridge: [0, 0] }));
    r.correct();
    r.target(1, 0);
    const ev = r.tick(200000, 500);
    const melted = ev.filter((e) => e.type === 'MELT_WARN').map((e) => (e.type === 'MELT_WARN' ? e.cell : -1));
    expect(melted).not.toContain(at(r.s.grid, 2, 1));
    expect(melted).not.toContain(at(r.s.grid, 3, 1));
  });
});

describe('пауза и время (2.7)', () => {
  it('на паузе стоят таймеры льдин и таяние', () => {
    const r = new Runner(stateFrom(BASIC));
    r.correct();
    r.target(1, 1);
    r.do({ type: 'PAUSE' });
    const t = r.s.time;
    expect(r.tick(60000, 1000)).toEqual([]);
    expect(r.s.time).toBe(t);
    expect(types(r.correct())).toEqual([]);
    r.do({ type: 'RESUME' });
    r.tick(1000);
    expect(r.s.time).toBe(t + 1000);
  });

  it('шаг кадра ограничен 100 мс', () => {
    expect(clampFrameDt(5000)).toBe(balance.rules.maxFrameDtMs);
    expect(clampFrameDt(16)).toBe(16);
    expect(clampFrameDt(-5)).toBe(0);
  });

  it('детерминизм: одинаковые сид и журнал действий — одинаковый итог', () => {
    const run = () => {
      let s = stateFrom(BASIC, { seed: 77, fish: [[3, 3]] });
      const log = [
        { type: 'ANSWER', correct: true, timeMs: 3000 },
        { type: 'SET_TARGET', cell: 6 },
        { type: 'TICK', dt: 4000 },
        { type: 'ANSWER', correct: false, timeMs: 3000 },
        { type: 'TICK', dt: 30000 },
        { type: 'ANSWER', correct: true, timeMs: 3000 },
        { type: 'SET_TARGET', cell: 18 },
        { type: 'TICK', dt: 30000 },
      ] as const;
      for (const a of log) s = reduce(s, a).state;
      return s;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('честность таяния на 10 000 событий (этап 1)', () => {
  it('после каждого MELT_WARN от героя остаётся честный маршрут к берегу', async () => {
    const { generateLevel } = await import('../src/core/levelGen');
    const { createState } = await import('../src/core/state');
    const { mulberry32 } = await import('../src/core/rng');
    const { jumpTargets } = await import('../src/core/jumps');
    let warns = 0;
    let round = 0;
    while (warns < 10000) {
      round++;
      const level = levels[round % levels.length];
      const gen = generateLevel(level, round * 31 + 7, PACE.tMedMs);
      let s = createState(level, gen, PACE, round);
      const rng = mulberry32(round * 977);
      for (let step = 0; step < 4000 && s.status === 'playing'; step++) {
        const roll = rng();
        let action;
        if (roll < 0.55) action = { type: 'TICK' as const, dt: 50 + rng() * 900 };
        else if (roll < 0.85) action = { type: 'ANSWER' as const, correct: rng() < 0.8, timeMs: 4000 };
        else {
          const opts = jumpTargets(s.grid, s.hero.cell);
          const pick = opts[Math.floor(rng() * opts.length)];
          action = pick ? { type: 'SET_TARGET' as const, cell: pick.to } : { type: 'CANCEL_TARGET' as const };
        }
        const r = reduce(s, action);
        s = r.state;
        for (const e of r.events) {
          if (e.type !== 'MELT_WARN') continue;
          warns++;
          expect(hasFairRoute(gridWithWetSunk(s), s.hero.cell, s.level, s.pace)).toBe(true);
        }
      }
    }
    expect(warns).toBeGreaterThanOrEqual(10000);
  }, 240000);
});

describe('уровни конфигурации', () => {
  it('семь уровней, числа из таблицы раздела 4', () => {
    expect(levels.map((l) => l.rows)).toEqual([5, 5, 6, 6, 7, 7, 7]);
    expect(levels.map((l) => l.length)).toEqual([7, 7, 7, 9, 9, 9, 9]);
    expect(levels.map((l) => l.hints)).toEqual(['risk', 'risk', 'risk', 'risk', 'route', 'route', 'none']);
  });
});
