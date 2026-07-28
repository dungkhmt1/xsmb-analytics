import { getDb, listV2History } from "./data.js";
import { json, fail, positiveInt } from "./response.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const limit = positiveInt(url.searchParams.get("limit"), 20, 100);
    const db = getDb(context.env);
    const rows = await listV2History(db, limit);

    return json({
      success: true,
      rows: rows.map((row) => ({
        predictionDate: row.prediction_date,
        sourceLatestDate: row.source_latest_date,
        songThu: [row.number_1, row.number_2],
        pairScore: row.pair_score,
        main10: JSON.parse(row.main10_json || "[]"),
        modelWeights: JSON.parse(row.model_weights_json || "{}"),
        evaluated: row.hit != null,
        hit: row.hit === 1,
        hitNumber: row.hit_number,
      })),
    });
  } catch (error) {
    return fail(error?.message || "Không tải được lịch sử V2.", 500);
  }
}
