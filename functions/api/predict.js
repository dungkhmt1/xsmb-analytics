/*
====================================================
XSMB PREDICT - BRIDGE V2.2
====================================================

NGUYÊN TẮC:

1. Ghép 1 chữ số ở vị trí A
   với 1 chữ số ở vị trí B.

2. Hai vị trí phải thuộc hai giải khác nhau.

3. Số được tạo ở ngày N phải xuất hiện
   trong loto ngày N+1.

4. Cầu phải chạy LIÊN TỤC tới kỳ mới nhất.

5. Chỉ giữ:
   streak = 2
   streak = 3

6. streak >= 4:
   LOẠI.

7. Nếu lần gần nhất bị gãy:
   streak = 0
   => LOẠI.

8. Cầu 3 ngày ưu tiên hơn cầu 2 ngày.

9. API chỉ READ database.
   Không INSERT / UPDATE dữ liệu.
====================================================
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


/*
====================================================
TÁCH CÁC SỐ TRONG GIẢI
====================================================
*/

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
====================================================
KIỂM TRA KỲ XỔ HỢP LỆ
====================================================
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


  /*
  Kiểm tra số lượng giải.
  */

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


  /*
  Kiểm tra số chữ số.
  */

  if (
    !special.every(
      x => /^\d{5}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g1.every(
      x => /^\d{5}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g2.every(
      x => /^\d{5}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g3.every(
      x => /^\d{5}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g4.every(
      x => /^\d{4}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g5.every(
      x => /^\d{4}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g6.every(
      x => /^\d{3}$/.test(x)
    )
  ) {
    return false;
  }


  if (
    !g7.every(
      x => /^\d{2}$/.test(x)
    )
  ) {
    return false;
  }


  return true;
}


/*
====================================================
LẤY TOÀN BỘ LOTO CỦA MỘT NGÀY
====================================================
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

      if (!number) {
        continue;
      }


      const loto =
        number
          .slice(-2)
          .padStart(2, "0");


      result.add(loto);
    }
  }


  return result;
}


/*
====================================================
TẠO DANH SÁCH TẤT CẢ VỊ TRÍ CHỮ SỐ
====================================================
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
====================================================
LẤY CHỮ SỐ TẠI MỘT VỊ TRÍ
====================================================
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


  const digit =
    number[
      position.digitIndex
    ];


  if (
    digit === undefined ||
    digit === null
  ) {
    return null;
  }


  return digit;
}


/*
====================================================
GHÉP HAI VỊ TRÍ THÀNH SỐ 2 CHỮ SỐ
====================================================
*/

function makeNumber(
  row,
  positionA,
  positionB,
  reverse = false
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


  if (reverse) {

    return (
      `${digitB}${digitA}`
    );
  }


  return (
    `${digitA}${digitB}`
  );
}


/*
====================================================
TÊN VỊ TRÍ
====================================================
*/

function positionName(position) {

  const label =
    LABELS[position.prize] ||
    position.prize;


  return (
    `${label}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


/*
====================================================
NGÀY + 1
====================================================
*/

function nextDate(
  dateString
) {

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
====================================================
KIỂM TRA 2 NGÀY LIÊN TIẾP
====================================================
*/

function isNextDay(
  previousDate,
  currentDate
) {

  return (
    nextDate(previousDate) ===
    currentDate
  );
}


/*
====================================================
TÍNH STREAK HIỆN TẠI

QUAN TRỌNG:

Bắt đầu từ kỳ mới nhất và đi ngược.

Nếu lần gần nhất gãy:
=> streak = 0.

Không được bỏ qua ngày gãy để tìm
một streak cũ hơn.
====================================================
*/

function calculateCurrentStreak(
  rows,
  lotoSets,
  positionA,
  positionB,
  reverse
) {

  let streak = 0;


  /*
  Ví dụ:

  rows:
  20
  21
  22
  23

  bắt đầu:

  22 -> 23
  rồi
  21 -> 22
  rồi
  20 -> 21
  */


  for (
    let i =
      rows.length - 2;

    i >= 0;

    i--
  ) {

    const sourceRow =
      rows[i];


    const targetRow =
      rows[i + 1];


    /*
    Hai ngày phải liên tục.
    */

    if (
      !isNextDay(
        sourceRow.draw_date,
        targetRow.draw_date
      )
    ) {

      break;
    }


    /*
    Số được tạo tại ngày nguồn.
    */

    const predicted =
      makeNumber(
        sourceRow,
        positionA,
        positionB,
        reverse
      );


    if (!predicted) {
      break;
    }


    /*
    Kiểm tra ngày kế tiếp.
    */

    const hit =
      lotoSets[i + 1]
        .has(predicted);


    /*
    GÃY CẦU.

    Dừng ngay.

    Không tìm cầu cũ.
    */

    if (!hit) {
      break;
    }


    streak++;


    /*
    Chỉ cần biết tới 4.

    Vì >=4 sẽ bị loại.
    */

    if (streak >= 4) {
      break;
    }
  }


  return streak;
}


/*
====================================================
API
====================================================
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

          version:
            "bridge-v2.2",

          message:
            "Không tìm thấy binding DB."
        },
        {
          status: 500
        }
      );
    }


    /*
    ==================================================
    CHỈ LẤY 10 KỲ

    Để xác định cầu 2/3/4 ngày
    không cần quét 199 kỳ.

    Giảm CPU Worker.
    ==================================================
    */

    const HISTORY_LIMIT = 10;


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
          HISTORY_LIMIT
        )
        .all();


    /*
    ==================================================
    LỌC KỲ HỢP LỆ
    ==================================================
    */

    let rows =
      (query.results || [])
        .filter(validRow)
        .reverse();


    if (
      rows.length < 4
    ) {

      return Response.json({

        success: false,

        version:
          "bridge-v2.2",

        message:
          "Không đủ ít nhất 4 kỳ hợp lệ.",

        validDraws:
          rows.length

      });
    }


    /*
    ==================================================
    CHỈ GIỮ CHUỖI NGÀY LIÊN TỤC
    SÁT KỲ HIỆN TẠI
    ==================================================
    */

    const latestRow =
      rows[
        rows.length - 1
      ];


    const continuousRows = [
      latestRow
    ];


    for (
      let i =
        rows.length - 2;

      i >= 0;

      i--
    ) {

      const older =
        rows[i];


      const newer =
        continuousRows[0];


      if (
        !isNextDay(
          older.draw_date,
          newer.draw_date
        )
      ) {

        break;
      }


      continuousRows.unshift(
        older
      );
    }


    rows =
      continuousRows;


    /*
    Phải có ít nhất 4 ngày:

    để xác định cầu chạy 3 ngày.
    */

    if (
      rows.length < 4
    ) {

      return Response.json({

        success: false,

        version:
          "bridge-v2.2",

        message:
          "Không đủ chuỗi ngày liên tục để phân tích cầu.",

        continuousDraws:
          rows.length,

        latestDate:
          latestRow.draw_date

      });
    }


    const latest =
      rows[
        rows.length - 1
      ];


    /*
    ==================================================
    TẠO LOTO SET
    ==================================================
    */

    const lotoSets =
      rows.map(
        row =>
          getLotoSet(row)
      );


    /*
    ==================================================
    DANH SÁCH VỊ TRÍ
    ==================================================
    */

    const positions =
      getPositions(
        latest
      );


    /*
    ==================================================
    QUÉT CẦU
    ==================================================
    */

    const candidates = [];


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
        ================================================
        CHỈ GHÉP HAI GIẢI KHÁC NHAU
        ================================================
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {

          continue;
        }


        /*
        ================================================
        KIỂM TRA 2 HƯỚNG:

        A+B
        B+A
        ================================================
        */

        for (
          const reverse
          of [false, true]
        ) {

          /*
          ==============================================
          STREAK HIỆN TẠI
          ==============================================
          */

          const streak =
            calculateCurrentStreak(
              rows,
              lotoSets,
              positionA,
              positionB,
              reverse
            );


          /*
          ==============================================
          BỘ LỌC QUAN TRỌNG NHẤT V2.2

          CHỈ:
          2
          3

          KHÔNG:
          0
          1
          >=4
          ==============================================
          */

          if (
            streak !== 2 &&
            streak !== 3
          ) {

            continue;
          }


          /*
          ==============================================
          TẠO SỐ CHO KỲ TIẾP THEO
          ==============================================
          */

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


          /*
          ==============================================
          CẦU HỢP LỆ
          ==============================================
          */

          candidates.push({

            prediction,

            streak,


            /*
            3 ngày ưu tiên hơn 2.
            */

            priority:
              streak === 3
                ? 2
                : 1,


            level:
              streak === 3
                ? "priority-3"
                : "running-2",


            direction:
              reverse
                ? "B+A"
                : "A+B",


            positionA:
              positionName(
                positionA
              ),


            positionB:
              positionName(
                positionB
              ),


            positionAKey:
              positionA.key,


            positionBKey:
              positionB.key

          });

        }
      }
    }


    /*
    ==================================================
    GOM THEO SỐ DỰ ĐOÁN
    ==================================================
    */

    const predictionMap =
      new Map();


    for (
      const bridge
      of candidates
    ) {

      const number =
        bridge.prediction;


      if (
        !predictionMap.has(
          number
        )
      ) {

        predictionMap.set(
          number,
          {

            number,

            bridgeCount: 0,

            streak2Count: 0,

            streak3Count: 0,

            bestStreak: 0,

            positionKeys:
              new Set(),

            bridges: []

          }
        );
      }


      const item =
        predictionMap.get(
          number
        );


      item.bridgeCount++;


      /*
      Đếm cầu 2 ngày.
      */

      if (
        bridge.streak === 2
      ) {

        item.streak2Count++;
      }


      /*
      Đếm cầu 3 ngày.
      */

      if (
        bridge.streak === 3
      ) {

        item.streak3Count++;
      }


      /*
      Streak tốt nhất.
      */

      item.bestStreak =
        Math.max(
          item.bestStreak,
          bridge.streak
        );


      /*
      Số vị trí độc lập.
      */

      item.positionKeys.add(
        bridge.positionAKey
      );


      item.positionKeys.add(
        bridge.positionBKey
      );


      /*
      Không trả quá nhiều chi tiết.

      Giảm JSON và CPU.
      */

      if (
        item.bridges.length < 10
      ) {

        item.bridges.push(
          bridge
        );
      }
    }


    /*
    ==================================================
    TẠO DANH SÁCH GỢI Ý
    ==================================================
    */

    let suggestions =
      Array.from(
        predictionMap.values()
      )
        .map(
          item => {

            const independentPositions =
              item.positionKeys.size;


            /*
            ============================================
            SCORE V2.2

            Cầu 3 ngày:
            trọng số cao nhất.

            Cầu 2 ngày:
            trọng số thấp hơn.

            Nhiều cầu độc lập cùng chỉ một số:
            cộng thêm điểm.

            SCORE KHÔNG PHẢI XÁC SUẤT.
            ============================================
            */

            const score =
              (
                item.streak3Count *
                100
              )
              +
              (
                item.streak2Count *
                40
              )
              +
              (
                Math.min(
                  item.bridgeCount,
                  20
                ) *
                5
              )
              +
              Math.min(
                independentPositions,
                20
              );


            return {

              number:
                item.number,


              bridgeCount:
                item.bridgeCount,


              streak2Count:
                item.streak2Count,


              streak3Count:
                item.streak3Count,


              bestStreak:
                item.bestStreak,


              independentPositions,


              score,


              bridges:
                item.bridges

            };

          }
        );


    /*
    ==================================================
    XẾP HẠNG

    Ưu tiên:

    1. Có nhiều cầu 3 ngày.
    2. Có nhiều cầu 2 ngày.
    3. Nhiều cầu độc lập.
    4. Score.
    ==================================================
    */

    suggestions.sort(
      (a, b) => {

        if (
          b.streak3Count !==
          a.streak3Count
        ) {

          return (
            b.streak3Count -
            a.streak3Count
          );
        }


        if (
          b.streak2Count !==
          a.streak2Count
        ) {

          return (
            b.streak2Count -
            a.streak2Count
          );
        }


        if (
          b.independentPositions !==
          a.independentPositions
        ) {

          return (
            b.independentPositions -
            a.independentPositions
          );
        }


        return (
          b.score -
          a.score
        );
      }
    );


    /*
    ==================================================
    NHÓM CẦU 3 NGÀY
    ==================================================
    */

    const priority3 =
      suggestions
        .filter(
          item =>
            item.streak3Count > 0
        )
        .slice(
          0,
          20
        );


    /*
    ==================================================
    NHÓM CHỈ CÓ CẦU 2 NGÀY

    Nếu một số đã có cầu 3 ngày
    thì không lặp lại ở đây.
    ==================================================
    */

    const running2 =
      suggestions
        .filter(
          item =>
            item.streak3Count === 0 &&
            item.streak2Count > 0
        )
        .slice(
          0,
          30
        );


    /*
    ==================================================
    TOP GỢI Ý

    Giới hạn 20 số.
    ==================================================
    */

    suggestions =
      suggestions.slice(
        0,
        20
      );


    /*
    ==================================================
    RESPONSE
    ==================================================
    */

    return Response.json({

      success: true,


      module:
        "bridge-predict",


      version:
        "bridge-v2.2",


      sourceDate:
        latest.draw_date,


      predictionDate:
        nextDate(
          latest.draw_date
        ),


      /*
      Số kỳ liên tục thực sự
      được sử dụng.
      */

      analyzedDraws:
        rows.length,


      /*
      Tổng số cầu còn sống
      sát ngày hiện tại.
      */

      activeBridgeCount:
        candidates.length,


      /*
      Số lượng số gợi ý.
      */

      suggestionCount:
        suggestions.length,


      /*
      ================================================
      QUY TẮC V2.2
      ================================================
      */

      rule: {

        requireCurrent:
          true,

        requireContinuous:
          true,

        acceptedStreaks: [
          2,
          3
        ],

        preferredStreak:
          3,

        rejectBroken:
          true,

        rejectFromStreak:
          4

      },


      /*
      ================================================
      TOP CHUNG
      ================================================
      */

      suggestions,


      /*
      ================================================
      PHÂN NHÓM
      ================================================
      */

      groups: {

        priority3,

        running2

      },


      note:
        "Chỉ gợi ý cầu đang chạy liên tục tới kỳ mới nhất và có streak 2 hoặc 3. Cầu gãy hoặc streak từ 4 trở lên bị loại."

    });


  } catch (error) {

    console.error(
      "Predict V2.2:",
      error
    );


    return Response.json(
      {

        success: false,

        module:
          "bridge-predict",

        version:
          "bridge-v2.2",

        message:
          error?.message ||
          "Lỗi phân tích cầu."

      },
      {
        status: 500
      }
    );
  }
}