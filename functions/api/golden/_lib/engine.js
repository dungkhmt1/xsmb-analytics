import { GOLDEN_CONFIG } from "./config.js";
import { extractLotoNumbers } from "./parser.js";
import { computeStats } from "./stats.js";

function weightedScore(signals) {
  return Object.entries(GOLDEN_CONFIG.WEIGHTS).reduce(
    (sum, [key, weight]) => sum + (signals[key] ?? 0) * weight,
    0,
  );
}

function sortDesc(items, selector) {
  return [...items].sort((a, b) => selector(b) - selector(a));
}

function assignCategory(item) {
  // Các category độc lập để dùng cho bảng giải thích.
  const s = item.signals;

  const categoryScores = {
    golden:
      s.cycle * 0.45 +
      s.freq30 * 0.30 +
      s.returnSignal * 0.25,

    gan:
      (item.gap >= 12 && !item.excluded ? s.gap : 0) * 0.75 +
      s.cycle * 0.25,

    explosion:
      s.gap * 0.25 +
      s.cycle * 0.25 +
      s.reverseGap * 0.15 +
      s.headHot * 0.175 +
      s.tailHot * 0.175,

    headTail:
      s.headHot * 0.50 +
      s.tailHot * 0.50,

    support:
      item.score,
  };

  const category = Object.entries(categoryScores).sort(
    (a, b) => b[1] - a[1],
  )[0][0];

  return {
    ...item,
    category,
    categoryScores,
  };
}

function pickUnique(source, count, used) {
  const picked = [];
  for (const item of source) {
    if (picked.length >= count) break;
    if (used.has(item.number)) continue;
    if (item.excluded) continue;

    used.add(item.number);
    picked.push(item);
  }
  return picked;
}

function reasonFor(item, category) {
  switch (category) {
    case "golden":
      return `Nhịp chu kỳ ${item.averageCycle == null ? "chưa đủ mẫu" : item.averageCycle.toFixed(1) + " kỳ"}, gan ${item.gap} kỳ, tần suất 30 kỳ: ${item.freq30}.`;

    case "gan":
      return `Đang gan ${item.gap} kỳ; chỉ giữ số dưới ngưỡng siêu khan ${GOLDEN_CONFIG.GAN_SUPER_COLD_LIMIT} kỳ.`;

    case "explosion":
      return `Hội tụ gap/chu kỳ/đảo/đầu-đuôi; điểm nổ ${item.categoryScores.explosion.toFixed(1)}.`;

    case "headTail":
      return `Đầu ${item.number[0]} và đuôi ${item.number[1]} đang có điểm nóng ${((item.signals.headHot + item.signals.tailHot) / 2).toFixed(1)}.`;

    default:
      return `Điểm tổng hợp ${item.score.toFixed(1)}, được dùng làm số bổ trợ.`;
  }
}

export function analyzeDraws(draws) {
  if (!Array.isArray(draws) || draws.length < 10) {
    throw new Error("Cần tối thiểu 10 kỳ dữ liệu để chạy Golden Strategy.");
  }

  const drawNumbers = draws.map((draw) =>
    extractLotoNumbers(draw, GOLDEN_CONFIG.RESULT_COLUMNS),
  );

  let items = computeStats(
    drawNumbers,
    GOLDEN_CONFIG.GAN_SUPER_COLD_LIMIT,
  ).map((item) => ({
    ...item,
    score: weightedScore(item.signals),
  }));

  items = items.map(assignCategory);

  const golden = sortDesc(
    items.filter((x) => !x.excluded),
    (x) => x.categoryScores.golden,
  );

  const gan = sortDesc(
    items.filter(
      (x) => !x.excluded && x.gap >= 12,
    ),
    (x) => x.categoryScores.gan,
  );

  const explosion = sortDesc(
    items.filter((x) => !x.excluded),
    (x) => x.categoryScores.explosion,
  );

  const headTail = sortDesc(
    items.filter((x) => !x.excluded),
    (x) => x.categoryScores.headTail,
  );

  const support = sortDesc(
    items.filter((x) => !x.excluded),
    (x) => x.score,
  );

  const used = new Set();
  const selected = [];

  const add = (source, count, category) => {
    const picks = pickUnique(source, count, used);
    for (const item of picks) {
      selected.push({
        ...item,
        selectedCategory: category,
      });
    }
  };

  add(golden, GOLDEN_CONFIG.MAIN10_RATIO.golden, "golden");
  add(gan, GOLDEN_CONFIG.MAIN10_RATIO.gan, "gan");
  add(explosion, GOLDEN_CONFIG.MAIN10_RATIO.explosion, "explosion");
  add(headTail, GOLDEN_CONFIG.MAIN10_RATIO.headTail, "headTail");
  add(support, GOLDEN_CONFIG.MAIN10_RATIO.support, "support");

  // Nếu một nhóm không đủ ứng viên, bù bằng score tổng hợp.
  if (selected.length < 10) {
    const extras = pickUnique(support, 10 - selected.length, used);
    for (const item of extras) {
      selected.push({
        ...item,
        selectedCategory: "support",
      });
    }
  }

  const details = selected.map((item) => ({
    number: item.number,
    category: item.selectedCategory,
    score: Number(item.score.toFixed(2)),
    gap: item.gap,
    freq7: item.freq7,
    freq30: item.freq30,
    averageCycle:
      item.averageCycle == null
        ? null
        : Number(item.averageCycle.toFixed(2)),
    reverse: item.reverse,
    reason: reasonFor(item, item.selectedCategory),
  }));

  return {
    allNumbers: items,
    main10: selected.map((x) => x.number),
    details,
  };
}
