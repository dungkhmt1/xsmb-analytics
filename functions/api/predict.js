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


/* =========================================
   KIỂM TRA KỲ HỢP LỆ
========================================= */

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


  /*
    Kiểm tra đúng số chữ số.

    Giữ được cả số có số 0 đầu.
  */

  return (
    /^\d{5}$/.test(special[0]) &&

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


/* =========================================
   LOTO 2 SỐ
========================================= */

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
        String(number)
          .slice(-2)
          .padStart(
            2,
            "0"
          )
      );
    }
  }


  return result;
}


/* =========================================
   TẤT CẢ VỊ TRÍ CHỮ SỐ
========================================= */

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
              `${prize}:${numberIndex}:${digitIndex}`
          });

        }

      }
    );
  }


  return result;
}


/* =========================================
   LẤY CHỮ SỐ
========================================= */

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


/* =========================================
   GHÉP 2 CHỮ SỐ
========================================= */

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
      digitB +
      digitA
    );
  }


  return (
    digitA +
    digitB
  );
}


/* =========================================
   TÊN VỊ TRÍ
========================================= */

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


/* =========================================
   NGÀY TIẾP THEO
========================================= */

function nextDate(
  dateString
) {
  const date =
    new Date(
      dateString +
      "T00:00:00Z"
    );


  date.setUTCDate(
    date.getUTCDate() + 1
  );


  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


/* =========================================
   KIỂM TRA NGÀY LIÊN TIẾP
========================================= */

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

export async function onRequestGet(
  context
) {
  try {
    const db =
      context.env.DB;


    const url =
      new URL(
        context.request.url
      );


    const minStreak =
      Math.max(
        2,
        Math.min(
          Number(
            url.searchParams.get(
              "minStreak"
            ) || 2
          ),
          5
        )
      );


    /*
      Chỉ cần lịch sử ngắn
      để tìm cầu ĐANG CHẠY.

      Không cần quét 199 kỳ.
    */

    const historyLimit =
      Math.max(
        10,
        minStreak + 8
      );


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

        .bind(
          historyLimit
        )

        .all();


    /*
      Loại kỳ chưa xổ / dữ liệu rác.
    */

    let rows =
      (results || [])
        .filter(
          validRow
        )
        .reverse();


    if (
      rows.length <
      minStreak + 1
    ) {
      return Response.json({
        success: false,

        message:
          "Không đủ kỳ hợp lệ để dò cầu.",

        validDraws:
          rows.length
      });
    }


    /*
      Chỉ giữ chuỗi ngày liên tục
      tính ngược từ ngày mới nhất.

      Ví dụ nếu thiếu 21/07 thì
      không được coi 20 -> 22
      là ngày kế tiếp.
    */

    const continuous = [
      rows[
        rows.length - 1
      ]
    ];


    for (
      let i =
        rows.length - 2;

      i >= 0;

      i--
    ) {
      const newer =
        continuous[0];


      const older =
        rows[i];


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


    rows =
      continuous;


    if (
      rows.length <
      minStreak + 1
    ) {
      return Response.json({
        success: false,

        message:
          "Dữ liệu gần nhất không đủ chuỗi ngày liên tục để dò cầu.",

        continuousDraws:
          rows.length
      });
    }


    const latest =
      rows[
        rows.length - 1
      ];


    const positions =
      getPositions(
        latest
      );


    const lotoSets =
      rows.map(
        getLotoSet
      );


    const candidates = [];


    /*
      =================================
      DÒ TỪNG CẶP VỊ TRÍ
      =================================
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
          Hiện tại chỉ ghép
          hai giải khác nhau.

          Tránh số lượng cầu
          tăng quá lớn.
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {
          continue;
        }


        /*
          A+B
          và
          B+A
        */

        for (
          const reverse
          of [false, true]
        ) {

          let streak = 0;


          /*
            Đi ngược từ kỳ mới nhất.

            Ngày i tạo số.

            Kết quả được kiểm tra
            ở ngày i + 1.
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
              lotoSets[
                i + 1
              ].has(
                predicted
              );


            if (!hit) {
              break;
            }


            streak++;
          }


          /*
            Chỉ giữ cầu
            đang chạy >=2 ngày.
          */

          if (
            streak <
            minStreak
          ) {
            continue;
          }


          /*
            Dùng ngày mới nhất
            sinh số cho ngày sau.
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


          candidates.push({

            prediction,

            streak,

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
      =================================
      GOM CẦU THEO SỐ 00-99
      =================================
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

            bestStreak: 0,

            bridges: [],

            positionKeys:
              new Set()
          }
        );

      }


      const item =
        predictionMap.get(
          number
        );


      item.bridgeCount++;


      item.bestStreak =
        Math.max(
          item.bestStreak,
          bridge.streak
        );


      /*
        Mỗi vị trí được dùng
        để đánh giá độ độc lập.
      */

      item.positionKeys.add(
        bridge.positionAKey
      );


      item.positionKeys.add(
        bridge.positionBKey
      );


      /*
        Chỉ gửi tối đa 10 cầu
        cho mỗi số để JSON nhẹ.
      */

      if (
        item.bridges.length <
        10
      ) {
        item.bridges.push(
          bridge
        );
      }

    }


    /*
      =================================
      XẾP HẠNG
      =================================
    */

    const suggestions =
      Array
        .from(
          predictionMap.values()
        )

        .map(
          item => {

            const independentPositions =
              item.positionKeys.size;


            /*
              Điểm chỉ dùng xếp hạng.

              Không coi là xác suất.
            */

            const score =
              (
                item.bestStreak *
                100
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

              bestStreak:
                item.bestStreak,

              independentPositions,

              score,

              bridges:
                item.bridges
            };
          }
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


            if (
              b.bridgeCount !==
              a.bridgeCount
            ) {
              return (
                b.bridgeCount -
                a.bridgeCount
              );
            }


            return (
              b.independentPositions -
              a.independentPositions
            );
          }
        );


    /*
      =================================
      PHÂN NHÓM
      =================================
    */

    const streak4Plus =
      suggestions
        .filter(
          x =>
            x.bestStreak >= 4
        )
        .slice(
          0,
          20
        );


    const streak3 =
      suggestions
        .filter(
          x =>
            x.bestStreak === 3
        )
        .slice(
          0,
          20
        );


    const streak2 =
      suggestions
        .filter(
          x =>
            x.bestStreak === 2
        )
        .slice(
          0,
          30
        );


    return Response.json({

      success: true,

      sourceDate:
        latest.draw_date,

      predictionDate:
        nextDate(
          latest.draw_date
        ),

      minStreak,

      analyzedDraws:
        rows.length,

      totalPositions:
        positions.length,

      activeBridgeCount:
        candidates.length,

      suggestionCount:
        suggestions.length,

      suggestions:
        suggestions.slice(
          0,
          20
        ),

      groups: {
        streak4Plus,
        streak3,
        streak2
      }

    });


  } catch (error) {

    return Response.json(
      {
        success: false,

        message:
          error?.message ||
          "Lỗi Predict"
      },
      {
        status: 500
      }
    );

  }
}