import { V2_CONFIG } from "./config.js";

function clamp(x, min = 0, max = 100) {
  return Math.max(min, Math.min(max, x));
}

export function choosePair(main10Items) {
  const pairs = [];

  for (let i = 0; i < main10Items.length; i += 1) {
    for (let j = i + 1; j < main10Items.length; j += 1) {
      const a = main10Items[i];
      const b = main10Items[j];

      const diversity =
        (a.number[0] !== b.number[0] ? 50 : 0) +
        (a.number[1] !== b.number[1] ? 50 : 0);

      const agreement =
        ((a.ensemble.modelsInTop10 + b.ensemble.modelsInTop10) / 8) * 100;

      const gapBalance =
        100 - Math.min(100, Math.abs(a.gap - b.gap) * 7);

      const rankStability =
        100 -
        Math.min(
          100,
          (Math.sqrt(a.ensemble.rankVariance) +
            Math.sqrt(b.ensemble.rankVariance)) *
            1.5,
        );

      const normalized =
        a.ensemble.finalScore * 0.30 +
        b.ensemble.finalScore * 0.30 +
        agreement * 0.15 +
        diversity * 0.10 +
        gapBalance * 0.08 +
        rankStability * 0.07;

      pairs.push({
        numbers: [a.number, b.number],
        normalized: clamp(normalized),
        pairScore:
          (clamp(normalized) / 100) * V2_CONFIG.PAIR_SCORE_MAX,
        components: {
          diversity,
          agreement,
          gapBalance,
          rankStability,
        },
      });
    }
  }

  pairs.sort((a, b) => b.pairScore - a.pairScore);

  return {
    best: pairs[0] ?? null,
    topPairs: pairs.slice(0, 10),
  };
}
