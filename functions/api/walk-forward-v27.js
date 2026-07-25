/*
========================================================
XSMB WALK-FORWARD V2.7.1
1 NGÀY / 1 REQUEST - GIẢM TẢI CLOUDFLARE
========================================================

Ví dụ:
/api/walk-forward-v27?offset=1&window=200
/api/walk-forward-v27?offset=10&window=200

offset=1:
- target = kỳ mới nhất đã có kết quả
- source = kỳ ngay trước target
- model chỉ được dùng dữ liệu đến source

Model kiểm nghiệm: bridge-v2.6.2
Score không phải xác suất trúng.
========================================================
*/

const VERSION = "walk-forward-v2.7.1";
const MODEL_VERSION = "bridge-v2.6.2";

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

const MIN_CURRENT_STREAK = 2;
const MAX_CURRENT_STREAK = 5;
const REJECT_STREAK_FROM = 6;

const DEFAULT_OFFSET = 1;
const MAX_OFFSET = 90;

const DEFAULT_WINDOW = 200;
const MAX_WINDOW = 250;

const DEFAULT_MIN_TRAIN = 100;

/*
V2.6.2 calibration
*/
const MIN_SAMPLES = 10;
const MIN_RATE = 40;
const MIN_EDGE = 10;
const MIN_WILSON_EDGE = 0;

const RECENT_ACTIVE_SAMPLES = 5;
const RECENT_LIMITED_SAMPLES = 3;

const MAX_RECOMMENDATIONS = 12;


/* =====================================================
   BASIC
===================================================== */

function clamp(
  value,
  min,
  max
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      n
    )
  );
}


function round(
  value,
  digits = 2
) {
  const p =
    10 ** digits;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      )
      *
      p
    )
    /
    p
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
   VALID ROW
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


  return (
    special.length === 1
    &&
    g1.length === 1
    &&
    g2.length === 2
    &&
    g3.length === 6
    &&
    g4.length === 4
    &&
    g5.length === 6
    &&
    g6.length === 3
    &&
    g7.length === 4

    &&

    special.every(
      x =>
        /^\d{5}$/.test(x)
    )

    &&

    g1.every(
      x =>
        /^\d{5}$/.test(x)
    )

    &&

    g2.every(
      x =>
        /^\d{5}$/.test(x)
    )

    &&

    g3.every(
      x =>
        /^\d{5}$/.test(x)
    )

    &&

    g4.every(
      x =>
        /^\d{4}$/.test(x)
    )

    &&

    g5.every(
      x =>
        /^\d{4}$/.test(x)
    )

    &&

    g6.every(
      x =>
        /^\d{3}$/.test(x)
    )

    &&

    g7.every(
      x =>
        /^\d{2}$/.test(x)
    )
  );
}


/* =====================================================
   LOTO
===================================================== */

function getLotoSet(row) {
  const result =
    new Set();


  for (
    const prize
    of PRIZES
  ) {
    const numbers =
      splitPrize(
        row[prize]
      );


    for (
      const number
      of numbers
    ) {
      result.add(
        number.slice(-2)
      );
    }
  }


  return result;
}


/* =====================================================
   POSITIONS
===================================================== */

function getPositions(row) {
  const result = [];


  for (
    const prize
    of PRIZES
  ) {
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
          digitIndex <
            number.length;
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
      row[
        position.prize
      ]
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
    a === null
    ||
    b === null
  ) {
    return null;
  }


  return reverse
    ? `${b}${a}`
    : `${a}${b}`;
}


function positionName(
  position
) {
  return (
    `${LABELS[
      position.prize
    ]}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


/* =====================================================
   BASELINE
===================================================== */

function calculateBaseline(
  lotoSets
) {
  if (
    lotoSets.length < 2
  ) {
    return 0;
  }


  let total = 0;

  let count = 0;


  for (
    let i = 1;
    i < lotoSets.length;
    i++
  ) {
    total +=
      lotoSets[i].size;

    count++;
  }


  return count
    ?
    round(
      total / count
    )
    :
    0;
}


/* =====================================================
   WILSON
===================================================== */

function wilsonLowerBound(
  successes,
  total
) {
  if (
    total <= 0
  ) {
    return 0;
  }


  const z = 1.96;


  const p =
    successes /
    total;


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
        2 *
        total
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


  /*
  rows cuối cùng là source.

  Transition cuối đã biết:
  rows[-2] -> rows[-1]
  */

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


    if (
      !number
      ||
      !lotoSets[
        i + 1
      ].has(number)
    ) {
      break;
    }


    streak++;


    if (
      streak >=
      REJECT_STREAK_FROM
    ) {
      break;
    }
  }


  return streak;
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
  const series =
    new Array(
      Math.max(
        0,
        rows.length - 1
      )
    );


  for (
    let i = 0;
    i <
      rows.length - 1;
    i++
  ) {
    const number =
      makeNumber(
        rows[i],
        positionA,
        positionB,
        reverse
      );


    series[i] =
      !!number
      &&
      lotoSets[
        i + 1
      ].has(number);
  }


  return series;
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
   SINGLE PASS BACKTEST
===================================================== */

function analyzeHitSeries(
  hitSeries,
  streak,
  baselineRate
) {
  /*
  Loại streak đang chạy hiện tại
  khỏi phần kiểm định lịch sử.
  */

  const historicalEnd =
    Math.max(
      0,
      hitSeries.length -
      streak
    );


  const all = {
    opportunities: 0,
    continued: 0
  };


  const w30 = {
    opportunities: 0,
    continued: 0
  };


  const w60 = {
    opportunities: 0,
    continued: 0
  };


  const w100 = {
    opportunities: 0,
    continued: 0
  };


  const start30 =
    Math.max(
      0,
      historicalEnd - 30
    );


  const start60 =
    Math.max(
      0,
      historicalEnd - 60
    );


  const start100 =
    Math.max(
      0,
      historicalEnd - 100
    );


  let consecutiveBefore = 0;

  let weightedTotal = 0;

  let weightedHits = 0;


  for (
    let i = 0;
    i < historicalEnd;
    i++
  ) {

    /*
    Trước transition i
    phải có đủ streak hit liên tiếp.
    */

    if (
      consecutiveBefore >=
      streak
    ) {
      const hit =
        hitSeries[i] === true;


      all.opportunities++;


      if (hit) {
        all.continued++;
      }


      /*
      Cả streak phải nằm
      trong window.
      */

      if (
        i - streak >=
        start30
      ) {
        w30.opportunities++;

        if (hit) {
          w30.continued++;
        }
      }


      if (
        i - streak >=
        start60
      ) {
        w60.opportunities++;

        if (hit) {
          w60.continued++;
        }
      }


      if (
        i - streak >=
        start100
      ) {
        w100.opportunities++;

        if (hit) {
          w100.continued++;
        }
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


    if (
      hitSeries[i] ===
      true
    ) {
      consecutiveBefore++;
    }
    else {
      consecutiveBefore = 0;
    }
  }


  const rateOf =
    bucket => {

      return (
        bucket.opportunities > 0
          ?
          bucket.continued /
          bucket.opportunities *
          100
          :
          0
      );
    };


  const rateAll =
    rateOf(all);


  const rate30 =
    rateOf(w30);


  const rate60 =
    rateOf(w60);


  const rate100 =
    rateOf(w100);


  const wilson =
    wilsonLowerBound(
      all.continued,
      all.opportunities
    )
    *
    100;


  const edge =
    rateAll -
    baselineRate;


  const wilsonEdge =
    wilson -
    baselineRate;


  const validRates = [];


  const windows = [
    {
      samples:
        w30.opportunities,

      rate:
        rate30
    },

    {
      samples:
        w60.opportunities,

      rate:
        rate60
    },

    {
      samples:
        w100.opportunities,

      rate:
        rate100
    },

    {
      samples:
        all.opportunities,

      rate:
        rateAll
    }
  ];


  for (
    const item
    of windows
  ) {
    if (
      item.samples >= 3
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


  let recentRate =
    rateAll;


  if (
    w30.opportunities >= 3
    &&
    w60.opportunities >= 3
  ) {
    recentRate =
      rate30 * 0.6
      +
      rate60 * 0.4;
  }
  else if (
    w60.opportunities >= 3
  ) {
    recentRate =
      rate60;
  }
  else if (
    w30.opportunities >= 3
  ) {
    recentRate =
      rate30;
  }


  const normalizedEdge =
    clamp(
      50 +
      edge * 1.5,
      0,
      100
    );


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
      round(
        rateAll
      ),

    weightedRate:
      round(
        weightedTotal > 0
          ?
          weightedHits /
          weightedTotal *
          100
          :
          0
      ),

    baselineRate:
      round(
        baselineRate
      ),

    edge:
      round(
        edge
      ),

    wilsonLowerBound:
      round(
        wilson
      ),

    wilsonEdge:
      round(
        wilsonEdge
      ),

    rate30:
      round(
        rate30
      ),

    samples30:
      w30.opportunities,

    rate60:
      round(
        rate60
      ),

    samples60:
      w60.opportunities,

    rate100:
      round(
        rate100
      ),

    samples100:
      w100.opportunities,

    recentRate:
      round(
        recentRate
      ),

    recentSamples:
      w60.opportunities,

    recentStatus:
      getRecentStatus(
        w60.opportunities
      ),

    stabilityRange:
      round(
        stabilityRange
      ),

    stabilityScore:
      round(
        stabilityScore
      ),

    sampleReliability:
      round(
        sampleReliability
      ),

    rawScore:
      round(
        rawScore
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


  let count = 0;


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


    usedPositions.add(
      candidate.positionAKey
    );


    usedPositions.add(
      candidate.positionBKey
    );


    count++;
  }


  return count;
}


/* =====================================================
   STRENGTH
===================================================== */

function classifyStrength(
  item,
  independent,
  finalScore
) {
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
    item.recentStatus ===
      "active"
    &&
    independent >= 2
    &&
    finalScore >= 60
  ) {
    return "very-strong";
  }


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
   RANDOM BASELINE
===================================================== */

function randomHitProbability(
  uniqueLotoCount,
  picks
) {
  const unique =
    Math.floor(
      clamp(
        uniqueLotoCount,
        0,
        100
      )
    );


  const k =
    Math.floor(
      clamp(
        picks,
        0,
        100
      )
    );


  if (
    unique <= 0
    ||
    k <= 0
  ) {
    return 0;
  }


  if (
    k >
    100 -
    unique
  ) {
    return 100;
  }


  let miss = 1;


  for (
    let i = 0;
    i < k;
    i++
  ) {
    miss *=
      (
        100 -
        unique -
        i
      )
      /
      (
        100 -
        i
      );
  }


  return round(
    (
      1 -
      miss
    )
    *
    100
  );
}


/* =====================================================
   TOP EVALUATION
===================================================== */

function evaluateTop(
  recommendations,
  actualSet,
  size
) {
  const picks =
    recommendations.slice(
      0,
      size
    );


  const hitNumbers =
    picks
      .filter(
        item =>
          actualSet.has(
            item.number
          )
      )
      .map(
        item =>
          item.number
      );


  return {
    requestedSize:
      size,

    actualPickCount:
      picks.length,

    numbers:
      picks.map(
        item =>
          item.number
      ),

    hit:
      hitNumbers.length > 0,

    hitNumbers,

    baselineRate:
      randomHitProbability(
        actualSet.size,
        picks.length
      )
  };
}


/* =====================================================
   API
===================================================== */

export async function onRequestGet(
  context
) {
  try {

    const DB =
      context.env.DB;


    if (!DB) {
      return Response.json(
        {
          success: false,

          module:
            "walk-forward",

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


    const offset =
      Math.floor(
        clamp(
          url.searchParams.get(
            "offset"
          )
          ??
          DEFAULT_OFFSET,

          1,

          MAX_OFFSET
        )
      );


    const historyDraws =
      Math.floor(
        clamp(
          url.searchParams.get(
            "window"
          )
          ??
          DEFAULT_WINDOW,

          60,

          MAX_WINDOW
        )
      );


    const minTrain =
      Math.floor(
        clamp(
          url.searchParams.get(
            "minTrain"
          )
          ??
          DEFAULT_MIN_TRAIN,

          60,

          historyDraws
        )
      );


    /*
    Cần thêm rows để có thể
    lùi theo offset.
    */

    const queryLimit =
      Math.min(
        340,

        historyDraws +
        offset +
        20
      );


    const query =
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
          queryLimit
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
      rows.length <
      minTrain +
      offset +
      1
    ) {
      return Response.json(
        {
          success: false,

          module:
            "walk-forward",

          version:
            VERSION,

          message:
            "Không đủ dữ liệu cho offset yêu cầu.",

          validDraws:
            rows.length,

          offset,

          minTrain
        },
        {
          status: 400
        }
      );
    }


    /*
    offset = 1

    target = kỳ mới nhất
    source = kỳ trước target
    */

    const targetIndex =
      rows.length -
      offset;


    const sourceIndex =
      targetIndex -
      1;


    if (
      sourceIndex < 0
      ||
      !rows[targetIndex]
      ||
      !rows[sourceIndex]
    ) {
      return Response.json(
        {
          success: false,

          module:
            "walk-forward",

          version:
            VERSION,

          message:
            "Không xác định được source/target."
        },
        {
          status: 400
        }
      );
    }


    const trainStart =
      Math.max(
        0,

        targetIndex -
        historyDraws
      );


    /*
    QUAN TRỌNG:

    targetIndex KHÔNG nằm
    trong historyRows.

    Model không nhìn thấy target.
    */

    const historyRows =
      rows.slice(
        trainStart,
        targetIndex
      );


    if (
      historyRows.length <
      minTrain
    ) {
      return Response.json(
        {
          success: false,

          module:
            "walk-forward",

          version:
            VERSION,

          message:
            "Không đủ dữ liệu train sau khi áp dụng window.",

          trainDraws:
            historyRows.length,

          minTrain
        },
        {
          status: 400
        }
      );
    }


    const sourceRow =
      rows[sourceIndex];


    const targetRow =
      rows[targetIndex];


    const historyLotoSets =
      historyRows.map(
        getLotoSet
      );


    const targetLotoSet =
      getLotoSet(
        targetRow
      );


    const baselineRate =
      calculateBaseline(
        historyLotoSets
      );


    const positions =
      getPositions(
        sourceRow
      );


    /* =================================================
       PHASE 1
       TÌM ACTIVE CANDIDATES
    ================================================= */

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


        /*
        Giữ giống V2.6.2:
        bỏ cặp cùng giải.
        */

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

          const streak =
            getCurrentStreak(
              historyRows,
              historyLotoSets,
              positionA,
              positionB,
              reverse
            );


          if (
            streak <
              MIN_CURRENT_STREAK
            ||
            streak >
              MAX_CURRENT_STREAK
          ) {
            continue;
          }


          const number =
            makeNumber(
              sourceRow,
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

            streak,

            positionA,

            positionB,

            positionAKey:
              positionA.key,

            positionBKey:
              positionB.key,

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


    /* =================================================
       PHASE 2
       BACKTEST CHỈ ACTIVE CANDIDATES
    ================================================= */

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

      const hitSeries =
        buildHitSeries(
          historyRows,
          historyLotoSets,
          candidate.positionA,
          candidate.positionB,
          candidate.reverse
        );


      const performance =
        analyzeHitSeries(
          hitSeries,
          candidate.streak,
          baselineRate
        );


      if (
        performance.opportunities <
        MIN_SAMPLES
      ) {
        rejected
          .insufficientSamples++;

        continue;
      }


      if (
        performance.continuationRate <
        MIN_RATE
      ) {
        rejected.lowRate++;

        continue;
      }


      if (
        performance.edge <
        MIN_EDGE
      ) {
        rejected.lowEdge++;

        continue;
      }


      if (
        performance.wilsonEdge <
        MIN_WILSON_EDGE
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


    /* =================================================
       GROUP BY NUMBER
    ================================================= */

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
        .get(
          item.number
        )
        .push(item);
    }


    /* =================================================
       CONSENSUS
    ================================================= */

    const consensusMap =
      new Map();


    for (
      const [
        number,
        items
      ]
      of numberGroups
    ) {

      consensusMap.set(
        number,
        {
          related:
            items.length,

          independent:
            calculateIndependent(
              items
            )
        }
      );
    }


    /* =================================================
       FINAL SCORE
    ================================================= */

    const allQualified =
      tested.map(
        item => {

          const consensus =
            consensusMap.get(
              item.number
            )
            ||
            {
              related: 1,
              independent: 1
            };


          const independent =
            consensus.independent;


          const related =
            consensus.related;


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


          const correlationPenalty =
            related > 1
              ?
              (
                1 -
                independent /
                related
              )
              *
              10
              :
              0;


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


          return {
            ...item,

            independentConsensus:
              independent,

            relatedBridgeCount:
              related,

            consensusBonus:
              round(
                consensusBonus
              ),

            correlationPenalty:
              round(
                correlationPenalty
              ),

            recentAdjustment,

            score:
              round(
                finalScore
              ),

            strength:
              classifyStrength(
                item,
                independent,
                finalScore
              )
          };
        }
      );


    /* =================================================
       SORT
    ================================================= */

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
      ) =>

        (
          strengthRank[
            b.strength
          ]
          -
          strengthRank[
            a.strength
          ]
        )

        ||

        (
          b.score -
          a.score
        )

        ||

        (
          b.wilsonEdge -
          a.wilsonEdge
        )

        ||

        (
          b.opportunities -
          a.opportunities
        )

        ||

        (
          b.stabilityScore -
          a.stabilityScore
        )
    );


    /*
    Historical-only không dùng
    làm prediction ngày đó.
    */

    const recommendations =
      allQualified.filter(
        item =>
          item.recentStatus !==
          "historical-only"
      );


    /* =================================================
       UNIQUE NUMBER
    ================================================= */

    const uniqueRecommendations = [];


    const seenNumbers =
      new Set();


    for (
      const item
      of recommendations
    ) {

      if (
        seenNumbers.has(
          item.number
        )
      ) {
        continue;
      }


      seenNumbers.add(
        item.number
      );


      uniqueRecommendations.push({
        rank:
          uniqueRecommendations.length +
          1,

        number:
          item.number,

        bridge:
          item.bridge,

        bridgeKey:
          item.bridgeKey,

        streak:
          item.streak,

        opportunities:
          item.opportunities,

        continued:
          item.continued,

        continuationRate:
          item.continuationRate,

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

        recentStatus:
          item.recentStatus,

        recentSamples:
          item.recentSamples,

        stabilityScore:
          item.stabilityScore,

        independentConsensus:
          item.independentConsensus,

        score:
          item.score,

        strength:
          item.strength,

        /*
        Chỉ chấm sau khi prediction
        đã được tạo.
        */

        hit:
          targetLotoSet.has(
            item.number
          )
      });


      if (
        uniqueRecommendations.length >=
        MAX_RECOMMENDATIONS
      ) {
        break;
      }
    }


    /* =================================================
       TOP 1 / 3 / 5
    ================================================= */

    const top1 =
      evaluateTop(
        uniqueRecommendations,
        targetLotoSet,
        1
      );


    const top3 =
      evaluateTop(
        uniqueRecommendations,
        targetLotoSet,
        3
      );


    const top5 =
      evaluateTop(
        uniqueRecommendations,
        targetLotoSet,
        5
      );


    /* =================================================
       COUNTS
    ================================================= */

    const counts = {
      veryStrong:
        uniqueRecommendations
          .filter(
            item =>
              item.strength ===
              "very-strong"
          )
          .length,

      strong:
        uniqueRecommendations
          .filter(
            item =>
              item.strength ===
              "strong"
          )
          .length,

      qualified:
        uniqueRecommendations
          .filter(
            item =>
              item.strength ===
              "qualified"
          )
          .length,

      historicalExcluded:
        allQualified
          .filter(
            item =>
              item.recentStatus ===
              "historical-only"
          )
          .length
    };


    /* =================================================
       RESPONSE
    ================================================= */

    return Response.json({
      success: true,

      module:
        "walk-forward",

      version:
        VERSION,

      modelVersion:
        MODEL_VERSION,


      offset,


      sourceDate:
        sourceRow.draw_date,


      predictionDate:
        targetRow.draw_date,


      modelWindow:
        historyDraws,


      minTrain,


      trainDraws:
        historyRows.length,


      baselineRate,


      actualUniqueLotoCount:
        targetLotoSet.size,


      totalPositions:
        positions.length,


      activeCandidateCount:
        active.length,


      qualifiedBridgeCount:
        allQualified.length,


      recommendationCount:
        uniqueRecommendations.length,


      counts,


      rejected,


      evaluation: {
        top1,

        top3,

        top5
      },


      recommendations:
        uniqueRecommendations,


      rule: {
        currentStreaks: [
          2,
          3,
          4,
          5
        ],

        minSamples:
          MIN_SAMPLES,

        minContinuationRate:
          MIN_RATE,

        minEdgeVsBaseline:
          MIN_EDGE,

        minWilsonEdge:
          MIN_WILSON_EDGE,

        recentWindow:
          60,

        recentActiveSamples:
          RECENT_ACTIVE_SAMPLES,

        recentLimitedSamples:
          RECENT_LIMITED_SAMPLES,

        historicalOnlyExcluded:
          true,

        oneDayPerRequest:
          true,

        scoreIsProbability:
          false
      },


      note:
        "V2.7.1 chỉ xử lý một ngày mỗi request. " +
        "Ngày target không nằm trong dữ liệu train. " +
        "Top 1/3/5 chỉ được chấm sau khi model đã tạo prediction."
    });


  } catch (error) {

    console.error(
      "Walk-forward V2.7.1:",
      error
    );


    return Response.json(
      {
        success: false,

        module:
          "walk-forward",

        version:
          VERSION,

        message:
          error?.message ||
          "Lỗi Walk-forward V2.7.1."
      },
      {
        status: 500
      }
    );
  }
}