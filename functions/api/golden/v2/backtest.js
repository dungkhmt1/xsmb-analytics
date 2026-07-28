import { V2_CONFIG } from "./config.js";
import { getDb, loadDraws } from "./data.js";
import { drawLoto } from "./features.js";
import { runGoldenV2 } from "./engine.js";
import { json, fail, positiveInt } from "./response.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const limit = positiveInt(
      url.searchParams.get("limit"),
      10,
      V2_CONFIG.MAX_BACKTEST_DRAWS,
    );

    const db = getDb(context.env);

    // Cần thêm lịch sử để train từng bước.
    const draws = await loadDraws(
      db,
      Math.min(
        V2_CONFIG.HISTORY_DRAWS,
        limit + V2_CONFIG.MIN_TRAIN_DRAWS + 35,
      ),
    );

    if (draws.length < V2_CONFIG.MIN_TRAIN_DRAWS + 1) {
      return fail("Chưa đủ dữ liệu để backtest V2.", 400);
    }

    const start = Math.max(
      V2_CONFIG.MIN_TRAIN_DRAWS,
      draws.length - limit,
    );

    const rows = [];

    for (let i = start; i < draws.length; i += 1) {
      const training = draws.slice(0, i);
      const result = runGoldenV2(training, draws[i].draw_date);

      const actual = drawLoto(draws[i]);
      const hitNumber =
        result.songThu.find((n) => actual.includes(n)) ?? null;

      const main10Hits = result.main10.filter((n) =>
        actual.includes(n),
      );

      rows.push({
        predictionDate: draws[i].draw_date,
        songThu: result.songThu,
        pairScore: result.pairScore,
        main10: result.main10,
        songThuHit: Boolean(hitNumber),
        hitNumber,
        main10HitCount: main10Hits.length,
        main10Hits,
        modelWeights: result.modelWeights,
      });
    }

    const pairHits = rows.filter((x) => x.songThuHit).length;
    const main10HitDraws = rows.filter(
      (x) => x.main10HitCount > 0,
    ).length;

    return json({
      success: true,
      methodology: "strict walk-forward",
      testedDraws: rows.length,
      songThuHits: pairHits,
      songThuHitRate:
        rows.length
          ? Number(((pairHits / rows.length) * 100).toFixed(2))
          : 0,
      main10HitDraws,
      main10HitRate:
        rows.length
          ? Number(((main10HitDraws / rows.length) * 100).toFixed(2))
          : 0,
      rows: rows.reverse(),
      warning:
        "Không dùng dữ liệu kỳ mục tiêu để tạo feature hay hiệu chỉnh ensemble.",
    });
  } catch (error) {
    return fail(error?.message || "Backtest V2 lỗi.", 500);
  }
}
