import { GOLDEN_CONFIG } from "./_lib/config.js";
import { getDb, loadDraws } from "./_lib/db.js";
import { analyzeDraws } from "./_lib/engine.js";
import { chooseBestPair } from "./_lib/pairs.js";
import { extractLotoNumbers } from "./_lib/parser.js";
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
      GOLDEN_CONFIG.MAX_BACKTEST_DRAWS,
    );

    const draws = await loadDraws(
      db,
      Math.min(
        GOLDEN_CONFIG.HISTORY_DRAWS,
        limit + 80,
      ),
    );

    if (draws.length < 30) {
      return errorJson(
        "Cần tối thiểu 30 kỳ dữ liệu để backtest.",
        400,
      );
    }

    const startIndex = Math.max(
      10,
      draws.length - limit,
    );

    const rows = [];

    for (let targetIndex = startIndex; targetIndex < draws.length; targetIndex += 1) {
      // Chống leakage: không bao gồm target draw.
      const training = draws.slice(
        0,
        targetIndex,
      );

      const analysis = analyzeDraws(training);
      const pair = chooseBestPair(
        analysis.main10,
        analysis.allNumbers,
      );

      if (!pair.best) continue;

      const actualNumbers = extractLotoNumbers(
        draws[targetIndex],
        GOLDEN_CONFIG.RESULT_COLUMNS,
      );

      const hitNumber =
        pair.best.numbers.find((n) =>
          actualNumbers.includes(n),
        ) ?? null;

      rows.push({
        predictionDate: draws[targetIndex].draw_date,
        songThu: pair.best.numbers,
        pairScore: Number(
          pair.best.pairScore.toFixed(2),
        ),
        hit: Boolean(hitNumber),
        hitNumber,
      });
    }

    const hits = rows.filter((x) => x.hit).length;

    return json({
      success: true,
      methodology: "walk-forward",
      testedDraws: rows.length,
      hits,
      hitRate:
        rows.length === 0
          ? 0
          : Number(((hits / rows.length) * 100).toFixed(2)),
      rows: rows.reverse(),
      warning:
        "Backtest là thống kê quá khứ; điểm ranking không phải xác suất tương lai.",
    });
  } catch (error) {
    return errorJson(
      error?.message || "Backtest thất bại.",
      500,
    );
  }
}
