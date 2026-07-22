function padNumber(n) {
  return String(n).padStart(2, "0");
}

function reverseNumber(n) {
  return n.split("").reverse().join("");
}

function normalize(value, max) {
  if (!max || max <= 0) return 0;

  return Math.min(
    Math.max(value / max, 0),
    1
  );
}

/*
 * =====================================================
 * NORMAL CDF
 * Dùng để tính p-value xấp xỉ
 * =====================================================
 */

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t =
    1 / (1 + p * x);

  const y =
    1 -
    (
      (
        (
          (
            (
              a5 * t + a4
            ) * t + a3
          ) * t + a2
        ) * t + a1
      ) *
      t *
      Math.exp(-x * x)
    );

  return sign * y;
}

function normalCDF(z) {
  return 0.5 *
    (
      1 +
      erf(
        z / Math.sqrt(2)
      )
    );
}

/*
 * =====================================================
 * COMBINATION RATIO
 *
 * C(a,k) / C(b,k)
 *
 * Không tính factorial trực tiếp
 * để tránh overflow.
 * =====================================================
 */

function combinationRatio(a, b, k) {
  if (k < 0) return 0;

  if (a < k) return 0;

  if (b < k) return 0;

  let ratio = 1;

  for (let i = 0; i < k; i++) {
    ratio *=
      (a - i) /
      (b - i);
  }

  return ratio;
}

/*
 * =====================================================
 * RANDOM BASELINE
 *
 * Có U số thực tế xuất hiện trong 100 số.
 *
 * Chọn ngẫu nhiên K số.
 *
 * Xác suất ít nhất một số trúng:
 *
 * 1 - C(100-U,K) / C(100,K)
 * =====================================================
 */

function randomHitProbability(
  uniqueActual,
  selectedCount
) {
  if (uniqueActual <= 0) {
    return 0;
  }

  if (selectedCount >= 100) {
    return 1;
  }

  const missAvailable =
    100 - uniqueActual;

  const missProbability =
    combinationRatio(
      missAvailable,
      100,
      selectedCount
    );

  return 1 - missProbability;
}

/*
 * =====================================================
 * WILSON 95% CONFIDENCE INTERVAL
 * =====================================================
 */

function wilsonInterval(
  hits,
  total
) {
  if (!total) {
    return {
      low: 0,
      high: 0
    };
  }

  const z = 1.96;

  const p =
    hits / total;

  const denominator =
    1 +
    (z * z) / total;

  const center =
    (
      p +
      (z * z) /
        (2 * total)
    ) /
    denominator;

  const margin =
    (
      z *
      Math.sqrt(
        (
          p * (1 - p) /
          total
        ) +
        (
          z * z /
          (
            4 *
            total *
            total
          )
        )
      )
    ) /
    denominator;

  return {
    low:
      Math.max(
        0,
        center - margin
      ) * 100,

    high:
      Math.min(
        1,
        center + margin
      ) * 100
  };
}

/*
 * =====================================================
 * BUILD MODEL
 *
 * QUAN TRỌNG:
 * historyDates phải theo:
 *
 * mới nhất -> cũ nhất
 *
 * =====================================================
 */

function buildModel(
  historyDates,
  dateMap
) {
  const features = [];

  for (
    let n = 0;
    n <= 99;
    n++
  ) {
    const number =
      padNumber(n);

    let gan = 0;

    let freq7 = 0;
    let freq30 = 0;

    let found = false;

    const appearances = [];

    for (
      let i = 0;
      i < historyDates.length;
      i++
    ) {
      const date =
        historyDates[i];

      const count =
        dateMap[date]?.[number]
        || 0;

      if (count > 0) {
        appearances.push(i);
      }

      /*
       * Gan tính theo SỐ KỲ,
       * không phải số ngày.
       *
       * Vì vậy nghỉ Tết không ảnh hưởng.
       */

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

    /*
     * Chu kỳ trung bình
     * tính theo kỳ xổ thực tế
     */

    let averageCycle = 0;

    if (
      appearances.length >= 2
    ) {
      let totalCycle = 0;

      for (
        let i = 0;
        i <
        appearances.length - 1;
        i++
      ) {
        totalCycle +=
          appearances[i + 1] -
          appearances[i];
      }

      averageCycle =
        totalCycle /
        (
          appearances.length - 1
        );
    }

    let cycleSignal = 0;

    if (averageCycle > 0) {
      const difference =
        Math.abs(
          gan - averageCycle
        );

      cycleSignal =
        1 -
        Math.min(
          difference /
          averageCycle,
          1
        );
    }

    /*
     * Heuristic hồi
     */

    let returnSignal = 0;

    if (
      gan >= 2 &&
      gan <= 10
    ) {
      returnSignal =
        Math.min(
          freq30 / 8,
          1
        );
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
   * ===================================================
   * CẶP ĐẢO
   * ===================================================
   */

  const featureMap = {};

  for (
    const item of features
  ) {
    featureMap[item.number] =
      item;
  }

  for (
    const item of features
  ) {
    const reverse =
      reverseNumber(
        item.number
      );

    const reverseItem =
      featureMap[reverse];

    item.reverse =
      reverse;

    item.reverseGan =
      reverseItem
        ? reverseItem.gan
        : 0;

    item.reverseFreq30 =
      reverseItem
        ? reverseItem.freq30
        : 0;
  }

  /*
   * ===================================================
   * ĐẦU / ĐUÔI 30 KỲ
   * ===================================================
   */

  const head30 = {};
  const tail30 = {};

  for (
    let i = 0;
    i <= 9;
    i++
  ) {
    head30[String(i)] = 0;
    tail30[String(i)] = 0;
  }

  const limit =
    Math.min(
      30,
      historyDates.length
    );

  for (
    let i = 0;
    i < limit;
    i++
  ) {
    const date =
      historyDates[i];

    const numbers =
      dateMap[date] || {};

    for (
      const [
        number,
        count
      ]
      of Object.entries(
        numbers
      )
    ) {
      head30[number[0]] +=
        count;

      tail30[number[1]] +=
        count;
    }
  }

  for (
    const item of features
  ) {
    item.headFreq30 =
      head30[
        item.number[0]
      ] || 0;

    item.tailFreq30 =
      tail30[
        item.number[1]
      ] || 0;
  }

  /*
   * ===================================================
   * NORMALIZATION
   * ===================================================
   */

  const maxGan =
    Math.max(
      ...features.map(
        x => x.gan
      ),
      1
    );

  const maxFreq7 =
    Math.max(
      ...features.map(
        x => x.freq7
      ),
      1
    );

  const maxFreq30 =
    Math.max(
      ...features.map(
        x => x.freq30
      ),
      1
    );

  const maxReverseGan =
    Math.max(
      ...features.map(
        x => x.reverseGan
      ),
      1
    );

  const maxReverseFreq30 =
    Math.max(
      ...features.map(
        x =>
          x.reverseFreq30
      ),
      1
    );

  const maxHead =
    Math.max(
      ...Object.values(
        head30
      ),
      1
    );

  const maxTail =
    Math.max(
      ...Object.values(
        tail30
      ),
      1
    );

  /*
   * ===================================================
   * MODEL V1 WEIGHTS
   *
   * Giữ đúng weights của predict.js
   * để backtest đúng model đang chạy.
   * ===================================================
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

  for (
    const item of features
  ) {
    const score =

      normalize(
        item.gan,
        maxGan
      ) *
      weights.gan +

      normalize(
        item.freq7,
        maxFreq7
      ) *
      weights.freq7 +

      normalize(
        item.freq30,
        maxFreq30
      ) *
      weights.freq30 +

      normalize(
        item.reverseGan,
        maxReverseGan
      ) *
      weights.reverseGan +

      normalize(
        item.reverseFreq30,
        maxReverseFreq30
      ) *
      weights.reverseFreq30 +

      item.cycleSignal *
      weights.cycle +

      item.returnSignal *
      weights.returnSignal +

      normalize(
        item.headFreq30,
        maxHead
      ) *
      weights.head +

      normalize(
        item.tailFreq30,
        maxTail
      ) *
      weights.tail;

    predictions.push({
      number:
        item.number,

      reverse:
        item.reverse,

      score:
        Number(
          (
            score * 100
          ).toFixed(4)
        )
    });
  }

  predictions.sort(
    (a, b) =>
      b.score -
      a.score
  );

  return predictions;
}

/*
 * =====================================================
 * TẠO DANH SÁCH CẶP ĐẢO
 * =====================================================
 */

function buildPairs(
  predictions
) {
  const predictionMap =
    {};

  for (
    const item
    of predictions
  ) {
    predictionMap[
      item.number
    ] = item;
  }

  const used =
    new Set();

  const pairs = [];

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

    const sorted =
      [
        item.number,
        item.reverse
      ].sort();

    const key =
      sorted.join("-");

    if (
      used.has(key)
    ) {
      continue;
    }

    used.add(key);

    const first =
      predictionMap[
        sorted[0]
      ];

    const second =
      predictionMap[
        sorted[1]
      ];

    if (
      !first ||
      !second
    ) {
      continue;
    }

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

    pairs.push({
      pair: key,

      number1:
        sorted[0],

      number2:
        sorted[1],

      score:
        high * 0.60 +
        low * 0.40
    });
  }

  pairs.sort(
    (a, b) =>
      b.score -
      a.score
  );

  return pairs;
}

/*
 * =====================================================
 * MAIN
 * =====================================================
 */

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

    let testDays =
      parseInt(
        url.searchParams.get(
          "days"
        ) || "100",
        10
      );

    let minimumHistory =
      parseInt(
        url.searchParams.get(
          "history"
        ) || "60",
        10
      );

    if (
      isNaN(testDays) ||
      testDays < 10
    ) {
      testDays = 100;
    }

    if (
      isNaN(
        minimumHistory
      ) ||
      minimumHistory < 30
    ) {
      minimumHistory = 60;
    }

    testDays =
      Math.min(
        testDays,
        500
      );

    /*
     * =================================================
     * LOAD D1
     * =================================================
     */

    const {
      results: rows
    } =
      await db
        .prepare(`
          SELECT
            draw_date,
            number,
            count
          FROM loto
          ORDER BY draw_date ASC
        `)
        .all();

    if (
      !rows ||
      rows.length === 0
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Database chưa có dữ liệu loto"
        },
        {
          status: 400
        }
      );
    }

    /*
     * =================================================
     * MAP
     * =================================================
     */

    const dateMap = {};

    for (
      const row
      of rows
    ) {
      if (
        !dateMap[
          row.draw_date
        ]
      ) {
        dateMap[
          row.draw_date
        ] = {};
      }

      dateMap[
        row.draw_date
      ][
        String(
          row.number
        ).padStart(
          2,
          "0"
        )
      ] =
        Number(
          row.count
        );
    }

    /*
     * allDates =
     * CHỈ NHỮNG NGÀY CÓ KỲ XỔ.
     *
     * Nghỉ Tết không xuất hiện ở đây.
     */

    const allDates =
      Object.keys(
        dateMap
      ).sort();

    if (
      allDates.length <=
      minimumHistory
    ) {
      return Response.json(
        {
          success: false,

          message:
            `Cần nhiều hơn ${minimumHistory} kỳ dữ liệu`,

          totalDraws:
            allDates.length
        },
        {
          status: 400
        }
      );
    }

    /*
     * =================================================
     * CHỌN KHOẢNG TEST
     * =================================================
     */

    const requestedStart =
      allDates.length -
      testDays;

    const startIndex =
      Math.max(
        minimumHistory,
        requestedStart
      );

    /*
     * =================================================
     * METRIC CONFIG
     * =================================================
     */

    const topSizes =
      [
        1,
        2,
        3,
        5,
        10,
        15,
        20
      ];

    const pairSizes =
      [
        1,
        3,
        5
      ];

    const numberStats = {};

    for (
      const size
      of topSizes
    ) {
      numberStats[size] = {
        hits: 0,

        baselineExpected:
          0,

        baselineVariance:
          0
      };
    }

    const pairStats = {};

    for (
      const size
      of pairSizes
    ) {
      pairStats[size] = {
        hits: 0,

        baselineExpected:
          0,

        baselineVariance:
          0
      };
    }

    let tested = 0;

    let totalUniqueActual =
      0;

    const daily = [];

    /*
     * =================================================
     * WALK FORWARD
     * =================================================
     */

    for (
      let targetIndex =
        startIndex;

      targetIndex <
        allDates.length;

      targetIndex++
    ) {
      const targetDate =
        allDates[
          targetIndex
        ];

      /*
       * Chỉ lấy các kỳ TRƯỚC target.
       */

      const historyDates =
        allDates
          .slice(
            0,
            targetIndex
          )
          .reverse();

      const predictions =
        buildModel(
          historyDates,
          dateMap
        );

      const pairs =
        buildPairs(
          predictions
        );

      /*
       * Kết quả thực tế
       */

      const actualNumbers =
        new Set(
          Object.entries(
            dateMap[
              targetDate
            ] || {}
          )
            .filter(
              ([, count]) =>
                Number(
                  count
                ) > 0
            )
            .map(
              ([number]) =>
                number
            )
        );

      const uniqueCount =
        actualNumbers.size;

      totalUniqueActual +=
        uniqueCount;

      /*
       * ===============================================
       * TOP NUMBER
       * ===============================================
       */

      const dayNumberHits =
        {};

      for (
        const size
        of topSizes
      ) {
        const selected =
          predictions.slice(
            0,
            size
          );

        const hit =
          selected.some(
            item =>
              actualNumbers.has(
                item.number
              )
          );

        if (hit) {
          numberStats[
            size
          ].hits++;
        }

        dayNumberHits[
          `top${size}`
        ] = hit;

        /*
         * Exact random baseline
         */

        const randomP =
          randomHitProbability(
            uniqueCount,
            size
          );

        numberStats[
          size
        ].baselineExpected +=
          randomP;

        numberStats[
          size
        ].baselineVariance +=
          randomP *
          (
            1 - randomP
          );
      }

      /*
       * ===============================================
       * PAIR
       *
       * 1 pair = 2 số.
       * 3 pairs = 6 số.
       * 5 pairs = 10 số.
       *
       * Các cặp đảo của chúng ta không trùng nhau.
       * ===============================================
       */

      const dayPairHits =
        {};

      for (
        const size
        of pairSizes
      ) {
        const selectedPairs =
          pairs.slice(
            0,
            size
          );

        const pairHit =
          selectedPairs.some(
            pair =>
              actualNumbers.has(
                pair.number1
              ) ||
              actualNumbers.has(
                pair.number2
              )
          );

        if (pairHit) {
          pairStats[
            size
          ].hits++;
        }

        dayPairHits[
          `top${size}Pairs`
        ] = pairHit;

        /*
         * size cặp =
         * size * 2 số.
         */

        const selectedNumbers =
          size * 2;

        const randomP =
          randomHitProbability(
            uniqueCount,
            selectedNumbers
          );

        pairStats[
          size
        ].baselineExpected +=
          randomP;

        pairStats[
          size
        ].baselineVariance +=
          randomP *
          (
            1 - randomP
          );
      }

      tested++;

      daily.push({
        date:
          targetDate,

        historyDraws:
          historyDates.length,

        actualUnique:
          uniqueCount,

        top5:
          predictions
            .slice(
              0,
              5
            )
            .map(
              x => x.number
            ),

        topPair:
          pairs[0]
            ?.pair
          || null,

        hit:
          dayNumberHits,

        pairHit:
          dayPairHits
      });
    }

    /*
     * =================================================
     * BUILD METRIC
     * =================================================
     */

    function buildMetric(
      stat
    ) {
      const modelRate =
        tested > 0
          ?
          stat.hits /
          tested
          :
          0;

      const baselineRate =
        tested > 0
          ?
          stat.baselineExpected /
          tested
          :
          0;

      /*
       * Lift
       */

      const lift =
        baselineRate > 0
          ?
          modelRate /
          baselineRate
          :
          0;

      /*
       * Z-test so với random expectation
       */

      let zScore = 0;
      let pValue = 1;

      if (
        stat.baselineVariance >
        0
      ) {
        zScore =
          (
            stat.hits -
            stat.baselineExpected
          ) /
          Math.sqrt(
            stat.baselineVariance
          );

        /*
         * one-sided:
         *
         * H1 =
         * model tốt hơn random
         */

        pValue =
          1 -
          normalCDF(
            zScore
          );
      }

      const ci =
        wilsonInterval(
          stat.hits,
          tested
        );

      return {
        hits:
          stat.hits,

        tested,

        modelRate:
          Number(
            (
              modelRate *
              100
            ).toFixed(2)
          ),

        randomBaseline:
          Number(
            (
              baselineRate *
              100
            ).toFixed(2)
          ),

        lift:
          Number(
            lift.toFixed(3)
          ),

        liftPercent:
          Number(
            (
              (
                lift - 1
              ) *
              100
            ).toFixed(2)
          ),

        confidence95: {
          low:
            Number(
              ci.low.toFixed(
                2
              )
            ),

          high:
            Number(
              ci.high.toFixed(
                2
              )
            )
        },

        zScore:
          Number(
            zScore.toFixed(
              3
            )
          ),

        pValue:
          Number(
            pValue.toFixed(
              5
            )
          ),

        significant:
          (
            pValue < 0.05 &&
            modelRate >
            baselineRate
          )
      };
    }

    const numberPerformance =
      {};

    for (
      const size
      of topSizes
    ) {
      numberPerformance[
        `top${size}`
      ] =
        buildMetric(
          numberStats[
            size
          ]
        );
    }

    const reversePairPerformance =
      {};

    for (
      const size
      of pairSizes
    ) {
      reversePairPerformance[
        `top${size}Pairs`
      ] =
        buildMetric(
          pairStats[
            size
          ]
        );
    }

    /*
     * =================================================
     * ĐÁNH GIÁ TỔNG QUÁT
     * =================================================
     */

    const top1 =
      numberPerformance
        .top1;

    let verdict =
      "NO_EDGE";

    if (
      top1.significant &&
      top1.lift > 1
    ) {
      verdict =
        "POSITIVE_EDGE";
    } else if (
      top1.lift >= 1 &&
      top1.pValue >= 0.05
    ) {
      verdict =
        "INCONCLUSIVE";
    }

    /*
     * =================================================
     * RESPONSE
     * =================================================
     */

    return Response.json({
      success: true,

      version:
        "2.0",

      model:
        "XSMB-MultiFactor-v1",

      method:
        "walk-forward",

      drawUnit:
        "actual-draw",

      note:
        "Gan, frequency và cycle được tính theo kỳ mở thưởng thực tế; ngày nghỉ Tết hoặc ngày không mở thưởng không được tính là một kỳ.",

      database: {
        totalDraws:
          allDates.length,

        firstDraw:
          allDates[0],

        lastDraw:
          allDates[
            allDates.length - 1
          ]
      },

      test: {
        minimumHistory,

        requestedDraws:
          testDays,

        testedDraws:
          tested,

        from:
          allDates[
            startIndex
          ],

        to:
          allDates[
            allDates.length - 1
          ]
      },

      actualResults: {
        averageUniqueNumbers:
          Number(
            (
              totalUniqueActual /
              tested
            ).toFixed(
              2
            )
          )
      },

      numberPerformance,

      reversePairPerformance,

      verdict,

      interpretation: {
        lift:
          "lift > 1 nghĩa là model tốt hơn baseline ngẫu nhiên; lift < 1 nghĩa là kém baseline.",

        pValue:
          "pValue < 0.05 và modelRate > randomBaseline là tín hiệu thống kê đáng chú ý, nhưng không chứng minh khả năng dự đoán tương lai.",

        score:
          "Backtest đánh giá khả năng xếp hạng của model; score trong predict không phải xác suất trúng."
      },

      recentTests:
        daily.slice(-30)

    });

  } catch (error) {
    return Response.json(
      {
        success: false,

        message:
          error.message,

        stack:
          error.stack
      },
      {
        status: 500
      }
    );
  }
}