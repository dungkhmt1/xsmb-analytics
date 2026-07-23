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


function splitPrize(value) {
  if (!value) return [];

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}


function getLotoSet(row) {

  const result = new Set();

  for (const prize of PRIZES) {

    const numbers =
      splitPrize(row[prize]);

    for (const number of numbers) {

      result.add(
        String(number)
          .slice(-2)
          .padStart(2, "0")
      );

    }

  }

  return result;
}


function getPositions(row) {

  const positions = [];

  for (const prize of PRIZES) {

    const numbers =
      splitPrize(row[prize]);

    numbers.forEach(
      (number, numberIndex) => {

        const digits =
          String(number)
            .replace(/\D/g, "")
            .split("");

        digits.forEach(
          (_, digitIndex) => {

            positions.push({

              prize,

              numberIndex,

              digitIndex,

              key:
                `${prize}:${numberIndex}:${digitIndex}`

            });

          }
        );

      }
    );

  }

  return positions;
}


function getDigit(row, position) {

  const numbers =
    splitPrize(
      row[position.prize]
    );

  const number =
    numbers[
      position.numberIndex
    ];

  if (number === undefined) {
    return null;
  }

  const digits =
    String(number)
      .replace(/\D/g, "")
      .split("");

  return (
    digits[
      position.digitIndex
    ] ?? null
  );
}


function makeNumber(
  row,
  posA,
  posB,
  reverse
) {

  const a =
    getDigit(row, posA);

  const b =
    getDigit(row, posB);

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


function labelPosition(p) {

  return (
    `${LABELS[p.prize]}` +
    `[${p.numberIndex + 1}]` +
    `.D${p.digitIndex + 1}`
  );

}


/*
=========================================
BACKTEST
=========================================
*/

export async function onRequestGet(context) {

  try {

    const url =
      new URL(
        context.request.url
      );


    const days =
      Math.max(
        30,
        Math.min(
          Number(
            url.searchParams
              .get("days")
            || 500
          ),
          1500
        )
      );


    const db =
      context.env.DB;


    const { results: rows } =
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

        .bind(days)

        .all();


    if (
      !rows ||
      rows.length < 20
    ) {

      return Response.json({

        success: false,

        message:
          "Cần ít nhất 20 kỳ dữ liệu"

      });

    }


    /*
      cũ → mới
    */

    rows.reverse();


    const lotoSets =
      rows.map(
        row =>
          getLotoSet(row)
      );


    const templateRow =
  [...rows]
    .reverse()
    .find(row => {

      const counts = {
        special: splitPrize(row.special).length,
        g1: splitPrize(row.g1).length,
        g2: splitPrize(row.g2).length,
        g3: splitPrize(row.g3).length,
        g4: splitPrize(row.g4).length,
        g5: splitPrize(row.g5).length,
        g6: splitPrize(row.g6).length,
        g7: splitPrize(row.g7).length
      };

      return (
        counts.special === 1 &&
        counts.g1 === 1 &&
        counts.g2 === 2 &&
        counts.g3 === 6 &&
        counts.g4 === 4 &&
        counts.g5 === 6 &&
        counts.g6 === 3 &&
        counts.g7 === 4
      );
    });


if (!templateRow) {
  return Response.json({
    success: false,
    message:
      "Không tìm thấy kỳ XSMB hợp lệ để tạo cấu trúc vị trí."
  });
}


const positions =
  getPositions(templateRow);


    /*
      Thống kê tổng hợp:

      streak = 2
      streak = 3
      ...
    */

    const streakStats = {};


    for (
      let streak = 1;
      streak <= 10;
      streak++
    ) {

      streakStats[streak] = {

        opportunities: 0,

        continued: 0

      };

    }


    /*
      Thống kê từng cầu
    */

    const bridgeStats = [];


    for (
      let a = 0;
      a < positions.length;
      a++
    ) {

      const posA =
        positions[a];


      for (
        let b = a + 1;
        b < positions.length;
        b++
      ) {

        const posB =
          positions[b];


        /*
          Chỉ ghép khác giải
        */

        if (
          posA.prize ===
          posB.prize
        ) {
          continue;
        }


        for (
          const reverse
          of [false, true]
        ) {


          let currentStreak = 0;

          let totalTests = 0;

          let totalHits = 0;

          let maximumStreak = 0;


          /*
            i tạo số
            kiểm tra i+1
          */

          for (
            let i = 0;
            i < rows.length - 1;
            i++
          ) {


            const predicted =
              makeNumber(
                rows[i],
                posA,
                posB,
                reverse
              );


            if (!predicted) {

              currentStreak = 0;

              continue;

            }


            const hit =
              lotoSets[i + 1]
                .has(predicted);


            totalTests++;


            /*
              Quan trọng:

              Trước khi xem kết quả
              kỳ tiếp theo:

              cầu đã chạy N ngày.

              Đây chính là cơ hội
              kiểm tra nó có tiếp tục
              hay không.
            */

            if (
              currentStreak >= 1 &&
              currentStreak <= 10
            ) {

              streakStats[
                currentStreak
              ].opportunities++;


              if (hit) {

                streakStats[
                  currentStreak
                ].continued++;

              }

            }


            if (hit) {

              totalHits++;

              currentStreak++;


              maximumStreak =
                Math.max(
                  maximumStreak,
                  currentStreak
                );

            }

            else {

              currentStreak = 0;

            }

          }


          /*
            Không cần trả về
            những cầu chưa từng
            chạy >=2 ngày.
          */

          if (
            maximumStreak < 2
          ) {
            continue;
          }


          bridgeStats.push({

            key:
              `${posA.key}|${posB.key}|${reverse ? 1 : 0}`,

            positionA:
              labelPosition(posA),

            positionB:
              labelPosition(posB),

            direction:
              reverse
                ? "B+A"
                : "A+B",

            totalTests,

            totalHits,

            hitRate:
              totalTests
                ? Number(
                    (
                      totalHits /
                      totalTests *
                      100
                    ).toFixed(2)
                  )
                : 0,

            maximumStreak

          });

        }

      }

    }


    /*
      Tính xác suất tiếp tục
      theo độ dài streak.
    */

    const continuation = [];


    for (
      let streak = 1;
      streak <= 10;
      streak++
    ) {

      const stat =
        streakStats[streak];


      const rate =
        stat.opportunities
          ? stat.continued /
            stat.opportunities *
            100
          : 0;


      continuation.push({

        streak,

        opportunities:
          stat.opportunities,

        continued:
          stat.continued,

        continuationRate:
          Number(
            rate.toFixed(2)
          )

      });

    }


    /*
      Các cầu lịch sử tốt nhất
    */

    bridgeStats.sort(
      (a, b) => {

        if (
          b.maximumStreak !==
          a.maximumStreak
        ) {

          return (
            b.maximumStreak -
            a.maximumStreak
          );

        }

        return (
          b.hitRate -
          a.hitRate
        );

      }
    );


    return Response.json({

      success: true,

      analyzedDraws:
        rows.length,

      fromDate:
        rows[0].draw_date,

      toDate:
        rows[
          rows.length - 1
        ].draw_date,

      continuation,

      bestHistoricalBridges:
        bridgeStats.slice(
          0,
          100
        )

    });


  }

  catch (error) {

    return Response.json(
      {

        success: false,

        message:
          error.message

      },
      {
        status: 500
      }
    );

  }

}