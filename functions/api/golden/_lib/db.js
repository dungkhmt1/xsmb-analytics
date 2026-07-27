import { GOLDEN_CONFIG } from "./config.js";

export function getDb(env) {
  const db = env?.[GOLDEN_CONFIG.DB_BINDING];

  if (!db || typeof db.prepare !== "function") {
    throw new Error(
      `Không tìm thấy D1 binding "${GOLDEN_CONFIG.DB_BINDING}". ` +
      `Kiểm tra Cloudflare Pages > Settings > Bindings.`,
    );
  }

  return db;
}

function safeIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Tên bảng/cột không hợp lệ: ${identifier}`);
  }
  return `"${identifier}"`;
}

export async function loadDraws(db, limit = GOLDEN_CONFIG.HISTORY_DRAWS) {
  const table = safeIdentifier(GOLDEN_CONFIG.RESULTS_TABLE);
  const dateColumn = safeIdentifier(GOLDEN_CONFIG.DATE_COLUMN);
  const columns = GOLDEN_CONFIG.RESULT_COLUMNS.map(safeIdentifier).join(", ");

  const sql = `
    SELECT ${dateColumn} AS draw_date, ${columns}
    FROM ${table}
    WHERE ${dateColumn} IS NOT NULL
    ORDER BY ${dateColumn} DESC
    LIMIT ?
  `;

  const result = await db.prepare(sql).bind(limit).all();
  const rows = Array.isArray(result?.results) ? result.results : [];

  // Engine cần thứ tự cũ -> mới.
  return rows.reverse();
}

export async function loadDrawByDate(db, drawDate) {
  const table = safeIdentifier(GOLDEN_CONFIG.RESULTS_TABLE);
  const dateColumn = safeIdentifier(GOLDEN_CONFIG.DATE_COLUMN);
  const columns = GOLDEN_CONFIG.RESULT_COLUMNS.map(safeIdentifier).join(", ");

  return db
    .prepare(
      `SELECT ${dateColumn} AS draw_date, ${columns}
       FROM ${table}
       WHERE ${dateColumn} = ?
       LIMIT 1`,
    )
    .bind(drawDate)
    .first();
}

export async function getPrediction(db, predictionDate) {
  return db
    .prepare(
      `SELECT *
       FROM golden_predictions
       WHERE prediction_date = ?
       LIMIT 1`,
    )
    .bind(predictionDate)
    .first();
}

export async function savePrediction(db, prediction) {
  await db
    .prepare(
      `INSERT INTO golden_predictions (
        prediction_date,
        source_latest_date,
        number_1,
        number_2,
        pair_score,
        main10_json,
        details_json,
        model_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(prediction_date) DO NOTHING`,
    )
    .bind(
      prediction.predictionDate,
      prediction.sourceLatestDate,
      prediction.songThu[0],
      prediction.songThu[1],
      prediction.pairScore,
      JSON.stringify(prediction.main10),
      JSON.stringify(prediction.details),
      prediction.modelVersion,
    )
    .run();

  return getPrediction(db, prediction.predictionDate);
}

export async function saveEvaluation(db, evaluation) {
  await db
    .prepare(
      `INSERT INTO golden_evaluations (
        prediction_date,
        hit,
        hit_number,
        actual_numbers_json
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(prediction_date) DO UPDATE SET
        hit = excluded.hit,
        hit_number = excluded.hit_number,
        actual_numbers_json = excluded.actual_numbers_json,
        evaluated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      evaluation.predictionDate,
      evaluation.hit ? 1 : 0,
      evaluation.hitNumber ?? null,
      JSON.stringify(evaluation.actualNumbers),
    )
    .run();
}

export async function listPredictionHistory(db, limit) {
  const result = await db
    .prepare(
      `SELECT
        p.prediction_date,
        p.source_latest_date,
        p.number_1,
        p.number_2,
        p.pair_score,
        p.model_version,
        p.created_at,
        e.hit,
        e.hit_number,
        e.evaluated_at
       FROM golden_predictions p
       LEFT JOIN golden_evaluations e
         ON e.prediction_date = p.prediction_date
       ORDER BY p.prediction_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all();

  return result?.results ?? [];
}
