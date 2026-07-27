export const GOLDEN_CONFIG = Object.freeze({
  DB_BINDING: "DB",

  // Chỉ cần sửa 2 dòng dưới nếu schema dữ liệu kết quả của V2.6.2 khác.
  RESULTS_TABLE: "results",
  DATE_COLUMN: "draw_date",

  RESULT_COLUMNS: [
    "special",
    "g1",
    "g2",
    "g3",
    "g4",
    "g5",
    "g6",
    "g7",
  ],

  HISTORY_DRAWS: 200,
  MAX_BACKTEST_DRAWS: 60,
  DEFAULT_PERFORMANCE_LIMIT: 20,

  GAN_SUPER_COLD_LIMIT: 120,

  MAIN10_RATIO: Object.freeze({
    golden: 3,
    gan: 2,
    explosion: 2,
    headTail: 2,
    support: 1,
  }),

  WEIGHTS: Object.freeze({
    freq7: 0.12,
    freq30: 0.18,
    cycle: 0.15,
    gap: 0.12,
    reverseFreq30: 0.10,
    reverseGap: 0.10,
    headHot: 0.08,
    tailHot: 0.08,
    returnSignal: 0.07,
  }),

  MODEL_VERSION: "Golden-MultiFactor-v1",
});
