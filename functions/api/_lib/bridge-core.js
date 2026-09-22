/*
========================================================
BRIDGE CORE — thư viện dùng chung
========================================================

File này gom các hàm toán/thống kê cốt lõi của thuật toán
"cầu" (bridge) — trước đây bị copy-paste trùng lặp y hệt
giữa predict.js, bridge-predict.js và walk-forward-v28.js.

Từ nay CHỈ sửa logic ở ĐÂY. Mọi file khác chỉ import và
dùng lại, không được định nghĩa lại các hàm này.

KHÔNG thay đổi hành vi bên trong các hàm so với bản gốc
trong predict.js (bridge-v2.8-learning) — đây là bản đang
chạy production nên được chọn làm bản chuẩn (canonical).
========================================================
*/


export const PRIZES = [
  "special",
  "g1",
  "g2",
  "g3",
  "g4",
  "g5",
  "g6",
  "g7"
];


export const LABELS = {
  special: "ĐB",
  g1: "G1",
  g2: "G2",
  g3: "G3",
  g4: "G4",
  g5: "G5",
  g6: "G6",
  g7: "G7"
};


/*
Cấu hình liên quan trực tiếp tới các hàm trong file này.
Giữ nguyên giá trị gốc từ predict.js bridge-v2.8-learning.
*/

export const CURRENT_REJECT_FROM = 6;

export const RECENT_ACTIVE_SAMPLES = 5;

export const RECENT_LIMITED_SAMPLES = 3;


export function clamp(
  value,
  minimum,
  maximum
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value
    )
  );
}

export function average(values) {
  if (!values.length) {
    return 0;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    )
    /
    values.length
  );
}

export function splitPrize(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(
      value =>
        /^\d+$/.test(value)
    );
}

export function validRow(row) {
  if (!row) {
    return false;
  }


  const special =
    splitPrize(row.special);

  const g1 =
    splitPrize(row.g1);

  const g2 =
    splitPrize(row.g2);

  const g3 =
    splitPrize(row.g3);

  const g4 =
    splitPrize(row.g4);

  const g5 =
    splitPrize(row.g5);

  const g6 =
    splitPrize(row.g6);

  const g7 =
    splitPrize(row.g7);


  if (
    special.length !== 1 ||
    g1.length !== 1 ||
    g2.length !== 2 ||
    g3.length !== 6 ||
    g4.length !== 4 ||
    g5.length !== 6 ||
    g6.length !== 3 ||
    g7.length !== 4
  ) {
    return false;
  }


  return (
    special.every(
      x => /^\d{5}$/.test(x)
    )
    &&
    g1.every(
      x => /^\d{5}$/.test(x)
    )
    &&
    g2.every(
      x => /^\d{5}$/.test(x)
    )
    &&
    g3.every(
      x => /^\d{5}$/.test(x)
    )
    &&
    g4.every(
      x => /^\d{4}$/.test(x)
    )
    &&
    g5.every(
      x => /^\d{4}$/.test(x)
    )
    &&
    g6.every(
      x => /^\d{3}$/.test(x)
    )
    &&
    g7.every(
      x => /^\d{2}$/.test(x)
    )
  );
}

export function getLotoSet(row) {
  const set =
    new Set();


  for (const prize of PRIZES) {
    const numbers =
      splitPrize(
        row[prize]
      );


    for (const number of numbers) {
      set.add(
        number.slice(-2)
      );
    }
  }


  return set;
}

export function getPositions(row) {
  const result = [];


  for (const prize of PRIZES) {
    const numbers =
      splitPrize(
        row[prize]
      );


    numbers.forEach(
      (
        number,
        numberIndex
      ) => {

        for (
          let digitIndex = 0;
          digitIndex < number.length;
          digitIndex++
        ) {
          result.push({
            prize,
            numberIndex,
            digitIndex,

            key:
              `${prize}:` +
              `${numberIndex}:` +
              `${digitIndex}`
          });
        }

      }
    );
  }


  return result;
}

export function getDigit(
  row,
  position
) {
  if (!row) {
    return null;
  }


  const numbers =
    splitPrize(
      row[position.prize]
    );


  const number =
    numbers[
      position.numberIndex
    ];


  if (!number) {
    return null;
  }


  return (
    number[
      position.digitIndex
    ] ?? null
  );
}

export function makeNumber(
  row,
  positionA,
  positionB,
  reverse
) {
  const a =
    getDigit(
      row,
      positionA
    );


  const b =
    getDigit(
      row,
      positionB
    );


  if (
    a === null ||
    b === null
  ) {
    return null;
  }


  return reverse
    ? `${b}${a}`
    : `${a}${b}`;
}

export function positionName(position) {
  return (
    `${LABELS[position.prize]}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}

export function nextDate(dateString) {
  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );


  date.setUTCDate(
    date.getUTCDate() + 1
  );


  return date
    .toISOString()
    .slice(0, 10);
}

export function calculateBaseline(
  lotoSets
) {
  const rates = [];


  for (
    let i = 1;
    i < lotoSets.length;
    i++
  ) {
    rates.push(
      lotoSets[i].size
      /
      100
      *
      100
    );
  }


  return Number(
    average(rates)
      .toFixed(2)
  );
}

export function wilsonLowerBound(
  successes,
  total
) {
  if (total <= 0) {
    return 0;
  }


  const z = 1.96;

  const p =
    successes / total;


  const denominator =
    1 +
    (
      z * z /
      total
    );


  const centre =
    p +
    (
      z * z /
      (
        2 * total
      )
    );


  const adjustment =
    z *
    Math.sqrt(
      (
        p *
        (
          1 - p
        )
        /
        total
      )
      +
      (
        z * z /
        (
          4 *
          total *
          total
        )
      )
    );


  return (
    centre -
    adjustment
  )
  /
  denominator;
}

export function getCurrentStreak(
  rows,
  lotoSets,
  positionA,
  positionB,
  reverse
) {
  let streak = 0;

  const history = [];


  for (
    let i =
      rows.length - 2;

    i >= 0;

    i--
  ) {
    const number =
      makeNumber(
        rows[i],
        positionA,
        positionB,
        reverse
      );


    if (!number) {
      break;
    }


    if (
      !lotoSets[i + 1]
        .has(number)
    ) {
      break;
    }


    streak++;


    if (
      history.length < 5
    ) {
      history.push({
        sourceDate:
          rows[i].draw_date,

        targetDate:
          rows[i + 1]
            .draw_date,

        number
      });
    }


    /*
    6+ không dùng làm
    prediction hiện tại.
    */

    if (
      streak >=
      CURRENT_REJECT_FROM
    ) {
      break;
    }
  }


  return {
    streak,
    history
  };
}

export function buildHitSeries(
  rows,
  lotoSets,
  positionA,
  positionB,
  reverse
) {
  const series = [];


  for (
    let i = 0;
    i < rows.length - 1;
    i++
  ) {
    const number =
      makeNumber(
        rows[i],
        positionA,
        positionB,
        reverse
      );


    series.push(
      number
        ?
        lotoSets[i + 1]
          .has(number)
        :
        false
    );
  }


  return series;
}

export function backtestWindow(
  hitSeries,
  streak,
  maxTransitions
) {
  /*
  Không dùng streak hiện tại
  để tự kiểm định chính nó.
  */

  const historicalEnd =
    Math.max(
      0,
      hitSeries.length -
      streak
    );


  const start =
    maxTransitions === null
      ?
      0
      :
      Math.max(
        0,
        historicalEnd -
        maxTransitions
      );


  let opportunities = 0;

  let continued = 0;

  let weightedTotal = 0;

  let weightedHits = 0;


  for (
    let i =
      Math.max(
        streak,
        start
      );

    i < historicalEnd;

    i++
  ) {
    if (
      i - streak <
      start
    ) {
      continue;
    }


    let validRun = true;


    for (
      let j = 1;
      j <= streak;
      j++
    ) {
      if (
        hitSeries[
          i - j
        ] !== true
      ) {
        validRun = false;

        break;
      }
    }


    if (!validRun) {
      continue;
    }


    opportunities++;


    const hit =
      hitSeries[i] === true;


    if (hit) {
      continued++;
    }


    const age =
      historicalEnd -
      1 -
      i;


    const weight =
      Math.exp(
        -age / 60
      );


    weightedTotal +=
      weight;


    if (hit) {
      weightedHits +=
        weight;
    }
  }


  const rate =
    opportunities > 0
      ?
      continued /
      opportunities *
      100
      :
      0;


  const weightedRate =
    weightedTotal > 0
      ?
      weightedHits /
      weightedTotal *
      100
      :
      0;


  return {
    opportunities,

    continued,

    rate:
      Number(
        rate.toFixed(2)
      ),

    weightedRate:
      Number(
        weightedRate
          .toFixed(2)
      )
  };
}

export function getRecentStatus(
  samples60
) {
  if (
    samples60 >=
    RECENT_ACTIVE_SAMPLES
  ) {
    return "active";
  }


  if (
    samples60 >=
    RECENT_LIMITED_SAMPLES
  ) {
    return "limited";
  }


  return "historical-only";
}

export function analyzePerformance(
  hitSeries,
  streak,
  baseline
) {
  const all =
    backtestWindow(
      hitSeries,
      streak,
      null
    );


  const w30 =
    backtestWindow(
      hitSeries,
      streak,
      30
    );


  const w60 =
    backtestWindow(
      hitSeries,
      streak,
      60
    );


  const w100 =
    backtestWindow(
      hitSeries,
      streak,
      100
    );


  const wilson =
    wilsonLowerBound(
      all.continued,
      all.opportunities
    )
    *
    100;


  const edge =
    all.rate -
    baseline;


  const wilsonEdge =
    wilson -
    baseline;


  /*
  Stability.
  */

  const validRates = [];


  for (
    const item of [
      w30,
      w60,
      w100,
      all
    ]
  ) {
    if (
      item.opportunities >= 3
    ) {
      validRates.push(
        item.rate
      );
    }
  }


  let stabilityRange = 30;


  if (
    validRates.length >= 2
  ) {
    stabilityRange =
      Math.max(
        ...validRates
      )
      -
      Math.min(
        ...validRates
      );
  }


  const stabilityScore =
    clamp(
      100 -
      stabilityRange * 2,
      0,
      100
    );


  /*
  Sample reliability.
  */

  const sampleReliability =
    clamp(
      Math.sqrt(
        all.opportunities /
        20
      )
      *
      100,
      0,
      100
    );


  /*
  Recent evidence.
  */

  const recentStatus =
    getRecentStatus(
      w60.opportunities
    );


  let recentRate =
    all.rate;


  if (
    w30.opportunities >= 3
    &&
    w60.opportunities >= 3
  ) {
    recentRate =
      w30.rate * 0.6
      +
      w60.rate * 0.4;
  }
  else if (
    w60.opportunities >= 3
  ) {
    recentRate =
      w60.rate;
  }
  else if (
    w30.opportunities >= 3
  ) {
    recentRate =
      w30.rate;
  }


  const normalizedEdge =
    clamp(
      50 +
      edge * 1.5,
      0,
      100
    );


  /*
  Raw score.

  Wilson       35%
  Edge         20%
  Recent       15%
  Stability    15%
  Sample       15%
  */

  const rawScore =
    wilson * 0.35
    +
    normalizedEdge * 0.20
    +
    recentRate * 0.15
    +
    stabilityScore * 0.15
    +
    sampleReliability * 0.15;


  return {
    opportunities:
      all.opportunities,

    continued:
      all.continued,

    continuationRate:
      all.rate,

    weightedRate:
      all.weightedRate,

    baselineRate:
      baseline,

    edge:
      Number(
        edge.toFixed(2)
      ),

    wilsonLowerBound:
      Number(
        wilson.toFixed(2)
      ),

    wilsonEdge:
      Number(
        wilsonEdge
          .toFixed(2)
      ),

    rate30:
      w30.rate,

    samples30:
      w30.opportunities,

    rate60:
      w60.rate,

    samples60:
      w60.opportunities,

    rate100:
      w100.rate,

    samples100:
      w100.opportunities,

    recentRate:
      Number(
        recentRate
          .toFixed(2)
      ),

    recentSamples:
      w60.opportunities,

    recentStatus,

    stabilityRange:
      Number(
        stabilityRange
          .toFixed(2)
      ),

    stabilityScore:
      Number(
        stabilityScore
          .toFixed(2)
      ),

    sampleReliability:
      Number(
        sampleReliability
          .toFixed(2)
      ),

    rawScore:
      Number(
        rawScore.toFixed(2)
      )
  };
}

export function calculateIndependent(
  candidates
) {
  const sorted =
    [...candidates]
      .sort(
        (
          a,
          b
        ) =>
          b.rawScore -
          a.rawScore
      );


  const usedPositions =
    new Set();


  const selected = [];


  for (
    const candidate
    of sorted
  ) {
    if (
      usedPositions.has(
        candidate.positionAKey
      )
      ||
      usedPositions.has(
        candidate.positionBKey
      )
    ) {
      continue;
    }


    selected.push(
      candidate
    );


    usedPositions.add(
      candidate.positionAKey
    );


    usedPositions.add(
      candidate.positionBKey
    );
  }


  return selected;
}

export function classifyStrength(
  item,
  independent,
  finalScore
) {
  /*
  VERY STRONG:

  Sample lớn.
  Rate tốt.
  Wilson vượt baseline rõ.
  Edge mạnh.
  Stability cao.
  Recent evidence active.
  Có >=2 cầu độc lập.
  */

  if (
    item.opportunities >= 15
    &&
    item.continuationRate >= 50
    &&
    item.wilsonEdge >= 5
    &&
    item.edge >= 20
    &&
    item.stabilityScore >= 70
    &&
    item.recentStatus === "active"
    &&
    independent >= 2
    &&
    finalScore >= 60
  ) {
    return "very-strong";
  }


  /*
  STRONG:

  Wilson phải thực sự
  vượt baseline.
  */

  if (
    item.opportunities >= 10
    &&
    item.continuationRate >= 40
    &&
    item.wilsonEdge > 0
    &&
    item.edge >= 10
    &&
    item.stabilityScore >= 60
    &&
    item.recentStatus !==
      "historical-only"
    &&
    finalScore >= 50
  ) {
    return "strong";
  }


  /*
  Historical:

  Lịch sử tốt nhưng
  60 kỳ gần không đủ mẫu.

  KHÔNG đưa vào prediction.
  */

  if (
    item.opportunities >= 10
    &&
    item.continuationRate >= 40
    &&
    item.wilsonEdge > 0
    &&
    item.edge >= 10
    &&
    item.stabilityScore >= 60
    &&
    item.recentStatus ===
      "historical-only"
  ) {
    return "historical";
  }


  return "qualified";
}
