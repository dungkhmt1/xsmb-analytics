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

/*
 * =====================================================
 * TẠO FEATURE CHO 100 SỐ
 * =====================================================
 */

function buildFeatures(historyDates, dateMap) {
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

    /*
     * Chu kỳ trung bình
     */

    let averageCycle = 0;

    if (appearances.length >= 2) {
      let totalCycle = 0;

      for (
        let i = 0;
        i < appearances.length - 1;
        i++
      ) {
        totalCycle +=
          appearances[i + 1] -
          appearances[i];
      }

      averageCycle =
        totalCycle /
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

    /*
     * Return signal
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
      freq7,
      freq30,
      cycleSignal,
      returnSignal
    });
  }

  /*
   * ===================================================
   * REVERSE
   * ===================================================
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
   * ===================================================
   * HEAD / TAIL
   * ===================================================
   */

  const head30 = {};
  const tail30 = {};

  for (let i = 0; i <= 9; i++) {
    head30[String(i)] = 0;
    tail30[String(i)] = 0;
  }

  for (
    let i = 0;
    i < Math.min(30, historyDates.length);
    i++
  ) {
    const date = historyDates[i];

    const numbers =
      dateMap[date] || {};

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

  return {
    features,
    head30,
    tail30
  };
}

/*
 * =====================================================
 * PREDICT VỚI WEIGHTS TÙY CHỌN
 * =====================================================
 */

function predictWithWeights(
  historyDates,
  dateMap,
  weights
) {
  const {
    features,
    head30,
    tail30
  } =
    buildFeatures(
      historyDates,
      dateMap
    );

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
      number:
        item.number,

      score
    });
  }

  predictions.sort(
    (a, b) =>
      b.score - a.score
  );

  return predictions;
}

/*
 * =====================================================
 * TEST 1 BỘ WEIGHT
 *
 * Dùng nhiều Top-N thay vì chỉ Top1.
 *
 * Top1 được ưu tiên mạnh nhất.
 * =====================================================
 */

function evaluateWeights(
  weights,
  dates,
  start,
  end,
  dateMap,
  minimumHistory
) {
  let tested = 0;

  let hit1 = 0;
  let hit2 = 0;
  let hit3 = 0;
  let hit5 = 0;

  for (
    let targetIndex = start;
    targetIndex < end;
    targetIndex++
  ) {
    if (
      targetIndex <
      minimumHistory
    ) {
      continue;
    }

    const targetDate =
      dates[targetIndex];

    const historyDates =
      dates
        .slice(0, targetIndex)
        .reverse();

    const predictions =
      predictWithWeights(
        historyDates,
        dateMap,
        weights
      );

    const actual =
      new Set(
        Object.entries(
          dateMap[targetDate] || {}
        )
          .filter(
            ([, count]) =>
              Number(count) > 0
          )
          .map(
            ([number]) => number
          )
      );

    function hasHit(top) {
      return predictions
        .slice(0, top)
        .some(
          item =>
            actual.has(
              item.number
            )
        );
    }

    if (hasHit(1)) hit1++;
    if (hasHit(2)) hit2++;
    if (hasHit(3)) hit3++;
    if (hasHit(5)) hit5++;

    tested++;
  }

  if (!tested) {
    return {
      tested: 0,
      score: 0
    };
  }

  const rate1 =
    hit1 / tested;

  const rate2 =
    hit2 / tested;

  const rate3 =
    hit3 / tested;

  const rate5 =
    hit5 / tested;

  /*
   * Composite objective.
   *
   * Ưu tiên Top1.
   *
   * Không nên chỉ tối ưu Top1 vì
   * mẫu dữ liệu hiện tại còn nhỏ.
   */

  const score =
    rate1 * 0.45 +
    rate2 * 0.25 +
    rate3 * 0.20 +
    rate5 * 0.10;

  return {
    tested,

    hit1,
    hit2,
    hit3,
    hit5,

    rate1:
      Number(
        (rate1 * 100).toFixed(2)
      ),

    rate2:
      Number(
        (rate2 * 100).toFixed(2)
      ),

    rate3:
      Number(
        (rate3 * 100).toFixed(2)
      ),

    rate5:
      Number(
        (rate5 * 100).toFixed(2)
      ),

    score:
      Number(
        score.toFixed(6)
      )
  };
}

/*
 * =====================================================
 * RANDOM WEIGHT GENERATOR
 * =====================================================
 */

function randomWeights() {
  /*
   * Tạo 9 random weights,
   * sau đó normalize tổng = 1.
   */

  const values = [];

  for (let i = 0; i < 9; i++) {
    values.push(
      0.01 +
      Math.random()
    );
  }

  const total =
    values.reduce(
      (a, b) => a + b,
      0
    );

  const w =
    values.map(
      x => x / total
    );

  return {
    gan: w[0],
    freq7: w[1],
    freq30: w[2],

    reverseGan: w[3],
    reverseFreq30: w[4],

    cycle: w[5],
    returnSignal: w[6],

    head: w[7],
    tail: w[8]
  };
}

function roundWeights(weights) {
  const result = {};

  for (
    const [
      key,
      value
    ]
    of Object.entries(
      weights
    )
  ) {
    result[key] =
      Number(
        value.toFixed(4)
      );
  }

  return result;
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

    /*
     * iterations:
     *
     * 100 = test nhanh
     * 300 = bình thường
     * 500 = sâu hơn
     */

    let iterations =
      parseInt(
        url.searchParams.get(
          "iterations"
        ) || "200",
        10
      );

    iterations =
      Math.min(
        Math.max(
          iterations,
          20
        ),
        1000
      );

    const minimumHistory = 60;

    /*
     * =================================================
     * LOAD DATABASE
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

    if (!rows?.length) {
      return Response.json({
        success: false,
        message:
          "Database chưa có dữ liệu"
      });
    }

    const dateMap = {};

    for (
      const row of rows
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
        ).padStart(2, "0")
      ] =
        Number(
          row.count
        );
    }

    /*
     * Chỉ các kỳ có mở thưởng.
     *
     * Ngày nghỉ Tết không xuất hiện.
     */

    const dates =
      Object.keys(
        dateMap
      ).sort();

    if (
      dates.length < 120
    ) {
      return Response.json({
        success: false,

        message:
          "Nên có tối thiểu 120 kỳ trước khi optimizer.",

        totalDraws:
          dates.length
      });
    }

    /*
     * =================================================
     * DATA SPLIT
     *
     * 60 kỳ đầu = warm-up.
     *
     * Phần còn lại:
     *
     * 50% train
     * 25% validation
     * 25% holdout
     * =================================================
     */

    const usable =
      dates.length -
      minimumHistory;

    const trainCount =
      Math.floor(
        usable * 0.50
      );

    const validationCount =
      Math.floor(
        usable * 0.25
      );

    const trainStart =
      minimumHistory;

    const trainEnd =
      trainStart +
      trainCount;

    const validationStart =
      trainEnd;

    const validationEnd =
      validationStart +
      validationCount;

    const holdoutStart =
      validationEnd;

    const holdoutEnd =
      dates.length;

    /*
     * =================================================
     * MODEL V1
     * =================================================
     */

    const originalWeights = {
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
     * Baseline original
     */

    const originalHoldout =
      evaluateWeights(
        originalWeights,

        dates,

        holdoutStart,

        holdoutEnd,

        dateMap,

        minimumHistory
      );

    /*
     * =================================================
     * SEARCH
     * =================================================
     */

    const candidates = [];

    /*
     * Luôn đưa model hiện tại
     * vào danh sách.
     */

    const originalTrain =
      evaluateWeights(
        originalWeights,
        dates,
        trainStart,
        trainEnd,
        dateMap,
        minimumHistory
      );

    candidates.push({
      weights:
        originalWeights,

      train:
        originalTrain
    });

    /*
     * Random Search
     */

    for (
      let i = 0;
      i < iterations;
      i++
    ) {
      const weights =
        randomWeights();

      const evaluation =
        evaluateWeights(
          weights,

          dates,

          trainStart,

          trainEnd,

          dateMap,

          minimumHistory
        );

      candidates.push({
        weights,
        train:
          evaluation
      });
    }

    /*
     * =================================================
     * TOP TRAIN CANDIDATES
     *
     * Không chọn ngay winner train.
     * =================================================
     */

    candidates.sort(
      (a, b) =>
        b.train.score -
        a.train.score
    );

    const topTrain =
      candidates.slice(
        0,
        Math.min(
          20,
          candidates.length
        )
      );

    /*
     * =================================================
     * VALIDATION
     * =================================================
     */

    const validated = [];

    for (
      const candidate
      of topTrain
    ) {
      const validation =
        evaluateWeights(
          candidate.weights,

          dates,

          validationStart,

          validationEnd,

          dateMap,

          minimumHistory
        );

      validated.push({
        ...candidate,

        validation
      });
    }

    /*
     * Chọn bằng validation,
     * KHÔNG bằng train.
     */

    validated.sort(
      (a, b) =>
        b.validation.score -
        a.validation.score
    );

    const winner =
      validated[0];

    /*
     * =================================================
     * HOLDOUT
     *
     * Chỉ chạy 1 lần sau khi đã
     * chọn model.
     * =================================================
     */

    const optimizedHoldout =
      evaluateWeights(
        winner.weights,

        dates,

        holdoutStart,

        holdoutEnd,

        dateMap,

        minimumHistory
      );

    /*
     * =================================================
     * SO SÁNH
     * =================================================
     */

    const originalScore =
      originalHoldout.score;

    const optimizedScore =
      optimizedHoldout.score;

    let improvement = 0;

    if (originalScore > 0) {
      improvement =
        (
          optimizedScore /
          originalScore -
          1
        ) *
        100;
    }

    /*
     * Điều kiện rất thận trọng.
     *
     * Chỉ recommend nếu holdout
     * thật sự tốt hơn model cũ.
     */

    const recommended =
      optimizedScore >
        originalScore &&
      optimizedHoldout.rate1 >=
        originalHoldout.rate1;

    /*
     * =================================================
     * RESPONSE
     * =================================================
     */

    return Response.json({
      success: true,

      optimizer:
        "XSMB-Optimizer-v1",

      method:
        "random-search-train-validation-holdout",

      iterations,

      database: {
        totalDraws:
          dates.length,

        firstDraw:
          dates[0],

        lastDraw:
          dates[
            dates.length - 1
          ]
      },

      split: {
        warmup: {
          draws:
            minimumHistory,

          from:
            dates[0],

          to:
            dates[
              minimumHistory - 1
            ]
        },

        train: {
          draws:
            trainEnd -
            trainStart,

          from:
            dates[
              trainStart
            ],

          to:
            dates[
              trainEnd - 1
            ]
        },

        validation: {
          draws:
            validationEnd -
            validationStart,

          from:
            dates[
              validationStart
            ],

          to:
            dates[
              validationEnd - 1
            ]
        },

        holdout: {
          draws:
            holdoutEnd -
            holdoutStart,

          from:
            dates[
              holdoutStart
            ],

          to:
            dates[
              holdoutEnd - 1
            ]
        }
      },

      originalModel: {
        weights:
          roundWeights(
            originalWeights
          ),

        holdout:
          originalHoldout
      },

      optimizedModel: {
        weights:
          roundWeights(
            winner.weights
          ),

        train:
          winner.train,

        validation:
          winner.validation,

        holdout:
          optimizedHoldout
      },

      comparison: {
        originalScore:
          originalScore,

        optimizedScore:
          optimizedScore,

        improvementPercent:
          Number(
            improvement.toFixed(
              2
            )
          ),

        originalTop1:
          originalHoldout.rate1,

        optimizedTop1:
          optimizedHoldout.rate1
      },

      recommended,

      decision:
        recommended
          ?
          "Optimized weights vượt model V1 trên holdout. Có thể xem xét sử dụng."
          :
          "Chưa có bằng chứng đủ để thay model V1. Không nên áp dụng weights mới.",

      warning:
        "Không được chọn model dựa trên kết quả holdout sau nhiều lần thử optimizer. Làm như vậy sẽ biến holdout thành dữ liệu huấn luyện."

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