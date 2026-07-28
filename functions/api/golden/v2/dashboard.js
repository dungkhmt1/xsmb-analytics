import { V2_CONFIG } from "./config.js";
import {
  getDb,
  loadDraws,
  loadDrawByDate,
  listV2History,
  saveV2Evaluation,
} from "./data.js";
import { drawLoto } from "./features.js";
import { runGoldenV2 } from "./engine.js";
import { json, fail } from "./response.js";

async function evaluatePending(db, rows) {
  for (const row of rows) {
    if (row.hit != null) continue;

    const draw = await loadDrawByDate(db, row.prediction_date);
    if (!draw) continue;

    const actual = drawLoto(draw);
    const hitNumber =
      [row.number_1, row.number_2].find((n) => actual.includes(n)) ?? null;

    await saveV2Evaluation(db, {
      predictionDate: row.prediction_date,
      hit: Boolean(hitNumber),
      hitNumber,
      actualNumbers: actual,
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
      evaluated.length
        ? Number(((hits / evaluated.length) * 100).toFixed(1))
        : 0,
  };
}

export async function onRequestGet(context) {
  try {
    const db = getDb(context.env);
    const draws = await loadDraws(db, V2_CONFIG.HISTORY_DRAWS);

    const result = runGoldenV2(draws);

    let history = await listV2History(db, 20);
    await evaluatePending(db, history);
    history = await listV2History(db, 20);

    return json({
      success: true,
      ...result,
      performance: performance(history),
      history: history.map((row) => ({
        predictionDate: row.prediction_date,
        songThu: [row.number_1, row.number_2],
        pairScore: row.pair_score,
        evaluated: row.hit != null,
        hit: row.hit === 1,
        hitNumber: row.hit_number,
      })),
      warning:
        "Golden V2 là hệ thống xếp hạng thống kê. Score không phải xác suất.",
    });
  } catch (error) {
    return fail(error?.message || "Golden V2 dashboard lỗi.", 500);
  }
}
