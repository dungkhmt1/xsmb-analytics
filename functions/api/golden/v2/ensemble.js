import { buildFeatures, drawLoto, addDays } from "./features.js";
import { scoreBaseModels, rankModel } from "./models.js";
import { V2_CONFIG } from "./config.js";

const MODELS = ["frequency", "cycle", "position", "temporal"];

function normalizeWeights(raw) {
  const floor = 0.08;
  const adjusted = {};

  let total = 0;
  for (const m of MODELS) {
    adjusted[m] = Math.max(floor, raw[m] ?? floor);
    total += adjusted[m];
  }

  for (const m of MODELS) adjusted[m] /= total;
  return adjusted;
}

function actualSet(draw) {
  return new Set(drawLoto(draw));
}

function topKHit(ranking, actual, k = 10) {
  const top = ranking.slice(0, k);
  return top.some((x) => actual.has(x.number)) ? 1 : 0;
}

export function calibrateModelWeights(draws) {
  const available = Math.min(
    V2_CONFIG.ENSEMBLE_CALIBRATION_DRAWS,
    draws.length - V2_CONFIG.MIN_TRAIN_DRAWS,
  );

  if (available <= 0) {
    return {
      weights: normalizeWeights({
        frequency: 1,
        cycle: 1,
        position: 1,
        temporal: 1,
      }),
      diagnostics: { tested: 0 },
    };
  }

  const start = draws.length - available;
  const hitSums = Object.fromEntries(MODELS.map((m) => [m, 0]));
  const reciprocalRankSums = Object.fromEntries(
    MODELS.map((m) => [m, 0]),
  );

  let tested = 0;

  for (let i = start; i < draws.length; i += 1) {
    const training = draws.slice(0, i);
    if (training.length < V2_CONFIG.MIN_TRAIN_DRAWS) continue;

    const targetDate = draws[i].draw_date;
    const scored = scoreBaseModels(buildFeatures(training, targetDate));
    const actual = actualSet(draws[i]);

    for (const m of MODELS) {
      const ranking = rankModel(scored, m);
      hitSums[m] += topKHit(ranking, actual, 10);

      const firstHitIndex = ranking.findIndex((x) =>
        actual.has(x.number),
      );
      if (firstHitIndex >= 0) {
        reciprocalRankSums[m] += 1 / (firstHitIndex + 1);
      }
    }

    tested += 1;
  }

  const raw = {};
  for (const m of MODELS) {
    const hitRate = tested ? hitSums[m] / tested : 0;
    const mrr = tested ? reciprocalRankSums[m] / tested : 0;

    // Kết hợp hit-rate Top10 và chất lượng thứ hạng.
    raw[m] = hitRate * 0.70 + mrr * 0.30 + 0.01;
  }

  return {
    weights: normalizeWeights(raw),
    diagnostics: {
      tested,
      hitSums,
      reciprocalRankSums,
    },
  };
}

export function applyEnsemble(scored, weights) {
  const rankings = {};
  for (const m of MODELS) rankings[m] = rankModel(scored, m);

  const rankMaps = {};
  for (const m of MODELS) {
    rankMaps[m] = new Map(
      rankings[m].map((x) => [x.number, x.rank]),
    );
  }

  return scored.map((item) => {
    const s = item.modelScores;

    const finalScore =
      s.frequency * weights.frequency +
      s.cycle * weights.cycle +
      s.position * weights.position +
      s.temporal * weights.temporal;

    const ranks = MODELS.map(
      (m) => rankMaps[m].get(item.number) ?? 100,
    );

    const rankMean =
      ranks.reduce((sum, x) => sum + x, 0) / ranks.length;

    const rankVariance =
      ranks.reduce((sum, x) => sum + (x - rankMean) ** 2, 0) /
      ranks.length;

    const modelsInTop10 = ranks.filter((x) => x <= 10).length;
    const modelsInTop20 = ranks.filter((x) => x <= 20).length;

    const agreementBonus =
      modelsInTop10 * 2.2 +
      modelsInTop20 * 0.8 -
      Math.min(8, Math.sqrt(rankVariance) * 0.15);

    return {
      ...item,
      ensemble: {
        finalScore: Math.max(0, Math.min(100, finalScore + agreementBonus)),
        ranks: {
          frequency: ranks[0],
          cycle: ranks[1],
          position: ranks[2],
          temporal: ranks[3],
        },
        modelsInTop10,
        modelsInTop20,
        rankVariance,
      },
    };
  });
}
