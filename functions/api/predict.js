/*
========================================================
XSMB BRIDGE PREDICT V2.6.1 CALIBRATION
========================================================

Mỗi cầu:

position A cố định
+
position B cố định
+
direction cố định


Mục tiêu V2.6.1:

- Giảm cầu giả
- Tăng yêu cầu sample
- So sánh với baseline
- Dùng Wilson Edge
- Giảm ảnh hưởng consensus
- Không cho consensus cứu một cầu yếu
- Strength dựa trên bằng chứng,
  không chỉ Final Score

SCORE KHÔNG PHẢI XÁC SUẤT.
========================================================
*/


const VERSION =
  "bridge-v2.6.1";


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


/*
========================================================
CALIBRATION
========================================================
*/

const MIN_CURRENT_STREAK = 2;

const MAX_CURRENT_STREAK = 5;

const CURRENT_REJECT_FROM = 6;


const DEFAULT_HISTORY_DRAWS = 200;

const MAX_HISTORY_DRAWS = 300;


/*
V2.6:
5

V2.6.1:
10
*/

const DEFAULT_MIN_SAMPLES = 10;


/*
V2.6:
30%

V2.6.1:
40%
*/

const DEFAULT_MIN_RATE = 40;


/*
Raw continuation rate phải
ít nhất hơn baseline 10 điểm %.

Có thể override bằng query.
*/

const DEFAULT_MIN_EDGE = 10;


/*
Wilson Edge:

Wilson lower bound
-
baseline.

Mặc định cho phép >= -5
để Strong vẫn có thể tồn tại,
nhưng Very Strong bắt buộc > 0.
*/

const DEFAULT_MIN_WILSON_EDGE = -5;


/*
Giảm output.
*/

const MAX_RETURNED_SUGGESTIONS = 15;


/*
========================================================
UTIL
========================================================
*/

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


/*
========================================================
VALID ROW
========================================================
*/

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


/*
========================================================
LOTO
========================================================
*/

function getLotoSet(row) {

  const result =
    new Set();


  for (const prize of PRIZES) {

    const numbers =
      splitPrize(
        row[prize]
      );


    for (const number of numbers) {

      result.add(
        number.slice(-2)
      );
    }
  }


  return result;
}


/*
========================================================
POSITIONS
========================================================
*/

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


/*
========================================================
BASELINE
========================================================
*/

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


/*
========================================================
CURRENT STREAK
========================================================
*/

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


/*
========================================================
HIT SERIES
========================================================
*/

function buildHitSeries(
  rows,
  lotoSets,
  positionA,
  positionB,
  reverse
) {

  const result = [];


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


    result.push(
      number
        ?
        lotoSets[i + 1]
          .has(number)
        :
        false
    );
  }


  return result;
}


/*
========================================================
BACKTEST WINDOW
========================================================
*/

function backtestWindow(
  hitSeries,
  currentStreak,
  maxTransitions
) {

  const historicalEnd =
    Math.max(
      0,
      hitSeries.length -
      currentStreak
    );


  const start =
    maxTransitions === null

      ? 0

      : Math.max(
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
        currentStreak,
        start
      );

    i < historicalEnd;

    i++
  ) {

    if (
      i - currentStreak <
      start
    ) {
      continue;
    }


    let valid = true;


    for (
      let j = 1;
      j <= currentStreak;
      j++
    ) {

      if (
        hitSeries[
          i - j
        ] !== true
      ) {

        valid = false;

        break;
      }
    }


    if (!valid) {
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
    opportunities

      ? (
          continued /
          opportunities *
          100
        )

      : 0;


  const weightedRate =
    weightedTotal

      ? (
          weightedHits /
          weightedTotal *
          100
        )

      : 0;


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


/*
========================================================
HISTORICAL PERFORMANCE
========================================================
*/

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


  /*
  V2.6.1:
  Wilson Edge.
  */

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

  20 samples = 100.
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
  Recent rate.
  */

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


  /*
  ======================================================
  RAW SCORE V2.6.1

  Wilson tăng trọng số.

  Consensus chưa được cộng ở đây.

  Wilson          35%
  Edge            20%
  Recent          15%
  Stability       15%
  Sample          15%
  ======================================================
  */


  const normalizedEdge =
    clamp(
      50 +
      edge *
      1.5,
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

    wilsonLowerBound:
      Number(
        wilson.toFixed(2)
      ),

    baselineRate:
      baseline,

    edge:
      Number(
        edge.toFixed(2)
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
        recentRate.toFixed(2)
      ),

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


/*
========================================================
INDEPENDENT CONSENSUS
========================================================
*/

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


  const used =
    new Set();


  const selected = [];


  for (
    const candidate
    of sorted
  ) {

    if (
      used.has(
        candidate.positionAKey
      )
      ||
      used.has(
        candidate.positionBKey
      )
    ) {

      continue;
    }


    selected.push(
      candidate
    );


    used.add(
      candidate.positionAKey
    );


    used.add(
      candidate.positionBKey
    );
  }


  return selected;
}


/*
========================================================
API
========================================================
*/

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
    ====================================================
    DATA
    ====================================================
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

                ? `${nameB} + ${nameA}`

                : `${nameA} + ${nameB}`,

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
    BACKTEST + FILTER
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

      const hitSeries =
        buildHitSeries(
          rows,
          lotoSets,
          candidate.positionA,
          candidate.positionB,
          candidate.reverse
        );


      const performance =
        analyzePerformance(
          hitSeries,
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
      of groups
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
    FINAL SCORE
    ====================================================
    */

    const accepted =
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
          =================================================
          CONSENSUS V2.6.1

          V2.6:
          max +15

          V2.6.1:
          max +8

          1 independent = +0
          2 = +2
          3 = +4
          4 = +6
          5+ = +8
          =================================================
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


          /*
          Correlation penalty vẫn giữ,
          tối đa 10.
          */

          const independentRatio =
            independent /
            related;


          const correlationPenalty =
            related > 1

              ? (
                  1 -
                  independentRatio
                )
                *
                10

              : 0;


          const finalScore =
            clamp(

              item.rawScore

              +

              consensusBonus

              -

              correlationPenalty,

              0,

              100
            );


          /*
          =================================================
          STRENGTH V2.6.1
          =================================================
          */


          let strength =
            "qualified";


          /*
          VERY STRONG

          Không chỉ nhìn score.
          */

          if (
            item.opportunities >= 15

            &&

            item.continuationRate >= 50

            &&

            item.wilsonEdge > 0

            &&

            item.edge >= 15

            &&

            item.stabilityScore >= 60

            &&

            independent >= 2

            &&

            finalScore >= 60
          ) {

            strength =
              "very-strong";
          }


          /*
          STRONG
          */

          else if (
            item.opportunities >= 10

            &&

            item.continuationRate >= 40

            &&

            item.edge >= 10

            &&

            item.stabilityScore >= 40

            &&

            finalScore >= 50
          ) {

            strength =
              "strong";
          }


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
    ====================================================
    */

    accepted.sort(
      (
        a,
        b
      ) => {

        /*
        Very Strong trước.
        */

        const rank = {

          "very-strong": 3,

          "strong": 2,

          "qualified": 1

        };


        if (
          rank[b.strength] !==
          rank[a.strength]
        ) {

          return (
            rank[b.strength] -
            rank[a.strength]
          );
        }


        /*
        Sau đó Wilson Edge.
        */

        if (
          b.wilsonEdge !==
          a.wilsonEdge
        ) {

          return (
            b.wilsonEdge -
            a.wilsonEdge
          );
        }


        /*
        Sau đó score.
        */

        if (
          b.score !==
          a.score
        ) {

          return (
            b.score -
            a.score
          );
        }


        /*
        Sample.
        */

        return (
          b.opportunities -
          a.opportunities
        );
      }
    );


    /*
    ====================================================
    NUMBER SUMMARY
    ====================================================
    */

    const numberSummary = [];


    for (
      const [
        number,
        items
      ]
      of groups
    ) {

      const finalItems =
        accepted
          .filter(
            item =>
              item.number ===
              number
          );


      if (!finalItems.length) {

        continue;
      }


      const best =
        finalItems[0];


      const consensus =
        consensusMap.get(
          number
        );


      numberSummary.push({

        number,

        bestScore:
          best.score,

        bestStrength:
          best.strength,

        bestBridge:
          best.bridge,

        bestWilsonEdge:
          best.wilsonEdge,

        bestRate:
          best.continuationRate,

        independentCount:
          consensus
            ?.independent || 1,

        relatedCount:
          items.length

      });
    }


    numberSummary.sort(
      (
        a,
        b
      ) => {

        const rank = {

          "very-strong": 3,

          "strong": 2,

          "qualified": 1

        };


        if (
          rank[b.bestStrength] !==
          rank[a.bestStrength]
        ) {

          return (
            rank[b.bestStrength] -
            rank[a.bestStrength]
          );
        }


        if (
          b.bestWilsonEdge !==
          a.bestWilsonEdge
        ) {

          return (
            b.bestWilsonEdge -
            a.bestWilsonEdge
          );
        }


        return (
          b.bestScore -
          a.bestScore
        );
      }
    );


    /*
    ====================================================
    GROUPS
    ====================================================
    */

    const veryStrong =
      accepted.filter(
        item =>
          item.strength ===
          "very-strong"
      );


    const strong =
      accepted.filter(
        item =>
          item.strength ===
          "strong"
      );


    const qualified =
      accepted.filter(
        item =>
          item.strength ===
          "qualified"
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

      sourceDate:
        latest.draw_date,

      predictionDate:
        nextDate(
          latest.draw_date
        ),

      analyzedDraws:
        rows.length,

      baselineRate,

      totalPositions:
        positions.length,

      activeCandidateCount:
        active.length,

      qualifiedCount:
        accepted.length,

      returnedCount:
        Math.min(
          accepted.length,
          MAX_RETURNED_SUGGESTIONS
        ),

      uniqueNumberCount:
        numberSummary.length,


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

        baselineComparison:
          true,

        wilsonEdge:
          true,

        reducedConsensusBonus:
          true,

        strictStrengthRules:
          true,

        maxReturned:
          MAX_RETURNED_SUGGESTIONS,

        scoreIsProbability:
          false

      },


      rejected,


      counts: {

        veryStrong:
          veryStrong.length,

        strong:
          strong.length,

        qualified:
          qualified.length,

        total:
          accepted.length

      },


      suggestions:
        accepted.slice(
          0,
          MAX_RETURNED_SUGGESTIONS
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
            15
          ),

        strong:
          strong.slice(
            0,
            15
          ),

        qualified:
          qualified.slice(
            0,
            15
          )

      },


      note:
        "V2.6.1 Calibration tăng minSamples lên 10, minRate lên 40%, yêu cầu edge tối thiểu 10%, bổ sung Wilson Edge, giảm consensus bonus và dùng điều kiện Strength chặt hơn."

    });


  } catch (error) {

    console.error(
      "Predict V2.6.1:",
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
          "Lỗi Predict V2.6.1."

      },
      {
        status: 500
      }
    );
  }
}