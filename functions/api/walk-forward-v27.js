const VERSION = "walk-forward-v2.7";
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
const REJECT_FROM_STREAK = 6;

const DEFAULT_TEST_DAYS = 30;
const MAX_TEST_DAYS = 60;

const DEFAULT_WINDOW = 200;
const MAX_WINDOW = 250;

const DEFAULT_MIN_TRAIN = 100;

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

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(
      max,
      Number(value)
    )
  );
}


function round(value, digits = 2) {
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
      x =>
        /^\d+$/.test(x)
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


  return (
    special.length === 1 &&
    g1.length === 1 &&
    g2.length === 2 &&
    g3.length === 6 &&
    g4.length === 4 &&
    g5.length === 6 &&
    g6.length === 3 &&
    g7.length === 4 &&

    special.every(
      x =>
        /^\d{5}$/.test(x)
    ) &&

    g1.every(
      x =>
        /^\d{5}$/.test(x)
    ) &&

    g2.every(
      x =>
        /^\d{5}$/.test(x)
    ) &&

    g3.every(
      x =>
        /^\d{5}$/.test(x)
    ) &&

    g4.every(
      x =>
        /^\d{4}$/.test(x)
    ) &&

    g5.every(
      x =>
        /^\d{4}$/.test(x)
    ) &&

    g6.every(
      x =>
        /^\d{3}$/.test(x)
    ) &&

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


function getDigit(
  row,
  position
) {
  const number =
    splitPrize(
      row[position.prize]
    )[
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


/* =====================================================
   RULES
===================================================== */

function buildRules(
  positions
) {
  const rules = [];

  for (
    let a = 0;
    a < positions.length;
    a++
  ) {
    for (
      let b = a + 1;
      b < positions.length;
      b++
    ) {
      const positionA =
        positions[a];

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
        const direction =
          reverse
            ? "B+A"
            : "A+B";

        const nameA =
          positionName(
            positionA
          );

        const nameB =
          positionName(
            positionB
          );

        rules.push({
          a:
            positionA,

          b:
            positionB,

          reverse,

          direction,

          bridgeKey:
            `${positionA.key}|` +
            `${positionB.key}|` +
            `${direction}`,

          bridge:
            reverse
              ? `${nameB} + ${nameA}`
              : `${nameA} + ${nameB}`,

          positionAKey:
            positionA.key,

          positionBKey:
            positionB.key
        });
      }
    }
  }

  return rules;
}


/* =====================================================
   HIT
===================================================== */

function hitAt(
  rows,
  lotoSets,
  rule,
  transitionIndex
) {
  const number =
    makeNumber(
      rows[
        transitionIndex
      ],
      rule.a,
      rule.b,
      rule.reverse
    );

  return (
    !!number &&
    lotoSets[
      transitionIndex + 1
    ].has(number)
  );
}


/* =====================================================
   CURRENT STREAK
===================================================== */

function currentStreak(
  rows,
  lotoSets,
  rule,
  trainStart,
  sourceIndex
) {
  let streak = 0;

  for (
    let i =
      sourceIndex - 1;

    i >= trainStart;

    i--
  ) {
    if (
      !hitAt(
        rows,
        lotoSets,
        rule,
        i
      )
    ) {
      break;
    }

    streak++;

    if (
      streak >=
      REJECT_FROM_STREAK
    ) {
      break;
    }
  }

  return streak;
}


/* =====================================================
   BASELINE
===================================================== */

function baselineForRange(
  lotoSets,
  firstTargetIndex,
  lastTargetIndex
) {
  if (
    lastTargetIndex <
    firstTargetIndex
  ) {
    return 0;
  }

  let total = 0;
  let count = 0;

  for (
    let i =
      firstTargetIndex;

    i <=
      lastTargetIndex;

    i++
  ) {
    total +=
      lotoSets[i].size;

    count++;
  }

  return count
    ? total / count
    : 0;
}


/* =====================================================
   WILSON
===================================================== */

function wilsonLowerBound(
  successes,
  total
) {
  if (!total) {
    return 0;
  }

  const z = 1.96;

  const p =
    successes /
    total;

  const denominator =
    1 +
    z * z /
    total;

  const centre =
    p +
    z * z /
    (
      2 *
      total
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
   BACKTEST WINDOW
===================================================== */

function backtestWindow(
  rows,
  lotoSets,
  rule,
  trainStart,
  sourceIndex,
  streak,
  maxTransitions
) {
  const lastKnownTransition =
    sourceIndex - 1;

  const historicalEndExclusive =
    lastKnownTransition -
    streak +
    1;

  if (
    historicalEndExclusive <=
    trainStart
  ) {
    return {
      opportunities: 0,
      continued: 0,
      rate: 0,
      weightedRate: 0
    };
  }

  const start =
    maxTransitions === null
      ? trainStart
      : Math.max(
          trainStart,
          historicalEndExclusive -
          maxTransitions
        );


  let opportunities = 0;
  let continued = 0;

  let weightedTotal = 0;
  let weightedHits = 0;


  for (
    let i =
      start +
      streak;

    i <
      historicalEndExclusive;

    i++
  ) {
    let validRun =
      true;


    for (
      let j = 1;
      j <= streak;
      j++
    ) {
      if (
        !hitAt(
          rows,
          lotoSets,
          rule,
          i - j
        )
      ) {
        validRun =
          false;

        break;
      }
    }


    if (!validRun) {
      continue;
    }


    opportunities++;


    const success =
      hitAt(
        rows,
        lotoSets,
        rule,
        i
      );


    if (success) {
      continued++;
    }


    const age =
      historicalEndExclusive -
      1 -
      i;


    const weight =
      Math.exp(
        -age / 60
      );


    weightedTotal +=
      weight;


    if (success) {
      weightedHits +=
        weight;
    }
  }


  return {
    opportunities,

    continued,

    rate:
      round(
        opportunities
          ? continued /
            opportunities *
            100
          : 0
      ),

    weightedRate:
      round(
        weightedTotal
          ? weightedHits /
            weightedTotal *
            100
          : 0
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
  rows,
  lotoSets,
  rule,
  trainStart,
  sourceIndex,
  streak,
  baselineRate
) {
  const all =
    backtestWindow(
      rows,
      lotoSets,
      rule,
      trainStart,
      sourceIndex,
      streak,
      null
    );

  const w30 =
    backtestWindow(
      rows,
      lotoSets,
      rule,
      trainStart,
      sourceIndex,
      streak,
      30
    );

  const w60 =
    backtestWindow(
      rows,
      lotoSets,
      rule,
      trainStart,
      sourceIndex,
      streak,
      60
    );

  const w100 =
    backtestWindow(
      rows,
      lotoSets,
      rule,
      trainStart,
      sourceIndex,
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
    baselineRate;


  const wilsonEdge =
    wilson -
    baselineRate;


  const stableRates =
    [
      w30,
      w60,
      w100,
      all
    ]
      .filter(
        item =>
          item.opportunities >= 3
      )
      .map(
        item =>
          item.rate
      );


  let stabilityRange =
    30;


  if (
    stableRates.length >= 2
  ) {
    stabilityRange =
      Math.max(
        ...stableRates
      )
      -
      Math.min(
        ...stableRates
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
    all.rate;


  if (
    w30.opportunities >= 3 &&
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
      round(
        baselineRate
      ),

    edge:
      round(edge),

    wilsonLowerBound:
      round(wilson),

    wilsonEdge:
      round(
        wilsonEdge
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
      round(
        recentRate
      ),

    recentSamples:
      w60.opportunities,

    recentStatus:
      getRecentStatus(
        w60.opportunities
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

function independentCount(
  items
) {
  const sorted =
    [...items]
      .sort(
        (
          a,
          b
        ) =>
          b.rawScore -
          a.rawScore
      );


  const used =
    new Set();


  let count = 0;


  for (
    const item
    of sorted
  ) {
    if (
      used.has(
        item.positionAKey
      )
      ||
      used.has(
        item.positionBKey
      )
    ) {
      continue;
    }


    used.add(
      item.positionAKey
    );


    used.add(
      item.positionBKey
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
    item.opportunities >= 15 &&
    item.continuationRate >= 50 &&
    item.wilsonEdge >= 5 &&
    item.edge >= 20 &&
    item.stabilityScore >= 70 &&
    item.recentStatus === "active" &&
    independent >= 2 &&
    finalScore >= 60
  ) {
    return "very-strong";
  }


  if (
    item.opportunities >= 10 &&
    item.continuationRate >= 40 &&
    item.wilsonEdge > 0 &&
    item.edge >= 10 &&
    item.stabilityScore >= 60 &&
    item.recentStatus !==
      "historical-only" &&
    finalScore >= 50
  ) {
    return "strong";
  }


  if (
    item.opportunities >= 10 &&
    item.continuationRate >= 40 &&
    item.wilsonEdge > 0 &&
    item.edge >= 10 &&
    item.stabilityScore >= 60 &&
    item.recentStatus ===
      "historical-only"
  ) {
    return "historical";
  }


  return "qualified";
}


/* =====================================================
   PREDICT AT ONE HISTORICAL DAY
===================================================== */

function predictAt(
  rows,
  lotoSets,
  rules,
  targetIndex,
  modelWindow
) {
  const sourceIndex =
    targetIndex - 1;


  const trainStart =
    Math.max(
      0,
      targetIndex -
      modelWindow
    );


  const baselineRate =
    baselineForRange(
      lotoSets,
      trainStart + 1,
      sourceIndex
    );


  const tested = [];


  for (
    const rule
    of rules
  ) {
    const streak =
      currentStreak(
        rows,
        lotoSets,
        rule,
        trainStart,
        sourceIndex
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
        rows[
          sourceIndex
        ],
        rule.a,
        rule.b,
        rule.reverse
      );


    if (!number) {
      continue;
    }


    const performance =
      analyzePerformance(
        rows,
        lotoSets,
        rule,
        trainStart,
        sourceIndex,
        streak,
        baselineRate
      );


    if (
      performance.opportunities <
      MIN_SAMPLES
    ) {
      continue;
    }


    if (
      performance.continuationRate <
      MIN_RATE
    ) {
      continue;
    }


    if (
      performance.edge <
      MIN_EDGE
    ) {
      continue;
    }


    if (
      performance.wilsonEdge <
      MIN_WILSON_EDGE
    ) {
      continue;
    }


    tested.push({
      bridgeKey:
        rule.bridgeKey,

      bridge:
        rule.bridge,

      number,

      streak,

      direction:
        rule.direction,

      positionAKey:
        rule.positionAKey,

      positionBKey:
        rule.positionBKey,

      ...performance
    });
  }


  const groups =
    new Map();


  for (
    const item
    of tested
  ) {
    if (
      !groups.has(
        item.number
      )
    ) {
      groups.set(
        item.number,
        []
      );
    }

    groups
      .get(
        item.number
      )
      .push(item);
  }


  const consensus =
    new Map();


  for (
    const [
      number,
      items
    ]
    of groups
  ) {
    consensus.set(
      number,
      {
        related:
          items.length,

        independent:
          independentCount(
            items
          )
      }
    );
  }


  const ranked =
    tested.map(
      item => {

        const c =
          consensus.get(
            item.number
          )
          ||
          {
            related: 1,
            independent: 1
          };


        const consensusBonus =
          Math.min(
            8,
            Math.max(
              0,
              c.independent - 1
            )
            *
            2
          );


        const correlationPenalty =
          c.related > 1
            ?
            (
              1 -
              c.independent /
              c.related
            )
            *
            10
            :
            0;


        const recentAdjustment =
          item.recentStatus ===
          "active"
            ? 4
            :
            item.recentStatus ===
            "historical-only"
              ? -6
              : 0;


        const score =
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
            c.independent,

          relatedBridgeCount:
            c.related,

          score:
            round(score),

          strength:
            classifyStrength(
              item,
              c.independent,
              score
            )
        };
      }
    );


  const strengthRank = {
    "very-strong": 4,
    "strong": 3,
    "historical": 2,
    "qualified": 1
  };


  ranked.sort(
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


  const recommendations =
    ranked.filter(
      item =>
        item.recentStatus !==
        "historical-only"
    );


  /*
  Dedupe theo số.

  Một số có nhiều cầu:
  chỉ giữ bridge tốt nhất.
  */

  const unique = [];

  const seen =
    new Set();


  for (
    const item
    of recommendations
  ) {
    if (
      seen.has(
        item.number
      )
    ) {
      continue;
    }


    seen.add(
      item.number
    );


    unique.push(
      item
    );


    if (
      unique.length >=
      MAX_RECOMMENDATIONS
    ) {
      break;
    }
  }


  return {
    baselineRate:
      round(
        baselineRate
      ),

    recommendations:
      unique
  };
}


/* =====================================================
   RANDOM BASELINE FOR TOP K
===================================================== */

function randomHitProbability(
  uniqueLotoCount,
  picks
) {
  const unique =
    clamp(
      uniqueLotoCount,
      0,
      100
    );


  const k =
    clamp(
      picks,
      0,
      100
    );


  if (!k) {
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


  return (
    1 -
    miss
  )
  *
  100;
}


/* =====================================================
   METRICS
===================================================== */

function newMetric() {
  return {
    availableDays: 0,
    hitDays: 0,
    baselineSum: 0
  };
}


function updateMetric(
  metric,
  picks,
  targetSet
) {
  if (
    !picks.length
  ) {
    return;
  }


  metric.availableDays++;


  if (
    picks.some(
      item =>
        targetSet.has(
          item.number
        )
    )
  ) {
    metric.hitDays++;
  }


  metric.baselineSum +=
    randomHitProbability(
      targetSet.size,
      picks.length
    );
}


function finalizeMetric(
  metric
) {
  const hitRate =
    metric.availableDays
      ?
      metric.hitDays /
      metric.availableDays *
      100
      :
      0;


  const baselineRate =
    metric.availableDays
      ?
      metric.baselineSum /
      metric.availableDays
      :
      0;


  return {
    availableDays:
      metric.availableDays,

    hitDays:
      metric.hitDays,

    hitRate:
      round(
        hitRate
      ),

    baselineRate:
      round(
        baselineRate
      ),

    liftVsBaseline:
      round(
        hitRate -
        baselineRate
      )
  };
}


/* =====================================================
   BUCKET STATS
===================================================== */

function updateBucket(
  map,
  key,
  hit
) {
  if (
    key === undefined ||
    key === null
  ) {
    return;
  }


  const value =
    String(key);


  if (!map[value]) {
    map[value] = {
      signals: 0,
      hits: 0
    };
  }


  map[value].signals++;


  if (hit) {
    map[value].hits++;
  }
}


function finalizeBuckets(
  map
) {
  const result = {};


  for (
    const [
      key,
      value
    ]
    of Object.entries(map)
  ) {
    result[key] = {
      ...value,

      hitRate:
        round(
          value.signals
            ?
            value.hits /
            value.signals *
            100
            :
            0
        )
    };
  }


  return result;
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


    const testDays =
      clamp(
        url.searchParams.get(
          "testDays"
        )
        ||
        DEFAULT_TEST_DAYS,
        5,
        MAX_TEST_DAYS
      );


    const modelWindow =
      clamp(
        url.searchParams.get(
          "window"
        )
        ||
        DEFAULT_WINDOW,
        100,
        MAX_WINDOW
      );


    const minTrain =
      clamp(
        url.searchParams.get(
          "minTrain"
        )
        ||
        DEFAULT_MIN_TRAIN,
        60,
        modelWindow
      );


    const queryLimit =
      Math.min(
        320,
        modelWindow +
        testDays +
        10
      );


    /*
    Load data.
    */

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
      minTrain + 1
    ) {
      return Response.json({
        success: false,

        version:
          VERSION,

        message:
          "Không đủ dữ liệu để walk-forward.",

        validDraws:
          rows.length,

        minTrain
      });
    }


    const lotoSets =
      rows.map(
        getLotoSet
      );


    const positions =
      getPositions(
        rows[
          rows.length - 1
        ]
      );


    const rules =
      buildRules(
        positions
      );


    /*
    Test các ngày gần nhất.
    */

    const firstTarget =
      Math.max(
        minTrain,
        rows.length -
        testDays
      );


    const top1 =
      newMetric();

    const top3 =
      newMetric();

    const top5 =
      newMetric();


    const rankStats = {};

    const streakStats = {};

    const strengthStats = {};

    const recentStats = {};


    const dailyResults = [];


    for (
      let targetIndex =
        firstTarget;

      targetIndex <
        rows.length;

      targetIndex++
    ) {
      /*
      Model chỉ được dùng
      dữ liệu trước targetIndex.
      */

      const prediction =
        predictAt(
          rows,
          lotoSets,
          rules,
          targetIndex,
          modelWindow
        );


      const picks =
        prediction
          .recommendations;


      const targetSet =
        lotoSets[
          targetIndex
        ];


      /*
      TOP 1 / 3 / 5.
      */

      updateMetric(
        top1,
        picks.slice(
          0,
          1
        ),
        targetSet
      );


      updateMetric(
        top3,
        picks.slice(
          0,
          3
        ),
        targetSet
      );


      updateMetric(
        top5,
        picks.slice(
          0,
          5
        ),
        targetSet
      );


      /*
      Rank / streak / strength.
      */

      picks
        .slice(
          0,
          5
        )
        .forEach(
          (
            item,
            index
          ) => {

            const hit =
              targetSet.has(
                item.number
              );


            updateBucket(
              rankStats,
              index + 1,
              hit
            );


            updateBucket(
              streakStats,
              item.streak,
              hit
            );


            updateBucket(
              strengthStats,
              item.strength,
              hit
            );


            updateBucket(
              recentStats,
              item.recentStatus,
              hit
            );
          }
        );


      /*
      Daily result.
      */

      dailyResults.push({
        predictionDate:
          rows[
            targetIndex
          ].draw_date,

        sourceDate:
          rows[
            targetIndex - 1
          ].draw_date,

        baselineRate:
          prediction
            .baselineRate,

        recommendationCount:
          picks.length,

        top1:
          picks
            .slice(
              0,
              1
            )
            .map(
              item => ({
                number:
                  item.number,

                hit:
                  targetSet.has(
                    item.number
                  ),

                score:
                  item.score
              })
            ),

        top3:
          picks
            .slice(
              0,
              3
            )
            .map(
              item => ({
                number:
                  item.number,

                hit:
                  targetSet.has(
                    item.number
                  ),

                score:
                  item.score
              })
            ),

        top5:
          picks
            .slice(
              0,
              5
            )
            .map(
              item => ({
                number:
                  item.number,

                hit:
                  targetSet.has(
                    item.number
                  ),

                score:
                  item.score
              })
            )
      });
    }


    /*
    RESPONSE.
    */

    return Response.json({
      success: true,

      module:
        "walk-forward",

      version:
        VERSION,

      modelVersion:
        MODEL_VERSION,

      testedDays:
        dailyResults.length,

      requestedTestDays:
        testDays,

      modelWindow,

      minTrain,

      totalValidDraws:
        rows.length,

      totalRules:
        rules.length,

      range:
        dailyResults.length
          ?
          {
            from:
              dailyResults[0]
                .predictionDate,

            to:
              dailyResults[
                dailyResults.length - 1
              ]
                .predictionDate
          }
          :
          null,


      results: {
        top1:
          finalizeMetric(
            top1
          ),

        top3:
          finalizeMetric(
            top3
          ),

        top5:
          finalizeMetric(
            top5
          ),

        rankPerformance:
          finalizeBuckets(
            rankStats
          ),

        streakPerformance:
          finalizeBuckets(
            streakStats
          ),

        strengthPerformance:
          finalizeBuckets(
            strengthStats
          ),

        recentPerformance:
          finalizeBuckets(
            recentStats
          )
      },


      dailyResults,


      note:
        "Walk-forward V2.7 chỉ dùng dữ liệu có trước ngày dự đoán. Baseline Top 1/3/5 được tính theo số loto unique thực tế và số lượng số model chọn. Lift dùng để kiểm định mô hình và không phải xác suất trúng tương lai."
    });


  } catch (error) {

    console.error(
      "Walk-forward V2.7:",
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
          "Lỗi Walk-forward V2.7."
      },
      {
        status: 500
      }
    );
  }
}