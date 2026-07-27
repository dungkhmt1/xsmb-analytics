import { getDb, listPredictionHistory } from "./_lib/db.js";
import {
  json,
  errorJson,
  getPositiveInt,
} from "./_lib/response.js";

export async function onRequestGet(context) {
  try {
    const db = getDb(context.env);
    const url = new URL(context.request.url);
    const limit = getPositiveInt(
      url.searchParams.get("limit"),
      20,
      100,
    );

    const rows = await listPredictionHistory(db, limit);

    return json({
      success: true,
      total: rows.length,
      rows: rows.map((row) => ({
        predictionDate: row.prediction_date,
        sourceLatestDate: row.source_latest_date,
        songThu: [row.number_1, row.number_2],
        pairScore: row.pair_score,
        modelVersion: row.model_version,
        createdAt: row.created_at,
        evaluated: row.hit != null,
        hit: row.hit === 1,
        hitNumber: row.hit_number,
        evaluatedAt: row.evaluated_at,
      })),
    });
  } catch (error) {
    return errorJson(error?.message || "Không tải được lịch sử.", 500);
  }
}
