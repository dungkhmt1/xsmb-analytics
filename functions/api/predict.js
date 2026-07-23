const PRIZES = [
  "special", "g1", "g2", "g3",
  "g4", "g5", "g6", "g7"
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
    .filter(x => /^\d+$/.test(x));
}

function validRow(row) {
  return (
    splitPrize(row.special).length === 1 &&
    splitPrize(row.g1).length === 1 &&
    splitPrize(row.g2).length === 2 &&
    splitPrize(row.g3).length === 6 &&
    splitPrize(row.g4).length === 4 &&
    splitPrize(row.g5).length === 6 &&
    splitPrize(row.g6).length === 3 &&
    splitPrize(row.g7).length === 4
  );
}

function getLotoSet(row) {
  const result = new Set();

  for (const prize of PRIZES) {
    for (const number of splitPrize(row[prize])) {
      result.add(number.slice(-2).padStart(2, "0"));
    }
  }

  return result;
}

function getPositions(row) {
  const result = [];

  for (const prize of PRIZES) {
    const numbers = splitPrize(row[prize]);

    numbers.forEach((number, numberIndex) => {
      [...number].forEach((digit, digitIndex) => {
        result.push({
          prize,
          numberIndex,
          digitIndex,
          digit,
          key: `${prize}:${numberIndex}:${digitIndex}`
        });
      });
    });
  }

  return result;
}

function getDigit(row, pos) {
  const numbers = splitPrize(row[pos.prize]);

  const number = numbers[pos.numberIndex];

  if (!number) return null;

  return number[pos.digitIndex] ?? null;
}

function makeNumber(row, a, b, reverse = false) {
  const da = getDigit(row, a);
  const db = getDigit(row, b);

  if (da === null || db === null) {
    return null;
  }

  return reverse
    ? db + da
    : da + db;
}

function positionName(p) {
  return (
    `${LABELS[p.prize]}` +
    `[${p.numberIndex + 1}]` +
    `.D${p.digitIndex + 1}`
  );
}

function nextDate(dateString) {
  const d = new Date(dateString + "T00:00:00Z");

  d.setUTCDate(
    d.getUTCDate() + 1
  );

  return d
    .toISOString()
    .slice(0, 10);
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    const url =
      new URL(context.request.url);

    const minStreak = Math.max(
      2,
      Math.min(
        Number(
          url.searchParams.get("minStreak") || 2
        ),
        5
      )
    );

    /*
      Không cần 199 ngày để tìm cầu đang chạy.

      minStreak=2:
      cần tối thiểu:
      N-2 -> N-1
      N-1 -> N
      và N tạo dự đoán ngày mai.

      Lấy dư vài kỳ để xác định streak dài hơn.
    */

    const historyLimit = Math.max(
      8,
      minStreak + 6
    );

    const { results } = await db
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
      .bind(historyLimit)
      .all();

    /*
      Loại kỳ rác như "..."
    */

    const rows = (results || [])
      .filter(validRow)
      .reverse();

    if (rows.length < minStreak + 1) {
      return Response.json({
        success: false,
        message:
          "Không đủ kỳ hợp lệ để phân tích cầu.",
        validDraws: rows.length
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
      =========================
      TÌM CẦU ĐANG SỐNG
      =========================
    */

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
        const posA = positions[a];
        const posB = positions[b];

        /*
          Hiện tại chỉ ghép
          hai giải khác nhau.
        */

        if (posA.prize === posB.prize) {
          continue;
        }

        /*
          Kiểm tra A+B và B+A.
        */

        for (const reverse of [false, true]) {
          let streak = 0;

          /*
            Đi ngược từ kỳ mới nhất.

            rows[i] sinh số
            rows[i+1] kiểm tra.
          */

          for (
            let i = rows.length - 2;
            i >= 0;
            i--
          ) {
            const number =
              makeNumber(
                rows[i],
                posA,
                posB,
                reverse
              );

            if (
              !number ||
              !lotoSets[i + 1].has(number)
            ) {
              break;
            }

            streak++;
          }

          if (streak < minStreak) {
            continue;
          }

          /*
            Dùng kỳ mới nhất
            sinh số ngày tiếp theo.
          */

          const prediction =
            makeNumber(
              latest,
              posA,
              posB,
              reverse
            );

          if (!prediction) continue;

          candidates.push({
            prediction,
            streak,

            direction:
              reverse
                ? "B+A"
                : "A+B",

            positionA:
              positionName(posA),

            positionB:
              positionName(posB),

            positionAKey:
              posA.key,

            positionBKey:
              posB.key
          });
        }
      }
    }

    /*
      =========================
      GOM THEO 00-99
      =========================
    */

    const map = new Map();

    for (const bridge of candidates) {
      const number =
        bridge.prediction;

      if (!map.has(number)) {
        map.set(number, {
          number,
          bridgeCount: 0,
          bestStreak: 0,
          independentBridgeCount: 0,
          bridges: []
        });
      }

      const item =
        map.get(number);

      item.bridgeCount++;

      item.bestStreak =
        Math.max(
          item.bestStreak,
          bridge.streak
        );

      /*
        Giữ tối đa 10 cầu chi tiết.
      */

      if (item.bridges.length < 10) {
        item.bridges.push(bridge);
      }
    }

    /*
      =========================
      ĐỘ ĐỘC LẬP SƠ BỘ

      Không tính nhiều cầu dùng
      đúng cùng một cặp vị trí
      là nhiều tín hiệu độc lập.
      =========================
    */

    for (const item of map.values()) {
      const independent =
        new Set();

      for (const bridge of item.bridges) {
        const keys = [
          bridge.positionAKey,
          bridge.positionBKey
        ].sort();

        independent.add(
          keys.join("|")
        );
      }

      item.independentBridgeCount =
        independent.size;
    }

    /*
      Score hiện chỉ dùng để
      sắp xếp cầu đang chạy.

      Chưa gọi đây là xác suất.
    */

    const suggestions =
      [...map.values()]
        .map(item => ({
          ...item,

          score:
            item.bestStreak * 100 +
            Math.min(
              item.independentBridgeCount,
              10
            ) * 10 +
            Math.min(
              item.bridgeCount,
              20
            )
        }))
        .sort((a, b) => {
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
            b.independentBridgeCount !==
            a.independentBridgeCount
          ) {
            return (
              b.independentBridgeCount -
              a.independentBridgeCount
            );
          }

          return (
            b.bridgeCount -
            a.bridgeCount
          );
        });

    return Response.json({
      success: true,

      sourceDate:
        latest.draw_date,

      predictionDate:
        nextDate(latest.draw_date),

      minStreak,

      analyzedDraws:
        rows.length,

      totalPositions:
        positions.length,

      activeBridgeCount:
        candidates.length,

      suggestionCount:
        suggestions.length,

      /*
        TOP 20
      */

      suggestions:
        suggestions.slice(0, 20),

      groups: {
        streak4Plus:
          suggestions
            .filter(
              x => x.bestStreak >= 4
            )
            .slice(0, 10),

        streak3:
          suggestions
            .filter(
              x => x.bestStreak === 3
            )
            .slice(0, 10),

        streak2:
          suggestions
            .filter(
              x => x.bestStreak === 2
            )
            .slice(0, 20)
      }
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Lỗi predict"
      },
      {
        status: 500
      }
    );
  }
}