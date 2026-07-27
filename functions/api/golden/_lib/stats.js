const NUMBERS = Array.from({ length: 100 }, (_, i) =>
  String(i).padStart(2, "0"),
);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function occurrenceIndexes(drawNumbers, number) {
  const indexes = [];
  for (let i = 0; i < drawNumbers.length; i += 1) {
    if (drawNumbers[i].includes(number)) indexes.push(i);
  }
  return indexes;
}

function currentGap(drawNumbers, number) {
  for (let i = drawNumbers.length - 1; i >= 0; i -= 1) {
    if (drawNumbers[i].includes(number)) {
      return drawNumbers.length - 1 - i;
    }
  }
  return drawNumbers.length;
}

function averageCycle(drawNumbers, number) {
  const indexes = occurrenceIndexes(drawNumbers, number);
  if (indexes.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < indexes.length; i += 1) {
    gaps.push(indexes[i] - indexes[i - 1]);
  }

  return mean(gaps);
}

function frequency(drawNumbers, number, window) {
  const slice = drawNumbers.slice(-window);
  return slice.reduce(
    (sum, draw) => sum + draw.filter((n) => n === number).length,
    0,
  );
}

function headFrequency(drawNumbers, head, window) {
  return drawNumbers
    .slice(-window)
    .reduce(
      (sum, draw) => sum + draw.filter((n) => n[0] === head).length,
      0,
    );
}

function tailFrequency(drawNumbers, tail, window) {
  return drawNumbers
    .slice(-window)
    .reduce(
      (sum, draw) => sum + draw.filter((n) => n[1] === tail).length,
      0,
    );
}

function normalizeMap(rawMap, invert = false) {
  const values = Object.values(rawMap);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const output = {};
  for (const [key, value] of Object.entries(rawMap)) {
    const normalized =
      max === min ? 50 : ((value - min) / (max - min)) * 100;
    output[key] = invert ? 100 - normalized : normalized;
  }
  return output;
}

export function computeStats(drawNumbers, superColdLimit) {
  const raw = {};

  for (const number of NUMBERS) {
    const reverse = number[1] + number[0];
    const gap = currentGap(drawNumbers, number);
    const avgCycle = averageCycle(drawNumbers, number);
    const cycleDistance =
      avgCycle == null ? 999 : Math.abs(gap - avgCycle);

    raw[number] = {
      number,
      reverse,
      gap,
      freq7: frequency(drawNumbers, number, 7),
      freq30: frequency(drawNumbers, number, 30),
      reverseFreq30: frequency(drawNumbers, reverse, 30),
      reverseGap: currentGap(drawNumbers, reverse),
      averageCycle: avgCycle,
      cycleDistance,
      headFreq30: headFrequency(drawNumbers, number[0], 30),
      tailFreq30: tailFrequency(drawNumbers, number[1], 30),
    };
  }

  const metric = (name, invert = false) => {
    const map = {};
    for (const item of Object.values(raw)) map[item.number] = item[name];
    return normalizeMap(map, invert);
  };

  const scores = {
    freq7: metric("freq7"),
    freq30: metric("freq30"),
    gap: metric("gap"),
    reverseFreq30: metric("reverseFreq30"),
    reverseGap: metric("reverseGap"),
    headHot: metric("headFreq30"),
    tailHot: metric("tailFreq30"),
    cycle: metric("cycleDistance", true),
  };

  const output = [];

  for (const item of Object.values(raw)) {
    const returnSignal =
      item.averageCycle == null
        ? 0
        : clamp(
            100 -
              (Math.abs(item.gap - item.averageCycle) /
                Math.max(item.averageCycle, 1)) *
                100,
          );

    output.push({
      ...item,
      returnSignal,
      excluded: item.gap > superColdLimit,
      signals: {
        freq7: scores.freq7[item.number],
        freq30: scores.freq30[item.number],
        cycle: scores.cycle[item.number],
        gap: scores.gap[item.number],
        reverseFreq30: scores.reverseFreq30[item.number],
        reverseGap: scores.reverseGap[item.number],
        headHot: scores.headHot[item.number],
        tailHot: scores.tailHot[item.number],
        returnSignal,
      },
    });
  }

  return output;
}
