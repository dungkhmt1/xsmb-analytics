function clamp(x, min = 0, max = 100) {
  return Math.max(min, Math.min(max, x));
}

function minMax(features, key, invert = false) {
  const values = features.map((x) => Number(x[key] ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);

  return features.map((x) => {
    let s = max === min ? 50 : ((Number(x[key] ?? 0) - min) / (max - min)) * 100;
    if (invert) s = 100 - s;
    return s;
  });
}

function zlike(value, scale) {
  return clamp(50 + (value / Math.max(scale, 1e-9)) * 25);
}

export function scoreBaseModels(features) {
  const norm = {
    rate5: minMax(features, "rate5"),
    rate10: minMax(features, "rate10"),
    rate20: minMax(features, "rate20"),
    rate30: minMax(features, "rate30"),
    rate60: minMax(features, "rate60"),
    rate90: minMax(features, "rate90"),
    gap: minMax(features, "gap"),
    reverseGap: minMax(features, "reverseGap"),
    cycleDeviation: minMax(features, "cycleDeviation", true),
    reverseFreq30: minMax(features, "reverseFreq30"),
    headFreq30: minMax(features, "headFreq30"),
    tailFreq30: minMax(features, "tailFreq30"),
    posExact: minMax(features, "posExact"),
    posReverse: minMax(features, "posReverse"),
    posHead: minMax(features, "posHead"),
    posTail: minMax(features, "posTail"),
  };

  return features.map((f, i) => {
    const frequency =
      norm.rate5[i] * 0.10 +
      norm.rate10[i] * 0.18 +
      norm.rate20[i] * 0.18 +
      norm.rate30[i] * 0.20 +
      norm.rate60[i] * 0.18 +
      norm.rate90[i] * 0.08 +
      zlike(f.momentum10_30, 0.5) * 0.05 +
      zlike(f.acceleration5, 5) * 0.03;

    const cycle =
      norm.cycleDeviation[i] * 0.42 +
      norm.gap[i] * 0.18 +
      norm.reverseGap[i] * 0.12 +
      norm.reverseFreq30[i] * 0.18 +
      zlike(-Math.abs(f.momentum20_60), 0.5) * 0.10;

    const position =
      norm.posReverse[i] * 0.28 +
      norm.posExact[i] * 0.10 +
      norm.posHead[i] * 0.18 +
      norm.posTail[i] * 0.18 +
      norm.headFreq30[i] * 0.13 +
      norm.tailFreq30[i] * 0.13;

    const weekday = clamp((f.weekdayLift - 0.5) * 66.67);
    const month = clamp((f.monthLift - 0.5) * 66.67);

    const temporal =
      weekday * 0.55 +
      month * 0.30 +
      norm.rate30[i] * 0.15;

    return {
      ...f,
      modelScores: {
        frequency: clamp(frequency),
        cycle: clamp(cycle),
        position: clamp(position),
        temporal: clamp(temporal),
      },
    };
  });
}

export function rankModel(scored, modelName) {
  return [...scored]
    .sort(
      (a, b) =>
        b.modelScores[modelName] - a.modelScores[modelName],
    )
    .map((x, index) => ({
      number: x.number,
      rank: index + 1,
      score: x.modelScores[modelName],
    }));
}
