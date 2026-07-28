import { V2_CONFIG } from "./config.js";

function safeIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Tên bảng/cột không hợp lệ: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function getDb(env) {
  const db = env?.[V2_CONFIG.DB_BINDING];
  if (!db || typeof db.prepare !== "function") {
    throw new Error(
      `Không tìm thấy D1 binding "${V2_CONFIG.DB_BINDING}".`,
    );
  }
  return db;
}

export async function loadDraws(db, limit = V2_CONFIG.HISTORY_DRAWS) {
  const table = safeIdentifier(V2_CONFIG.RESULTS_TABLE);
  const dateCol = safeIdentifier(V2_CONFIG.DATE_COLUMN);
  const cols = V2_CONFIG.RESULT_COLUMNS.map(safeIdentifier).join(", ");

  const result = await db.prepare(`
    SELECT ${dateCol} AS draw_date, ${cols}
    FROM ${table}
    WHERE ${dateCol} IS NOT NULL
    ORDER BY ${dateCol} DESC
    LIMIT ?
  `).bind(limit).all();

  return (result?.results ?? []).reverse();
}

export async function loadDrawByDate(db, date) {
  const table = safeIdentifier(V2_CONFIG.RESULTS_TABLE);
  const dateCol = safeIdentifier(V2_CONFIG.DATE_COLUMN);
  const cols = V2_CONFIG.RESULT_COLUMNS.map(safeIdentifier).join(", ");

  return db.prepare(`
    SELECT ${dateCol} AS draw_date, ${cols}
    FROM ${table}
    WHERE ${dateCol} = ?
    LIMIT 1
  `).bind(date).first();
}

export async function getV2Prediction(db, date) {
  return db.prepare(`
    SELECT *
    FROM golden_v2_predictions
    WHERE prediction_date = ?
    LIMIT 1
  `).bind(date).first();
}

export async function saveV2Prediction(db, p) {
  await db.prepare(`
    INSERT INTO golden_v2_predictions (
      prediction_date,
      source_latest_date,
      number_1,
      number_2,
      pair_score,
      main10_json,
      model_weights_json,
      details_json,
      model_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prediction_date) DO NOTHING
  `).bind(
    p.predictionDate,
    p.sourceLatestDate,
    p.songThu[0],
    p.songThu[1],
    p.pairScore,
    JSON.stringify(p.main10),
    JSON.stringify(p.modelWeights),
    JSON.stringify(p.details),
    p.modelVersion,
  ).run();

  return getV2Prediction(db, p.predictionDate);
}

export async function listV2History(db, limit = 20) {
  const result = await db.prepare(`
    SELECT
      p.prediction_date,
      p.source_latest_date,
      p.number_1,
      p.number_2,
      p.pair_score,
      p.main10_json,
      p.model_weights_json,
      p.model_version,
      p.created_at,
      e.hit,
      e.hit_number,
      e.evaluated_at
    FROM golden_v2_predictions p
    LEFT JOIN golden_v2_evaluations e
      ON e.prediction_date = p.prediction_date
    ORDER BY p.prediction_date DESC
    LIMIT ?
  `).bind(limit).all();

  return result?.results ?? [];
}

export async function saveV2Evaluation(db, e) {
  await db.prepare(`
    INSERT INTO golden_v2_evaluations (
      prediction_date,
      hit,
      hit_number,
      actual_numbers_json
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(prediction_date) DO UPDATE SET
      hit = excluded.hit,
      hit_number = excluded.hit_number,
      actual_numbers_json = excluded.actual_numbers_json,
      evaluated_at = CURRENT_TIMESTAMP
  `).bind(
    e.predictionDate,
    e.hit ? 1 : 0,
    e.hitNumber ?? null,
    JSON.stringify(e.actualNumbers),
  ).run();
}
