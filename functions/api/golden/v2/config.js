export const V2_CONFIG = Object.freeze({
  DB_BINDING: "DB",
  RESULTS_TABLE: "results",
  DATE_COLUMN: "draw_date",

  RESULT_COLUMNS: [
    "special", "g1", "g2", "g3", "g4", "g5", "g6", "g7",
  ],

  HISTORY_DRAWS: 180,
  MIN_TRAIN_DRAWS: 30,

  // Giữ nhỏ để tránh Worker CPU limit.
  ENSEMBLE_CALIBRATION_DRAWS: 12,
  MAX_BACKTEST_DRAWS: 30,

  WINDOWS: [5, 10, 20, 30, 60, 90],

  MODEL_VERSION: "Golden-Ensemble-v2",

  // Không phải xác suất; chỉ dùng scale ranking.
  PAIR_SCORE_MAX: 500,
});
