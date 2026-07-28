import { buildFeatures, addDays } from "./features.js";
import { scoreBaseModels } from "./models.js";
import {
  calibrateModelWeights,
  applyEnsemble,
} from "./ensemble.js";
import { choosePair } from "./pair.js";
import { V2_CONFIG } from "./config.js";

function selectDiversifiedTop10(items) {
  const sorted = [...items].sort(
    (a, b) => b.ensemble.finalScore - a.ensemble.finalScore,
  );

  const selected = [];
  const headCount = {};
  const tailCount = {};

  for (const item of sorted) {
    if (selected.length >= 10) break;

    const h = item.number[0];
    const t = item.number[1];

    // Soft diversification: tối đa 3 số cùng đầu hoặc cùng đuôi
    // trước khi phải dùng tới pass bù.
    if ((headCount[h] ?? 0) >= 3) continue;
    if ((tailCount[t] ?? 0) >= 3) continue;

    selected.push(item);
    headCount[h] = (headCount[h] ?? 0) + 1;
    tailCount[t] = (tailCount[t] ?? 0) + 1;
  }

  if (selected.length < 10) {
    const used = new Set(selected.map((x) => x.number));
    for (const item of sorted) {
      if (selected.length >= 10) break;
      if (used.has(item.number)) continue;
      selected.push(item);
      used.add(item.number);
    }
  }

  return selected;
}

function explain(item) {
  const s = item.modelScores;
  const e = item.ensemble;

  const strongest = Object.entries(s).sort((a, b) => b[1] - a[1])[0];

  return {
    number: item.number,
    finalScore: Number(e.finalScore.toFixed(2)),
    strongestModel: strongest[0],
    strongestScore: Number(strongest[1].toFixed(2)),
    modelsInTop10: e.modelsInTop10,
    ranks: e.ranks,
    gap: item.gap,
    cycleMedian: Number(item.cycleMedian.toFixed(2)),
    cycleDeviation: Number(item.cycleDeviation.toFixed(2)),
    momentum10_30: Number(item.momentum10_30.toFixed(4)),
    weekdayLift: Number(item.weekdayLift.toFixed(2)),
    monthLift: Number(item.monthLift.toFixed(2)),
  };
}

export function runGoldenV2(draws, targetDate = null) {
  const latest = draws.at(-1);
  const predictionDate =
    targetDate || addDays(latest.draw_date, 1);

  const calibration = calibrateModelWeights(draws);

  const features = buildFeatures(draws, predictionDate);
  const base = scoreBaseModels(features);
  const ensembled = applyEnsemble(base, calibration.weights);

  const top10Items = selectDiversifiedTop10(ensembled);
  const pair = choosePair(top10Items);

  if (!pair.best) throw new Error("Không tạo được cặp song thủ V2.");

  return {
    modelVersion: V2_CONFIG.MODEL_VERSION,
    predictionDate,
    sourceLatestDate: latest.draw_date,
    modelWeights: Object.fromEntries(
      Object.entries(calibration.weights).map(
        ([k, v]) => [k, Number(v.toFixed(4))],
      ),
    ),
    calibration: calibration.diagnostics,
    main10: top10Items.map((x) => x.number),
    details: top10Items.map(explain),
    songThu: pair.best.numbers,
    pairScore: Number(pair.best.pairScore.toFixed(2)),
    topPairs: pair.topPairs.map((p) => ({
      numbers: p.numbers,
      pairScore: Number(p.pairScore.toFixed(2)),
    })),
  };
}
