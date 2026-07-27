function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function pairCompatibility(a, b) {
  const gapCompatibility =
    100 - Math.min(100, Math.abs(a.gap - b.gap) * 8);

  const cycleA = a.signals.cycle ?? 0;
  const cycleB = b.signals.cycle ?? 0;
  const cycleCompatibility = (cycleA + cycleB) / 2;

  const historicalBalance =
    ((a.signals.freq30 ?? 0) + (b.signals.freq30 ?? 0)) / 2;

  const reverseStrength =
    ((a.signals.reverseFreq30 ?? 0) +
      (b.signals.reverseFreq30 ?? 0)) /
    2;

  // Khuyến khích cặp không quá giống đầu/đuôi để giảm phụ thuộc một cụm.
  const diversity =
    (a.number[0] !== b.number[0] ? 50 : 0) +
    (a.number[1] !== b.number[1] ? 50 : 0);

  return {
    gapCompatibility,
    cycleCompatibility,
    historicalBalance,
    reverseStrength,
    diversity,
  };
}

export function chooseBestPair(main10, allNumbers) {
  const byNumber = new Map(allNumbers.map((x) => [x.number, x]));
  const pairs = [];

  for (let i = 0; i < main10.length; i += 1) {
    for (let j = i + 1; j < main10.length; j += 1) {
      const a = byNumber.get(main10[i]);
      const b = byNumber.get(main10[j]);
      if (!a || !b) continue;

      const c = pairCompatibility(a, b);

      const normalized =
        a.score * 0.25 +
        b.score * 0.25 +
        c.gapCompatibility * 0.15 +
        c.cycleCompatibility * 0.15 +
        c.historicalBalance * 0.08 +
        c.reverseStrength * 0.05 +
        c.diversity * 0.07;

      // Scale giao diện 0..500, vẫn là điểm ranking chứ không phải xác suất.
      const pairScore = clamp(normalized, 0, 100) * 5;

      pairs.push({
        numbers: [a.number, b.number],
        pairScore,
        components: c,
      });
    }
  }

  pairs.sort((a, b) => b.pairScore - a.pairScore);

  return {
    best: pairs[0] ?? null,
    topPairs: pairs.slice(0, 10),
  };
}
