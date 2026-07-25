/* XSMB WALK-FORWARD V2.8 - Rank Calibration (browser-side) */

const WF28_VERSION = "walk-forward-v2.8";
const WF28_BASE_MODEL = "bridge-v2.6.2";
const WF28_MODEL = "bridge-v2.8-rank-calibration";

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

const MIN_SAMPLES = 10;
const MIN_RATE = 40;
const MIN_EDGE = 10;
const MIN_WILSON_EDGE = 0;

const RECENT_ACTIVE_SAMPLES = 5;
const RECENT_LIMITED_SAMPLES = 3;

const MAX_RECOMMENDATIONS = 12;


/*
========================================================
V2.8 SHRINKAGE
========================================================
*/

const PRIOR_SAMPLES = 20;
const RECENT_PRIOR_SAMPLES = 12;


/*
========================================================
V2.8 RANK CALIBRATION
========================================================
*/

const RANK_CAL_PRIOR = 10;
const RANK_CAL_ALPHA = 1.5;
const RANK_CAL_WARMUP_DAYS = 30;


/*
========================================================
STATE
========================================================
*/

let wf28Engine = null;
let wf28Running = false;
let wf28Stop = false;
let wf28Daily = [];
let wf28LastCalibration = [];


/*
========================================================
HELPERS
========================================================
*/

function clamp(v, min, max) {
  return Math.max(
    min,
    Math.min(
      max,
      Number(v)
    )
  );
}


function round(v, digits = 2) {
  const p =
    10 ** digits;

  return (
    Math.round(
      (
        Number(v) +
        Number.EPSILON
      ) *
      p
    ) /
    p
  );
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
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
      v =>
        /^\d+$/.test(v)
    );
}


function esc(value) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function fmtDate(value) {
  if (!value) {
    return "--";
  }

  const p =
    String(value)
      .split("-");

  return p.length === 3
    ?
    `${p[2]}/${p[1]}/${p[0]}`
    :
    esc(value);
}


function pct(value) {
  return (
    `${round(
      value,
      2
    )}%`
  );
}


/*
========================================================
VALIDATE
========================================================
*/

function validRow(row) {
  if (!row) {
    return false;
  }

  const s =
    splitPrize(
      row.special
    );

  const g1 =
    splitPrize(
      row.g1
    );

  const g2 =
    splitPrize(
      row.g2
    );

  const g3 =
    splitPrize(
      row.g3
    );

  const g4 =
    splitPrize(
      row.g4
    );

  const g5 =
    splitPrize(
      row.g5
    );

  const g6 =
    splitPrize(
      row.g6
    );

  const g7 =
    splitPrize(
      row.g7
    );


  return (
    s.length === 1 &&
    g1.length === 1 &&
    g2.length === 2 &&
    g3.length === 6 &&
    g4.length === 4 &&
    g5.length === 6 &&
    g6.length === 3 &&
    g7.length === 4 &&

    s.every(
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


/*
========================================================
NORMALIZE
========================================================
*/

function normalizeRow(row) {
  const prizes = {};

  for (
    const prize
    of PRIZES
  ) {
    prizes[prize] =
      splitPrize(
        row[prize]
      );
  }


  const lotoFlags =
    new Uint8Array(
      100
    );


  let lotoCount = 0;


  for (
    const prize
    of PRIZES
  ) {
    for (
      const number
      of prizes[prize]
    ) {
      const value =
        Number(
          number.slice(-2)
        );


      if (
        !lotoFlags[
          value
        ]
      ) {
        lotoFlags[
          value
        ] = 1;

        lotoCount++;
      }
    }
  }


  return {
    draw_date:
      row.draw_date,

    prizes,

    lotoFlags,

    lotoCount
  };
}


/*
========================================================
POSITIONS
========================================================
*/

function buildPositions(row) {
  const positions = [];


  for (
    const prize
    of PRIZES
  ) {
    const numbers =
      row.prizes[
        prize
      ];


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
          positions.push({
            index:
              positions.length,

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


  return positions;
}


function positionName(p) {
  return (
    `${LABELS[p.prize]}` +
    `[${p.numberIndex + 1}]` +
    `.D${p.digitIndex + 1}`
  );
}


/*
========================================================
DIGIT MATRIX
========================================================
*/

function buildDigitRows(
  rows,
  positions
) {
  return rows.map(
    row => {

      const digits =
        new Uint8Array(
          positions.length
        );


      for (
        const p
        of positions
      ) {
        const number =
          row.prizes[
            p.prize
          ][
            p.numberIndex
          ];


        digits[
          p.index
        ] =
          number.charCodeAt(
            p.digitIndex
          ) -
          48;
      }


      return digits;
    }
  );
}


/*
========================================================
RULES
========================================================
*/

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

      const A =
        positions[a];

      const B =
        positions[b];


      if (
        A.prize ===
        B.prize
      ) {
        continue;
      }


      const nameA =
        positionName(A);

      const nameB =
        positionName(B);


      rules.push({
        a,
        b,

        reverse:
          false,

        positionAKey:
          A.key,

        positionBKey:
          B.key,

        bridgeKey:
          `${A.key}|` +
          `${B.key}|A+B`,

        bridge:
          `${nameA} + ${nameB}`
      });


      rules.push({
        a,
        b,

        reverse:
          true,

        positionAKey:
          A.key,

        positionBKey:
          B.key,

        bridgeKey:
          `${A.key}|` +
          `${B.key}|B+A`,

        bridge:
          `${nameB} + ${nameA}`
      });
    }
  }


  return rules;
}


function numberForRule(
  digits,
  rule
) {
  const a =
    digits[
      rule.a
    ];

  const b =
    digits[
      rule.b
    ];


  return rule.reverse
    ?
    b * 10 + a
    :
    a * 10 + b;
}


function numberText(value) {
  return String(value)
    .padStart(
      2,
      "0"
    );
}


/*
========================================================
HIT MATRIX
========================================================
*/

function buildHitMatrix(
  rows,
  digitRows,
  rules
) {
  const transitions =
    rows.length - 1;


  const hits =
    new Uint8Array(
      rules.length *
      transitions
    );


  for (
    let r = 0;
    r < rules.length;
    r++
  ) {
    const base =
      r *
      transitions;


    const rule =
      rules[r];


    for (
      let t = 0;
      t < transitions;
      t++
    ) {
      const number =
        numberForRule(
          digitRows[t],
          rule
        );


      hits[
        base + t
      ] =
        rows[
          t + 1
        ]
          .lotoFlags[
            number
          ]
          ?
          1
          :
          0;
    }
  }


  return {
    hits,
    transitions
  };
}


/*
========================================================
WILSON
========================================================
*/

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


  const den =
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


  const adj =
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
    adj
  )
  /
  den;
}


/*
========================================================
BASELINE
========================================================
*/

function baselineForRange(
  rows,
  trainStart,
  sourceIndex
) {
  let total = 0;
  let count = 0;


  for (
    let i =
      trainStart + 1;

    i <=
      sourceIndex;

    i++
  ) {
    total +=
      rows[i]
        .lotoCount;

    count++;
  }


  return count
    ?
    total /
    count
    :
    0;
}


/*
========================================================
CURRENT STREAK
========================================================
*/

function currentStreak(
  engine,
  ruleIndex,
  trainStart,
  sourceIndex
) {
  const base =
    ruleIndex *
    engine.transitions;


  let streak = 0;


  for (
    let t =
      sourceIndex - 1;

    t >=
      trainStart;

    t--
  ) {
    if (
      !engine.hits[
        base + t
      ]
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


/*
========================================================
ANALYZE RULE
========================================================
*/

function analyzeRule(
  engine,
  ruleIndex,
  trainStart,
  sourceIndex,
  streak,
  baselineRate
) {
  const base =
    ruleIndex *
    engine.transitions;


  const historicalEndExclusive =
    sourceIndex -
    streak;


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
      trainStart,
      historicalEndExclusive -
      30
    );


  const start60 =
    Math.max(
      trainStart,
      historicalEndExclusive -
      60
    );


  const start100 =
    Math.max(
      trainStart,
      historicalEndExclusive -
      100
    );


  let run = 0;

  let weightedTotal = 0;
  let weightedHits = 0;


  for (
    let t =
      trainStart;

    t <
      historicalEndExclusive;

    t++
  ) {

    if (
      run >=
      streak
    ) {
      const hit =
        engine.hits[
          base + t
        ] === 1;


      all.opportunities++;

      if (hit) {
        all.continued++;
      }


      if (
        t - streak >=
        start30
      ) {
        w30.opportunities++;

        if (hit) {
          w30.continued++;
        }
      }


      if (
        t - streak >=
        start60
      ) {
        w60.opportunities++;

        if (hit) {
          w60.continued++;
        }
      }


      if (
        t - streak >=
        start100
      ) {
        w100.opportunities++;

        if (hit) {
          w100.continued++;
        }
      }


      const age =
        historicalEndExclusive -
        1 -
        t;


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


    run =
      engine.hits[
        base + t
      ]
        ?
        run + 1
        :
        0;
  }


  const rateOf =
    b =>
      b.opportunities
        ?
        b.continued /
        b.opportunities *
        100
        :
        0;


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


  const stableRates = [
    [
      w30.opportunities,
      rate30
    ],

    [
      w60.opportunities,
      rate60
    ],

    [
      w100.opportunities,
      rate100
    ],

    [
      all.opportunities,
      rateAll
    ]
  ]
    .filter(
      x =>
        x[0] >= 3
    )
    .map(
      x =>
        x[1]
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
      stabilityRange *
      2,
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
    w30.opportunities >= 3 &&
    w60.opportunities >= 3
  ) {
    recentRate =
      rate30 *
      0.6
      +
      rate60 *
      0.4;
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


  const recentStatus =
    w60.opportunities >=
      RECENT_ACTIVE_SAMPLES

      ?

      "active"

      :

      w60.opportunities >=
        RECENT_LIMITED_SAMPLES

        ?

        "limited"

        :

        "historical-only";


  const normalizedEdge =
    clamp(
      50 +
      edge *
      1.5,
      0,
      100
    );


  const rawScore =
    wilson *
    0.35
    +
    normalizedEdge *
    0.20
    +
    recentRate *
    0.15
    +
    stabilityScore *
    0.15
    +
    sampleReliability *
    0.15;


  /*
  V2.8 shrinkage.
  */

  const baselineP =
    baselineRate /
    100;


  const posteriorRate =
    (
      (
        all.continued
        +
        baselineP *
        PRIOR_SAMPLES
      )
      /
      (
        all.opportunities
        +
        PRIOR_SAMPLES
      )
    )
    *
    100;


  const posteriorEdge =
    posteriorRate -
    baselineRate;


  const recentPosteriorRate =
    (
      (
        w60.continued
        +
        baselineP *
        RECENT_PRIOR_SAMPLES
      )
      /
      (
        w60.opportunities
        +
        RECENT_PRIOR_SAMPLES
      )
    )
    *
    100;


  const recentPosteriorEdge =
    recentPosteriorRate -
    baselineRate;


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
        weightedTotal
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

    continued30:
      w30.continued,

    rate60:
      round(
        rate60
      ),

    samples60:
      w60.opportunities,

    continued60:
      w60.continued,

    rate100:
      round(
        rate100
      ),

    samples100:
      w100.opportunities,

    continued100:
      w100.continued,

    recentRate:
      round(
        recentRate
      ),

    recentSamples:
      w60.opportunities,

    recentStatus,

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
      ),

    posteriorRate:
      round(
        posteriorRate
      ),

    posteriorEdge:
      round(
        posteriorEdge
      ),

    recentPosteriorRate:
      round(
        recentPosteriorRate
      ),

    recentPosteriorEdge:
      round(
        recentPosteriorEdge
      )
  };
}


/*
========================================================
INDEPENDENT CONSENSUS
========================================================
*/

function calculateIndependent(
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


/*
========================================================
STRENGTH
========================================================
*/

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
    item.recentStatus ===
      "active" &&
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


/*
========================================================
RANDOM BASELINE
========================================================
*/

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
    unique <= 0 ||
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


/*
========================================================
DEDUPE BASE RANKING
========================================================
*/

function dedupeBaseRanking(
  ranked,
  targetFlags
) {
  const unique = [];

  const seen =
    new Set();


  for (
    const item
    of ranked
  ) {
    if (
      item.recentStatus ===
        "historical-only"
      ||
      seen.has(
        item.number
      )
    ) {
      continue;
    }


    seen.add(
      item.number
    );


    unique.push({
      rank:
        unique.length + 1,

      number:
        item.number,

      numberValue:
        item.numberValue,

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

      posteriorRate:
        item.posteriorRate,

      posteriorEdge:
        item.posteriorEdge,

      recentPosteriorRate:
        item.recentPosteriorRate,

      recentPosteriorEdge:
        item.recentPosteriorEdge,

      rate60:
        item.rate60,

      samples60:
        item.samples60,

      recentStatus:
        item.recentStatus,

      stabilityScore:
        item.stabilityScore,

      sampleReliability:
        item.sampleReliability,

      independentConsensus:
        item.independentConsensus,

      strength:
        item.strength,

      baseScore:
        item.baseScore,

      hit:
        Boolean(
          targetFlags[
            item.numberValue
          ]
        )
    });


    if (
      unique.length >=
      MAX_RECOMMENDATIONS
    ) {
      break;
    }
  }


  return unique;
}


/*
========================================================
EVALUATE TOP
========================================================
*/

function evaluateTop(
  ranking,
  targetLotoCount,
  size
) {
  const picks =
    ranking.slice(
      0,
      size
    );


  const hitNumbers =
    picks
      .filter(
        x =>
          x.hit
      )
      .map(
        x =>
          x.number
      );


  return {
    requestedSize:
      size,

    actualPickCount:
      picks.length,

    numbers:
      picks.map(
        x =>
          x.number
      ),

    hit:
      hitNumbers.length > 0,

    hitNumbers,

    baselineRate:
      randomHitProbability(
        targetLotoCount,
        picks.length
      )
  };
}


/*
========================================================
V2.8 ONLINE RANK CALIBRATOR

Quan trọng:
- chỉ học từ ngày cũ hơn target hiện tại
- không dùng kết quả target trước khi xếp hạng
========================================================
*/

function createRankCalibrator() {
  return {
    stats:
      Array.from(
        {
          length:
            MAX_RECOMMENDATIONS +
            1
        },
        () => ({
          signals: 0,
          hits: 0,
          baselineSum: 0
        })
      )
  };
}


function rankCalibrationLift(
  calibrator,
  rank,
  currentBaselineRate
) {
  const s =
    calibrator.stats[
      rank
    ];


  if (!s) {
    return 0;
  }


  const currentBaseP =
    currentBaselineRate /
    100;


  const posteriorRate =
    (
      (
        s.hits
        +
        RANK_CAL_PRIOR *
        currentBaseP
      )
      /
      (
        s.signals
        +
        RANK_CAL_PRIOR
      )
    )
    *
    100;


  const referenceBaseline =
    s.signals
      ?
      s.baselineSum /
      s.signals
      :
      currentBaselineRate;


  return (
    posteriorRate -
    referenceBaseline
  );
}


/*
========================================================
V2.8 RERANK
========================================================
*/

function rerankV28(
  baseRecommendations,
  calibrator,
  currentBaselineRate
) {
  if (
    !baseRecommendations.length
  ) {
    return [];
  }


  /*
  Giữ nguyên Rank #1.

  Walk-forward V2.7.2:
  Top1 có lift dương.

  Vấn đề chủ yếu nằm ở
  Rank #2 → #5.
  */

  const first = {
    ...baseRecommendations[0],

    baseRank: 1,

    rankCalibrationLift:
      0,

    v28Score:
      baseRecommendations[0]
        .baseScore
  };


  const rest =
    baseRecommendations
      .slice(1)
      .map(
        (
          item,
          index
        ) => {

          const baseRank =
            index + 2;


          const rankLift =
            rankCalibrationLift(
              calibrator,
              baseRank,
              currentBaselineRate
            );


          const calibratedScore =
            item.baseScore
            +
            RANK_CAL_ALPHA *
            rankLift;


          return {
            ...item,

            baseRank,

            rankCalibrationLift:
              round(
                rankLift
              ),

            v28Score:
              round(
                calibratedScore
              )
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          (
            b.v28Score -
            a.v28Score
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
            a.baseRank -
            b.baseRank
          )
      );


  return [
    first,
    ...rest
  ].map(
    (
      item,
      index
    ) => ({
      ...item,

      rank:
        index + 1
    })
  );
}


/*
========================================================
UPDATE CALIBRATOR
========================================================
*/

function updateRankCalibrator(
  calibrator,
  baseRecommendations,
  modelBaselineRate
) {
  baseRecommendations.forEach(
    (
      item,
      index
    ) => {

      const rank =
        index + 1;


      const s =
        calibrator.stats[
          rank
        ];


      if (!s) {
        return;
      }


      s.signals++;


      if (
        item.hit
      ) {
        s.hits++;
      }


      s.baselineSum +=
        modelBaselineRate;
    }
  );
}


/*
========================================================
CALIBRATION SNAPSHOT
========================================================
*/

function calibratorSnapshot(
  calibrator
) {
  return calibrator.stats
    .map(
      (
        s,
        rank
      ) => {

        if (
          rank === 0 ||
          !s.signals
        ) {
          return null;
        }


        const hitRate =
          s.hits /
          s.signals *
          100;


        const baselineRate =
          s.baselineSum /
          s.signals;


        return {
          rank,

          signals:
            s.signals,

          hits:
            s.hits,

          hitRate:
            round(
              hitRate
            ),

          baselineRate:
            round(
              baselineRate
            ),

          lift:
            round(
              hitRate -
              baselineRate
            )
        };
      }
    )
    .filter(
      Boolean
    );
}


/*
========================================================
BASE V2.6.2 HISTORICAL PREDICTION
========================================================
*/

function predictBaseHistoricalDay(
  targetIndex,
  modelWindow,
  minTrain
) {
  const engine =
    wf28Engine;


  const rows =
    engine.rows;


  const sourceIndex =
    targetIndex - 1;


  const trainStart =
    Math.max(
      0,
      targetIndex -
      modelWindow
    );


  const trainDraws =
    targetIndex -
    trainStart;


  if (
    trainDraws <
    minTrain
  ) {
    return null;
  }


  const baselineRate =
    baselineForRange(
      rows,
      trainStart,
      sourceIndex
    );


  /*
  ACTIVE CANDIDATES
  */

  const active = [];


  for (
    let ruleIndex = 0;
    ruleIndex <
      engine.rules.length;
    ruleIndex++
  ) {
    const streak =
      currentStreak(
        engine,
        ruleIndex,
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


    const rule =
      engine.rules[
        ruleIndex
      ];


    const numberValue =
      numberForRule(
        engine.digitRows[
          sourceIndex
        ],
        rule
      );


    active.push({
      ruleIndex,

      numberValue,

      number:
        numberText(
          numberValue
        ),

      streak,

      bridge:
        rule.bridge,

      bridgeKey:
        rule.bridgeKey,

      positionAKey:
        rule.positionAKey,

      positionBKey:
        rule.positionBKey
    });
  }


  /*
  BACKTEST ACTIVE
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
    const p =
      analyzeRule(
        engine,
        candidate.ruleIndex,
        trainStart,
        sourceIndex,
        candidate.streak,
        baselineRate
      );


    if (
      p.opportunities <
      MIN_SAMPLES
    ) {
      rejected
        .insufficientSamples++;

      continue;
    }


    if (
      p.continuationRate <
      MIN_RATE
    ) {
      rejected.lowRate++;

      continue;
    }


    if (
      p.edge <
      MIN_EDGE
    ) {
      rejected.lowEdge++;

      continue;
    }


    if (
      p.wilsonEdge <
      MIN_WILSON_EDGE
    ) {
      rejected
        .lowWilsonEdge++;

      continue;
    }


    tested.push({
      ...candidate,
      ...p
    });
  }


  /*
  GROUP BY NUMBER
  */

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
      .push(
        item
      );
  }


  /*
  V2.6.2 SCORE
  */

  const ranked =
    tested.map(
      item => {

        const group =
          groups.get(
            item.number
          )
          ||
          [item];


        const independent =
          calculateIndependent(
            group
          );


        const related =
          group.length;


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


        const recentAdjustment =
          item.recentStatus ===
            "active"
            ?
            4
            :
            item.recentStatus ===
              "historical-only"
              ?
              -6
              :
              0;


        const baseScore =
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
            baseScore
          );


        return {
          ...item,

          independentConsensus:
            independent,

          relatedBridgeCount:
            related,

          baseScore:
            round(
              baseScore
            ),

          strength
        };
      }
    );


  /*
  V2.6.2 SORT
  */

  const strengthRank = {
    "very-strong": 4,
    strong: 3,
    historical: 2,
    qualified: 1
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
        b.baseScore -
        a.baseScore
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


  const target =
    rows[
      targetIndex
    ];


  const recommendations =
    dedupeBaseRanking(
      ranked,
      target.lotoFlags
    );


  return {
    sourceDate:
      rows[
        sourceIndex
      ]
        .draw_date,

    predictionDate:
      target.draw_date,

    trainDraws,

    modelWindow,

    baselineRate:
      round(
        baselineRate
      ),

    actualUniqueLotoCount:
      target.lotoCount,

    activeCandidateCount:
      active.length,

    qualifiedBridgeCount:
      ranked.length,

    rejected,

    recommendations,

    evaluation: {
      top1:
        evaluateTop(
          recommendations,
          target.lotoCount,
          1
        ),

      top3:
        evaluateTop(
          recommendations,
          target.lotoCount,
          3
        ),

      top5:
        evaluateTop(
          recommendations,
          target.lotoCount,
          5
        )
    }
  };
}


/*
========================================================
COMBINE V2.6.2 + V2.8
========================================================
*/

function combineBaseAndV28(
  baseDay,
  calibrator
) {
  const v28Recommendations =
    rerankV28(
      baseDay.recommendations,
      calibrator,
      baseDay.baselineRate
    );


  return {
    sourceDate:
      baseDay.sourceDate,

    predictionDate:
      baseDay.predictionDate,

    trainDraws:
      baseDay.trainDraws,

    modelWindow:
      baseDay.modelWindow,

    baselineRate:
      baseDay.baselineRate,

    actualUniqueLotoCount:
      baseDay.actualUniqueLotoCount,

    activeCandidateCount:
      baseDay.activeCandidateCount,

    qualifiedBridgeCount:
      baseDay.qualifiedBridgeCount,

    rejected:
      baseDay.rejected,


    base: {
      model:
        WF28_BASE_MODEL,

      recommendations:
        baseDay.recommendations,

      evaluation:
        baseDay.evaluation
    },


    v28: {
      model:
        WF28_MODEL,

      recommendations:
        v28Recommendations,

      evaluation: {
        top1:
          evaluateTop(
            v28Recommendations,
            baseDay.actualUniqueLotoCount,
            1
          ),

        top3:
          evaluateTop(
            v28Recommendations,
            baseDay.actualUniqueLotoCount,
            3
          ),

        top5:
          evaluateTop(
            v28Recommendations,
            baseDay.actualUniqueLotoCount,
            5
          )
      }
    }
  };
}


/*
========================================================
BUILD ENGINE
========================================================
*/

function buildEngineFromRaw(
  rawRows
) {
  const rows =
    rawRows
      .filter(
        validRow
      )
      .map(
        normalizeRow
      );


  if (
    rows.length <
    101
  ) {
    throw new Error(
      `Chỉ có ${rows.length} kỳ hợp lệ; ` +
      `cần ít nhất 101 kỳ.`
    );
  }


  const positions =
    buildPositions(
      rows[
        rows.length - 1
      ]
    );


  const digitRows =
    buildDigitRows(
      rows,
      positions
    );


  const rules =
    buildRules(
      positions
    );


  const matrix =
    buildHitMatrix(
      rows,
      digitRows,
      rules
    );


  return {
    rows,

    positions,

    digitRows,

    rules,

    hits:
      matrix.hits,

    transitions:
      matrix.transitions
  };
}


/*
========================================================
LOAD DATA
========================================================
*/

async function loadEngine() {
  setStatus(
    "Đang tải dữ liệu D1..."
  );


  const response =
    await fetch(
      `/api/walk-forward-v27` +
      `?limit=340` +
      `&t=${Date.now()}`,
      {
        cache:
          "no-store"
      }
    );


  const text =
    await response.text();


  let data;


  try {
    data =
      JSON.parse(
        text
      );
  }
  catch {
    throw new Error(
      "API không trả JSON. " +
      "Kiểm tra /api/walk-forward-v27?limit=340."
    );
  }


  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data?.message ||
      `HTTP ${response.status}`
    );
  }


  setStatus(
    "Đang dựng hit matrix và engine V2.8 trên trình duyệt..."
  );


  await sleep(20);


  wf28Engine =
    buildEngineFromRaw(
      Array.isArray(
        data.rows
      )
        ?
        data.rows
        :
        []
    );


  const rows =
    wf28Engine.rows;


  document
    .getElementById(
      "data-info"
    )
    .innerHTML =
      `DATA: <strong>${rows.length} kỳ</strong>` +
      ` • ${fmtDate(rows[0].draw_date)}` +
      ` → ${fmtDate(rows[rows.length - 1].draw_date)}` +
      ` • ${wf28Engine.positions.length} vị trí` +
      ` • ${wf28Engine.rules.length} rule` +
      ` • CPU: trình duyệt.`;
}


/*
========================================================
UI HELPERS
========================================================
*/

function setStatus(message) {
  const el =
    document.getElementById(
      "status"
    );

  if (el) {
    el.textContent =
      message;
  }
}


function setProgress(
  done,
  total
) {
  const el =
    document.getElementById(
      "progress"
    );


  if (el) {
    el.style.width =
      `${total
        ?
        done /
        total *
        100
        :
        0}%`;
  }
}


function showError(message) {
  document
    .getElementById(
      "error-text"
    )
    .textContent =
      message;


  document
    .getElementById(
      "error-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


function hideError() {
  document
    .getElementById(
      "error-panel"
    )
    .classList
    .add(
      "hidden"
    );


  document
    .getElementById(
      "error-text"
    )
    .textContent =
      "";
}


/*
========================================================
METRICS
========================================================
*/

function metricFor(
  modelKey,
  topKey,
  testedDays
) {
  let availableDays = 0;
  let fullPickDays = 0;
  let hitDays = 0;
  let baselineTotal = 0;
  let requestedSize = 0;


  for (
    const day
    of wf28Daily
  ) {
    const item =
      day[
        modelKey
      ]
        ?.evaluation
        ?.[topKey];


    if (!item) {
      continue;
    }


    requestedSize =
      item.requestedSize
      ||
      requestedSize;


    if (
      item.actualPickCount <= 0
    ) {
      continue;
    }


    availableDays++;


    if (
      item.actualPickCount >=
      requestedSize
    ) {
      fullPickDays++;
    }


    if (
      item.hit
    ) {
      hitDays++;
    }


    baselineTotal +=
      Number(
        item.baselineRate ||
        0
      );
  }


  const hitRate =
    availableDays
      ?
      hitDays /
      availableDays *
      100
      :
      0;


  const baselineRate =
    availableDays
      ?
      baselineTotal /
      availableDays
      :
      0;


  return {
    requestedSize,

    availableDays,

    fullPickDays,

    hitDays,

    hitRate:
      round(
        hitRate
      ),

    baselineRate:
      round(
        baselineRate
      ),

    lift:
      round(
        hitRate -
        baselineRate
      ),

    coverage:
      round(
        testedDays
          ?
          availableDays /
          testedDays *
          100
          :
          0
      ),

    fullCoverage:
      round(
        testedDays
          ?
          fullPickDays /
          testedDays *
          100
          :
          0
      )
  };
}


/*
========================================================
COMPARISON TABLE
========================================================
*/

function renderComparison(
  testedDays
) {
  const rows = [
    "top1",
    "top3",
    "top5"
  ]
    .map(
      key => {

        const b =
          metricFor(
            "base",
            key,
            testedDays
          );


        const v =
          metricFor(
            "v28",
            key,
            testedDays
          );


        const label =
          key.toUpperCase();


        const delta =
          v.lift -
          b.lift;


        return `
          <tr>

            <td>
              <strong>
                ${label}
              </strong>
            </td>

            <td>
              ${pct(b.hitRate)}
              (${b.hitDays}/${b.availableDays})
            </td>

            <td>
              ${pct(b.baselineRate)}
            </td>

            <td
              class="${b.lift >= 0 ? "pos" : "neg"}"
            >
              ${b.lift > 0 ? "+" : ""}
              ${pct(b.lift)}
            </td>

            <td>
              ${pct(v.hitRate)}
              (${v.hitDays}/${v.availableDays})
            </td>

            <td>
              ${pct(v.baselineRate)}
            </td>

            <td
              class="${v.lift >= 0 ? "pos" : "neg"}"
            >
              ${v.lift > 0 ? "+" : ""}
              ${pct(v.lift)}
            </td>

            <td
              class="${delta >= 0 ? "pos" : "neg"}"
            >
              ${delta > 0 ? "+" : ""}
              ${pct(delta)}
            </td>

          </tr>
        `;
      }
    )
    .join("");


  document
    .getElementById(
      "comparison-table"
    )
    .innerHTML = `
      <table>

        <thead>

          <tr>

            <th>
              Nhóm
            </th>

            <th>
              V2.6.2 Hit
            </th>

            <th>
              Baseline
            </th>

            <th>
              Lift
            </th>

            <th>
              V2.8 Hit
            </th>

            <th>
              Baseline
            </th>

            <th>
              Lift
            </th>

            <th>
              Δ Lift
            </th>

          </tr>

        </thead>

        <tbody>
          ${rows}
        </tbody>

      </table>
    `;


  document
    .getElementById(
      "comparison-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
BUCKET STATS
========================================================
*/

function bucketStats(
  modelKey
) {
  const rank = {};
  const recent = {};
  const strength = {};


  const add =
    (
      map,
      key,
      hit
    ) => {

      const k =
        String(key);


      if (
        !map[k]
      ) {
        map[k] = {
          signals: 0,
          hits: 0
        };
      }


      map[k]
        .signals++;


      if (hit) {
        map[k]
          .hits++;
      }
    };


  for (
    const day
    of wf28Daily
  ) {
    const recs =
      (
        day[
          modelKey
        ]
          ?.recommendations
        ||
        []
      )
        .slice(
          0,
          5
        );


    recs.forEach(
      (
        item,
        i
      ) => {

        add(
          rank,
          i + 1,
          item.hit
        );


        add(
          recent,
          item.recentStatus,
          item.hit
        );


        add(
          strength,
          item.strength,
          item.hit
        );
      }
    );
  }


  return {
    rank,
    recent,
    strength
  };
}


/*
========================================================
BUCKET TABLE
========================================================
*/

function renderBucketTable(
  map
) {
  const entries =
    Object.entries(
      map
    );


  if (
    !entries.length
  ) {
    return (
      "<div class='small'>" +
      "Chưa có dữ liệu." +
      "</div>"
    );
  }


  return `
    <table>

      <thead>

        <tr>
          <th>Nhóm</th>
          <th>Signals</th>
          <th>Hits</th>
          <th>Hit rate</th>
        </tr>

      </thead>

      <tbody>

        ${
          entries
            .map(
              (
                [
                  k,
                  v
                ]
              ) => {

                return `
                  <tr>

                    <td>
                      <strong>
                        ${esc(k)}
                      </strong>
                    </td>

                    <td>
                      ${v.signals}
                    </td>

                    <td>
                      ${v.hits}
                    </td>

                    <td>
                      ${
                        pct(
                          v.signals
                            ?
                            v.hits /
                            v.signals *
                            100
                            :
                            0
                        )
                      }
                    </td>

                  </tr>
                `;
              }
            )
            .join("")
        }

      </tbody>

    </table>
  `;
}


/*
========================================================
CALIBRATION TABLE
========================================================
*/

function renderCalibrationSnapshot() {
  const el =
    document.getElementById(
      "calibration-table"
    );


  if (!el) {
    return;
  }


  if (
    !wf28LastCalibration.length
  ) {
    el.innerHTML =
      "<div class='small'>" +
      "Chưa có dữ liệu calibration." +
      "</div>";

    return;
  }


  el.innerHTML = `
    <table>

      <thead>

        <tr>
          <th>Base rank</th>
          <th>Signals</th>
          <th>Hits</th>
          <th>Hit rate</th>
          <th>Baseline</th>
          <th>Lift</th>
        </tr>

      </thead>

      <tbody>

        ${
          wf28LastCalibration
            .slice(
              0,
              8
            )
            .map(
              x => {

                return `
                  <tr>

                    <td>
                      <strong>
                        #${x.rank}
                      </strong>
                    </td>

                    <td>
                      ${x.signals}
                    </td>

                    <td>
                      ${x.hits}
                    </td>

                    <td>
                      ${pct(x.hitRate)}
                    </td>

                    <td>
                      ${pct(x.baselineRate)}
                    </td>

                    <td
                      class="${x.lift >= 0 ? "pos" : "neg"}"
                    >
                      ${x.lift > 0 ? "+" : ""}
                      ${pct(x.lift)}
                    </td>

                  </tr>
                `;
              }
            )
            .join("")
        }

      </tbody>

    </table>
  `;
}


/*
========================================================
RENDER BUCKETS
========================================================
*/

function renderBuckets() {
  const base =
    bucketStats(
      "base"
    );


  const v28 =
    bucketStats(
      "v28"
    );


  document
    .getElementById(
      "base-rank"
    )
    .innerHTML =
      renderBucketTable(
        base.rank
      );


  document
    .getElementById(
      "v28-rank"
    )
    .innerHTML =
      renderBucketTable(
        v28.rank
      );


  document
    .getElementById(
      "v28-recent"
    )
    .innerHTML =
      renderBucketTable(
        v28.recent
      );


  document
    .getElementById(
      "v28-strength"
    )
    .innerHTML =
      renderBucketTable(
        v28.strength
      );


  document
    .getElementById(
      "detail-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
DAILY TABLE
========================================================
*/

function renderDaily() {
  const html =
    [...wf28Daily]
      .sort(
        (
          a,
          b
        ) =>
          a.offset -
          b.offset
      )
      .map(
        day => {

          const base =
            (
              day.base
                .recommendations
              ||
              []
            )
              .slice(
                0,
                5
              );


          const v28 =
            (
              day.v28
                .recommendations
              ||
              []
            )
              .slice(
                0,
                5
              );


          const nums =
            list =>
              list.length
                ?
                list
                  .map(
                    x =>
                      `<span class="num ${x.hit ? "hit" : ""}">` +
                      `${esc(x.number)}` +
                      `</span>`
                  )
                  .join("")
                :
                "-";


          const hitText =
            e =>
              e
                ?
                `<span class="pos">HIT</span>`
                :
                `<span class="neg">MISS</span>`;


          return `
            <tr>

              <td>
                ${day.offset}
              </td>

              <td>
                ${fmtDate(day.sourceDate)}
                →
                ${fmtDate(day.predictionDate)}
              </td>

              <td>
                ${nums(base)}
              </td>

              <td>
                ${
                  hitText(
                    day.base
                      .evaluation
                      .top3
                      .hit
                  )
                }
              </td>

              <td>
                ${nums(v28)}
              </td>

              <td>
                ${
                  hitText(
                    day.v28
                      .evaluation
                      .top3
                      .hit
                  )
                }
              </td>

            </tr>
          `;
        }
      )
      .join("");


  document
    .getElementById(
      "daily-table"
    )
    .innerHTML = `
      <table>

        <thead>

          <tr>
            <th>Offset</th>
            <th>Kỳ</th>
            <th>V2.6.2 Top5</th>
            <th>V2.6.2 Top3</th>
            <th>V2.8 Top5</th>
            <th>V2.8 Top3</th>
          </tr>

        </thead>

        <tbody>
          ${html}
        </tbody>

      </table>
    `;


  document
    .getElementById(
      "daily-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
RENDER ALL
========================================================
*/

function renderAll(
  testedDays
) {
  if (
    !wf28Daily.length
  ) {
    return;
  }


  renderComparison(
    testedDays
  );


  renderBuckets();


  renderDaily();
}


/*
========================================================
START V2.8
========================================================
*/

async function startWalkForwardV28() {
  if (
    wf28Running
  ) {
    return;
  }


  wf28Running = true;
  wf28Stop = false;
  wf28Daily = [];


  hideError();


  document
    .getElementById(
      "start-button"
    )
    .disabled =
      true;


  document
    .getElementById(
      "stop-button"
    )
    .disabled =
      false;


  [
    "comparison-panel",
    "detail-panel",
    "daily-panel"
  ]
    .forEach(
      id =>
        document
          .getElementById(id)
          .classList
          .add(
            "hidden"
          )
    );


  try {

    if (
      !wf28Engine
    ) {
      await loadEngine();
    }


    const requestedDays =
      Number(
        document
          .getElementById(
            "test-days"
          )
          .value
      );


    const modelWindow =
      Number(
        document
          .getElementById(
            "model-window"
          )
          .value
      );


    const minTrain =
      Number(
        document
          .getElementById(
            "min-train"
          )
          .value
      );


    const latestTargetIndex =
      wf28Engine
        .rows
        .length -
      1;


    const earliestAllowedTarget =
      minTrain;


    const maxTestableDays =
      latestTargetIndex -
      earliestAllowedTarget +
      1;


    const testDays =
      Math.min(
        requestedDays,
        Math.max(
          0,
          maxTestableDays
        )
      );


    if (
      testDays <= 0
    ) {
      throw new Error(
        "Không đủ dữ liệu cho minTrain đã chọn."
      );
    }


    /*
    Vùng test gần nhất.

    Calibration warmup phải
    hoàn toàn nằm trước vùng test.
    */

    const testStartIndex =
      wf28Engine
        .rows
        .length -
      testDays;


    const warmupStartIndex =
      Math.max(
        earliestAllowedTarget,
        testStartIndex -
        RANK_CAL_WARMUP_DAYS
      );


    const warmupDays =
      Math.max(
        0,
        testStartIndex -
        warmupStartIndex
      );


    const calibrator =
      createRankCalibrator();


    setProgress(
      0,
      warmupDays +
      testDays
    );


    let processed = 0;


    /*
    Chạy tuần tự theo thời gian:

    calibration cũ nhất
    →
    test mới nhất.

    Không future leakage.
    */

    for (
      let targetIndex =
        warmupStartIndex;

      targetIndex <=
        latestTargetIndex;

      targetIndex++
    ) {

      if (
        wf28Stop
      ) {
        break;
      }


      const isTestDay =
        targetIndex >=
        testStartIndex;


      const phase =
        isTestDay
          ?
          "TEST"
          :
          "CAL";


      setStatus(
        `${phase} ` +
        `${processed + 1}/` +
        `${warmupDays + testDays}` +
        ` • ` +
        `${fmtDate(
          wf28Engine
            .rows[
              targetIndex
            ]
            .draw_date
        )}` +
        ` • local CPU`
      );


      const baseDay =
        predictBaseHistoricalDay(
          targetIndex,
          modelWindow,
          minTrain
        );


      if (
        baseDay
      ) {

        /*
        QUAN TRỌNG:

        V2.8 phải xếp hạng
        TRƯỚC khi kết quả target
        được đưa vào calibrator.
        */

        const combined =
          combineBaseAndV28(
            baseDay,
            calibrator
          );


        if (
          isTestDay
        ) {
          combined.offset =
            wf28Engine
              .rows
              .length -
            targetIndex;


          wf28Daily.push(
            combined
          );


          renderAll(
            testDays
          );
        }


        /*
        Sau khi prediction xong
        mới cho kết quả target
        vào calibration history.
        */

        updateRankCalibrator(
          calibrator,
          baseDay.recommendations,
          baseDay.baselineRate
        );
      }


      processed++;


      setProgress(
        processed,
        warmupDays +
        testDays
      );


      await sleep(15);
    }


    wf28LastCalibration =
      calibratorSnapshot(
        calibrator
      );


    renderCalibrationSnapshot();


    setStatus(
      wf28Stop
        ?
        `Đã dừng • ` +
        `${wf28Daily.length} ngày test.`
        :
        `Hoàn tất ` +
        `${wf28Daily.length} ngày test` +
        ` • warmup ${warmupDays} ngày` +
        ` • V2.8 Rank Calibration.`
    );

  }
  catch (error) {

    console.error(
      error
    );


    showError(
      error?.message ||
      "Lỗi V2.8 Rank Calibration."
    );


    setStatus(
      "Có lỗi."
    );

  }
  finally {

    wf28Running =
      false;


    document
      .getElementById(
        "start-button"
      )
      .disabled =
        false;


    document
      .getElementById(
        "stop-button"
      )
      .disabled =
        true;
  }
}


/*
========================================================
STOP
========================================================
*/

function stopWalkForwardV28() {
  wf28Stop =
    true;


  setStatus(
    "Sẽ dừng sau ngày đang tính..."
  );
}


/*
========================================================
NODE TEST EXPORT
Không ảnh hưởng trình duyệt.
========================================================
*/

if (
  typeof module !==
    "undefined"
  &&
  module.exports
) {
  module.exports = {
    buildEngineFromRaw,

    predictBaseHistoricalDay,

    combineBaseAndV28,

    createRankCalibrator,

    updateRankCalibrator,

    metricFor,

    constants: {
      WF28_VERSION,
      WF28_MODEL,
      WF28_BASE_MODEL
    },

    setEngineForTest(engine) {
      wf28Engine =
        engine;
    },

    getDailyForTest() {
      return wf28Daily;
    },

    setDailyForTest(days) {
      wf28Daily =
        days;
    }
  };
}