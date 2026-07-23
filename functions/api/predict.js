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

const PRIZE_LABELS = {
  special: "ĐB",
  g1: "G1",
  g2: "G2",
  g3: "G3",
  g4: "G4",
  g5: "G5",
  g6: "G6",
  g7: "G7"
};


/* =========================
   HÀM CƠ BẢN
========================= */

function splitPrize(value) {
  if (!value) return [];

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}


function getLotoSet(row) {
  const set = new Set();

  for (const prize of PRIZES) {
    const numbers = splitPrize(row[prize]);

    for (const value of numbers) {
      set.add(
        String(value)
          .slice(-2)
          .padStart(2, "0")
      );
    }
  }

  return set;
}


/*
 Ví dụ position:

 {
   prize: "g3",
   numberIndex: 1,
   digitIndex: 2,
   key: "g3:1:2"
 }
*/

function getAllPositions(row) {
  const positions = [];

  for (const prize of PRIZES) {
    const numbers = splitPrize(row[prize]);

    numbers.forEach((number, numberIndex) => {
      const digits = String(number)
        .replace(/\D/g, "")
        .split("");

      digits.forEach((digit, digitIndex) => {
        positions.push({
          prize,
          numberIndex,
          digitIndex,
          key:
            `${prize}:${numberIndex}:${digitIndex}`
        });
      });
    });
  }

  return positions;
}


function getDigit(row, position) {
  if (!row) return null;

  const numbers =
    splitPrize(row[position.prize]);

  const number =
    numbers[position.numberIndex];

  if (number === undefined) {
    return null;
  }

  const digits =
    String(number)
      .replace(/\D/g, "")
      .split("");

  return (
    digits[position.digitIndex]
    ?? null
  );
}


function formatPosition(position) {
  return {
    prize:
      PRIZE_LABELS[position.prize],

    number:
      position.numberIndex + 1,

    digit:
      position.digitIndex + 1,

    key:
      position.key
  };
}


function addOneDay(dateString) {
  const date =
    new Date(`${dateString}T00:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}


/* =========================
   KIỂM TRA 1 CẦU
========================= */

function testBridge(
  sourceRow,
  targetLoto,
  posA,
  posB,
  reverse
) {
  const digitA =
    getDigit(sourceRow, posA);

  const digitB =
    getDigit(sourceRow, posB);

  if (
    digitA === null ||
    digitB === null
  ) {
    return {
      valid: false,
      hit: false,
      number: null
    };
  }

  const number =
    reverse
      ? `${digitB}${digitA}`
      : `${digitA}${digitB}`;

  return {
    valid: true,
    number,
    hit:
      targetLoto.has(number)
  };
}


/* =========================
   API
========================= */

export async function onRequestGet(context) {

  try {

    const db =
      context.env.DB;

    const url =
      new URL(context.request.url);


    /*
      days:
      số ngày lịch sử dùng để đánh giá

      minStreak:
      cầu tối thiểu bao nhiêu ngày
    */

    const days =
      Math.max(
        10,
        Math.min(
          Number(
            url.searchParams.get("days")
            || 300
          ),
          1000
        )
      );


    const minStreak =
      Math.max(
        2,
        Math.min(
          Number(
            url.searchParams.get("minStreak")
            || 2
          ),
          20
        )
      );


    /*
      Mặc định:
      không ghép 2 vị trí
      cùng một giải.

      ?samePrize=1
      sẽ cho phép.
    */

    const allowSamePrize =
      url.searchParams.get("samePrize")
      === "1";


    /*
      Lấy dữ liệu
    */

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
        .bind(days + 1)
        .all();


    if (
      !rows ||
      rows.length <
        minStreak + 1
    ) {

      return Response.json({
        success: false,

        message:
          "Không đủ dữ liệu lịch sử để dò cầu."
      });
    }


    /*
      Chuyển thành:
      cũ -> mới
    */

    rows.reverse();


    /*
      Tạo sẵn loto Set
      để kiểm tra nhanh.
    */

    const lotoSets =
      rows.map(
        row =>
          getLotoSet(row)
      );


    const latestIndex =
      rows.length - 1;

    const latestRow =
      rows[latestIndex];


    /*
      Danh sách vị trí cố định.

      XSMB bình thường có khoảng
      107 vị trí chữ số.
    */

    const positions =
      getAllPositions(latestRow);


    /*
      ==========================
      GIAI ĐOẠN 1

      Lọc cầu bằng minStreak
      kỳ gần nhất.

      Chỉ những cầu đang sống
      mới được giữ lại.
      ==========================
    */

    const candidates = [];


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
          Mặc định không ghép
          2 vị trí cùng giải.
        */

        if (
          !allowSamePrize &&
          posA.prize === posB.prize
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

          let alive = true;


          /*
            Kiểm tra minStreak
            chuyển tiếp gần nhất.

            Ngày N tạo số
            kiểm tra kết quả N+1.
          */

          for (
            let offset = 1;
            offset <= minStreak;
            offset++
          ) {

            const sourceIndex =
              latestIndex - offset;

            const targetIndex =
              sourceIndex + 1;


            if (sourceIndex < 0) {
              alive = false;
              break;
            }


            const test =
              testBridge(
                rows[sourceIndex],
                lotoSets[targetIndex],
                posA,
                posB,
                reverse
              );


            if (
              !test.valid ||
              !test.hit
            ) {

              alive = false;
              break;

            }

          }


          if (!alive) {
            continue;
          }


          candidates.push({
            posA,
            posB,
            reverse
          });

        }

      }

    }


    /*
      ==========================
      GIAI ĐOẠN 2

      Với cầu đang sống:
      truy ngược để xác định
      streak thực tế.
      ==========================
    */

    const activeBridges = [];


    for (
      const candidate
      of candidates
    ) {

      const {
        posA,
        posB,
        reverse
      } = candidate;


      let streak = 0;


      /*
        Đếm streak hiện tại.
      */

      for (
        let sourceIndex =
          latestIndex - 1;

        sourceIndex >= 0;

        sourceIndex--
      ) {

        const targetIndex =
          sourceIndex + 1;


        const test =
          testBridge(
            rows[sourceIndex],
            lotoSets[targetIndex],
            posA,
            posB,
            reverse
          );


        if (
          !test.valid ||
          !test.hit
        ) {
          break;
        }


        streak++;

      }


      if (
        streak < minStreak
      ) {
        continue;
      }


      /*
        ========================
        ĐÁNH GIÁ TOÀN LỊCH SỬ
        ========================
      */

      let totalTests = 0;
      let totalHits = 0;

      let maxStreak = 0;
      let historicalStreak = 0;


      for (
        let i = 0;
        i < latestIndex;
        i++
      ) {

        const test =
          testBridge(
            rows[i],
            lotoSets[i + 1],
            posA,
            posB,
            reverse
          );


        if (!test.valid) {
          historicalStreak = 0;
          continue;
        }


        totalTests++;


        if (test.hit) {

          totalHits++;

          historicalStreak++;


          if (
            historicalStreak >
            maxStreak
          ) {

            maxStreak =
              historicalStreak;

          }

        } else {

          historicalStreak = 0;

        }

      }


      /*
        Dùng kết quả ngày mới nhất
        để tạo dự đoán ngày mai.
      */

      const digitA =
        getDigit(
          latestRow,
          posA
        );


      const digitB =
        getDigit(
          latestRow,
          posB
        );


      if (
        digitA === null ||
        digitB === null
      ) {
        continue;
      }


      const prediction =
        reverse
          ? `${digitB}${digitA}`
          : `${digitA}${digitB}`;


      const hitRate =
        totalTests > 0
          ? Number(
              (
                totalHits /
                totalTests *
                100
              ).toFixed(2)
            )
          : 0;


      /*
        Điểm cầu.

        Streak là yếu tố
        quan trọng nhất.
      */

      const score =
        Number(
          (
            streak * 100 +

            Math.min(
              hitRate,
              100
            ) +

            Math.min(
              maxStreak * 5,
              50
            )
          ).toFixed(2)
        );


      activeBridges.push({

        prediction,

        streak,

        maxStreak,

        totalHits,

        totalTests,

        hitRate,

        score,

        direction:
          reverse
            ? "B+A"
            : "A+B",

        positionA:
          formatPosition(posA),

        positionB:
          formatPosition(posB),

        latestDigits: {
          A: digitA,
          B: digitB
        }

      });

    }


    /*
      ==========================
      XẾP HẠNG CẦU
      ==========================
    */

    activeBridges.sort(
      (a, b) => {

        if (
          b.streak !==
          a.streak
        ) {
          return (
            b.streak -
            a.streak
          );
        }


        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }


        return (
          b.hitRate -
          a.hitRate
        );

      }
    );


    /*
      ==========================
      GOM THEO SỐ DỰ ĐOÁN

      Một số được nhiều cầu
      độc lập cùng chỉ ra
      sẽ được ưu tiên.
      ==========================
    */

    const predictionMap =
      new Map();


    for (
      const bridge
      of activeBridges
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

            bestStreak: 0,

            maxHistoricalStreak: 0,

            bestHitRate: 0,

            totalScore: 0,

            bridges: []
          }
        );

      }


      const item =
        predictionMap.get(number);


      item.bridgeCount++;


      item.bestStreak =
        Math.max(
          item.bestStreak,
          bridge.streak
        );


      item.maxHistoricalStreak =
        Math.max(
          item.maxHistoricalStreak,
          bridge.maxStreak
        );


      item.bestHitRate =
        Math.max(
          item.bestHitRate,
          bridge.hitRate
        );


      item.totalScore +=
        bridge.score;


      /*
        Không cần nhồi quá nhiều
        cầu giống nhau vào JSON.
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
      Điểm gợi ý cuối cùng.

      Ưu tiên:
      1. streak
      2. nhiều cầu cùng chỉ
      3. chất lượng lịch sử
    */

    const suggestions =
      Array.from(
        predictionMap.values()
      )
      .map(item => {

        const suggestionScore =
          Number(
            (
              item.bestStreak * 1000 +

              item.bridgeCount * 50 +

              item.bestHitRate +

              Math.min(
                item.maxHistoricalStreak * 10,
                100
              )
            ).toFixed(2)
          );


        return {
          ...item,

          totalScore:
            Number(
              item.totalScore
                .toFixed(2)
            ),

          suggestionScore
        };

      })
      .sort(
        (a, b) =>
          b.suggestionScore -
          a.suggestionScore
      );


    /*
      Phân nhóm cầu
    */

    const veryStrong =
      suggestions.filter(
        x =>
          x.bestStreak >= 4
      );


    const strong =
      suggestions.filter(
        x =>
          x.bestStreak === 3
      );


    const running =
      suggestions.filter(
        x =>
          x.bestStreak === 2
      );


    return Response.json({

      success: true,

      sourceDate:
        latestRow.draw_date,

      predictionDate:
        addOneDay(
          latestRow.draw_date
        ),

      analyzedDraws:
        rows.length,

      minStreak,

      allowSamePrize,

      totalPositions:
        positions.length,

      activeBridgeCount:
        activeBridges.length,

      suggestionCount:
        suggestions.length,


      /*
        Gợi ý chính
      */

      suggestions:
        suggestions.slice(0, 30),


      /*
        Phân loại nhanh
      */

      groups: {

        veryStrong:
          veryStrong.slice(0, 20),

        strong:
          strong.slice(0, 20),

        running:
          running.slice(0, 30)

      },


      /*
        Chi tiết từng cầu
      */

      activeBridges:
        activeBridges.slice(0, 200)

    });


  } catch (error) {

    return Response.json(
      {
        success: false,

        message:
          error?.message ||
          "Lỗi không xác định"
      },
      {
        status: 500
      }
    );

  }

}