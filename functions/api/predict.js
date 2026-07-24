/*
========================================================
XSMB BRIDGE PREDICT V2.5
========================================================

MỖI CẦU =

1 vị trí A cố định
+
1 vị trí B cố định
+
1 chiều ghép cố định A+B hoặc B+A


Ví dụ:

ĐB[1].D4 + G4[2].D3
A+B


========================================================
BƯỚC 1 - CẦU HIỆN TẠI
========================================================

Cầu phải chạy liên tục sát kỳ mới nhất.

Chấp nhận:

2 kỳ
3 kỳ
4 kỳ
5 kỳ

Loại:

0 kỳ
1 kỳ
>= 6 kỳ

Nếu kỳ gần nhất không trúng:
=> cầu gãy
=> loại ngay.


========================================================
BƯỚC 2 - BACKTEST CHÍNH CẦU ĐÓ
========================================================

Ví dụ cầu hiện tại streak = 3.

Tìm trong lịch sử những thời điểm
chính cầu này đã chạy 3 kỳ liên tục.

Sau đó kiểm tra:

kỳ tiếp theo có tiếp tục trúng hay không?


Ví dụ:

opportunities = 20
continued = 12

continuationRate = 60%


========================================================
BỘ LỌC MẶC ĐỊNH
========================================================

opportunities >= 5

continuationRate >= 50%


========================================================
SCORE
========================================================

Score KHÔNG phải xác suất.

Score sử dụng:

- Wilson lower bound
- continuation rate
- weighted recent rate
- sample size


========================================================
TỐI ƯU CLOUDFLARE
========================================================

Chỉ backtest những cầu đang sống hiện tại.

Không backtest toàn bộ cầu lịch sử trước.

========================================================
*/


const VERSION = "bridge-v2.5";


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
CONFIG
========================================================
*/

const MIN_CURRENT_STREAK = 2;

const MAX_CURRENT_STREAK = 5;

/*
Nếu phát hiện >=6 thì cầu hiện tại bị loại.
*/

const CURRENT_REJECT_FROM = 6;


const DEFAULT_HISTORY_DRAWS = 150;

const DEFAULT_MIN_SAMPLES = 5;

const DEFAULT_MIN_RATE = 50;


/*
Giới hạn JSON trả về.
*/

const MAX_RETURNED_SUGGESTIONS = 40;


/*
========================================================
TÁCH GIẢI
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


/*
========================================================
KIỂM TRA KỲ HỢP LỆ
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
      value => /^\d{5}$/.test(value)
    )

    &&

    g1.every(
      value => /^\d{5}$/.test(value)
    )

    &&

    g2.every(
      value => /^\d{5}$/.test(value)
    )

    &&

    g3.every(
      value => /^\d{5}$/.test(value)
    )

    &&

    g4.every(
      value => /^\d{4}$/.test(value)
    )

    &&

    g5.every(
      value => /^\d{4}$/.test(value)
    )

    &&

    g6.every(
      value => /^\d{3}$/.test(value)
    )

    &&

    g7.every(
      value => /^\d{2}$/.test(value)
    )

  );
}


/*
========================================================
LOTO CỦA 1 KỲ
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
DANH SÁCH VỊ TRÍ
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


/*
========================================================
LẤY CHỮ SỐ
========================================================
*/

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


/*
========================================================
GHÉP SỐ
========================================================
*/

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


/*
========================================================
TÊN VỊ TRÍ
========================================================
*/

function positionName(position) {

  return (
    `${LABELS[position.prize]}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


/*
========================================================
NGÀY + 1

Chỉ dùng để hiển thị.
========================================================
*/

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
WILSON LOWER BOUND
========================================================

Ví dụ:

4/5 = 80%

không nên được coi mạnh hơn:

30/50 = 60%

Wilson giảm ảnh hưởng
của sample quá nhỏ.
========================================================
*/

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
    centre -
    adjustment
  ) /
  denominator;
}


/*
========================================================
STREAK HIỆN TẠI
========================================================

Chỉ tính từ kỳ mới nhất đi ngược.

Ví dụ:

20 -> 21 ✓
21 -> 22 ✓
22 -> 23 ✓
23 -> 24 ✗

streak hiện tại = 0

Không lấy streak 3 cũ.
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


    /*
    Gãy sát hiện tại.
    */

    if (!hit) {
      break;
    }


    streak++;


    /*
    Lưu lịch sử để giao diện
    chứng minh cầu.
    */

    if (
      history.length < 5
    ) {

      history.push({

        sourceDate:
          rows[i].draw_date,

        targetDate:
          rows[i + 1].draw_date,

        number:
          prediction

      });
    }


    /*
    Chỉ cần biết đã >=6.
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


/*
========================================================
HIT SERIES
========================================================

Ví dụ:

[
  false,
  true,
  true,
  false,
  true,
  true,
  true
]

Mỗi phần tử đại diện:

kỳ N tạo số
→ kỳ N+1 có số đó hay không
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
BACKTEST THEO STREAK HIỆN TẠI
========================================================

Ví dụ currentStreak = 3.

Ta tìm lịch sử:

✓ ✓ ✓ ?

Mỗi lần xuất hiện ✓✓✓ là một opportunity.

? = true
=> continued

? = false
=> gãy
========================================================
*/

function backtestBridge(
  hitSeries,
  currentStreak
) {

  /*
  Không dùng chính streak hiện tại
  làm dữ liệu backtest.
  */

  const historicalEnd =
    Math.max(
      0,

      hitSeries.length -
      currentStreak
    );


  let opportunities = 0;

  let continued = 0;


  let weightedOpportunities = 0;

  let weightedContinued = 0;


  for (
    let i =
      currentStreak;

    i <
      historicalEnd;

    i++
  ) {

    let validRun = true;


    /*
    Kiểm tra N hit trước i.
    */

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

        validRun = false;

        break;
      }
    }


    if (!validRun) {
      continue;
    }


    opportunities++;


    const success =
      hitSeries[i] === true;


    if (success) {

      continued++;
    }


    /*
    Ưu tiên lịch sử gần hơn.

    age càng lớn
    weight càng nhỏ.
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


  const continuationRate =
    opportunities > 0

      ? (
          continued /
          opportunities *
          100
        )

      : 0;


  const weightedRate =
    weightedOpportunities > 0

      ? (
          weightedContinued /
          weightedOpportunities *
          100
        )

      : 0;


  const wilson =
    wilsonLowerBound(
      continued,
      opportunities
    ) * 100;


  /*
  SAMPLE FACTOR

  Sample >=20:
  factor = 1

  Sample nhỏ:
  giảm điểm.
  */

  const sampleFactor =
    Math.min(
      1,

      Math.sqrt(
        opportunities / 20
      )
    );


  /*
  SCORE V2.5

  Không phải xác suất.
  */

  const baseScore =
    (
      wilson * 0.60
    )
    +
    (
      weightedRate * 0.25
    )
    +
    (
      continuationRate * 0.15
    );


  const score =
    Number(
      (
        baseScore *
        sampleFactor
      ).toFixed(2)
    );


  return {

    opportunities,

    continued,


    continuationRate:
      Number(
        continuationRate
          .toFixed(2)
      ),


    weightedRate:
      Number(
        weightedRate
          .toFixed(2)
      ),


    wilsonLowerBound:
      Number(
        wilson
          .toFixed(2)
      ),


    sampleFactor:
      Number(
        sampleFactor
          .toFixed(3)
      ),


    score

  };
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
            "Không tìm thấy binding DB."

        },
        {
          status: 500
        }
      );
    }


    /*
    ====================================================
    QUERY PARAMS
    ====================================================
    */

    const url =
      new URL(
        context.request.url
      );


    const historyDraws =
      Math.max(
        50,

        Math.min(

          Number(
            url.searchParams.get(
              "days"
            )
            ||
            DEFAULT_HISTORY_DRAWS
          ),

          250

        )
      );


    const minSamples =
      Math.max(
        1,

        Math.min(

          Number(
            url.searchParams.get(
              "minSamples"
            )
            ||
            DEFAULT_MIN_SAMPLES
          ),

          50

        )
      );


    const minRate =
      Math.max(
        0,

        Math.min(

          Number(
            url.searchParams.get(
              "minRate"
            )
            ||
            DEFAULT_MIN_RATE
          ),

          100

        )
      );


    /*
    ====================================================
    LOAD HISTORY
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
      rows.length < 20
    ) {

      return Response.json({

        success: false,

        module:
          "bridge-predict",

        version:
          VERSION,

        message:
          "Cần ít nhất 20 kỳ hợp lệ để chạy Predict V2.5.",

        validDraws:
          rows.length

      });
    }


    /*
    ====================================================
    BASIC DATA
    ====================================================
    */

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


    /*
    ====================================================
    PHASE 1
    FIND ACTIVE BRIDGES
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
        let b = a + 1;
        b < positions.length;
        b++
      ) {

        const positionB =
          positions[b];


        /*
        Hai vị trí thuộc
        hai giải khác nhau.
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {

          continue;
        }


        /*
        Hai hướng độc lập.
        */

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


          /*
          Chỉ cầu đang chạy 2-5.
          */

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

              ? `${nameB} + ${nameA}`

              : `${nameA} + ${nameB}`;


          activeCandidates.push({

            positionA,

            positionB,

            reverse,


            bridgeKey:

              `${positionA.key}|` +
              `${positionB.key}|` +
              `${direction}`,


            number:
              prediction,


            streak:
              current.streak,


            history:
              current.history,


            positionAName:
              nameA,


            positionBName:
              nameB,


            direction,

            bridge

          });
        }
      }
    }


    /*
    ====================================================
    PHASE 2
    BACKTEST ACTIVE BRIDGES ONLY
    ====================================================
    */

    const accepted = [];


    const rejected = {

      insufficientSamples: 0,

      lowContinuationRate: 0

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


      const backtest =
        backtestBridge(
          hitSeries,
          candidate.streak
        );


      /*
      SAMPLE FILTER
      */

      if (
        backtest.opportunities <
        minSamples
      ) {

        rejected
          .insufficientSamples++;

        continue;
      }


      /*
      RATE FILTER
      */

      if (
        backtest.continuationRate <
        minRate
      ) {

        rejected
          .lowContinuationRate++;

        continue;
      }


      /*
      Strength chỉ là phân nhóm.
      */

      let strength =
        "qualified";


      if (
        backtest.continuationRate >= 70
      ) {

        strength =
          "very-strong";

      } else if (
        backtest.continuationRate >= 60
      ) {

        strength =
          "strong";
      }


      accepted.push({

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


        direction:
          candidate.direction,


        strength,


        opportunities:
          backtest.opportunities,


        continued:
          backtest.continued,


        continuationRate:
          backtest.continuationRate,


        weightedRate:
          backtest.weightedRate,


        wilsonLowerBound:
          backtest.wilsonLowerBound,


        sampleFactor:
          backtest.sampleFactor,


        score:
          backtest.score,


        history:
          candidate.history

      });
    }


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
        Score quan trọng nhất.
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
        Sample lớn hơn.
        */

        if (
          b.opportunities !==
          a.opportunities
        ) {

          return (
            b.opportunities -
            a.opportunities
          );
        }


        /*
        Rate.
        */

        if (
          b.continuationRate !==
          a.continuationRate
        ) {

          return (
            b.continuationRate -
            a.continuationRate
          );
        }


        /*
        Cuối cùng mới dùng streak.
        */

        return (
          b.streak -
          a.streak
        );

      }
    );


    /*
    ====================================================
    UNIQUE NUMBERS
    ====================================================
    */

    const uniqueNumbers =
      [
        ...new Set(
          accepted.map(
            item =>
              item.number
          )
        )
      ];


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


      /*
      Trước backtest.
      */

      activeCandidateCount:
        activeCandidates.length,


      /*
      Sau bộ lọc.
      */

      qualifiedCount:
        accepted.length,


      returnedCount:
        Math.min(
          accepted.length,
          MAX_RETURNED_SUGGESTIONS
        ),


      uniqueNumberCount:
        uniqueNumbers.length,


      uniqueNumbers,


      rule: {

        fixedPosition:
          true,

        fixedDirection:
          true,

        requireCurrent:
          true,

        currentStreaks: [
          2,
          3,
          4,
          5
        ],

        rejectBroken:
          true,

        minSamples,

        minContinuationRate:
          minRate,

        historyDraws:
          rows.length,

        scoreIsProbability:
          false

      },


      rejected,


      suggestions:
        accepted.slice(
          0,
          MAX_RETURNED_SUGGESTIONS
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
        "V2.5: chỉ các cầu vị trí đang sống hiện tại được backtest. Cầu phải có đủ mẫu và tỷ lệ tiếp diễn lịch sử đạt ngưỡng. Score chỉ dùng xếp hạng, không phải xác suất trúng."

    });


  } catch (error) {

    console.error(
      "Predict V2.5:",
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
          "Lỗi Predict V2.5."

      },
      {
        status: 500
      }
    );
  }
}