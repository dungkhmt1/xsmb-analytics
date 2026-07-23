/*
====================================================
CẦU 5 CHỮ SỐ - MODULE ĐỘC LẬP
====================================================

Chỉ xét:
ĐB
G1
G2
G3

Điều kiện:
- số phải đủ 5 chữ số
- chỉ chứa đúng 2 chữ số khác nhau

Ví dụ:
66606 -> 06 / 60
55525 -> 25 / 52

Không sửa dữ liệu.
Chỉ READ bảng results.
====================================================
*/


const PRIZES = [
  {
    key: "special",
    label: "ĐB"
  },
  {
    key: "g1",
    label: "G1"
  },
  {
    key: "g2",
    label: "G2"
  },
  {
    key: "g3",
    label: "G3"
  }
];


/* ================================
   TÁCH CÁC SỐ TRONG GIẢI
================================ */

function splitPrize(value) {
  if (!value) return [];

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(
      value => /^\d{5}$/.test(value)
    );
}


/* ================================
   TẠO SET LOTO CỦA MỘT NGÀY
================================ */

function getLotoSet(row) {

  const keys = [
    "special",
    "g1",
    "g2",
    "g3",
    "g4",
    "g5",
    "g6",
    "g7"
  ];

  const result =
    new Set();


  for (const key of keys) {

    const values =
      String(row[key] || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);


    for (const value of values) {

      if (!/^\d+$/.test(value)) {
        continue;
      }

      result.add(
        value
          .slice(-2)
          .padStart(2, "0")
      );
    }
  }


  return result;
}


/* ================================
   PHÂN TÍCH SỐ 5 CHỮ SỐ
================================ */

function analyzeNumber(number) {

  if (!/^\d{5}$/.test(number)) {
    return null;
  }


  const unique = [];


  for (const digit of number) {

    if (!unique.includes(digit)) {
      unique.push(digit);
    }
  }


  /*
  Phải đúng 2 chữ số khác nhau.
  */

  if (unique.length !== 2) {
    return null;
  }


  const a =
    unique[0];

  const b =
    unique[1];


  /*
  Chuẩn hóa cặp.

  Ví dụ:
  66606

  unique theo thứ tự xuất hiện:
  6,0

  nhưng hiển thị chuẩn:
  06 - 60
  */

  const sorted =
    [...unique].sort();


  const x =
    sorted[0];

  const y =
    sorted[1];


  const direct =
    `${x}${y}`;

  const reverse =
    `${y}${x}`;


  /*
  Pattern:

  66606

  chữ số đầu tiên = A
  chữ số thứ hai = B

  => AAABA
  */

  const pattern =
    [...number]
      .map(
        digit =>
          digit === a
            ? "A"
            : "B"
      )
      .join("");


  return {
    number,

    digits: [
      x,
      y
    ],

    direct,
    reverse,

    pair:
      `${direct}-${reverse}`,

    pattern
  };
}


/* ================================
   NGÀY + N
================================ */

function addDays(
  dateString,
  days
) {

  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );


  date.setUTCDate(
    date.getUTCDate() + days
  );


  return date
    .toISOString()
    .slice(0, 10);
}


/* ================================
   TẠO KEY VỊ TRÍ
================================ */

function positionKey(
  prize,
  index
) {

  return (
    `${prize}:${index}`
  );
}


/* ================================
   PHÂN TÍCH MỘT KỲ
================================ */

function analyzeDraw(row) {

  const signals = [];


  for (const prize of PRIZES) {

    const values =
      splitPrize(
        row[prize.key]
      );


    values.forEach(
      (number, index) => {

        const analysis =
          analyzeNumber(number);


        if (!analysis) {
          return;
        }


        signals.push({

          date:
            row.draw_date,

          prize:
            prize.key,

          prizeLabel:
            prize.label,

          index:
            index + 1,

          position:
            positionKey(
              prize.key,
              index + 1
            ),

          sourceNumber:
            number,

          ...analysis
        });

      }
    );
  }


  return signals;
}


/* ================================
   KIỂM TRA TÍN HIỆU CÓ TRÚNG
================================ */

function checkHit(
  signal,
  targetRow
) {

  if (!targetRow) {
    return false;
  }


  const loto =
    getLotoSet(
      targetRow
    );


  return (
    loto.has(signal.direct) ||
    loto.has(signal.reverse)
  );
}


/* ================================
   API
================================ */

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
          message:
            "Không tìm thấy binding DB."
        },
        {
          status: 500
        }
      );
    }


    /*
    Chỉ lấy 35 kỳ.

    API này độc lập và nhẹ.
    Tránh lỗi Worker 1102.
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

          WHERE special IS NOT NULL

          ORDER BY draw_date DESC

          LIMIT 35
        `)
        .all();


    const rows =
      query.results || [];


    if (!rows.length) {

      return Response.json({
        success: false,
        message:
          "Chưa có dữ liệu XSMB."
      });
    }


    /*
    Chuyển về:
    cũ -> mới

    để xử lý timeline dễ hơn.
    */

    rows.reverse();


    const latest =
      rows[
        rows.length - 1
      ];


    const latestSignals =
      analyzeDraw(latest);


    /*
    ====================================
    TẠO MAP NGÀY
    ====================================
    */

    const rowByDate =
      new Map();


    for (const row of rows) {

      rowByDate.set(
        row.draw_date,
        row
      );
    }


    /*
    ====================================
    LỊCH SỬ THEO VỊ TRÍ
    ====================================
    */

    const historicalSignals =
      [];


    for (const row of rows) {

      const signals =
        analyzeDraw(row);


      for (const signal of signals) {

        historicalSignals.push(
          signal
        );
      }
    }


    /*
    ====================================
    PHÂN TÍCH TỪNG TÍN HIỆU HIỆN TẠI
    ====================================
    */

    const outputSignals = [];


    for (
      const current
      of latestSignals
    ) {

      /*
      Chỉ lấy lịch sử
      cùng vị trí.

      Ví dụ:
      G3.2 chỉ so với G3.2.
      */

      const history =
        historicalSignals
          .filter(
            item =>
              item.position ===
                current.position &&
              item.date <
                current.date
          )
          .sort(
            (a, b) =>
              b.date.localeCompare(
                a.date
              )
          );


      /*
      ==================================
      STREAK

      Cầu chạy được tính theo các
      tín hiệu gần nhất của cùng vị trí.

      Tối đa 2.
      ==================================
      */

      let streak = 0;


      for (const old of history) {

        const targetDate =
          addDays(
            old.date,
            1
          );


        const targetRow =
          rowByDate.get(
            targetDate
          );


        /*
        Không có kỳ kế tiếp trong
        dataset thì bỏ qua.
        */

        if (!targetRow) {
          continue;
        }


        if (
          checkHit(
            old,
            targetRow
          )
        ) {

          streak++;

          if (streak >= 2) {
            break;
          }

        } else {

          break;
        }
      }


      /*
      ==================================
      THỐNG KÊ PATTERN
      ==================================
      */

      let patternTotal = 0;
      let patternHit = 0;


      for (const old of history) {

        if (
          old.pattern !==
          current.pattern
        ) {
          continue;
        }


        const targetDate =
          addDays(
            old.date,
            1
          );


        const targetRow =
          rowByDate.get(
            targetDate
          );


        if (!targetRow) {
          continue;
        }


        patternTotal++;


        if (
          checkHit(
            old,
            targetRow
          )
        ) {
          patternHit++;
        }
      }


      const patternRate =
        patternTotal > 0
          ?
          Number(
            (
              patternHit /
              patternTotal *
              100
            ).toFixed(1)
          )
          :
          null;


      /*
      ==================================
      THỐNG KÊ VỊ TRÍ
      ==================================
      */

      let positionTotal = 0;
      let positionHit = 0;


      for (const old of history) {

        const targetDate =
          addDays(
            old.date,
            1
          );


        const targetRow =
          rowByDate.get(
            targetDate
          );


        if (!targetRow) {
          continue;
        }


        positionTotal++;


        if (
          checkHit(
            old,
            targetRow
          )
        ) {
          positionHit++;
        }
      }


      const positionRate =
        positionTotal > 0
          ?
          Number(
            (
              positionHit /
              positionTotal *
              100
            ).toFixed(1)
          )
          :
          null;


      /*
      ==================================
      ĐIỂM XẾP HẠNG

      Không gọi đây là xác suất.
      ==================================
      */

      let score = 0;


      score +=
        streak * 30;


      if (
        patternRate !== null
      ) {
        score +=
          patternRate * 0.4;
      }


      if (
        positionRate !== null
      ) {
        score +=
          positionRate * 0.2;
      }


      /*
      Có nhiều mẫu lịch sử hơn
      thì đáng tin hơn một chút.
      */

      score +=
        Math.min(
          patternTotal,
          10
        );


      score =
        Number(
          score.toFixed(1)
        );


      outputSignals.push({

        ...current,

        streak,

        status:
          streak >= 2
            ? "running-2"
            :
          streak === 1
            ? "running-1"
            :
            "new",

        patternStats: {
          total:
            patternTotal,

          hits:
            patternHit,

          rate:
            patternRate
        },

        positionStats: {
          total:
            positionTotal,

          hits:
            positionHit,

          rate:
            positionRate
        },

        score
      });
    }


    /*
    Xếp cầu mạnh lên trước.
    */

    outputSignals.sort(
      (a, b) =>
        b.score - a.score
    );


    /*
    ====================================
    GOM DÀN SỐ
    ====================================
    */

    const suggestionMap =
      new Map();


    for (
      const signal
      of outputSignals
    ) {

      const numbers = [
        signal.direct,
        signal.reverse
      ];


      for (
        const number
        of numbers
      ) {

        if (
          !suggestionMap.has(
            number
          )
        ) {

          suggestionMap.set(
            number,
            {
              number,
              signalCount: 0,
              bestStreak: 0,
              totalScore: 0,
              sources: []
            }
          );
        }


        const item =
          suggestionMap.get(
            number
          );


        item.signalCount++;


        item.bestStreak =
          Math.max(
            item.bestStreak,
            signal.streak
          );


        item.totalScore +=
          signal.score;


        item.sources.push({
          prize:
            signal.prizeLabel,

          index:
            signal.index,

          sourceNumber:
            signal.sourceNumber,

          pattern:
            signal.pattern,

          streak:
            signal.streak,

          score:
            signal.score
        });
      }
    }


    const suggestions =
      Array.from(
        suggestionMap.values()
      )
      .map(
        item => ({
          ...item,

          totalScore:
            Number(
              item.totalScore
                .toFixed(1)
            )
        })
      )
      .sort(
        (a, b) => {

          if (
            b.bestStreak !==
            a.bestStreak
          ) {

            return (
              b.bestStreak -
              a.bestStreak
            );
          }


          return (
            b.totalScore -
            a.totalScore
          );
        }
      );


    return Response.json({

      success: true,

      module:
        "five-digit-bridge",

      sourceDate:
        latest.draw_date,

      predictionDate:
        addDays(
          latest.draw_date,
          1
        ),

      secondPredictionDate:
        addDays(
          latest.draw_date,
          2
        ),

      analyzedDraws:
        rows.length,

      signalCount:
        outputSignals.length,

      signals:
        outputSignals,

      suggestions,

      note:
        "Điểm dùng để xếp hạng tín hiệu, không phải xác suất trúng."

    });


  } catch (error) {

    console.error(
      "five-digit-bridge:",
      error
    );


    return Response.json(
      {
        success: false,

        module:
          "five-digit-bridge",

        message:
          error?.message ||
          "Lỗi phân tích cầu 5 số."
      },
      {
        status: 500
      }
    );
  }
}