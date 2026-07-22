function padNumber(n) {
  return String(n).padStart(2, "0");
}

function reverseNumber(n) {
  return n.split("").reverse().join("");
}

function normalize(value, max) {
  if (!max || max <= 0) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

function buildModel(historyDates, dateMap) {
  const features = [];

  for (let n = 0; n <= 99; n++) {
    const number = padNumber(n);

    let gan = 0;
    let freq7 = 0;
    let freq30 = 0;
    let found = false;

    const appearances = [];

    for (let i = 0; i < historyDates.length; i++) {
      const date = historyDates[i];

      const count =
        dateMap[date]?.[number] || 0;

      if (count > 0) {
        appearances.push(i);
      }

      if (!found) {
        if (count > 0) {
          found = true;
        } else {
          gan++;
        }
      }

      if (i < 7) {
        freq7 += count;
      }

      if (i < 30) {
        freq30 += count;
      }
    }

    let averageCycle = 0;

    if (appearances.length >= 2) {
      let total = 0;

      for (
        let i = 0;
        i < appearances.length - 1;
        i++
      ) {
        total +=
          appearances[i + 1] -
          appearances[i];
      }

      averageCycle =
        total /
        (appearances.length - 1);
    }

    let cycleSignal = 0;

    if (averageCycle > 0) {
      cycleSignal =
        1 -
        Math.min(
          Math.abs(
            gan - averageCycle
          ) / averageCycle,
          1
        );
    }

    let returnSignal = 0;

    if (gan >= 2 && gan <= 10) {
      returnSignal =
        Math.min(freq30 / 8, 1);
    }

    features.push({
      number,
      gan,
      freq7,
      freq30,
      averageCycle,
      cycleSignal,
      returnSignal
    });
  }

  /*
   * Cặp đảo
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
      reverseItem?.gan || 0;

    item.reverseFreq30 =
      reverseItem?.freq30 || 0;
  }

  /*
   * Đầu / đuôi 30 kỳ
   */

  const head30 = {};
  const tail30 = {};

  for (let i = 0; i <= 9; i++) {
    head30[String(i)] = 0;
    tail30[String(i)] = 0;
  }

  for (
    let i = 0;
    i < Math.min(
      30,
      historyDates.length
    );
    i++
  ) {
    const numbers =
      dateMap[historyDates[i]] || {};

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
   * Normalize
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
      ...features.map(
        x => x.reverseGan
      ),
      1
    );

  const maxReverse30 =
    Math.max(
      ...features.map(
        x => x.reverseFreq30
      ),
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
   * PHẢI GIỐNG predict.js
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

  const predictions = [];

  for (const item of features) {
    const score =
      normalize(
        item.gan,
        maxGan
      ) * weights.gan +

      normalize(
        item.freq7,
        maxFreq7
      ) * weights.freq7 +

      normalize(
        item.freq30,
        maxFreq30
      ) * weights.freq30 +

      normalize(
        item.reverseGan,
        maxReverseGan
      ) * weights.reverseGan +

      normalize(
        item.reverseFreq30,
        maxReverse30
      ) * weights.reverseFreq30 +

      item.cycleSignal *
        weights.cycle +

      item.returnSignal *
        weights.returnSignal +

      normalize(
        item.headFreq30,
        maxHead
      ) * weights.head +

      normalize(
        item.tailFreq30,
        maxTail
      ) * weights.tail;

    predictions.push({
      number: item.number,

      reverse:
        item.reverse,

      score:
        Number(
          (score * 100).toFixed(3)
        )
    });
  }

  predictions.sort(
    (a, b) =>
      b.score - a.score
  );

  return predictions;
}


export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    const url =
      new URL(context.request.url);

    /*
     * Số kỳ muốn test.
     *
     * /api/backtest?days=100
     */

    let testDays =
      parseInt(
        url.searchParams.get("days")
          || "100",
        10
      );

    if (
      isNaN(testDays) ||
      testDays < 10
    ) {
      testDays = 100;
    }

    /*
     * Giới hạn để tránh request quá nặng
     */

    testDays =
      Math.min(testDays, 500);

    /*
     * Lấy database theo thứ tự
     * mới -> cũ
     */

    const { results: rows } =
      await db
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
      return Response.json({
        success: false,
        message:
          "Database chưa có dữ liệu"
      });
    }

    /*
     * date -> loto
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
     * Chuyển thành cũ -> mới
     */

    const allDates =
      [
        ...new Set(
          rows.map(
            row => row.draw_date
          )
        )
      ].sort();

    /*
     * Cần tối thiểu 30 kỳ history.
     * 60 tốt hơn cho model hiện tại.
     */

    const minimumHistory = 60;

    if (
      allDates.length <=
      minimumHistory
    ) {
      return Response.json({
        success: false,

        message:
          "Cần nhiều hơn 60 kỳ dữ liệu để backtest",

        totalDraws:
          allDates.length
      });
    }

    /*
     * Chỉ test N kỳ cuối
     */

    const firstPossible =
      minimumHistory;

    const requestedStart =
      allDates.length - testDays;

    const startIndex =
      Math.max(
        firstPossible,
        requestedStart
      );

    /*
     * Metrics
     */

    let tested = 0;

    let hit1 = 0;
    let hit2 = 0;
    let hit3 = 0;
    let hit5 = 0;
    let hit10 = 0;
    let hit15 = 0;
    let hit20 = 0;

    let pairHit1 = 0;
    let pairHit3 = 0;
    let pairHit5 = 0;

    const daily = [];

    /*
     * =========================================
     * WALK FORWARD
     * =========================================
     */

    for (
      let targetIndex = startIndex;
      targetIndex < allDates.length;
      targetIndex++
    ) {
      const targetDate =
        allDates[targetIndex];

      /*
       * Chỉ lấy ngày TRƯỚC targetDate.
       *
       * buildModel yêu cầu:
       * mới -> cũ
       */

      const historyDates =
        allDates
          .slice(0, targetIndex)
          .reverse();

      const predictions =
        buildModel(
          historyDates,
          dateMap
        );

      /*
       * Kết quả thực tế
       */

      const actualNumbers =
        new Set(
          Object.entries(
            dateMap[targetDate] || {}
          )
            .filter(
              ([, count]) =>
                count > 0
            )
            .map(
              ([number]) =>
                number
            )
        );

      /*
       * Kiểm tra Top N
       */

      function hasHit(n) {
        return predictions
          .slice(0, n)
          .some(
            item =>
              actualNumbers.has(
                item.number
              )
          );
      }

      const h1 =
        hasHit(1);

      const h2 =
        hasHit(2);

      const h3 =
        hasHit(3);

      const h5 =
        hasHit(5);

      const h10 =
        hasHit(10);

      const h15 =
        hasHit(15);

      const h20 =
        hasHit(20);

      if (h1) hit1++;
      if (h2) hit2++;
      if (h3) hit3++;
      if (h5) hit5++;
      if (h10) hit10++;
      if (h15) hit15++;
      if (h20) hit20++;

      /*
       * =========================================
       * CẶP ĐẢO
       * =========================================
       */

      const pairs = [];
      const usedPairs = new Set();

      for (
        const item
        of predictions
      ) {
        if (
          item.number ===
          item.reverse
        ) {
          continue;
        }

        const key =
          [
            item.number,
            item.reverse
          ]
            .sort()
            .join("-");

        if (
          usedPairs.has(key)
        ) {
          continue;
        }

        usedPairs.add(key);

        const reverseItem =
          predictions.find(
            p =>
              p.number ===
              item.reverse
          );

        if (!reverseItem) {
          continue;
        }

        const high =
          Math.max(
            item.score,
            reverseItem.score
          );

        const low =
          Math.min(
            item.score,
            reverseItem.score
          );

        pairs.push({
          pair: key,

          number1:
            item.number,

          number2:
            item.reverse,

          score:
            high * 0.6 +
            low * 0.4
        });
      }

      pairs.sort(
        (a, b) =>
          b.score - a.score
      );

      function pairHit(n) {
        return pairs
          .slice(0, n)
          .some(
            pair =>
              actualNumbers.has(
                pair.number1
              ) ||
              actualNumbers.has(
                pair.number2
              )
          );
      }

      const p1 =
        pairHit(1);

      const p3 =
        pairHit(3);

      const p5 =
        pairHit(5);

      if (p1) pairHit1++;
      if (p3) pairHit3++;
      if (p5) pairHit5++;

      tested++;

      /*
       * Chỉ giữ thông tin cần thiết.
       * Không trả toàn bộ 100 số mỗi ngày.
       */

      daily.push({
        date:
          targetDate,

        top5:
          predictions
            .slice(0, 5)
            .map(
              item =>
                item.number
            ),

        actual:
          [...actualNumbers],

        hit: {
          top1: h1,
          top2: h2,
          top3: h3,
          top5: h5,
          top10: h10
        },

        topPair:
          pairs[0]?.pair
          || null,

        pairHit:
          p1
      });
    }

    function rate(hits) {
      if (!tested) return 0;

      return Number(
        (
          hits /
          tested *
          100
        ).toFixed(2)
      );
    }

    /*
     * =========================================
     * BASELINE
     *
     * Một kỳ XSMB có 27 lượt loto nhưng số
     * khác nhau thực tế thường <27.
     *
     * Baseline chính xác hơn sẽ được tính
     * ở bước optimizer.
     * =========================================
     */

    const averageUnique =
      allDates
        .slice(startIndex)
        .reduce(
          (sum, date) =>
            sum +
            Object.keys(
              dateMap[date] || {}
            ).length,
          0
        ) / tested;

    const approximateRandomTop1 =
      averageUnique;

    return Response.json({
      success: true,

      model:
        "XSMB-MultiFactor-v1",

      method:
        "walk-forward",

      testedDraws:
        tested,

      period: {
        from:
          allDates[startIndex],

        to:
          allDates[
            allDates.length - 1
          ]
      },

      numberPerformance: {
        top1: {
          hits: hit1,
          rate: rate(hit1)
        },

        top2: {
          hits: hit2,
          rate: rate(hit2)
        },

        top3: {
          hits: hit3,
          rate: rate(hit3)
        },

        top5: {
          hits: hit5,
          rate: rate(hit5)
        },

        top10: {
          hits: hit10,
          rate: rate(hit10)
        },

        top15: {
          hits: hit15,
          rate: rate(hit15)
        },

        top20: {
          hits: hit20,
          rate: rate(hit20)
        }
      },

      reversePairPerformance: {
        top1Pair: {
          hits:
            pairHit1,

          rate:
            rate(pairHit1)
        },

        top3Pairs: {
          hits:
            pairHit3,

          rate:
            rate(pairHit3)
        },

        top5Pairs: {
          hits:
            pairHit5,

          rate:
            rate(pairHit5)
        }
      },

      baseline: {
        averageUniqueNumbersPerDraw:
          Number(
            averageUnique.toFixed(2)
          ),

        approximateRandomTop1Rate:
          Number(
            approximateRandomTop1
              .toFixed(2)
          )
      },

      /*
       * 30 ngày gần nhất để response
       * không quá lớn.
       */

      recentTests:
        daily.slice(-30)
    });

  } catch (error) {
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