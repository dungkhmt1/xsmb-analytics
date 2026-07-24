/*
========================================================
XSMB BRIDGE PREDICT V2.6
========================================================

MỖI CẦU:

position A cố định
+
position B cố định
+
direction cố định A+B hoặc B+A


VÍ DỤ:

ĐB[1].D4 + G4[2].D3
A+B


========================================================
V2.6 PIPELINE
========================================================

1. Tìm cầu đang sống sát kỳ mới nhất.

2. Chỉ giữ current streak:
   2, 3, 4, 5.

3. Backtest CHÍNH cầu đó.

4. Tính:
   - all history
   - 100 kỳ
   - 60 kỳ
   - 30 kỳ

5. So với baseline thực tế.

6. Wilson lower bound.

7. Stability score.

8. Sample reliability.

9. Tìm consensus độc lập:
   nhiều cầu cùng ra một số nhưng
   không dùng chung vị trí.

10. Correlation penalty:
    nhiều cầu trùng vị trí không được
    xem là nhiều bằng chứng độc lập.

11. Final score dùng để xếp hạng.

SCORE KHÔNG PHẢI XÁC SUẤT TRÚNG.
========================================================
*/


const VERSION = "bridge-v2.6";


/*
========================================================
CONFIG
========================================================
*/

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


/*
Nếu streak hiện tại đạt tới 6
thì không dùng làm prediction hiện tại.

Nhưng dữ liệu lịch sử streak >=6
vẫn được giữ khi backtest.
*/

const CURRENT_REJECT_FROM = 6;


/*
Dataset của bạn hiện khoảng 200 kỳ.

220 để có thể mở rộng thêm.
*/

const DEFAULT_HISTORY_DRAWS = 200;

const MAX_HISTORY_DRAWS = 300;


/*
Bộ lọc mặc định.
*/

const DEFAULT_MIN_SAMPLES = 5;


/*
Không dùng continuation rate 50%
làm filter quá cứng nữa.

V2.6 dùng edge so với baseline.

Tuy nhiên vẫn giữ một minimum
rất thấp để loại cầu quá yếu.
*/

const DEFAULT_MIN_RATE = 30;


/*
Cầu phải ít nhất không tệ hơn baseline
quá nhiều.

0 nghĩa là phải >= baseline.
*/

const DEFAULT_MIN_EDGE = 0;


const MAX_RETURNED_SUGGESTIONS = 40;


/*
========================================================
BASIC UTILITIES
========================================================
*/

function splitPrize(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(
      value => /^\d+$/.test(value)
    );
}


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
    ) &&

    g1.every(
      x => /^\d{5}$/.test(x)
    ) &&

    g2.every(
      x => /^\d{5}$/.test(x)
    ) &&

    g3.every(
      x => /^\d{5}$/.test(x)
    ) &&

    g4.every(
      x => /^\d{4}$/.test(x)
    ) &&

    g5.every(
      x => /^\d{4}$/.test(x)
    ) &&

    g6.every(
      x => /^\d{3}$/.test(x)
    ) &&

    g7.every(
      x => /^\d{2}$/.test(x)
    )
  );
}


/*
========================================================
LOTO SET
========================================================
*/

function getLotoSet(row) {
  const result =
    new Set();


  for (const prize of PRIZES) {
    const values =
      splitPrize(
        row[prize]
      );


    for (const value of values) {
      result.add(
        value.slice(-2)
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
  const digitA =
    getDigit(
      row,
      positionA
    );


  const digitB =
    getDigit(
      row,
      positionB
    );


  if (
    digitA === null ||
    digitB === null
  ) {
    return null;
  }


  return reverse
    ? `${digitB}${digitA}`
    : `${digitA}${digitB}`;
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
STATISTICS UTILITIES
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
    ) /
    values.length
  );
}


/*
========================================================
WILSON LOWER BOUND
========================================================

Dùng để giảm điểm:

4 / 5 = 80%

so với:

40 / 60 = 66.7%

Mẫu lớn sẽ được tin cậy hơn.
========================================================
*/

function wilsonLowerBound(
  success,
  total
) {
  if (
    !total ||
    total <= 0
  ) {
    return 0;
  }


  const z = 1.96;

  const p =
    success / total;


  const denominator =
    1 +
    (
      z * z /
      total
    );


  const center =
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
        ) /
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
    center -
    adjustment
  ) /
  denominator;
}


/*
========================================================
CURRENT STREAK
========================================================

Bắt đầu từ transition mới nhất.

Nếu mới nhất gãy:
streak = 0.

Không đi tìm streak cũ.
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
    const prediction =
      makeNumber(
        rows[i],
        positionA,
        positionB,
        reverse
      );


    if (!prediction) {
      break;
    }


    const hit =
      lotoSets[i + 1]
        .has(prediction);


    if (!hit) {
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

        number:
          prediction
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

true:
cầu tạo số ở N
và số đó xuất hiện N+1.

false:
không xuất hiện.
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
    const prediction =
      makeNumber(
        rows[i],
        positionA,
        positionB,
        reverse
      );


    if (!prediction) {
      result.push(false);

      continue;
    }


    result.push(
      lotoSets[i + 1]
        .has(prediction)
    );
  }


  return result;
}


/*
========================================================
BASELINE
========================================================

Một số 00-99 bất kỳ vốn có khả năng
xuất hiện trong một kỳ.

Baseline được tính bằng:

số lượng loto UNIQUE trung bình / 100.

Ví dụ:
mỗi ngày có trung bình 23 số loto unique

baseline ≈ 23%.
========================================================
*/

function calculateBaseline(
  lotoSets
) {
  if (
    lotoSets.length <= 1
  ) {
    return 0;
  }


  const rates = [];


  /*
  bỏ kỳ đầu tiên vì transition
  dự đoán kiểm tra kỳ kế tiếp.
  */

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
BACKTEST WINDOW
========================================================

currentStreak = 3

Tìm trong lịch sử:

✓ ✓ ✓ ?

? = continued hay gãy.

Window:
30
60
100
all
========================================================
*/

function backtestWindow(
  hitSeries,
  currentStreak,
  maxTransitions
) {
  /*
  Không dùng current streak cuối series
  để tự đánh giá chính nó.
  */

  const historicalEnd =
    Math.max(
      0,
      hitSeries.length -
      currentStreak
    );


  let start = 0;


  if (
    maxTransitions !== null
  ) {
    start =
      Math.max(
        0,
        historicalEnd -
        maxTransitions
      );
  }


  let opportunities = 0;

  let continued = 0;


  let weightedOpportunities = 0;

  let weightedContinued = 0;


  for (
    let i =
      Math.max(
        currentStreak,
        start
      );

    i < historicalEnd;

    i++
  ) {
    /*
    Bảo đảm toàn bộ run trước i
    vẫn nằm trong cửa sổ.
    */

    if (
      i - currentStreak <
      start
    ) {
      continue;
    }


    let runValid = true;


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
        runValid = false;

        break;
      }
    }


    if (!runValid) {
      continue;
    }


    opportunities++;


    const success =
      hitSeries[i] === true;


    if (success) {
      continued++;
    }


    /*
    Transition mới hơn có weight cao hơn.
    */

    const age =
      historicalEnd -
      1 -
      i;


    const weight =
      Math.exp(
        -age / 60
      );


    weightedOpportunities +=
      weight;


    if (success) {
      weightedContinued +=
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
    weightedOpportunities > 0
      ?
      weightedContinued /
      weightedOpportunities *
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


/*
========================================================
MULTI WINDOW
========================================================
*/

function analyzeHistoricalPerformance(
  hitSeries,
  currentStreak,
  baselineRate
) {
  const all =
    backtestWindow(
      hitSeries,
      currentStreak,
      null
    );


  const w100 =
    backtestWindow(
      hitSeries,
      currentStreak,
      100
    );


  const w60 =
    backtestWindow(
      hitSeries,
      currentStreak,
      60
    );


  const w30 =
    backtestWindow(
      hitSeries,
      currentStreak,
      30
    );


  /*
  Wilson dùng all-history sample.
  */

  const wilson =
    wilsonLowerBound(
      all.continued,
      all.opportunities
    )
    *
    100;


  /*
  Edge so với baseline.
  */

  const edge =
    all.rate -
    baselineRate;


  const edge30 =
    w30.rate -
    baselineRate;


  const edge60 =
    w60.rate -
    baselineRate;


  const edge100 =
    w100.rate -
    baselineRate;


  /*
  ======================================================
  STABILITY

  Chỉ dùng window có sample >= 3.

  Nếu:
  30 = 70
  60 = 67
  100 = 65
  all = 64

  range nhỏ => ổn định.

  Nếu:
  30 = 85
  60 = 55
  100 = 35
  all = 30

  range lớn => instability.
  ======================================================
  */

  const validRates = [];


  if (
    w30.opportunities >= 3
  ) {
    validRates.push(
      w30.rate
    );
  }


  if (
    w60.opportunities >= 3
  ) {
    validRates.push(
      w60.rate
    );
  }


  if (
    w100.opportunities >= 3
  ) {
    validRates.push(
      w100.rate
    );
  }


  if (
    all.opportunities >= 3
  ) {
    validRates.push(
      all.rate
    );
  }


  let stabilityRange = 100;


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
  else if (
    validRates.length === 1
  ) {
    stabilityRange = 30;
  }


  /*
  0 range -> 100 stability

  50+ range -> 0 stability.
  */

  const stabilityScore =
    clamp(
      100 -
      stabilityRange * 2,
      0,
      100
    );


  /*
  Sample reliability.

  5 sample  -> ~50
  20 sample -> 100
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
  Recent score.

  Dùng 30/60 nếu có sample.
  */

  let recentRate =
    all.rate;


  if (
    w30.opportunities >= 3 &&
    w60.opportunities >= 3
  ) {
    recentRate =
      (
        w30.rate * 0.6
      )
      +
      (
        w60.rate * 0.4
      );
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
  BRIDGE SCORE BEFORE CONSENSUS

  30% Wilson
  20% edge above baseline
  20% recent
  15% stability
  15% sample reliability

  edge được chuẩn hóa:
  +30 điểm edge => 100
  0 edge => 50
  -30 => 0
  ======================================================
  */

  const normalizedEdge =
    clamp(
      50 +
      edge *
      (
        50 / 30
      ),
      0,
      100
    );


  const rawScore =
    (
      wilson * 0.30
    )
    +
    (
      normalizedEdge * 0.20
    )
    +
    (
      recentRate * 0.20
    )
    +
    (
      stabilityScore * 0.15
    )
    +
    (
      sampleReliability * 0.15
    );


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

    baselineRate,

    edge:
      Number(
        edge.toFixed(2)
      ),

    rate30:
      w30.rate,

    samples30:
      w30.opportunities,

    edge30:
      Number(
        edge30.toFixed(2)
      ),

    rate60:
      w60.rate,

    samples60:
      w60.opportunities,

    edge60:
      Number(
        edge60.toFixed(2)
      ),

    rate100:
      w100.rate,

    samples100:
      w100.opportunities,

    edge100:
      Number(
        edge100.toFixed(2)
      ),

    recentRate:
      Number(
        recentRate.toFixed(2)
      ),

    stabilityRange:
      Number(
        stabilityRange.toFixed(2)
      ),

    stabilityScore:
      Number(
        stabilityScore.toFixed(2)
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
INDEPENDENCE
========================================================

Hai cầu được coi là phụ thuộc
nếu dùng chung position A/B.

Ví dụ:

DB.D4 + G4.D3
DB.D4 + G5.D2

=> dùng chung DB.D4
=> correlation.

Greedy selection dùng để tìm
số cầu độc lập cùng dự đoán một số.
========================================================
*/

function calculateIndependentConsensus(
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


  const selected = [];

  const usedPositions =
    new Set();


  for (
    const candidate
    of sorted
  ) {
    const keyA =
      candidate.positionAKey;

    const keyB =
      candidate.positionBKey;


    if (
      usedPositions.has(keyA) ||
      usedPositions.has(keyB)
    ) {
      continue;
    }


    selected.push(
      candidate
    );


    usedPositions.add(keyA);

    usedPositions.add(keyB);
  }


  return selected;
}


/*
========================================================
MAIN API
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
            "Không tìm thấy binding DB."
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


    /*
    ====================================================
    LOAD DATA ONCE
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
          "V2.6 cần ít nhất 30 kỳ dữ liệu hợp lệ.",

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


    const positions =
      getPositions(
        latest
      );


    const baselineRate =
      calculateBaseline(
        lotoSets
      );


    /*
    ====================================================
    PHASE 1
    ACTIVE CURRENT BRIDGES
    ====================================================
    */

    const activeCandidates = [];


    for (
      let a = 0;
      a < positions.length;
      a++
    ) {
      const positionA =
        positions[a];


      for (
        let b =
          a + 1;
        b < positions.length;
        b++
      ) {
        const positionB =
          positions[b];


        /*
        Vẫn giữ rule:
        hai giải khác nhau.
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


          const prediction =
            makeNumber(
              latest,
              positionA,
              positionB,
              reverse
            );


          if (!prediction) {
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


          const bridge =
            reverse
              ?
              `${nameB} + ${nameA}`
              :
              `${nameA} + ${nameB}`;


          activeCandidates.push({
            positionA,
            positionB,

            positionAKey:
              positionA.key,

            positionBKey:
              positionB.key,

            reverse,

            bridgeKey:
              `${positionA.key}|` +
              `${positionB.key}|` +
              `${direction}`,

            number:
              prediction,

            streak:
              current.streak,

            bridge,

            positionAName:
              nameA,

            positionBName:
              nameB,

            direction,

            history:
              current.history
          });
        }
      }
    }


    /*
    ====================================================
    PHASE 2
    BACKTEST ACTIVE ONLY
    ====================================================
    */

    const tested = [];


    const rejected = {
      insufficientSamples: 0,

      lowRate: 0,

      belowBaseline: 0
    };


    for (
      const candidate
      of activeCandidates
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
        analyzeHistoricalPerformance(
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
        rejected
          .belowBaseline++;

        continue;
      }


      tested.push({
        bridgeKey:
          candidate.bridgeKey,

        number:
          candidate.number,

        streak:
          candidate.streak,

        bridge:
          candidate.bridge,

        positionA:
          candidate.positionAName,

        positionB:
          candidate.positionBName,

        positionAKey:
          candidate.positionAKey,

        positionBKey:
          candidate.positionBKey,

        direction:
          candidate.direction,

        history:
          candidate.history,

        ...performance
      });
    }


    /*
    ====================================================
    PHASE 3
    CONSENSUS BY PREDICTED NUMBER
    ====================================================
    */

    const numberGroups =
      new Map();


    for (
      const candidate
      of tested
    ) {
      if (
        !numberGroups.has(
          candidate.number
        )
      ) {
        numberGroups.set(
          candidate.number,
          []
        );
      }


      numberGroups
        .get(candidate.number)
        .push(candidate);
    }


    /*
    Tính independent consensus.
    */

    const numberConsensus =
      new Map();


    for (
      const [
        number,
        candidates
      ]
      of numberGroups
    ) {
      const independent =
        calculateIndependentConsensus(
          candidates
        );


      numberConsensus.set(
        number,
        {
          totalBridgeCount:
            candidates.length,

          independentCount:
            independent.length,

          independentBridges:
            independent
              .slice(0, 5)
              .map(
                item =>
                  item.bridgeKey
              )
        }
      );
    }


    /*
    ====================================================
    FINAL BRIDGE SCORE
    ====================================================

    Consensus bonus:
    + tối đa 15.

    Correlation penalty:
    nếu nhiều cầu nhưng ít independent,
    giảm điểm.
    ====================================================
    */

    const accepted =
      tested.map(
        item => {
          const consensus =
            numberConsensus.get(
              item.number
            );


          const independentCount =
            consensus
              ?.independentCount
            || 1;


          const totalBridgeCount =
            consensus
              ?.totalBridgeCount
            || 1;


          /*
          Ví dụ:

          10 cầu
          nhưng chỉ 2 độc lập

          independentRatio = 0.2
          */

          const independentRatio =
            independentCount /
            totalBridgeCount;


          const consensusBonus =
            Math.min(
              15,
              Math.max(
                0,
                independentCount -
                1
              )
              *
              5
            );


          /*
          Nếu chỉ có nhiều cầu
          vì dùng chung vị trí,
          penalty tối đa 10.
          */

          const correlationPenalty =
            (
              totalBridgeCount > 1
            )
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
          Không cộng trực tiếp streak.

          Streak chỉ là trạng thái
          kích hoạt cầu hiện tại.
          */

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


          let strength =
            "qualified";


          if (
            finalScore >= 70 &&
            item.edge > 10 &&
            item.opportunities >= 10
          ) {
            strength =
              "very-strong";
          }
          else if (
            finalScore >= 55
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
              item.positionA,

            positionB:
              item.positionB,

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

            wilsonLowerBound:
              item.wilsonLowerBound,

            baselineRate:
              item.baselineRate,

            edge:
              item.edge,

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

            stabilityRange:
              item.stabilityRange,

            stabilityScore:
              item.stabilityScore,

            sampleReliability:
              item.sampleReliability,

            rawScore:
              item.rawScore,

            independentConsensus:
              independentCount,

            relatedBridgeCount:
              totalBridgeCount,

            correlationPenalty:
              Number(
                correlationPenalty
                  .toFixed(2)
              ),

            consensusBonus:
              Number(
                consensusBonus
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
          b.independentConsensus !==
          a.independentConsensus
        ) {
          return (
            b.independentConsensus -
            a.independentConsensus
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


        if (
          b.edge !==
          a.edge
        ) {
          return (
            b.edge -
            a.edge
          );
        }


        return (
          b.stabilityScore -
          a.stabilityScore
        );
      }
    );


    /*
    ====================================================
    NUMBER SUMMARY
    ====================================================

    Đây mới là phần hữu ích
    để sau này tạo Top số.

    Không thay thế danh sách cầu.
    ====================================================
    */

    const numberSummary = [];


    for (
      const [
        number,
        candidates
      ]
      of numberGroups
    ) {
      const finalCandidates =
        accepted.filter(
          item =>
            item.number ===
            number
        );


      if (
        !finalCandidates.length
      ) {
        continue;
      }


      const consensus =
        numberConsensus.get(
          number
        );


      const best =
        finalCandidates[0];


      const topScores =
        finalCandidates
          .slice(0, 3)
          .map(
            item =>
              item.score
          );


      /*
      Number score:

      best bridge = chính

      thêm chút consensus
      nếu nhiều cầu độc lập.
      */

      const numberScore =
        clamp(
          best.score
          +
          Math.min(
            10,
            Math.max(
              0,
              (
                consensus
                  ?.independentCount
                || 1
              )
              -
              1
            )
            *
            3
          ),
          0,
          100
        );


      numberSummary.push({
        number,

        score:
          Number(
            numberScore
              .toFixed(2)
          ),

        bestBridgeScore:
          best.score,

        bestBridge:
          best.bridge,

        bestStreak:
          best.streak,

        independentBridgeCount:
          consensus
            ?.independentCount
          || 1,

        totalRelatedBridges:
          candidates.length,

        averageTopScore:
          Number(
            average(
              topScores
            )
              .toFixed(2)
          )
      });
    }


    numberSummary.sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
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

      /*
      Cầu đang sống streak 2-5.
      */

      activeCandidateCount:
        activeCandidates.length,

      /*
      Sau sample/rate/baseline filter.
      */

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
        fixedPosition: true,

        fixedDirection: true,

        requireCurrent: true,

        currentStreaks: [
          2,
          3,
          4,
          5
        ],

        rejectBroken: true,

        minSamples,

        minContinuationRate:
          minRate,

        minEdgeVsBaseline:
          minEdge,

        multiWindow:
          true,

        baselineComparison:
          true,

        wilsonAdjustment:
          true,

        stabilityPenalty:
          true,

        independentConsensus:
          true,

        correlationPenalty:
          true,

        historyDraws:
          rows.length,

        scoreIsProbability:
          false
      },


      rejected,


      /*
      TOP CẦU
      */

      suggestions:
        accepted.slice(
          0,
          MAX_RETURNED_SUGGESTIONS
        ),


      /*
      TOP SỐ
      */

      numberSummary:
        numberSummary.slice(
          0,
          30
        ),


      groups: {
        veryStrong:
          veryStrong.slice(
            0,
            20
          ),

        strong:
          strong.slice(
            0,
            20
          ),

        qualified:
          qualified.slice(
            0,
            20
          )
      },


      note:
        "V2.6: streak chỉ dùng xác định cầu đang sống. Xếp hạng dựa trên backtest cùng vị trí, baseline, Wilson, nhiều cửa sổ lịch sử, độ ổn định và consensus giữa các cầu độc lập. Score không phải xác suất trúng."

    });


  } catch (error) {

    console.error(
      "Predict V2.6:",
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
          "Lỗi Predict V2.6."
      },
      {
        status: 500
      }
    );
  }
}