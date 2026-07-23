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


/* =========================================
   TÁCH GIẢI
========================================= */

function splitPrize(value) {
  if (!value) return [];

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(value => /^\d+$/.test(value));
}


/* =========================================
   KIỂM TRA KỲ HỢP LỆ
========================================= */

function validRow(row) {
  if (!row) return false;

  const special = splitPrize(row.special);
  const g1 = splitPrize(row.g1);
  const g2 = splitPrize(row.g2);
  const g3 = splitPrize(row.g3);
  const g4 = splitPrize(row.g4);
  const g5 = splitPrize(row.g5);
  const g6 = splitPrize(row.g6);
  const g7 = splitPrize(row.g7);

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
    /^\d{5}$/.test(special[0]) &&
    g1.every(x => /^\d{5}$/.test(x)) &&
    g2.every(x => /^\d{5}$/.test(x)) &&
    g3.every(x => /^\d{5}$/.test(x)) &&
    g4.every(x => /^\d{4}$/.test(x)) &&
    g5.every(x => /^\d{4}$/.test(x)) &&
    g6.every(x => /^\d{3}$/.test(x)) &&
    g7.every(x => /^\d{2}$/.test(x))
  );
}


/* =========================================
   LOTO CỦA MỘT KỲ
========================================= */

function getLotoSet(row) {
  const result = new Set();

  for (const prize of PRIZES) {
    const numbers = splitPrize(row[prize]);

    for (const number of numbers) {
      result.add(
        number
          .slice(-2)
          .padStart(2, "0")
      );
    }
  }

  return result;
}


/* =========================================
   DANH SÁCH VỊ TRÍ
========================================= */

function getPositions(row) {
  const result = [];

  for (const prize of PRIZES) {
    const numbers = splitPrize(row[prize]);

    numbers.forEach((number, numberIndex) => {
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
            `${prize}:${numberIndex}:${digitIndex}`
        });
      }
    });
  }

  return result;
}


/* =========================================
   LẤY CHỮ SỐ
========================================= */

function getDigit(row, position) {
  if (!row) return null;

  const numbers =
    splitPrize(row[position.prize]);

  const number =
    numbers[position.numberIndex];

  if (!number) {
    return null;
  }

  return (
    number[position.digitIndex] ??
    null
  );
}


/* =========================================
   GHÉP SỐ
========================================= */

function makeNumber(
  row,
  positionA,
  positionB,
  reverse = false
) {
  const digitA =
    getDigit(row, positionA);

  const digitB =
    getDigit(row, positionB);

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


/* =========================================
   HIỂN THỊ VỊ TRÍ
========================================= */

function positionName(position) {
  return (
    `${LABELS[position.prize]}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


/* =========================================
   NGÀY TIẾP THEO
========================================= */

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


function isNextDay(
  previous,
  current
) {
  return (
    nextDate(previous) ===
    current
  );
}


/* =========================================
   API
========================================= */

export async function onRequestGet(context) {
  try {
    const db =
      context.env.DB;

    /*
      Chỉ cần một số kỳ gần nhất
      để xác định streak hiện tại.

      Không quét toàn bộ 199 kỳ.
    */

    const HISTORY_LIMIT = 10;

    const { results } =
      await db
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
        .bind(HISTORY_LIMIT)
        .all();


    /*
      Loại dữ liệu chưa xổ / "..."
    */

    let rows =
      (results || [])
        .filter(validRow)
        .reverse();


    if (rows.length < 4) {
      return Response.json({
        success: false,

        message:
          "Cần ít nhất 4 kỳ hợp lệ để phân tích cầu V2.",

        validDraws:
          rows.length
      });
    }


    /*
      =========================================
      CHỈ GIỮ CHUỖI NGÀY LIÊN TỤC
      =========================================
    */

    const continuous = [
      rows[rows.length - 1]
    ];


    for (
      let i = rows.length - 2;
      i >= 0;
      i--
    ) {
      const older =
        rows[i];

      const newer =
        continuous[0];

      if (
        !isNextDay(
          older.draw_date,
          newer.draw_date
        )
      ) {
        break;
      }

      continuous.unshift(
        older
      );
    }


    rows = continuous;


    if (rows.length < 4) {
      return Response.json({
        success: false,

        message:
          "Không đủ chuỗi kỳ liên tục để xác định cầu 2-3 ngày.",

        continuousDraws:
          rows.length
      });
    }


    const latest =
      rows[rows.length - 1];


    const positions =
      getPositions(latest);


    const lotoSets =
      rows.map(getLotoSet);


    const candidates = [];


    /*
      =========================================
      QUÉT CẦU VỊ TRÍ
      =========================================
    */

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
          Không ghép hai chữ số
          trong cùng một giải.
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {
          continue;
        }


        /*
          Kiểm tra cả:
          A+B
          B+A
        */

        for (
          const reverse
          of [false, true]
        ) {
          let streak = 0;


          /*
            Đi từ kỳ mới nhất
            ngược về quá khứ.
          */

          for (
            let i =
              rows.length - 2;

            i >= 0;

            i--
          ) {
            const predicted =
              makeNumber(
                rows[i],
                positionA,
                positionB,
                reverse
              );


            if (!predicted) {
              break;
            }


            const hit =
              lotoSets[i + 1]
                .has(predicted);


            if (!hit) {
              break;
            }


            streak++;


            /*
              Đây là thay đổi quan trọng.

              Khi phát hiện cầu đã
              chạy tới 4 ngày thì
              không cần kiểm tra thêm.

              Vì cầu này sẽ bị loại.
            */

            if (streak >= 4) {
              break;
            }
          }


          /*
            ===================================
            LOGIC V2 MỚI
            ===================================

            0-1 ngày: loại
            2 ngày: giữ
            3 ngày: giữ
            >=4 ngày: loại
          */

          if (
            streak < 2 ||
            streak >= 4
          ) {
            continue;
          }


          /*
            Số sinh từ kỳ mới nhất
            để dự đoán kỳ kế tiếp.
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
            Cầu 3 ngày được ưu tiên
            hơn cầu 2 ngày.
          */

          const priority =
            streak === 3
              ? 2
              : 1;


          candidates.push({

            prediction,

            streak,

            priority,

            level:
              streak === 3
                ? "priority"
                : "running",

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
      =========================================
      GOM THEO SỐ DỰ ĐOÁN
      =========================================
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
        !predictionMap.has(number)
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
        predictionMap.get(number);


      item.bridgeCount++;


      if (bridge.streak === 2) {
        item.streak2Count++;
      }


      if (bridge.streak === 3) {
        item.streak3Count++;
      }


      item.bestStreak =
        Math.max(
          item.bestStreak,
          bridge.streak
        );


      item.positionKeys.add(
        bridge.positionAKey
      );

      item.positionKeys.add(
        bridge.positionBKey
      );


      if (
        item.bridges.length < 10
      ) {
        item.bridges.push(
          bridge
        );
      }
    }


    /*
      =========================================
      XẾP HẠNG

      Không còn:
      streak 4 > streak 3 > streak 2

      Mà:
      streak 3 > streak 2
      streak >=4 không tồn tại.
      =========================================
    */

    const suggestions =
      Array.from(
        predictionMap.values()
      )
        .map(item => {

          const independentPositions =
            item.positionKeys.size;


          /*
            Trọng số:

            cầu 3 ngày:
            mạnh hơn rõ rệt.

            cầu 2 ngày:
            vẫn là tín hiệu chính.

            nhiều cầu cùng chỉ:
            cộng thêm điểm.
          */

          const score =
            (
              item.streak3Count * 100
            )
            +
            (
              item.streak2Count * 40
            )
            +
            (
              Math.min(
                item.bridgeCount,
                20
              ) * 5
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
        })

        .sort(
          (a, b) => {

            /*
              Ưu tiên số có
              nhiều cầu 3 ngày.
            */

            if (
              b.streak3Count !==
              a.streak3Count
            ) {
              return (
                b.streak3Count -
                a.streak3Count
              );
            }


            /*
              Sau đó số có
              nhiều cầu 2 ngày.
            */

            if (
              b.streak2Count !==
              a.streak2Count
            ) {
              return (
                b.streak2Count -
                a.streak2Count
              );
            }


            return (
              b.score -
              a.score
            );
          }
        );


    /*
      =========================================
      PHÂN NHÓM
      =========================================
    */

    const streak3 =
      suggestions
        .filter(
          item =>
            item.streak3Count > 0
        )
        .slice(0, 20);


    const streak2 =
      suggestions
        .filter(
          item =>
            item.streak3Count === 0 &&
            item.streak2Count > 0
        )
        .slice(0, 30);


    return Response.json({

      success: true,

      version:
        "bridge-v2.1",

      sourceDate:
        latest.draw_date,

      predictionDate:
        nextDate(
          latest.draw_date
        ),

      analyzedDraws:
        rows.length,

      activeBridgeCount:
        candidates.length,

      suggestionCount:
        suggestions.length,


      /*
        Logic hiện tại
      */

      rule: {
        minStreak: 2,
        preferredStreak: 3,
        maxAcceptedStreak: 3,
        rejectFromStreak: 4
      },


      /*
        TOP chung
      */

      suggestions:
        suggestions.slice(0, 20),


      /*
        Nhóm riêng
      */

      groups: {

        priority3:
          streak3,

        running2:
          streak2

      },


      note:
        "Chỉ giữ cầu đang chạy 2 hoặc 3 ngày. Cầu từ 4 ngày trở lên bị loại."

    });


  } catch (error) {

    return Response.json(
      {
        success: false,

        version:
          "bridge-v2.1",

        message:
          error?.message ||
          "Lỗi phân tích cầu V2."
      },
      {
        status: 500
      }
    );
  }
}