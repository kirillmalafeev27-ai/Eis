/**
 * Все числа баланса и тайминги «Льдин» (разделы 2–4, 8–11, 13). В сценах магических чисел нет:
 * если число влияет на правила, время игрока или ощущение от события — оно живёт здесь.
 */
export const balance = {
  /** Общие для всех уровней значения правил (раздел 4.1). */
  rules: {
    warmth: 3,
    floeGraceMs: 1000,
    meltStartAnswers: 3,
    meltRampAnswers: 24,
    meltWarnAnswers: 1.0,
    /** Намокание длится не меньше 3 с (2.4.5). */
    meltWarnMinMs: 3000,
    wrongFeedbackMs: 1000,
    riskBlue: 0.35,
    riskRed: 0.65,
    penaltyOrange: 0.5,
    penaltyRed: 2,
    /** Стадии трещин — доли таймера льдины (2.3.2). */
    crackStages: [0.25, 0.5, 0.75] as readonly number[],
    /** На 90% льдина раскалывается на куски. */
    splitAt: 0.9,
    /** Последние секунды льдины с отсчётом DREI! ZWEI! EINS! */
    countdownFromMs: 3000,
    /** Рыба становится кандидатом на таяние с этой силы ледохода (2.4.3). */
    fishMeltStrength: 0.5,
    /** Тонкие льдины выбираются таянием вдвое чаще толстых. */
    meltWeightThin: 2,
    meltWeightThick: 1,
    /** Шаг времени кадра ограничен (2.7.3). */
    maxFrameDtMs: 100,
    /** Победа «KNAPP!» — если льдине оставалось меньше этого. */
    knappMs: 1500,
  },

  /** Темп игрока (раздел 3). */
  pace: {
    timeWindow: 20,
    accuracyWindow: 30,
    defaultTmedMs: 5000,
    minTmedMs: 3000,
    maxTmedMs: 10000,
    defaultP: 0.8,
    minP: 0.5,
    maxP: 1,
  },

  /** Генерация уровня (раздел 5). */
  gen: {
    maxWaterRun: 3,
    minFloesPerRow: 2,
    maxJumpsToThick: 3,
    fishCount: 3,
    /** Рыба кладётся начиная со второго ряда льда. */
    fishMinRow: 2,
    /** Хотя бы одна рыба — в стольких клетках от кратчайшей переправы. */
    fishOffRoute: 2,
    /** Дилемма: маршрут через рыб длиннее переправы минимум на столько зарядов. */
    dilemmaCharges: 3,
    solverP: 0.8,
    solverBudget: 200_000,
    attempts: 50,
  },

  /** Вопросы и панель (разделы 2.7, 11.2, 12). */
  questions: {
    doubleTapGuardMs: 120,
    correctGlowMs: 150,
    flipMs: 150,
    noRepeatWithin: 10,
    retryWrongMin: 4,
    retryWrongMax: 6,
    fontMaxPx: 24,
    fontMinPx: 16,
    /** Генерация заданий через ИИ (движок Morskoy): блок по теме, как в Morskoy. */
    aiBatch: 10,
    /** Новый блок запрашивается, когда в очереди темы остаётся столько заданий. */
    aiRefillAt: 5,
    /** Первый вопрос после выбора тем: сколько раунд ждёт генерацию, потом — встроенный набор. */
    aiFirstWaitMs: 45_000,
    /** Очередь пуста посреди игры: короткое ожидание, затем вопрос из встроенного набора. */
    aiNextWaitMs: 1500,
    aiRequestTimeoutMs: 180_000,
  },

  /** Модель ответа для калибровки риска и ботов (2.8, 14.2). */
  answerModel: {
    sigma: 0.5,
    wrongShowMs: 1000,
    switchMs: 300,
  },

  /** Тайминги анимаций мира: ни одна не задерживает правила (0.5, 9.1). */
  anim: {
    /** Позы героя и рыб сменяются «на двойках». */
    posesPerSecond: 12,
    jumpMs: 220,
    longJumpMs: 320,
    crouchFrames: 2,
    floeSinkMs: 300,
    fallClimbMs: 400,
    splitDriftPx: 10,
    landSquash: 0.82,
    hitStopMs: 60,
    punchZoom: 1.03,
    punchMs: 160,
    shakeThinPx: 1,
    shakeFallPx: 6,
    shakeMs: 180,
    meltSinkMs: 700,
    wetSagPx: 3,
    maxWords: 3,
    wordLifeMs: 900,
    wordRisePx: 34,
    /** Слово не закрывает героя и соседей дольше 200 мс (7.7.6). */
    wordCoverMs: 200,
    zappelMinGapMs: 6000,
    fishFlopMinMs: 2000,
    fishFlopMaxMs: 4000,
    crowMinGapMs: 20000,
    crowMaxGapMs: 34000,
    crowFlightMs: 3800,
    rumbleFromStrength: 0.4,
    rumbleMinMs: 15000,
    rumbleMaxMs: 25000,
    introMs: 2500,
    finaleMaxMs: 2000,
    hopFloePx: 6,
    reachLiftPx: 5,
    floeBobPx: 1.6,
    floeBobThickPx: 0.7,
    floeBobMs: 2400,
    deniedFlashMs: 260,
    flashMaxPerSecond: 3,
    fishFlyMs: 620,
    resultCardDelayMs: 220,
    countMs: 260,
  },

  /** Свет и цвет (раздел 8). */
  light: {
    shadowLenMin: 0.12,
    shadowLenMax: 0.45,
    shadowAlphaMin: 0.22,
    shadowAlphaMax: 0.35,
    /** Угол солнца (экранный, радианы от +x по часовой): сверху слева → низко слева. */
    sunAngleDay: -2.2,
    sunAngleDusk: -2.95,
    windowGlowMin: 0.35,
    windowGlowMax: 1.0,
    /** Виньетка Phaser 4: внутри радиуса доля цвета = sin(d/r · π · сила), за радиусом — 1. */
    vignetteRadius: 0.86,
    vignetteStrengthDay: 0.1,
    vignetteStrengthDusk: 0.17,
    glintCount: 26,
    glintCountLow: 12,
  },

  /** Течение (7.5.1): скорость слоёв воды в клетках в секунду при силе 0 и 1. */
  water: {
    speedMin: 0.06,
    speedMax: 0.42,
    layerSpeeds: [0.55, 1, 1.6] as readonly number[],
    floatingBits: 14,
    floatingBitsLow: 7,
  },

  /** Звук (раздел 10). */
  audio: {
    pitchJitter: 0.05,
    duckOnCrack: 0.7,
    sfxDefault: 0.8,
    ambientDefault: 0.55,
  },

  /** Раскладка (раздел 11.1) и чёткость (13.5). */
  layout: {
    portraitQuestionShare: 0.42,
    portraitQuestionMin: 300,
    portraitQuestionMax: 420,
    landscapeQuestionShare: 0.34,
    landscapeQuestionMin: 340,
    landscapeQuestionMax: 480,
    landscapeRatio: 1.2,
    gap: 12,
    minCellCss: 36,
    maxDpr: 2,
    /** Виртуальные единицы мира: пикселей на клетку. */
    cellPx: 128,
    cellPxLow: 96,
    /** Поля мира вокруг сетки: за дальним берегом стоят избушка и сосны. */
    marginFar: 1.15,
    marginNear: 0.55,
    marginSide: 0.18,
  },

  /** Качество (13.6). */
  quality: {
    lowFpsThreshold: 45,
    lowFpsSeconds: 3,
    maxParticles: 200,
    textureBudgetMs: 1500,
  },

  /** Обучение при первом запуске (11.5.7). */
  tutorial: {
    bubbleMinMs: 900,
  },
} as const;

export type Balance = typeof balance;
