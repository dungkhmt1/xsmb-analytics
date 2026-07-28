import { V2_CONFIG } from "./config.js";
import {
  getDb,
  loadDraws,
  getV2Prediction,
  saveV2Prediction,
} from "./data.js";
import { runGoldenV2 } from "./engine.js";
import { json, fail } from "./response.js";

function normalizeRow(row) {
  return {
    predictionDate: row.prediction_date,
    sourceLatestDate: row.source_latest_date,
    songThu: [row.number_1, row.number_2],
    pairScore: row.pair_score,
    main10: JSON.parse(row.main10_json || "[]"),
    modelWeights: JSON.parse(row.model_weights_json || "{}"),
    details: JSON.parse(row.details_json || "[]"),
    modelVersion: row.model_version,
    createdAt: row.created_at,
  };
}

export async function onRequestPost(context) {
  try {
    const db = getDb(context.env);

    let body = {};
    try {
      body = await context.request.json();
    } catch {}

    const draws = await loadDraws(db, V2_CONFIG.HISTORY_DRAWS);
    const result = runGoldenV2(draws, body?.predictionDate || null);

    const existing = await getV2Prediction(db, result.predictionDate);
    if (existing) {
      return json({
        success: true,
        locked: true,
        existed: true,
        prediction: normalizeRow(existing),
      });
    }

    const row = await saveV2Prediction(db, result);

    return json({
      success: true,
      locked: true,
      existed: false,
      prediction: normalizeRow(row),
    });
  } catch (error) {
    return fail(error?.message || "Không khóa được Golden V2.", 500);
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const date = url.searchParams.get("date");
    if (!date) return fail("Thiếu ?date=YYYY-MM-DD", 400);

    const db = getDb(context.env);
    const row = await getV2Prediction(db, date);

    if (!row) return fail("Chưa có prediction V2 ngày này.", 404);

    return json({
      success: true,
      prediction: normalizeRow(row),
    });
  } catch (error) {
    return fail(error?.message || "Lỗi đọc Golden V2 prediction.", 500);
  }
}
