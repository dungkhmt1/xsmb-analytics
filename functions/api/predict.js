/*
========================================================
XSMB BRIDGE PREDICT V2.6.2
RECENT EVIDENCE CALIBRATION
========================================================

Mỗi cầu =
vị trí A cố định
+
vị trí B cố định
+
chiều ghép cố định.

Pipeline:

1. Cầu hiện tại phải còn sống.
2. Streak hiện tại 2-5.
3. Backtest đúng cầu đó.
4. Sample >= 10.
5. Rate >= 40%.
6. Edge >= +10%.
7. Wilson Edge >= 0.
8. Kiểm tra 30 / 60 / 100 kỳ.
9. Phân loại bằng chứng gần:
   active
   limited
   historical-only
10. Historical-only KHÔNG đưa vào
    suggestions hôm nay.
11. Consensus chỉ cộng điểm nhỏ.
12. Score KHÔNG phải xác suất.
========================================================
*/


/*
MODEL là khóa lưu trong D1.
Giữ nguyên để không làm mất lịch sử/evidence V2.7.1.

VERSION chỉ là phiên bản code đang chạy.
*/
const MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "bridge-v2.8-learning";


const PRIZES = [
  "special",
  "g1",
  "g2",
  "g3",
  "g4",
  "g5",
  "g6",
  "g7"
];


const LABELS = {
  special: "ĐB",
  g1: "G1",
  g2: "G2",
  g3: "G3",
  g4: "G4",
  g5: "G5",
  g6: "G6",
  g7: "G7"
};


/* =====================================================
   CONFIG
===================================================== */

const MIN_CURRENT_STREAK = 2;

const MAX_CURRENT_STREAK = 5;

/*
========================================================
V2.8 BRIDGE LEARNING CONFIG

Các giá trị dưới đây là trọng số ranking, KHÔNG phải
xác suất trúng. Chúng được tách riêng để sau này
backtest và hiệu chỉnh dễ dàng.
========================================================
*/

const BRIDGE_STATE_RECENT_WINDOW = 5;
const BRIDGE_STATE_PRIOR_SAMPLES = 8;
const BRIDGE_STATE_MIN_RELIABLE_SAMPLES = 20;

const CARRY_WEIGHT_STREAK = 0.35;
const CARRY_WEIGHT_RECENT = 0.25;
const CARRY_WEIGHT_SHRUNK_RATE = 0.20;
const CARRY_WEIGHT_SAMPLE = 0.10;
const CARRY_WEIGHT_STABILITY = 0.10;


const CURRENT_REJECT_FROM = 6;


const DEFAULT_HISTORY_DRAWS = 200;

const MAX_HISTORY_DRAWS = 300;


const DEFAULT_MIN_SAMPLES = 10;

const DEFAULT_MIN_RATE = 40;

const DEFAULT_MIN_EDGE = 10;


/*
V2.6.1 = -5
V2.6.2 = 0

Wilson lower bound phải
ít nhất vượt baseline.
*/

const DEFAULT_MIN_WILSON_EDGE = 0;


/*
Recent evidence dựa trên 60 kỳ.
*/

const RECENT_ACTIVE_SAMPLES = 5;

const RECENT_LIMITED_SAMPLES = 3;


/*
Chỉ trả tối đa 12 cầu
cho prediction chính.
*/

const MAX_RECOMMENDATIONS = 12;

const MAX_HISTORICAL = 10;


/* =====================================================
   BASIC
===================================================== */

function clamp(
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


function average(values) {
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


function splitPrize(value) {
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


/* =====================================================
   VALID DRAW
===================================================== */

function validRow(row) {
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


/* =====================================================
   LOTO SET
===================================================== */

function getLotoSet(row) {
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


/* =====================================================
   POSITIONS
===================================================== */

function getPositions(row) {
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


function getDigit(
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


function makeNumber(
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


function positionName(position) {
  return (
    `${LABELS[position.prize]}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


function nextDate(dateString) {
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


/* =====================================================
   BASELINE
===================================================== */

function calculateBaseline(
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


/* =====================================================
   WILSON LOWER BOUND
===================================================== */

function wilsonLowerBound(
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


/* =====================================================
   CURRENT STREAK
===================================================== */

function getCurrentStreak(
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


/* =====================================================
   HIT SERIES
===================================================== */

function buildHitSeries(
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


/* =====================================================
   BACKTEST WINDOW
===================================================== */

function backtestWindow(
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


/* =====================================================
   RECENT STATUS
===================================================== */

function getRecentStatus(
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


/* =====================================================
   PERFORMANCE
===================================================== */

function analyzePerformance(
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


/* =====================================================
   INDEPENDENT CONSENSUS
===================================================== */

function calculateIndependent(
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


/* =====================================================
   STRENGTH
===================================================== */

function classifyStrength(
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




/* =====================================================
   CARRY TẤT CẢ VỊ TRÍ ĐÃ HIT - V2.7

Predict không ghi DB. Endpoint chỉ đọc evidence đã được save-prediction chấm,
sau đó tái tính đúng bridgeKey trên kết quả mới nhất.
===================================================== */

function addDaysISO(
  dateString,
  days
) {
  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function parseBridgeKey(
  bridgeKey
) {
  const parts =
    String(
      bridgeKey || ""
    )
      .split("|");

  if (parts.length !== 3) {
    return null;
  }

  return {
    positionAKey:
      parts[0],

    positionBKey:
      parts[1],

    direction:
      parts[2]
  };
}


/*
Đọc TẤT CẢ bridge đã HIT ở ngày liền trước.

Ví dụ:
- 30/07 HIT 08
  => 31/07 tiếp tục đúng vị trí bridge tạo 08.

- 31/07 HIT 35, 24, 05, 54
  => 01/08 tiếp tục cả 4 vị trí bridge tương ứng.
*/

/*
========================================================
V2.8 BRIDGE PERFORMANCE STATE
========================================================

Bridge state chỉ dùng dữ liệu TRACKING đã được khóa/chấm.

Không dùng kết quả tương lai.
Không coi carryScore là xác suất.

Các biến:
- tested: số lần bridge thực sự xuất hiện trong prediction.
- hits: số lần pair AB-BA HIT.
- currentHitStreak: chuỗi HIT liên tiếp gần nhất.
- recentRate: tỷ lệ HIT trong cửa sổ gần nhất.
- shrunkRate: hit-rate co về global tracked rate để giảm
  overfit khi sample nhỏ.
- directHit / reverseHit: phân biệt số gốc và số đảo về.
*/

function clamp100(value) {
  return Math.max(
    0,
    Math.min(
      100,
      Number(value) || 0
    )
  );
}


function round2(value) {
  return Number(
    (
      Number(value) || 0
    ).toFixed(2)
  );
}


function consecutiveHitStreak(rows) {
  let streak = 0;

  for (
    let i = rows.length - 1;
    i >= 0;
    i--
  ) {
    if (
      Number(rows[i].hit) === 1
    ) {
      streak++;
      continue;
    }

    break;
  }

  return streak;
}


function computeBridgeState(
  rows,
  globalRate
) {
  const ordered =
    [...rows]
      .sort(
        (a, b) =>
          String(a.prediction_date)
            .localeCompare(
              String(b.prediction_date)
            )
      );


  const tested =
    ordered.length;

  const hits =
    ordered.filter(
      row =>
        Number(row.hit) === 1
    ).length;


  const directHits =
    ordered.filter(
      row =>
        Number(row.direct_hit) === 1
    ).length;


  const reverseHits =
    ordered.filter(
      row =>
        Number(row.reverse_hit) === 1
    ).length;


  const currentHitStreak =
    consecutiveHitStreak(
      ordered
    );


  const recent =
    ordered.slice(
      -BRIDGE_STATE_RECENT_WINDOW
    );


  const recentHits =
    recent.filter(
      row =>
        Number(row.hit) === 1
    ).length;


  const overallRate =
    tested
      ? hits / tested * 100
      : 0;


  const recentRate =
    recent.length
      ? recentHits / recent.length * 100
      : 0;


  /*
  Empirical-Bayes style shrinkage:
  sample nhỏ bị kéo về hit-rate chung của toàn bộ
  bridge đã tracking, thay vì tin tuyệt đối vào 1-2 HIT.
  */
  const priorRate =
    clamp100(
      globalRate
    );


  const shrunkRate =
    (
      hits +
      (
        priorRate /
        100
      ) *
      BRIDGE_STATE_PRIOR_SAMPLES
    )
    /
    (
      tested +
      BRIDGE_STATE_PRIOR_SAMPLES
    )
    *
    100;


  const sampleReliability =
    clamp100(
      tested /
      BRIDGE_STATE_MIN_RELIABLE_SAMPLES *
      100
    );


  const stability =
    clamp100(
      100 -
      Math.abs(
        recentRate -
        overallRate
      )
    );


  const streakScore =
    clamp100(
      Math.min(
        currentHitStreak,
        3
      )
      /
      3
      *
      100
    );


  const carryScore =
    clamp100(
      streakScore *
      CARRY_WEIGHT_STREAK
      +
      recentRate *
      CARRY_WEIGHT_RECENT
      +
      shrunkRate *
      CARRY_WEIGHT_SHRUNK_RATE
      +
      sampleReliability *
      CARRY_WEIGHT_SAMPLE
      +
      stability *
      CARRY_WEIGHT_STABILITY
    );


  let carryTier =
    "C";


  if (
    currentHitStreak >= 2 &&
    carryScore >= 55
  ) {
    carryTier =
      "A";
  }
  else if (
    carryScore >= 40
  ) {
    carryTier =
      "B";
  }


  return {
    tested,
    hits,

    hitRate:
      round2(
        overallRate
      ),

    recentSamples:
      recent.length,

    recentHits,

    recentRate:
      round2(
        recentRate
      ),

    shrunkRate:
      round2(
        shrunkRate
      ),

    globalTrackedRate:
      round2(
        priorRate
      ),

    sampleReliability:
      round2(
        sampleReliability
      ),

    stability:
      round2(
        stability
      ),

    currentHitStreak,

    directHits,
    reverseHits,

    directHitRate:
      tested
        ? round2(
            directHits /
            tested *
            100
          )
        : 0,

    reverseHitRate:
      tested
        ? round2(
            reverseHits /
            tested *
            100
          )
        : 0,

    carryScore:
      round2(
        carryScore
      ),

    carryTier,

    lastTrackedDate:
      ordered.at(-1)
        ?.prediction_date
      ||
      null,

    recentHistory:
      recent.map(
        row => ({
          date:
            row.prediction_date,

          hit:
            Number(
              row.hit
            ) === 1,

          directHit:
            Number(
              row.direct_hit
            ) === 1,

          reverseHit:
            Number(
              row.reverse_hit
            ) === 1,

          hitNumber:
            row.hit_number ||
            null,

          number:
            normalize2(
              row.number
            ),

          reverseNumber:
            normalize2(
              row.reverse_number
            )
        })
      )
  };
}


async function getGlobalTrackedHitRate(
  db,
  throughDate
) {
  try {
    const row =
      await db
        .prepare(`
          SELECT
            COUNT(*) AS tested,
            COALESCE(
              SUM(hit),
              0
            ) AS hits

          FROM prediction_bridge_evidence

          WHERE model = ?
            AND prediction_date <= ?
        `)
        .bind(
          MODEL,
          throughDate
        )
        .first();


    const tested =
      Number(
        row?.tested || 0
      );


    const hits =
      Number(
        row?.hits || 0
      );


    return tested
      ? hits / tested * 100
      : 0;
  }
  catch {
    return 0;
  }
}


async function getBridgeStates(
  db,
  bridgeKeys,
  throughDate
) {
  const keys =
    [
      ...new Set(
        bridgeKeys
          .filter(Boolean)
      )
    ];


  if (!keys.length) {
    return new Map();
  }


  const globalRate =
    await getGlobalTrackedHitRate(
      db,
      throughDate
    );


  const placeholders =
    keys
      .map(
        () => "?"
      )
      .join(",");


  /*
  direct_hit / reverse_hit được thêm trong tracking-sync V2.8.
  Nếu deployment đầu tiên chưa có cột, fallback query vẫn chạy.
  */
  let rows = [];


  try {
    const response =
      await db
        .prepare(`
          SELECT
            prediction_date,
            bridge_key,
            number,
            reverse_number,
            hit,
            hit_number,
            direct_hit,
            reverse_hit

          FROM prediction_bridge_evidence

          WHERE model = ?
            AND prediction_date <= ?
            AND bridge_key IN (${placeholders})

          ORDER BY
            prediction_date ASC
        `)
        .bind(
          MODEL,
          throughDate,
          ...keys
        )
        .all();

    rows =
      response.results ||
      [];
  }
  catch {
    const response =
      await db
        .prepare(`
          SELECT
            prediction_date,
            bridge_key,
            number,
            reverse_number,
            hit,
            hit_number,
            0 AS direct_hit,
            0 AS reverse_hit

          FROM prediction_bridge_evidence

          WHERE model = ?
            AND prediction_date <= ?
            AND bridge_key IN (${placeholders})

          ORDER BY
            prediction_date ASC
        `)
        .bind(
          MODEL,
          throughDate,
          ...keys
        )
        .all();

    rows =
      response.results ||
      [];
  }


  const grouped =
    new Map();


  for (const row of rows) {
    if (
      !grouped.has(
        row.bridge_key
      )
    ) {
      grouped.set(
        row.bridge_key,
        []
      );
    }

    grouped
      .get(
        row.bridge_key
      )
      .push(
        row
      );
  }


  const states =
    new Map();


  for (const key of keys) {
    states.set(
      key,
      computeBridgeState(
        grouped.get(key) ||
        [],
        globalRate
      )
    );
  }


  return states;
}


async function getPreviousHitEvidence(
  db,
  predictionDate
) {
  const previousDate =
    addDaysISO(
      predictionDate,
      -1
    );

  if (!previousDate) {
    return {
      date: null,
      hits: []
    };
  }

  try {
    const response =
      await db
        .prepare(`
          SELECT
            bridge_key,
            bridge,
            number,
            reverse_number,
            pair_key,
            hit_number,
            base_rank,
            score,
            strength

          FROM prediction_bridge_evidence

          WHERE prediction_date = ?
            AND model = ?
            AND hit = 1

          ORDER BY
            base_rank ASC,
            score DESC
        `)
        .bind(
          previousDate,
          MODEL
        )
        .all();

    return {
      date:
        previousDate,

      hits:
        response.results || []
    };
  }
  catch (error) {
    console.error(
      "carry evidence:",
      error
    );

    return {
      date:
        previousDate,

      hits: []
    };
  }
}


/*
Tính số mới trực tiếp từ ĐÚNG VỊ TRÍ bridge đã HIT.

Không yêu cầu bridge hôm nay phải còn streak,
qualified hoặc nằm trong candidate pool.
*/
async function buildCarryPriorityRecommendations(
  db,
  latest,
  positions,
  evidence
) {
  const byKey =
    new Map(
      positions.map(
        position => [
          position.key,
          position
        ]
      )
    );


  const priorities = [];

  const usedBridgeKeys =
    new Set();


  const bridgeKeys =
    (
      evidence?.hits ||
      []
    )
      .map(
        hit =>
          hit.bridge_key
      )
      .filter(Boolean);


  const states =
    await getBridgeStates(
      db,
      bridgeKeys,
      evidence?.date ||
      latest.draw_date
    );


  for (
    const hit of
    evidence?.hits || []
  ) {
    const bridgeKey =
      hit.bridge_key;


    if (
      !bridgeKey ||
      usedBridgeKeys.has(
        bridgeKey
      )
    ) {
      continue;
    }


    const parsed =
      parseBridgeKey(
        bridgeKey
      );


    if (!parsed) {
      continue;
    }


    const positionA =
      byKey.get(
        parsed.positionAKey
      );


    const positionB =
      byKey.get(
        parsed.positionBKey
      );


    if (
      !positionA ||
      !positionB
    ) {
      continue;
    }


    const reverse =
      parsed.direction ===
      "B+A";


    const number =
      makeNumber(
        latest,
        positionA,
        positionB,
        reverse
      );


    if (!number) {
      continue;
    }


    const nameA =
      positionName(
        positionA
      );


    const nameB =
      positionName(
        positionB
      );


    const bridge =
      reverse
        ? `${nameB} + ${nameA}`
        : `${nameA} + ${nameB}`;


    const state =
      states.get(
        bridgeKey
      )
      ||
      computeBridgeState(
        [],
        0
      );


    /*
    Base ranking của carry vẫn được đặt cao hơn candidate thường,
    nhưng KHÔNG còn tất cả carry = 100.

    70..100:
    - carry yếu vẫn được giữ,
    - carry có streak/performance tốt sẽ đứng trước.
    */
    const dynamicScore =
      70 +
      state.carryScore *
      0.30;


    priorities.push({
      number,

      streak:
        Math.max(
          1,
          state.currentHitStreak
        ),

      history:
        state.recentHistory ||
        [],

      positionA,
      positionB,

      positionAKey:
        positionA.key,

      positionBKey:
        positionB.key,

      positionAName:
        nameA,

      positionBName:
        nameB,

      reverse,

      direction:
        parsed.direction,

      bridge,

      bridgeKey,

      score:
        round2(
          dynamicScore
        ),

      sourceScore:
        Number(
          hit.score || 0
        ),

      strength:
        state.carryTier ===
        "A"
          ? "very-strong"
          : state.carryTier ===
            "B"
            ? "strong"
            : "qualified",

      recentStatus:
        "carry-hit-learning",

      carryPriority:
        true,

      carryTier:
        state.carryTier,

      carryScore:
        state.carryScore,

      bridgeState:
        state,

      previousHitDate:
        evidence.date,

      previousNumber:
        normalize2(
          hit.number
        ),

      previousReverseNumber:
        normalize2(
          hit.reverse_number
        ),

      previousHitNumber:
        hit.hit_number ||
        null,

      carryReason:
        `Bridge HIT ${evidence.date} • tier ${state.carryTier} • streak ${state.currentHitStreak} • carryScore ${state.carryScore}`
    });


    usedBridgeKeys.add(
      bridgeKey
    );
  }


  priorities.sort(
    (
      a,
      b
    ) => {
      const tierRank = {
        A: 3,
        B: 2,
        C: 1
      };


      const tierDiff =
        (
          tierRank[
            b.carryTier
          ] || 0
        )
        -
        (
          tierRank[
            a.carryTier
          ] || 0
        );


      if (tierDiff !== 0) {
        return tierDiff;
      }


      return (
        Number(
          b.carryScore || 0
        )
        -
        Number(
          a.carryScore || 0
        )
      );
    }
  );


  return priorities;
}


function mergeCarryWithRecommendations(
  carryItems,
  normalItems
) {
  const merged = [];
  const seenBridge =
    new Set();


  for (
    const item of [
      ...carryItems,
      ...normalItems
    ]
  ) {
    const key =
      item.bridgeKey ||
      `${item.number}|${item.bridge}`;

    if (
      seenBridge.has(
        key
      )
    ) {
      continue;
    }

    seenBridge.add(
      key
    );

    merged.push(
      item
    );
  }


  return merged;
}


/* =====================================================
   AB-BA PAIR LAYER V2.7
===================================================== */

function normalize2(value) {
  const digits =
    String(value ?? "")
      .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits
    .padStart(2, "0")
    .slice(-2);
}


function reverse2(value) {
  const number =
    normalize2(value);

  if (!number) {
    return null;
  }

  return `${number[1]}${number[0]}`;
}


function canonicalPairKey(value) {
  const a =
    normalize2(value);

  if (!a) {
    return null;
  }

  const b =
    reverse2(a);

  return [a, b]
    .sort()
    .join("-");
}


function pairDisplay(a, b) {
  if (!a) {
    return "--";
  }

  if (!b || a === b) {
    return a;
  }

  return `${a}-${b}`;
}


/*
Mỗi recommendation gốc vẫn giữ nguyên bridgeKey.
Layer này chỉ gom recommendation thành cặp AB-BA.

PairScore KHÔNG phải xác suất.
- 65%: cầu mạnh nhất của cặp
- 25%: hỗ trợ của số đảo nếu cũng qualified
- 10%: đồng thuận nhiều cầu trong cùng pair
*/
function buildABBARecommendations(
  recommendations,
  maxPairs
) {
  const groups =
    new Map();


  for (const item of recommendations) {
    const number =
      normalize2(
        item.number
      );

    if (!number) {
      continue;
    }

    const reverseNumber =
      reverse2(number);

    const key =
      canonicalPairKey(number);

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push({
        ...item,
        number,
        reverseNumber
      });
  }


  const pairs = [];


  for (const [pairKey, items] of groups) {
    const sorted =
      [...items]
        .sort(
          (a, b) => {
            const sa =
              Number(a.score || 0);

            const sb =
              Number(b.score || 0);

            return sb - sa;
          }
        );


    const best =
      sorted[0];

    const number =
      best.number;

    const reverseNumber =
      reverse2(number);


    const reverseSupport =
      sorted
        .filter(
          item =>
            item.number ===
            reverseNumber
        )
        .sort(
          (a, b) =>
            Number(b.score || 0) -
            Number(a.score || 0)
        )[0]
      ||
      null;


    const bestScore =
      Number(
        best.score || 0
      );

    const reverseScore =
      Number(
        reverseSupport?.score || 0
      );


    const bridgeCount =
      new Set(
        sorted
          .map(
            item =>
              item.bridgeKey
          )
          .filter(Boolean)
      )
        .size;


    const agreementScore =
      Math.min(
        100,
        bridgeCount * 20
      );


    const pairScore =
      Math.max(
        0,
        Math.min(
          100,
          bestScore * 0.65 +
          reverseScore * 0.25 +
          agreementScore * 0.10
        )
      );


    const pairNumbers =
      number === reverseNumber
        ? [number]
        : [number, reverseNumber];


    pairs.push({
      ...best,

      number,
      reverseNumber,

      pairKey,
      pairNumbers,

      pair:
        pairDisplay(
          number,
          reverseNumber
        ),

      pairScore:
        Number(
          pairScore.toFixed(2)
        ),

      score:
        Number(
          pairScore.toFixed(2)
        ),

      sourceScore:
        bestScore,

      reverseSupport:
        reverseSupport
          ? {
              number:
                reverseSupport.number,

              score:
                Number(
                  reverseSupport.score || 0
                ),

              bridgeKey:
                reverseSupport.bridgeKey ||
                null,

              bridge:
                reverseSupport.bridge ||
                null
            }
          : null,

      pairBridgeCount:
        bridgeCount,

      pairSources:
        sorted.map(
          source => ({
            number:
              source.number,

            bridgeKey:
              source.bridgeKey ||
              null,

            bridge:
              source.bridge ||
              null,

            score:
              Number(
                source.score || 0
              ),

            strength:
              source.strength ||
              null,

            carryPriority:
              Boolean(
                source.carryPriority
              )
          })
        ),

      /*
      Chỉ cần một source trong pair là cầu HIT carry
      thì toàn pair được xem là ưu tiên.
      */
      carryPriority:
        sorted.some(
          source =>
            Boolean(
              source.carryPriority
            )
        ),

      carryTier:
        sorted.find(
          source =>
            Boolean(
              source.carryPriority
            )
        )?.carryTier
        ||
        null,

      carryScore:
        Number(
          sorted.find(
            source =>
              Boolean(
                source.carryPriority
              )
          )?.carryScore
          ||
          0
        ),

      bridgeState:
        sorted.find(
          source =>
            Boolean(
              source.carryPriority
            )
        )?.bridgeState
        ||
        null,

      carryReason:
        sorted.find(
          source =>
            Boolean(
              source.carryPriority
            )
        )?.carryReason
        ||
        null,

      previousHitDate:
        sorted.find(
          source =>
            Boolean(
              source.carryPriority
            )
        )?.previousHitDate
        ||
        null,

      previousHitNumber:
        sorted.find(
          source =>
            Boolean(
              source.carryPriority
            )
        )?.previousHitNumber
        ||
        null,

      hitRule:
        "AB-or-BA"
    });
  }


  pairs.sort(
    (a, b) => {
      /*
      Cầu đang chạy/HIT hôm trước LUÔN đứng trước
      recommendation thường.
      */
      const carryTierRank = {
        A: 3,
        B: 2,
        C: 1
      };


      const carryPresenceDiff =
        Number(
          Boolean(
            b.carryPriority
          )
        )
        -
        Number(
          Boolean(
            a.carryPriority
          )
        );


      if (
        carryPresenceDiff !==
        0
      ) {
        return carryPresenceDiff;
      }


      if (
        a.carryPriority &&
        b.carryPriority
      ) {
        const tierDiff =
          (
            carryTierRank[
              b.carryTier
            ] || 0
          )
          -
          (
            carryTierRank[
              a.carryTier
            ] || 0
          );


        if (tierDiff !== 0) {
          return tierDiff;
        }


        const carryScoreDiff =
          Number(
            b.carryScore || 0
          )
          -
          Number(
            a.carryScore || 0
          );


        if (
          carryScoreDiff !==
          0
        ) {
          return carryScoreDiff;
        }
      }


      const strengthOrder = {
        "very-strong": 4,
        "strong": 3,
        "qualified": 2,
        "historical": 1
      };


      const strengthDiff =
        (
          strengthOrder[
            b.strength
          ] || 0
        )
        -
        (
          strengthOrder[
            a.strength
          ] || 0
        );


      if (strengthDiff !== 0) {
        return strengthDiff;
      }


      if (
        b.pairScore !==
        a.pairScore
      ) {
        return (
          b.pairScore -
          a.pairScore
        );
      }


      return (
        Number(
          b.sourceScore || 0
        )
        -
        Number(
          a.sourceScore || 0
        )
      );
    }
  );


  return pairs.slice(
    0,
    maxPairs
  );
}


function buildMinimalCandidatePool(
  active
) {
  return active.map(
    item => {
      const number =
        normalize2(
          item.number
        );

      const reverseNumber =
        reverse2(number);

      return {
        number,

        reverseNumber,

        pairKey:
          canonicalPairKey(
            number
          ),

        pairNumbers:
          number === reverseNumber
            ? [number]
            : [
                number,
                reverseNumber
              ],

        pair:
          pairDisplay(
            number,
            reverseNumber
          ),

        bridgeKey:
          item.bridgeKey ||
          null,

        bridge:
          item.bridge ||
          null,

        positionA:
          item.positionA ||
          null,

        positionB:
          item.positionB ||
          null,

        direction:
          item.direction ||
          null,

        score:
          Number(
            item.score || 0
          ),

        strength:
          item.strength ||
          null,

        streak:
          Number(
            item.streak || 0
          )
      };
    }
  );
}


/* =====================================================
   API
===================================================== */

export async function onRequestGet(
  context
) {
  const db =
    context.env.DB;

  if (!db) {
    return Response.json(
      {
        success: false,
        module: "bridge-predict",
        version: VERSION,
        message: "Không tìm thấy D1 binding DB"
      },
      { status: 500 }
    );
  }

  try {
    const DB =
      context.env.DB;


    if (!DB) {
      return Response.json(
        {
          success: false,

          module:
            "bridge-predict",

          version:
            VERSION,

          message:
            "Không tìm thấy DB."
        },
        {
          status: 500
        }
      );
    }


    const url =
      new URL(
        context.request.url
      );


    /*
    ====================================================
    WALK-FORWARD AS-OF DATE

    /api/predict?asOf=2026-08-01

    Chỉ dùng kết quả <= asOf.
    Nhờ vậy tracking-sync có thể backfill lịch sử
    mà không nhìn thấy dữ liệu tương lai.
    ====================================================
    */

    const asOf =
      url.searchParams.get(
        "asOf"
      );


    if (
      asOf &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        asOf
      )
    ) {
      return Response.json(
        {
          success: false,
          module:
            "bridge-predict",
          version:
            VERSION,
          message:
            "asOf phải có định dạng YYYY-MM-DD"
        },
        {
          status: 400
        }
      );
    }


    const historyDraws =
      clamp(
        Number(
          url.searchParams.get(
            "days"
          )
          ||
          DEFAULT_HISTORY_DRAWS
        ),
        50,
        MAX_HISTORY_DRAWS
      );


    const minSamples =
      clamp(
        Number(
          url.searchParams.get(
            "minSamples"
          )
          ||
          DEFAULT_MIN_SAMPLES
        ),
        1,
        50
      );


    const minRate =
      clamp(
        Number(
          url.searchParams.get(
            "minRate"
          )
          ||
          DEFAULT_MIN_RATE
        ),
        0,
        100
      );


    const minEdge =
      clamp(
        Number(
          url.searchParams.get(
            "minEdge"
          )
          ??
          DEFAULT_MIN_EDGE
        ),
        -100,
        100
      );


    const minWilsonEdge =
      clamp(
        Number(
          url.searchParams.get(
            "minWilsonEdge"
          )
          ??
          DEFAULT_MIN_WILSON_EDGE
        ),
        -100,
        100
      );


    /*
    DATA
    */

    const query =
      asOf
        ?
        await DB
          .prepare(`
            SELECT
              draw_date,
              special,
              g1,
              g2,
              g3,
              g4,
              g5,
              g6,
              g7

            FROM results

            WHERE draw_date <= ?

            ORDER BY draw_date DESC

            LIMIT ?
          `)
          .bind(
            asOf,
            historyDraws
          )
          .all()
        :
        await DB
          .prepare(`
            SELECT
              draw_date,
              special,
              g1,
              g2,
              g3,
              g4,
              g5,
              g6,
              g7

            FROM results

            ORDER BY draw_date DESC

            LIMIT ?
          `)
          .bind(
            historyDraws
          )
          .all();


    const rows =
      (
        query.results ||
        []
      )
        .filter(
          validRow
        )
        .reverse();


    if (
      rows.length < 30
    ) {
      return Response.json({
        success: false,

        module:
          "bridge-predict",

        version:
          VERSION,

        message:
          "Cần ít nhất 30 kỳ hợp lệ.",

        validDraws:
          rows.length
      });
    }


    const latest =
      rows[
        rows.length - 1
      ];


    const lotoSets =
      rows.map(
        getLotoSet
      );


    const baselineRate =
      calculateBaseline(
        lotoSets
      );


    const positions =
      getPositions(
        latest
      );


    /*
    ====================================================
    ƯU TIÊN VỊ TRÍ HIT NGÀY TRƯỚC
    ====================================================
    */

    const predictionDate =
      nextDate(
        latest.draw_date
      );


    const previousHitEvidence =
      await getPreviousHitEvidence(
        db,
        predictionDate
      );


    const carryPriorityRecommendations =
      await buildCarryPriorityRecommendations(
        db,
        latest,
        positions,
        previousHitEvidence
      );


    /*
    ====================================================
    PHASE 1
    ACTIVE BRIDGES
    ====================================================
    */

    const active = [];


    for (
      let a = 0;
      a < positions.length;
      a++
    ) {
      const positionA =
        positions[a];


      for (
        let b = a + 1;
        b < positions.length;
        b++
      ) {
        const positionB =
          positions[b];


        if (
          positionA.prize ===
          positionB.prize
        ) {
          continue;
        }


        for (
          const reverse
          of [false, true]
        ) {
          const current =
            getCurrentStreak(
              rows,
              lotoSets,
              positionA,
              positionB,
              reverse
            );


          if (
            current.streak <
              MIN_CURRENT_STREAK
            ||
            current.streak >
              MAX_CURRENT_STREAK
          ) {
            continue;
          }


          const number =
            makeNumber(
              latest,
              positionA,
              positionB,
              reverse
            );


          if (!number) {
            continue;
          }


          const nameA =
            positionName(
              positionA
            );


          const nameB =
            positionName(
              positionB
            );


          const direction =
            reverse
              ? "B+A"
              : "A+B";


          active.push({
            number,

            streak:
              current.streak,

            history:
              current.history,

            positionA,

            positionB,

            positionAKey:
              positionA.key,

            positionBKey:
              positionB.key,

            positionAName:
              nameA,

            positionBName:
              nameB,

            reverse,

            direction,

            bridge:
              reverse
                ?
                `${nameB} + ${nameA}`
                :
                `${nameA} + ${nameB}`,

            bridgeKey:
              `${positionA.key}|` +
              `${positionB.key}|` +
              `${direction}`
          });
        }
      }
    }


    /*
    ====================================================
    PHASE 2
    BACKTEST
    ====================================================
    */

    const tested = [];


    const rejected = {
      insufficientSamples: 0,

      lowRate: 0,

      lowEdge: 0,

      lowWilsonEdge: 0
    };


    for (
      const candidate
      of active
    ) {
      const series =
        buildHitSeries(
          rows,
          lotoSets,
          candidate.positionA,
          candidate.positionB,
          candidate.reverse
        );


      const performance =
        analyzePerformance(
          series,
          candidate.streak,
          baselineRate
        );


      if (
        performance.opportunities <
        minSamples
      ) {
        rejected
          .insufficientSamples++;

        continue;
      }


      if (
        performance.continuationRate <
        minRate
      ) {
        rejected.lowRate++;

        continue;
      }


      if (
        performance.edge <
        minEdge
      ) {
        rejected.lowEdge++;

        continue;
      }


      if (
        performance.wilsonEdge <
        minWilsonEdge
      ) {
        rejected
          .lowWilsonEdge++;

        continue;
      }


      tested.push({
        ...candidate,
        ...performance
      });
    }


    /*
    ====================================================
    GROUP BY NUMBER
    ====================================================
    */

    const numberGroups =
      new Map();


    for (
      const item
      of tested
    ) {
      if (
        !numberGroups.has(
          item.number
        )
      ) {
        numberGroups.set(
          item.number,
          []
        );
      }


      numberGroups
        .get(item.number)
        .push(item);
    }


    /*
    ====================================================
    CONSENSUS
    ====================================================
    */

    const consensusMap =
      new Map();


    for (
      const [
        number,
        items
      ]
      of numberGroups
    ) {
      const independent =
        calculateIndependent(
          items
        );


      consensusMap.set(
        number,
        {
          related:
            items.length,

          independent:
            independent.length
        }
      );
    }


    /*
    ====================================================
    FINAL CALIBRATION
    ====================================================
    */

    const allQualified =
      tested.map(
        item => {
          const consensus =
            consensusMap.get(
              item.number
            );


          const independent =
            consensus
              ?.independent || 1;


          const related =
            consensus
              ?.related || 1;


          /*
          Bonus tối đa 8.
          */

          const consensusBonus =
            Math.min(
              8,
              Math.max(
                0,
                independent - 1
              )
              *
              2
            );


          const independentRatio =
            independent /
            related;


          const correlationPenalty =
            related > 1
              ?
              (
                1 -
                independentRatio
              )
              *
              10
              :
              0;


          /*
          Recent adjustment.

          active          +4
          limited          0
          historical-only -6
          */

          let recentAdjustment = 0;


          if (
            item.recentStatus ===
            "active"
          ) {
            recentAdjustment = 4;
          }
          else if (
            item.recentStatus ===
            "historical-only"
          ) {
            recentAdjustment = -6;
          }


          const finalScore =
            clamp(
              item.rawScore
              +
              consensusBonus
              -
              correlationPenalty
              +
              recentAdjustment,
              0,
              100
            );


          const strength =
            classifyStrength(
              item,
              independent,
              finalScore
            );


          return {
            bridgeKey:
              item.bridgeKey,

            number:
              item.number,

            streak:
              item.streak,

            bridge:
              item.bridge,

            positionA:
              item.positionAName,

            positionB:
              item.positionBName,

            direction:
              item.direction,

            opportunities:
              item.opportunities,

            continued:
              item.continued,

            continuationRate:
              item.continuationRate,

            weightedRate:
              item.weightedRate,

            baselineRate:
              item.baselineRate,

            edge:
              item.edge,

            wilsonLowerBound:
              item.wilsonLowerBound,

            wilsonEdge:
              item.wilsonEdge,

            rate30:
              item.rate30,

            samples30:
              item.samples30,

            rate60:
              item.rate60,

            samples60:
              item.samples60,

            rate100:
              item.rate100,

            samples100:
              item.samples100,

            recentRate:
              item.recentRate,

            recentSamples:
              item.recentSamples,

            recentStatus:
              item.recentStatus,

            stabilityRange:
              item.stabilityRange,

            stabilityScore:
              item.stabilityScore,

            sampleReliability:
              item.sampleReliability,

            rawScore:
              item.rawScore,

            independentConsensus:
              independent,

            relatedBridgeCount:
              related,

            consensusBonus:
              Number(
                consensusBonus
                  .toFixed(2)
              ),

            correlationPenalty:
              Number(
                correlationPenalty
                  .toFixed(2)
              ),

            recentAdjustment,

            score:
              Number(
                finalScore
                  .toFixed(2)
              ),

            strength,

            history:
              item.history
          };
        }
      );


    /*
    ====================================================
    SORT

    Strength
    → Final Score
    → Wilson Edge
    → Sample
    → Stability
    ====================================================
    */

    const strengthRank = {
      "very-strong": 4,
      "strong": 3,
      "historical": 2,
      "qualified": 1
    };


    allQualified.sort(
      (
        a,
        b
      ) => {

        if (
          strengthRank[
            b.strength
          ]
          !==
          strengthRank[
            a.strength
          ]
        ) {
          return (
            strengthRank[
              b.strength
            ]
            -
            strengthRank[
              a.strength
            ]
          );
        }


        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }


        if (
          b.wilsonEdge !==
          a.wilsonEdge
        ) {
          return (
            b.wilsonEdge -
            a.wilsonEdge
          );
        }


        if (
          b.opportunities !==
          a.opportunities
        ) {
          return (
            b.opportunities -
            a.opportunities
          );
        }


        return (
          b.stabilityScore -
          a.stabilityScore
        );
      }
    );


    /*
    Historical-only KHÔNG phải
    prediction hôm nay.
    */

    const historicalOnly =
      allQualified.filter(
        item =>
          item.recentStatus ===
          "historical-only"
      );


    const recommendations =
      allQualified.filter(
        item =>
          item.recentStatus !==
          "historical-only"
      );


    const veryStrong =
      recommendations.filter(
        item =>
          item.strength ===
          "very-strong"
      );


    const strong =
      recommendations.filter(
        item =>
          item.strength ===
          "strong"
      );


    const qualified =
      recommendations.filter(
        item =>
          item.strength ===
          "qualified"
      );


    /*
    ====================================================
    UNIQUE NUMBERS

    Chỉ recommendations thật.
    ====================================================
    */

    const recommendedNumbers =
      [
        ...new Set(
          recommendations.map(
            item =>
              item.number
          )
        )
      ];


    /*
    ====================================================
    NUMBER SUMMARY
    ====================================================
    */

    const numberSummary = [];


    for (
      const number
      of recommendedNumbers
    ) {
      const items =
        recommendations.filter(
          item =>
            item.number ===
            number
        );


      const best =
        items[0];


      numberSummary.push({
        number,

        score:
          best.score,

        strength:
          best.strength,

        bestBridge:
          best.bridge,

        bestWilsonEdge:
          best.wilsonEdge,

        bestRate:
          best.continuationRate,

        independentCount:
          best.independentConsensus,

        bridgeCount:
          items.length
      });
    }


    numberSummary.sort(
      (
        a,
        b
      ) => {

        if (
          strengthRank[
            b.strength
          ]
          !==
          strengthRank[
            a.strength
          ]
        ) {
          return (
            strengthRank[
              b.strength
            ]
            -
            strengthRank[
              a.strength
            ]
          );
        }


        return (
          b.score -
          a.score
        );
      }
    );


    /*
    ====================================================
    AB-BA OUTPUT
    ====================================================
    */

    /*
    Carry priority đứng trước recommendation thường.

    Nếu ngày trước có nhiều HIT thì giữ TẤT CẢ bridge HIT,
    không chỉ lấy một bridge.
    */

    const recommendationsWithCarry =
      mergeCarryWithRecommendations(
        carryPriorityRecommendations,
        recommendations
      );


    const pairSuggestions =
      buildABBARecommendations(
        recommendationsWithCarry,
        MAX_RECOMMENDATIONS
      );


    const candidatePool =
      buildMinimalCandidatePool(
        mergeCarryWithRecommendations(
          carryPriorityRecommendations,
          active
        )
      );


    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return Response.json({
      success: true,

      module:
        "bridge-predict",

      version:
        VERSION,

      model:
        MODEL,

      sourceDate:
        latest.draw_date,

      predictionDate,

      analyzedDraws:
        rows.length,

      baselineRate,

      totalPositions:
        positions.length,

      activeCandidateCount:
        active.length,

      /*
      Qua statistical filters,
      bao gồm historical-only.
      */

      qualifiedCount:
        allQualified.length,

      /*
      Thực sự dùng làm prediction.
      */

      recommendationCount:
        recommendations.length,

      historicalOnlyCount:
        historicalOnly.length,

      returnedCount:
        pairSuggestions.length,

      uniqueNumberCount:
        recommendedNumbers.length,

      uniquePairCount:
        pairSuggestions.length,

      suggestionMode:
        "AB-BA",

      walkForward: {
        asOf:
          asOf || latest.draw_date,

        latestUsedDate:
          latest.draw_date,

        futureDataUsed:
          false
      },

      carryPriority: {
        sourceHitDate:
          previousHitEvidence.date,

        hitBridgeCount:
          previousHitEvidence.hits.length,

        promotedCount:
          carryPriorityRecommendations.length,

        promoted:
          carryPriorityRecommendations.map(
            item => ({
              previousNumber:
                item.previousNumber,

              previousHitNumber:
                item.previousHitNumber,

              bridgeKey:
                item.bridgeKey,

              bridge:
                item.bridge,

              currentNumber:
                item.number,

              currentPair:
                pairDisplay(
                  item.number,
                  reverse2(
                    item.number
                  )
                ),

              carryTier:
                item.carryTier,

              carryScore:
                item.carryScore,

              bridgeState:
                item.bridgeState
            })
          )
      },


      rule: {
        currentStreaks: [
          2,
          3,
          4,
          5
        ],

        minSamples,

        minContinuationRate:
          minRate,

        minEdgeVsBaseline:
          minEdge,

        minWilsonEdge,

        recentWindow:
          60,

        recentActiveSamples:
          RECENT_ACTIVE_SAMPLES,

        recentLimitedSamples:
          RECENT_LIMITED_SAMPLES,

        historicalOnlyExcluded:
          true,

        strictStrengthRules:
          true,

        ranking:
          "abba-strength-pairscore-wilson-sample-stability",

        maxRecommendations:
          MAX_RECOMMENDATIONS,

        scoreIsProbability:
          false,

        pairHitRule:
          "AB hoặc BA xuất hiện đều tính HIT"
      },


      rejected,


      counts: {
        veryStrong:
          veryStrong.length,

        strong:
          strong.length,

        qualified:
          qualified.length,

        historical:
          historicalOnly.length,

        recommendations:
          recommendations.length
      },


      /*
      Prediction thật.
      */

      suggestions:
        pairSuggestions,

      /*
      Candidate pool tối giản để LIVE có thể
      tiếp tục bridge HIT ngay cả khi bridge
      bị filter khỏi suggestions.
      */

      candidates:
        candidatePool,


      /*
      Chỉ nghiên cứu.
      */

      historicalCandidates:
        historicalOnly.slice(
          0,
          MAX_HISTORICAL
        ),


      numberSummary:
        numberSummary.slice(
          0,
          20
        ),


      groups: {
        veryStrong:
          veryStrong.slice(
            0,
            12
          ),

        strong:
          strong.slice(
            0,
            12
          ),

        qualified:
          qualified.slice(
            0,
            12
          ),

        historical:
          historicalOnly.slice(
            0,
            10
          )
      },


      note:
        "V2.7 AB-BA tiếp tục toàn bộ vị trí bridge đã HIT ở ngày liền trước. Nếu nhiều cặp HIT, tất cả vị trí HIT đều được đưa vào nhóm ưu tiên kỳ kế tiếp. AB hoặc BA xuất hiện đều tính HIT."
    });


  } catch (error) {

    console.error(
      "Predict V2.6.2:",
      error
    );


    return Response.json(
      {
        success: false,

        module:
          "bridge-predict",

        version:
          VERSION,

        message:
          error?.message ||
          "Lỗi Predict V2.6.2."
      },
      {
        status: 500
      }
    );
  }
}