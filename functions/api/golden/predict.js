import { GOLDEN_CONFIG } from "./_lib/config.js";
import {
  getDb,
  loadDraws,
  getPrediction,
  savePrediction,
} from "./_lib/db.js";
import { analyzeDraws } from "./_lib/engine.js";
import { chooseBestPair } from "./_lib/pairs.js";
import { dateAddDays } from "./_lib/parser.js";
import { json, errorJson } from "./_lib/response.js";

async function buildPrediction(db, predictionDate) {
  const draws = await loadDraws(db, GOLDEN_CONFIG.HISTORY_DRAWS);
  if (!draws.length) throw new Error("Database chưa có dữ liệu XSMB.");

  const latest = draws.at(-1);
  const targetDate =
    predictionDate || dateAddDays(latest.draw_date, 1);

  const existing = await getPrediction(db, targetDate);
  if (existing) {
    return {
      existed: true,
      row: existing,
    };
  }

  const analysis = analyzeDraws(draws);
  const pair = chooseBestPair(
    analysis.main10,
    analysis.allNumbers,
  );

  if (!pair.best) {
    throw new Error("Không tạo được song thủ từ dàn 10.");
  }

  const prediction = {
    predictionDate: targetDate,
    sourceLatestDate: latest.draw_date,
    songThu: pair.best.numbers,
    pairScore: Number(pair.best.pairScore.toFixed(2)),
    main10: analysis.main10,
    details: analysis.details,
    modelVersion: GOLDEN_CONFIG.MODEL_VERSION,
  };

  const row = await savePrediction(db, prediction);

  return {
    existed: false,
    row,
    analysis: prediction,
  };
}

export async function onRequestPost(context) {
  try {
    const db = getDb(context.env);

    let body = {};
    try {
      body = await context.request.json();
    } catch {
      body = {};
    }

    const result = await buildPrediction(
      db,
      body?.predictionDate || null,
    );

    if (result.existed) {
      return json({
        success: true,
        locked: true,
        message: "Dự đoán ngày này đã tồn tại và không bị ghi đè.",
        prediction: normalizePredictionRow(result.row),
      });
    }

    return json({
      success: true,
      locked: true,
      prediction: result.analysis,
    });
  } catch (error) {
    return errorJson(error?.message || "Không tạo được dự đoán.", 500);
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const predictionDate = url.searchParams.get("date");
    const db = getDb(context.env);

    if (!predictionDate) {
      return errorJson("Thiếu query ?date=YYYY-MM-DD", 400);
    }

    const row = await getPrediction(db, predictionDate);

    if (!row) {
      return errorJson("Chưa có dự đoán cho ngày này.", 404);
    }

    return json({
      success: true,
      prediction: normalizePredictionRow(row),
    });
  } catch (error) {
    return errorJson(error?.message || "Lỗi đọc dự đoán.", 500);
  }
}

function normalizePredictionRow(row) {
  return {
    predictionDate: row.prediction_date,
    sourceLatestDate: row.source_latest_date,
    songThu: [row.number_1, row.number_2],
    pairScore: row.pair_score,
    main10: JSON.parse(row.main10_json || "[]"),
    details: JSON.parse(row.details_json || "[]"),
    modelVersion: row.model_version,
    createdAt: row.created_at,
  };
}
