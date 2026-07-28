import { V2_CONFIG } from "./config.js";

const NUMBERS = Array.from({ length: 100 }, (_, i) =>
  String(i).padStart(2, "0"),
);

function flattenUnknown(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenUnknown);
  if (typeof value === "number") return [String(value)];
  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text) return [];

  if (
    (text.startsWith("[") && text.endsWith("]")) ||
    (text.startsWith("{") && text.endsWith("}"))
  ) {
    try {
      return flattenUnknown(JSON.parse(text));
    } catch {}
  }

  return text
    .split(/[\s,;|]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);
}

export function prizePositions(draw) {
  const positions = [];

  for (const column of V2_CONFIG.RESULT_COLUMNS) {
    const values = flattenUnknown(draw[column]);
    values.forEach((value, index) => {
      if (value.length < 2) return;
      positions.push({
        key: `${column}_${index}`,
        prize: column,
        index,
        value,
        last2: value.slice(-2).padStart(2, "0"),
      });
    });
  }

  return positions;
}

export function drawLoto(draw) {
  return prizePositions(draw).map((x) => x.last2);
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function std(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((sum, x) => sum + (x - m) ** 2, 0) / values.length,
  );
}

function occurrences(drawNumbers, number) {
  const out = [];
  drawNumbers.forEach((row, i) => {
    if (row.includes(number)) out.push(i);
  });
  return out;
}

function gap(drawNumbers, number) {
  for (let i = drawNumbers.length - 1; i >= 0; i -= 1) {
    if (drawNumbers[i].includes(number)) {
      return drawNumbers.length - 1 - i;
    }
  }
  return drawNumbers.length;
}

function frequency(drawNumbers, number, window) {
  return drawNumbers.slice(-window).reduce(
    (sum, row) => sum + row.filter((x) => x === number).length,
    0,
  );
}

function headFrequency(drawNumbers, head, window) {
  return drawNumbers.slice(-window).reduce(
    (sum, row) => sum + row.filter((x) => x[0] === head).length,
    0,
  );
}

function tailFrequency(drawNumbers, tail, window) {
  return drawNumbers.slice(-window).reduce(
    (sum, row) => sum + row.filter((x) => x[1] === tail).length,
    0,
  );
}

function calendarRate(draws, drawNumbers, number, targetDate, type) {
  const target = new Date(`${targetDate}T00:00:00Z`);
  const targetKey =
    type === "weekday" ? target.getUTCDay() : target.getUTCMonth();

  let matchingDraws = 0;
  let hits = 0;

  for (let i = 0; i < draws.length; i += 1) {
    const dt = new Date(`${draws[i].draw_date}T00:00:00Z`);
    const key = type === "weekday" ? dt.getUTCDay() : dt.getUTCMonth();
    if (key !== targetKey) continue;

    matchingDraws += 1;
    hits += drawNumbers[i].filter((x) => x === number).length;
  }

  return matchingDraws ? hits / matchingDraws : 0;
}

function positionalSignals(latestDraw, number) {
  const positions = prizePositions(latestDraw);
  const reverse = number[1] + number[0];

  let exact = 0;
  let reverseMatch = 0;
  let headMatch = 0;
  let tailMatch = 0;

  for (const p of positions) {
    if (p.last2 === number) exact += 1;
    if (p.last2 === reverse) reverseMatch += 1;
    if (p.last2[0] === number[0]) headMatch += 1;
    if (p.last2[1] === number[1]) tailMatch += 1;
  }

  return { exact, reverseMatch, headMatch, tailMatch };
}

export function buildFeatures(draws, targetDate) {
  if (draws.length < V2_CONFIG.MIN_TRAIN_DRAWS) {
    throw new Error(
      `Golden V2 cần tối thiểu ${V2_CONFIG.MIN_TRAIN_DRAWS} kỳ dữ liệu.`,
    );
  }

  const drawNumbers = draws.map(drawLoto);
  const latest = draws.at(-1);

  return NUMBERS.map((number) => {
    const reverse = number[1] + number[0];
    const occ = occurrences(drawNumbers, number);
    const cycles = [];

    for (let i = 1; i < occ.length; i += 1) {
      cycles.push(occ[i] - occ[i - 1]);
    }

    const cycleMedian = median(cycles);
    const cycleMean = mean(cycles);
    const cycleStd = std(cycles);
    const currentGap = gap(drawNumbers, number);

    const freq = {};
    for (const w of V2_CONFIG.WINDOWS) {
      freq[w] = frequency(drawNumbers, number, w);
    }

    const rate = (w) => freq[w] / Math.min(w, drawNumbers.length);

    const recent5 = frequency(drawNumbers, number, 5);
    const prior5 = drawNumbers.length >= 10
      ? drawNumbers.slice(-10, -5).reduce(
          (sum, row) => sum + row.filter((x) => x === number).length,
          0,
        )
      : 0;

    const overallRate =
      frequency(drawNumbers, number, drawNumbers.length) /
      drawNumbers.length;

    const weekdayRate = calendarRate(
      draws, drawNumbers, number, targetDate, "weekday",
    );

    const monthRate = calendarRate(
      draws, drawNumbers, number, targetDate, "month",
    );

    const pos = positionalSignals(latest, number);

    return {
      number,
      reverse,

      freq5: freq[5],
      freq10: freq[10],
      freq20: freq[20],
      freq30: freq[30],
      freq60: freq[60],
      freq90: freq[90],

      rate5: rate(5),
      rate10: rate(10),
      rate20: rate(20),
      rate30: rate(30),
      rate60: rate(60),
      rate90: rate(90),

      momentum5_20: rate(5) - rate(20),
      momentum10_30: rate(10) - rate(30),
      momentum20_60: rate(20) - rate(60),
      acceleration5: recent5 - prior5,

      gap: currentGap,
      reverseGap: gap(drawNumbers, reverse),

      cycleMean,
      cycleMedian,
      cycleStd,
      cycleDeviation:
        cycleMedian > 0
          ? Math.abs(currentGap - cycleMedian) / Math.max(cycleStd, 1)
          : 99,

      reverseFreq10: frequency(drawNumbers, reverse, 10),
      reverseFreq30: frequency(drawNumbers, reverse, 30),
      reverseFreq60: frequency(drawNumbers, reverse, 60),

      headFreq10: headFrequency(drawNumbers, number[0], 10),
      headFreq30: headFrequency(drawNumbers, number[0], 30),
      tailFreq10: tailFrequency(drawNumbers, number[1], 10),
      tailFreq30: tailFrequency(drawNumbers, number[1], 30),

      overallRate,
      weekdayRate,
      weekdayLift:
        overallRate > 0 ? weekdayRate / overallRate : 1,
      monthRate,
      monthLift:
        overallRate > 0 ? monthRate / overallRate : 1,

      posExact: pos.exact,
      posReverse: pos.reverseMatch,
      posHead: pos.headMatch,
      posTail: pos.tailMatch,

      doubleNumber: number[0] === number[1] ? 1 : 0,
      digitSum: Number(number[0]) + Number(number[1]),
      oddEven:
        (Number(number[0]) % 2) * 2 + (Number(number[1]) % 2),
    };
  });
}
