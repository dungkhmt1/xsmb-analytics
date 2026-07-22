function padNumber(n) {
  return String(n).padStart(2, "0");
}

function reverseNumber(n) {
  return n.split("").reverse().join("");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value, max) {
  if (!max || max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

function nextDate(dateString) {
  const date = new Date(dateString + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    /*
     * Có thể dùng:
     *
     * /api/predict
     *
     * hoặc:
     *
     * /api/predict?top=20
     */

    const requestURL = new URL(context.request.url);

    let top =
      parseInt(
        requestURL.searchParams.get("top") || "15",
        10
      );

    if (isNaN(top)) {
      top = 15;
    }

    top = clamp(top, 5, 100);

    /*
     * ==================================================
     * 1. ĐỌC DỮ LIỆU
     * ==================================================
     */

    const { results: rows } = await db
      .prepare(`
        SELECT
          draw_date,
          number,
          count
        FROM loto
        ORDER BY draw_date DESC
      `)
      .all();

    if (!rows || rows.length === 0) {
      return Response.json(
        {
          success: false,
          message: "Database chưa có dữ liệu loto"
        },
        { status: 400 }
      );
    }

    /*
     * ==================================================
     * 2. TẠO DANH SÁCH NGÀY
     * ==================================================
     */

    const drawDates = [
      ...new Set(
        rows.map(row => row.draw_date)
      )
    ];

    const latestDate = drawDates[0];
    const predictionDate = nextDate(latestDate);

    /*
     * ==================================================
     * 3. MAP DỮ LIỆU
     *
     * dateMap[date][number] = count
     * ==================================================
     */

    const dateMap = {};

    for (const row of rows) {
      if (!dateMap[row.draw_date]) {
        dateMap[row.draw_date] = {};
      }

      dateMap[row.draw_date][row.number] =
        Number(row.count);
    }

    /*
     * ==================================================
     * 4. TẠO FEATURE 00 -> 99
     * ==================================================
     */

    const features = [];

    for (let n = 0; n <= 99; n++) {
      const number = padNumber(n);

      let gan = 0;

      let freq3 = 0;
      let freq7 = 0;
      let freq14 = 0;
      let freq30 = 0;
      let freq60 = 0;
      let freq100 = 0;

      let draws7 = 0;
      let draws30 = 0;

      let totalCount = 0;
      let drawsAppeared = 0;

      let foundLatest = false;

      const appearanceIndexes = [];

      /*
       * Duyệt từ mới -> cũ
       */

      for (
        let i = 0;
        i < drawDates.length;
        i++
      ) {
        const date = drawDates[i];

        const count =
          dateMap[date]?.[number] || 0;

        totalCount += count;

        if (count > 0) {
          drawsAppeared++;
          appearanceIndexes.push(i);
        }

        /*
         * Gan hiện tại
         */

        if (!foundLatest) {
          if (count > 0) {
            foundLatest = true;
          } else {
            gan++;
          }
        }

        /*
         * Tần suất
         */

        if (i < 3) {
          freq3 += count;
        }

        if (i < 7) {
          freq7 += count;

          if (count > 0) {
            draws7++;
          }
        }

        if (i < 14) {
          freq14 += count;
        }

        if (i < 30) {
          freq30 += count;

          if (count > 0) {
            draws30++;
          }
        }

        if (i < 60) {
          freq60 += count;
        }

        if (i < 100) {
          freq100 += count;
        }
      }

      /*
       * ==================================================
       * 5. CHU KỲ XUẤT HIỆN
       * ==================================================
       */

      let averageCycle = 0;

      if (appearanceIndexes.length >= 2) {
        let cycleTotal = 0;

        for (
          let i = 0;
          i < appearanceIndexes.length - 1;
          i++
        ) {
          cycleTotal +=
            appearanceIndexes[i + 1] -
            appearanceIndexes[i];
        }

        averageCycle =
          cycleTotal /
          (appearanceIndexes.length - 1);
      }

      /*
       * Số hiện tại đang gần chu kỳ trung bình
       */

      let cycleSignal = 0;

      if (averageCycle > 0) {
        const difference =
          Math.abs(gan - averageCycle);

        cycleSignal =
          1 -
          Math.min(
            difference / averageCycle,
            1
          );
      }

      /*
       * ==================================================
       * 6. TÍN HIỆU HỒI
       *
       * Số vừa vắng vài kỳ sau khi từng xuất hiện
       * tương đối thường xuyên.
       *
       * Đây chỉ là heuristic.
       * ==================================================
       */

      let returnSignal = 0;

      if (gan >= 2 && gan <= 10) {
        returnSignal =
          Math.min(
            freq30 / 8,
            1
          );
      }

      features.push({
        number,

        gan,

        freq3,
        freq7,
        freq14,
        freq30,
        freq60,
        freq100,

        draws7,
        draws30,

        totalCount,
        drawsAppeared,

        averageCycle:
          Number(
            averageCycle.toFixed(2)
          ),

        cycleSignal,

        returnSignal
      });
    }

    /*
     * ==================================================
     * 7. THÊM FEATURE CẶP ĐẢO
     * ==================================================
     */

    const featureMap = {};

    for (const item of features) {
      featureMap[item.number] = item;
    }

    for (const item of features) {
      const reverse =
        reverseNumber(item.number);

      const reverseItem =
        featureMap[reverse];

      item.reverse = reverse;

      item.reverseGan =
        reverseItem
          ? reverseItem.gan
          : 0;

      item.reverseFreq7 =
        reverseItem
          ? reverseItem.freq7
          : 0;

      item.reverseFreq30 =
        reverseItem
          ? reverseItem.freq30
          : 0;
    }

    /*
     * ==================================================
     * 8. TÍNH ĐẦU / ĐUÔI
     * ==================================================
     */

    const head30 = {};
    const tail30 = {};

    for (let i = 0; i <= 9; i++) {
      head30[String(i)] = 0;
      tail30[String(i)] = 0;
    }

    for (
      let i = 0;
      i < Math.min(30, drawDates.length);
      i++
    ) {
      const date = drawDates[i];
      const numbers = dateMap[date] || {};

      for (
        const [number, count]
        of Object.entries(numbers)
      ) {
        head30[number[0]] += count;
        tail30[number[1]] += count;
      }
    }

    for (const item of features) {
      item.headFreq30 =
        head30[item.number[0]] || 0;

      item.tailFreq30 =
        tail30[item.number[1]] || 0;
    }

    /*
     * ==================================================
     * 9. TÌM MAX ĐỂ NORMALIZE
     * ==================================================
     */

    const maxGan =
      Math.max(
        ...features.map(x => x.gan),
        1
      );

    const maxFreq7 =
      Math.max(
        ...features.map(x => x.freq7),
        1
      );

    const maxFreq30 =
      Math.max(
        ...features.map(x => x.freq30),
        1
      );

    const maxReverseGan =
      Math.max(
        ...features.map(x => x.reverseGan),
        1
      );

    const maxReverse30 =
      Math.max(
        ...features.map(x => x.reverseFreq30),
        1
      );

    const maxHead =
      Math.max(
        ...Object.values(head30),
        1
      );

    const maxTail =
      Math.max(
        ...Object.values(tail30),
        1
      );

    /*
     * ==================================================
     * 10. TRỌNG SỐ MODEL V1
     *
     * Tổng = 1
     *
     * Đây là trọng số khởi đầu.
     * Chưa phải trọng số được chứng minh bằng backtest.
     * ==================================================
     */

    const weights = {
      gan: 0.18,
      freq7: 0.12,
      freq30: 0.18,

      reverseGan: 0.12,
      reverseFreq30: 0.10,

      cycle: 0.12,
      returnSignal: 0.08,

      head: 0.05,
      tail: 0.05
    };

    /*
     * ==================================================
     * 11. CHẤM ĐIỂM
     * ==================================================
     */

    const predictions = [];

    for (const item of features) {
      const normalized = {
        gan:
          normalize(
            item.gan,
            maxGan
          ),

        freq7:
          normalize(
            item.freq7,
            maxFreq7
          ),

        freq30:
          normalize(
            item.freq30,
            maxFreq30
          ),

        reverseGan:
          normalize(
            item.reverseGan,
            maxReverseGan
          ),

        reverseFreq30:
          normalize(
            item.reverseFreq30,
            maxReverse30
          ),

        cycle:
          item.cycleSignal,

        returnSignal:
          item.returnSignal,

        head:
          normalize(
            item.headFreq30,
            maxHead
          ),

        tail:
          normalize(
            item.tailFreq30,
            maxTail
          )
      };

      const rawScore =
        normalized.gan *
          weights.gan +

        normalized.freq7 *
          weights.freq7 +

        normalized.freq30 *
          weights.freq30 +

        normalized.reverseGan *
          weights.reverseGan +

        normalized.reverseFreq30 *
          weights.reverseFreq30 +

        normalized.cycle *
          weights.cycle +

        normalized.returnSignal *
          weights.returnSignal +

        normalized.head *
          weights.head +

        normalized.tail *
          weights.tail;

      const score =
        Number(
          (rawScore * 100).toFixed(2)
        );

      predictions.push({
        number:
          item.number,

        reverse:
          item.reverse,

        score,

        signals: {
          gan:
            item.gan,

          freq7:
            item.freq7,

          freq30:
            item.freq30,

          reverseGan:
            item.reverseGan,

          reverseFreq30:
            item.reverseFreq30,

          averageCycle:
            item.averageCycle,

          cycleSignal:
            Number(
              item.cycleSignal
                .toFixed(3)
            ),

          returnSignal:
            Number(
              item.returnSignal
                .toFixed(3)
            ),

          headFreq30:
            item.headFreq30,

          tailFreq30:
            item.tailFreq30
        }
      });
    }

    /*
     * Xếp cao -> thấp
     */

    predictions.sort(
      (a, b) =>
        b.score - a.score
    );

    /*
     * ==================================================
     * 12. TẠO CẶP ĐẢO
     * ==================================================
     */

    const pairMap = new Map();

    for (const prediction of predictions) {
      const a = prediction.number;
      const b = prediction.reverse;

      /*
       * Bỏ kép:
       * 00, 11, 22...
       */

      if (a === b) {
        continue;
      }

      const pairNumbers =
        [a, b].sort();

      const key =
        pairNumbers.join("-");

      if (pairMap.has(key)) {
        continue;
      }

      const first =
        predictions.find(
          x =>
            x.number === pairNumbers[0]
        );

      const second =
        predictions.find(
          x =>
            x.number === pairNumbers[1]
        );

      if (!first || !second) {
        continue;
      }

      /*
       * Điểm cặp:
       *
       * 60% số mạnh hơn
       * 40% số còn lại
       */

      const high =
        Math.max(
          first.score,
          second.score
        );

      const low =
        Math.min(
          first.score,
          second.score
        );

      const pairScore =
        Number(
          (
            high * 0.60 +
            low * 0.40
          ).toFixed(2)
        );

      pairMap.set(
        key,
        {
          pair:
            key,

          number1:
            pairNumbers[0],

          number2:
            pairNumbers[1],

          score:
            pairScore,

          number1Score:
            first.score,

          number2Score:
            second.score
        }
      );
    }

    const pairs =
      [...pairMap.values()]
        .sort(
          (a, b) =>
            b.score - a.score
        );

    /*
     * ==================================================
     * 13. TOP CHẠM
     * ==================================================
     */

    const touchScores = {};

    for (let digit = 0; digit <= 9; digit++) {
      const d = String(digit);

      const related =
        predictions.filter(
          item =>
            item.number.includes(d)
        );

      if (related.length === 0) {
        continue;
      }

      const average =
        related.reduce(
          (sum, item) =>
            sum + item.score,
          0
        ) / related.length;

      touchScores[d] =
        Number(
          average.toFixed(2)
        );
    }

    const topTouches =
      Object.entries(touchScores)
        .map(
          ([digit, score]) => ({
            digit,
            score
          })
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

    /*
     * ==================================================
     * 14. RESPONSE
     * ==================================================
     */

    return Response.json({
      success: true,

      model:
        "XSMB-MultiFactor-v1",

      data: {
        latestResult:
          latestDate,

        predictionDate,

        totalDraws:
          drawDates.length
      },

      weights,

      /*
       * Không gọi đây là probability.
       */

      warning:
        "score là điểm xếp hạng của mô hình, không phải xác suất trúng.",

      topNumbers:
        predictions.slice(
          0,
          top
        ),

      topPairs:
        pairs.slice(
          0,
          10
        ),

      topTouches:
        topTouches.slice(
          0,
          5
        )
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message
      },
      {
        status: 500
      }
    );
  }
}