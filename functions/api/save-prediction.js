/*
========================================================
XSMB V2.6.2 LIVE VALIDATION
/api/save-prediction
========================================================

- Đọc đúng schema thực tế của /api/predict
- Lưu prediction trước khi biết kết quả
- Prediction đã lưu => LOCK, không ghi đè
- Giữ prediction_daily để tương thích hệ thống cũ
- Lưu toàn bộ suggestions V2.6.2 để nghiên cứu sau này
- Top1 / Top3 / Top5 được chấm tự động
========================================================
*/

const TRACK_MODEL = "bridge-v2.6.2";
const MAX_TRACK_RECOMMENDATIONS = 12;


/*
========================================================
JSON RESPONSE
========================================================
*/

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}


/*
========================================================
HELPERS
========================================================
*/

function round2(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(n * 100) / 100;
}


function normalizeNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const digits =
    String(value)
      .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits
    .padStart(2, "0")
    .slice(-2);
}


/*
========================================================
CREATE TRACKING TABLE
========================================================
*/

async function ensureTrackingTable(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_tracking (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        prediction_date TEXT NOT NULL,
        source_date TEXT,

        model TEXT NOT NULL,

        numbers TEXT NOT NULL,
        pick_count INTEGER NOT NULL DEFAULT 0,

        recommendations_json TEXT NOT NULL,

        points REAL NOT NULL DEFAULT 1,

        status TEXT NOT NULL DEFAULT 'locked',

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        evaluated_at TEXT,

        actual_unique_count INTEGER,

        top1_hit INTEGER,
        top3_hit INTEGER,
        top5_hit INTEGER,

        baseline_top1 REAL,
        baseline_top3 REAL,
        baseline_top5 REAL,

        evaluation_json TEXT,

        UNIQUE (
          prediction_date,
          model
        )
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS
      idx_prediction_tracking_date

      ON prediction_tracking (
        prediction_date
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS
      idx_prediction_tracking_pending

      ON prediction_tracking (
        model,
        evaluated_at
      )
    `)
    .run();
}


/*
========================================================
EXTRACT LOTO FROM RESULT
========================================================
*/

function extractPrizeNumbers(value) {
  if (value === null || value === undefined) {
    return [];
  }

  return String(value).match(/\d+/g) || [];
}


function extractUniqueLoto(row) {
  const fields = [
    "special",
    "g1",
    "g2",
    "g3",
    "g4",
    "g5",
    "g6",
    "g7"
  ];

  const set =
    new Set();


  for (const field of fields) {
    const prizes =
      extractPrizeNumbers(
        row[field]
      );

    for (const prize of prizes) {
      const number =
        prize
          .padStart(2, "0")
          .slice(-2);

      set.add(number);
    }
  }


  return [...set].sort();
}


/*
========================================================
RANDOM BASELINE

P(at least one hit)
k số được chọn
u số loto unique thực tế
========================================================
*/

function randomHitProbability(
  uniqueCount,
  pickCount
) {
  const u =
    Math.max(
      0,
      Math.min(
        100,
        Number(uniqueCount) || 0
      )
    );

  const k =
    Math.max(
      0,
      Math.min(
        100,
        Number(pickCount) || 0
      )
    );


  if (!u || !k) {
    return 0;
  }


  let noHit =
    1;


  for (let i = 0; i < k; i++) {
    const numerator =
      100 - u - i;

    const denominator =
      100 - i;


    if (numerator <= 0) {
      noHit = 0;
      break;
    }


    noHit *=
      numerator /
      denominator;
  }


  return round2(
    (1 - noHit) * 100
  );
}


/*
========================================================
NORMALIZE V2.6.2 SUGGESTION
========================================================
*/

function normalizeSuggestion(
  item,
  rank
) {
  return {
    rank,

    number:
      normalizeNumber(
        item.number
      ),

    bridgeKey:
      item.bridgeKey ?? null,

    bridge:
      item.bridge ?? null,

    positionA:
      item.positionA ?? null,

    positionB:
      item.positionB ?? null,

    direction:
      item.direction ?? null,

    streak:
      Number(item.streak) || 0,

    opportunities:
      Number(item.opportunities) || 0,

    continued:
      Number(item.continued) || 0,

    continuationRate:
      Number(item.continuationRate) || 0,

    weightedRate:
      Number(item.weightedRate) || 0,

    baselineRate:
      Number(item.baselineRate) || 0,

    edge:
      Number(item.edge) || 0,

    wilsonLowerBound:
      Number(item.wilsonLowerBound) || 0,

    wilsonEdge:
      Number(item.wilsonEdge) || 0,

    rate30:
      Number(item.rate30) || 0,

    samples30:
      Number(item.samples30) || 0,

    rate60:
      Number(item.rate60) || 0,

    samples60:
      Number(item.samples60) || 0,

    rate100:
      Number(item.rate100) || 0,

    samples100:
      Number(item.samples100) || 0,

    recentRate:
      Number(item.recentRate) || 0,

    recentSamples:
      Number(item.recentSamples) || 0,

    recentStatus:
      item.recentStatus ?? null,

    stabilityRange:
      Number(item.stabilityRange) || 0,

    stabilityScore:
      Number(item.stabilityScore) || 0,

    sampleReliability:
      Number(item.sampleReliability) || 0,

    rawScore:
      Number(item.rawScore) || 0,

    independentConsensus:
      Number(item.independentConsensus) || 0,

    relatedBridgeCount:
      Number(item.relatedBridgeCount) || 0,

    consensusBonus:
      Number(item.consensusBonus) || 0,

    correlationPenalty:
      Number(item.correlationPenalty) || 0,

    recentAdjustment:
      Number(item.recentAdjustment) || 0,

    score:
      Number(item.score) || 0,

    strength:
      item.strength ?? null
  };
}


/*
========================================================
READ SAVED PAYLOAD
========================================================
*/

function readRecommendations(text) {
  try {
    const parsed =
      JSON.parse(text || "[]");


    // Schema mới
    if (
      parsed &&
      Array.isArray(
        parsed.recommendations
      )
    ) {
      return parsed.recommendations;
    }


    // Tương thích row cũ
    if (Array.isArray(parsed)) {
      return parsed;
    }


    return [];
  } catch {
    return [];
  }
}


/*
========================================================
EVALUATE PENDING PREDICTIONS
========================================================
*/

async function evaluatePending(db) {
  const query =
    await db
      .prepare(`
        SELECT
          id,
          prediction_date,
          numbers,
          recommendations_json

        FROM prediction_tracking

        WHERE
          model = ?
          AND evaluated_at IS NULL

        ORDER BY prediction_date ASC
      `)
      .bind(
        TRACK_MODEL
      )
      .all();


  const rows =
    query.results || [];


  let evaluatedNow = 0;


  for (const saved of rows) {
    const actual =
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

          WHERE draw_date = ?

          LIMIT 1
        `)
        .bind(
          saved.prediction_date
        )
        .first();


    /*
     * Chưa có kết quả target.
     */
    if (!actual) {
      continue;
    }


    const actualNumbers =
      extractUniqueLoto(
        actual
      );


    if (!actualNumbers.length) {
      continue;
    }


    const actualSet =
      new Set(
        actualNumbers
      );


    let recommendations =
      readRecommendations(
        saved.recommendations_json
      );


    /*
     * Fallback cho dữ liệu cũ.
     */
    if (!recommendations.length) {
      recommendations =
        String(saved.numbers || "")
          .split(",")
          .map(
            (number, index) => ({
              rank:
                index + 1,

              number:
                normalizeNumber(
                  number
                )
            })
          )
          .filter(
            x => x.number
          );
    }


    recommendations =
      recommendations
        .filter(
          x => x.number
        )
        .sort(
          (a, b) =>
            Number(a.rank) -
            Number(b.rank)
        );


    const evaluated =
      recommendations.map(
        item => ({
          rank:
            item.rank,

          number:
            item.number,

          hit:
            actualSet.has(
              item.number
            )
        })
      );


    const top1 =
      evaluated.slice(0, 1);

    const top3 =
      evaluated.slice(0, 3);

    const top5 =
      evaluated.slice(0, 5);


    const top1Hit =
      top1.some(x => x.hit)
        ? 1
        : 0;

    const top3Hit =
      top3.some(x => x.hit)
        ? 1
        : 0;

    const top5Hit =
      top5.some(x => x.hit)
        ? 1
        : 0;


    const uniqueCount =
      actualNumbers.length;


    const baselineTop1 =
      randomHitProbability(
        uniqueCount,
        top1.length
      );

    const baselineTop3 =
      randomHitProbability(
        uniqueCount,
        top3.length
      );

    const baselineTop5 =
      randomHitProbability(
        uniqueCount,
        top5.length
      );


    await db
      .prepare(`
        UPDATE prediction_tracking

        SET
          actual_unique_count = ?,

          top1_hit = ?,
          top3_hit = ?,
          top5_hit = ?,

          baseline_top1 = ?,
          baseline_top3 = ?,
          baseline_top5 = ?,

          evaluation_json = ?,

          evaluated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = ?
          AND evaluated_at IS NULL
      `)
      .bind(
        uniqueCount,

        top1Hit,
        top3Hit,
        top5Hit,

        baselineTop1,
        baselineTop3,
        baselineTop5,

        JSON.stringify({
          actualNumbers,
          recommendations:
            evaluated
        }),

        saved.id
      )
      .run();


    evaluatedNow++;
  }


  return evaluatedNow;
}


/*
========================================================
LIVE STATISTICS
========================================================
*/

async function getLiveStatistics(db) {
  const stats =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS evaluated,

          COALESCE(
            SUM(top1_hit),
            0
          ) AS top1_hits,

          COALESCE(
            SUM(top3_hit),
            0
          ) AS top3_hits,

          COALESCE(
            SUM(top5_hit),
            0
          ) AS top5_hits,

          AVG(
            baseline_top1
          ) AS baseline_top1,

          AVG(
            baseline_top3
          ) AS baseline_top3,

          AVG(
            baseline_top5
          ) AS baseline_top5

        FROM prediction_tracking

        WHERE
          model = ?
          AND evaluated_at IS NOT NULL
      `)
      .bind(
        TRACK_MODEL
      )
      .first();


  const totalRow =
    await db
      .prepare(`
        SELECT
          COUNT(*) AS total

        FROM prediction_tracking

        WHERE model = ?
      `)
      .bind(
        TRACK_MODEL
      )
      .first();


  const totalTracked =
    Number(
      totalRow?.total || 0
    );

  const evaluated =
    Number(
      stats?.evaluated || 0
    );

  const top1Hits =
    Number(
      stats?.top1_hits || 0
    );

  const top3Hits =
    Number(
      stats?.top3_hits || 0
    );

  const top5Hits =
    Number(
      stats?.top5_hits || 0
    );


  const buildMetric =
    (
      hits,
      baseline
    ) => {

      const hitRate =
        evaluated
          ?
          hits /
          evaluated *
          100
          :
          0;


      const baselineRate =
        round2(
          baseline
        );


      return {
        hits,

        tested:
          evaluated,

        hitRate:
          round2(
            hitRate
          ),

        baseline:
          baselineRate,

        lift:
          round2(
            hitRate -
            baselineRate
          )
      };
    };


  return {
    model:
      TRACK_MODEL,

    totalTracked,

    evaluated,

    pending:
      Math.max(
        0,
        totalTracked -
        evaluated
      ),

    top1:
      buildMetric(
        top1Hits,
        stats?.baseline_top1
      ),

    top3:
      buildMetric(
        top3Hits,
        stats?.baseline_top3
      ),

    top5:
      buildMetric(
        top5Hits,
        stats?.baseline_top5
      )
  };
}


/*
========================================================
GET CURRENT SNAPSHOT
========================================================
*/

async function getSnapshot(
  db,
  predictionDate
) {
  return db
    .prepare(`
      SELECT
        *

      FROM prediction_tracking

      WHERE
        prediction_date = ?
        AND model = ?

      LIMIT 1
    `)
    .bind(
      predictionDate,
      TRACK_MODEL
    )
    .first();
}


/*
========================================================
API GET
========================================================
*/

export async function onRequestGet(context) {
  try {
    const db =
      context.env.DB;


    if (!db) {
      throw new Error(
        "Không tìm thấy D1 binding DB"
      );
    }


    await ensureTrackingTable(
      db
    );


    /*
    ================================================
    1. Chấm các prediction cũ
    ================================================
    */

    const evaluatedNow =
      await evaluatePending(
        db
      );


    /*
    ================================================
    2. GET V2.6.2 PREDICTION

    Cấu trúc thực tế:

    version
    sourceDate
    predictionDate
    suggestions[]
    ================================================
    */

    const origin =
      new URL(
        context.request.url
      ).origin;


    /*
========================================================
2. GET V2.6.2 PREDICTION
========================================================
*/

const origin =
  new URL(
    context.request.url
  ).origin;


const predictResponse =
  await fetch(
    `${origin}/api/predict?t=${Date.now()}`,
    {
      headers: {
        Accept:
          "application/json"
      }
    }
  );


/*
 * Đọc text trước để lấy được lỗi thật
 * nếu /api/predict trả HTTP 500.
 */

const predictText =
  await predictResponse.text();


let predict;


try {

  predict =
    JSON.parse(
      predictText
    );

} catch {

  throw new Error(
    "Predict API không trả JSON: " +
    predictText.slice(0, 500)
  );
}


if (!predictResponse.ok) {

  throw new Error(
    predict?.message
    ||
    (
      `Predict API HTTP ${predictResponse.status}: ` +
      predictText.slice(0, 500)
    )
  );
}


if (!predict?.success) {

  throw new Error(
    predict?.message
    ||
    "Predict API trả success=false"
  );
}


    if (!predictResponse.ok) {
      throw new Error(
        `Predict API HTTP ${predictResponse.status}`
      );
    }


    const predict =
      await predictResponse.json();


    if (!predict?.success) {
      throw new Error(
        predict?.message ||
        "Không lấy được prediction"
      );
    }


    /*
    ================================================
    EXACT V2.6.2 SCHEMA
    ================================================
    */

    const model =
      predict.version;

    const predictionDate =
      predict.predictionDate;

    const sourceDate =
      predict.sourceDate;


    if (model !== TRACK_MODEL) {
      return json(
        {
          success: false,

          message:
            "Model hiện tại không phải V2.6.2. Không lưu Live Validation.",

          expectedModel:
            TRACK_MODEL,

          actualModel:
            model || null
        },
        409
      );
    }


    if (!predictionDate) {
      throw new Error(
        "Predict API không trả predictionDate"
      );
    }


    if (!sourceDate) {
      throw new Error(
        "Predict API không trả sourceDate"
      );
    }


    /*
    ================================================
    SUGGESTIONS

    Dùng đúng array predict.suggestions.
    ================================================
    */

    const sourceSuggestions =
      Array.isArray(
        predict.suggestions
      )
        ?
        predict.suggestions
        :
        [];


    if (!sourceSuggestions.length) {
      throw new Error(
        "V2.6.2 không có suggestions để lưu"
      );
    }


    const suggestions =
      sourceSuggestions
        .slice(
          0,
          MAX_TRACK_RECOMMENDATIONS
        )
        .map(
          (item, index) =>
            normalizeSuggestion(
              item,
              index + 1
            )
        )
        .filter(
          item =>
            item.number
        );


    if (!suggestions.length) {
      throw new Error(
        "Không lấy được số hợp lệ từ suggestions"
      );
    }


    /*
    ================================================
    3. KIỂM TRA SNAPSHOT ĐÃ TỒN TẠI

    Có rồi => tuyệt đối không regenerate.
    ================================================
    */

    let snapshot =
      await getSnapshot(
        db,
        predictionDate
      );


    let savedNew =
      false;


    if (!snapshot) {

      /*
      ==============================================
      PROSPECTIVE VALIDATION GUARD

      Nếu kết quả target đã tồn tại thì
      KHÔNG cho tạo snapshot mới.

      Như vậy không thể vô tình lưu prediction
      sau khi đã biết kết quả.
      ==============================================
      */

      const targetResult =
        await db
          .prepare(`
            SELECT draw_date

            FROM results

            WHERE draw_date = ?

            LIMIT 1
          `)
          .bind(
            predictionDate
          )
          .first();


      if (targetResult) {
        return json(
          {
            success: false,

            message:
              `Kết quả ${predictionDate} đã tồn tại. ` +
              "Không tạo snapshot Live Validation sau khi đã biết kết quả.",

            predictionDate,

            model:
              TRACK_MODEL,

            evaluatedNow,

            livePerformance:
              await getLiveStatistics(db)
          },
          409
        );
      }


      const numbers =
        suggestions.map(
          item => item.number
        );


      /*
      ==============================================
      4. GIỮ prediction_daily CŨ

      Chỉ Top2.
      DO NOTHING = LOCK.
      ==============================================
      */

      const legacyNumbers =
        numbers.slice(0, 2);


      await db
        .prepare(`
          INSERT INTO prediction_daily (
            prediction_date,
            numbers,
            points,
            model
          )

          VALUES (?, ?, ?, ?)

          ON CONFLICT(prediction_date)

          DO NOTHING
        `)
        .bind(
          predictionDate,
          legacyNumbers.join(","),
          1,
          TRACK_MODEL
        )
        .run();


      /*
      ==============================================
      5. FULL V2.6.2 SNAPSHOT

      recommendations_json lưu cả:
      - metadata model
      - rule
      - rejected
      - counts
      - suggestions
      ==============================================
      */

      const trackingPayload = {
        meta: {
          module:
            predict.module,

          version:
            predict.version,

          sourceDate:
            predict.sourceDate,

          predictionDate:
            predict.predictionDate,

          analyzedDraws:
            predict.analyzedDraws,

          baselineRate:
            predict.baselineRate,

          totalPositions:
            predict.totalPositions,

          activeCandidateCount:
            predict.activeCandidateCount,

          qualifiedCount:
            predict.qualifiedCount,

          recommendationCount:
            predict.recommendationCount,

          historicalOnlyCount:
            predict.historicalOnlyCount,

          returnedCount:
            predict.returnedCount,

          uniqueNumberCount:
            predict.uniqueNumberCount,

          rule:
            predict.rule,

          rejected:
            predict.rejected,

          counts:
            predict.counts
        },

        recommendations:
          suggestions
      };


      const insert =
        await db
          .prepare(`
            INSERT INTO prediction_tracking (

              prediction_date,

              source_date,

              model,

              numbers,

              pick_count,

              recommendations_json,

              points,

              status
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              'locked'
            )

            ON CONFLICT(
              prediction_date,
              model
            )

            DO NOTHING
          `)
          .bind(
            predictionDate,

            sourceDate,

            TRACK_MODEL,

            numbers.join(","),

            numbers.length,

            JSON.stringify(
              trackingPayload
            ),

            1
          )
          .run();


      savedNew =
        Number(
          insert?.meta?.changes || 0
        ) > 0;


      snapshot =
        await getSnapshot(
          db,
          predictionDate
        );
    }


    /*
    ================================================
    6. READ STORED SNAPSHOT
    ================================================
    */

    const storedRecommendations =
      readRecommendations(
        snapshot?.recommendations_json
      );


    const numbers =
      String(
        snapshot?.numbers || ""
      )
        .split(",")
        .filter(Boolean);


    /*
    ================================================
    7. LIVE STATS
    ================================================
    */

    const livePerformance =
      await getLiveStatistics(
        db
      );


    /*
    ================================================
    RESPONSE
    ================================================
    */

    return json({
      success: true,

      module:
        "v2.6.2-live-validation",

      version:
        TRACK_MODEL,

      action:
        savedNew
          ?
          "saved-and-locked"
          :
          "already-locked",

      savedNew,

      evaluatedNow,

      prediction: {
        sourceDate:
          snapshot?.source_date,

        predictionDate:
          snapshot?.prediction_date,

        numbers,

        top1:
          numbers.slice(0, 1),

        top2:
          numbers.slice(0, 2),

        top3:
          numbers.slice(0, 3),

        top5:
          numbers.slice(0, 5),

        totalSuggestions:
          numbers.length,

        recommendations:
          storedRecommendations,

        status:
          snapshot?.status,

        createdAt:
          snapshot?.created_at
      },

      evaluation: {
        evaluated:
          Boolean(
            snapshot?.evaluated_at
          ),

        evaluatedAt:
          snapshot?.evaluated_at || null,

        actualUniqueCount:
          snapshot?.actual_unique_count ?? null,

        top1Hit:
          snapshot?.top1_hit ?? null,

        top3Hit:
          snapshot?.top3_hit ?? null,

        top5Hit:
          snapshot?.top5_hit ?? null,

        baselineTop1:
          snapshot?.baseline_top1 ?? null,

        baselineTop3:
          snapshot?.baseline_top3 ?? null,

        baselineTop5:
          snapshot?.baseline_top5 ?? null
      },

      livePerformance
    });

  } catch (error) {
    console.error(
      "save-prediction:",
      error
    );


    return json(
      {
        success: false,

        message:
          error?.message ||
          "Lỗi save prediction"
      },
      500
    );
  }
}