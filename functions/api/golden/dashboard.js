import { GOLDEN_CONFIG } from "./_lib/config.js";
import {
  getDb,
  loadDraws,
  loadDrawByDate,
  listPredictionHistory,
  saveEvaluation,
} from "./_lib/db.js";
import { extractLotoNumbers } from "./_lib/parser.js";
import { analyzeDraws } from "./_lib/engine.js";
import { chooseBestPair } from "./_lib/pairs.js";
import { json, errorJson } from "./_lib/response.js";

async function evaluatePending(db, historyRows) {
  for (const row of historyRows) {
    if (row.hit != null) continue;

    const actualDraw = await loadDrawByDate(
      db,
      row.prediction_date,
    );
    if (!actualDraw) continue;

    const actualNumbers = extractLotoNumbers(
      actualDraw,
      GOLDEN_CONFIG.RESULT_COLUMNS,
    );

    const hit1 = actualNumbers.includes(row.number_1);
    const hit2 = actualNumbers.includes(row.number_2);

    await saveEvaluation(db, {
      predictionDate: row.prediction_date,
      hit: hit1 || hit2,
      hitNumber: hit1
        ? row.number_1
        : hit2
          ? row.number_2
          : null,
      actualNumbers,
    });
  }
}

function performance(rows) {
  const evaluated = rows.filter((x) => x.hit != null);
  const hits = evaluated.filter((x) => x.hit === 1).length;

  return {
    tracked: evaluated.length,
    hits,
    rate:
      evaluated.length === 0
        ? 0
        : Number(((hits / evaluated.length) * 100).toFixed(1)),
  };
}

export async function onRequestGet(context) {
  try {
    const db = getDb(context.env);
    const draws = await loadDraws(
      db,
      GOLDEN_CONFIG.HISTORY_DRAWS,
    );

    if (!draws.length) {
      return errorJson("Database chưa có dữ liệu XSMB.", 404);
    }

    const latest = draws.at(-1);
    const analysis = analyzeDraws(draws);
    const pair = chooseBestPair(
      analysis.main10,
      analysis.allNumbers,
    );

    let history = await listPredictionHistory(
      db,
      GOLDEN_CONFIG.DEFAULT_PERFORMANCE_LIMIT,
    );

    await evaluatePending(db, history);

    // Đọc lại sau khi auto-evaluate.
    history = await listPredictionHistory(
      db,
      GOLDEN_CONFIG.DEFAULT_PERFORMANCE_LIMIT,
    );

    return json({
      success: true,
      modelVersion: GOLDEN_CONFIG.MODEL_VERSION,
      latestDataDate: latest.draw_date,
      main10: analysis.main10,
      details: analysis.details,
      songThu: pair.best
        ? {
            numbers: pair.best.numbers,
            pairScore: Number(
              pair.best.pairScore.toFixed(2),
            ),
            note: "Điểm xếp hạng, không phải xác suất.",
          }
        : null,
      performance: performance(history),
      history: history.map((row) => ({
        predictionDate: row.prediction_date,
        songThu: [row.number_1, row.number_2],
        pairScore: row.pair_score,
        evaluated: row.hit != null,
        hit: row.hit === 1,
        hitNumber: row.hit_number,
      })),
    });
  } catch (error) {
    return errorJson(
      error?.message || "Không tải được Golden Dashboard.",
      500,
    );
  }
}
