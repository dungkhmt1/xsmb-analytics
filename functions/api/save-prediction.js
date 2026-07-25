/*
========================================================
XSMB V2.6.2 LIVE VALIDATION
/api/save-prediction
========================================================

Chức năng:

1. Gọi /api/predict?top=5
2. Chỉ chấp nhận bridge-v2.6.2
3. Lưu Top 2 vào prediction_daily (tương thích cũ)
4. Lưu Top 5 + feature vào prediction_tracking
5. Snapshot LOCKED, không ghi đè
6. Tự chấm các prediction cũ khi results đã có
7. Trả thống kê Live Top1 / Top3 / Top5

IMPORTANT:
Prediction đã lưu không bao giờ regenerate.
========================================================
*/

const TRACK_MODEL = "bridge-v2.6.2";

const MAX_TRACK_NUMBERS = 5;


/*
========================================================
RESPONSE
========================================================
*/

function jsonResponse(
  data,
  status = 200
) {
  return Response.json(
    data,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate"
      }
    }
  );
}


/*
========================================================
HELPERS
========================================================
*/

function round2(value) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(
    n * 100
  ) / 100;
}


function firstDefined(
  ...values
) {

  for (
    const value
    of values
  ) {

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}


function numberValue(
  value
) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


/*
========================================================
NORMALIZE 2 DIGIT NUMBER
========================================================
*/

function normalizeNumber(
  value
) {

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }


  const digits =
    String(value)
      .replace(/\D/g, "");


  if (!digits.length) {
    return null;
  }


  return digits
    .padStart(2, "0")
    .slice(-2);
}


/*
========================================================
DATABASE TABLE
========================================================
*/

async function ensureTrackingTable(
  db
) {

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
LOTTERY RESULT -> UNIQUE LOTO
========================================================
*/

function prizeTokens(
  value
) {

  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }


  return (
    String(value)
      .match(/\d+/g)
    ||
    []
  );
}


function extractLotoNumbers(
  result
) {

  const prizeFields = [

    "special",

    "g1",

    "g2",

    "g3",

    "g4",

    "g5",

    "g6",

    "g7"
  ];


  const numbers =
    new Set();


  for (
    const field
    of prizeFields
  ) {

    const tokens =
      prizeTokens(
        result[field]
      );


    for (
      const token
      of tokens
    ) {

      const loto =
        token
          .padStart(2, "0")
          .slice(-2);


      numbers.add(
        loto
      );
    }
  }


  return [
    ...numbers
  ]
    .sort();
}


/*
========================================================
EXACT RANDOM BASELINE

Giả sử:
- 100 số từ 00 -> 99
- target có U loto unique
- model chọn K số khác nhau

P(at least 1 hit)
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


  if (
    u <= 0 ||
    k <= 0
  ) {
    return 0;
  }


  if (
    u >= 100
  ) {
    return 100;
  }


  let noHit =
    1;


  for (
    let i = 0;
    i < k;
    i++
  ) {

    const numerator =
      100 -
      u -
      i;


    const denominator =
      100 -
      i;


    if (
      numerator <= 0
    ) {

      noHit =
        0;

      break;
    }


    noHit *=
      numerator /
      denominator;
  }


  return round2(
    (
      1 -
      noHit
    )
    *
    100
  );
}


/*
========================================================
NORMALIZE RECOMMENDATION
========================================================
*/

function normalizeRecommendation(
  item,
  rank
) {

  const number =
    normalizeNumber(
      firstDefined(
        item?.number,
        item?.predictedNumber,
        item?.value
      )
    );


  return {

    rank,

    number,

    bridge:
      firstDefined(
        item?.bridge,
        item?.bridgeName
      ),

    bridgeKey:
      firstDefined(
        item?.bridgeKey,
        item?.bridge_key
      ),

    streak:
      numberValue(
        firstDefined(
          item?.streak,
          item?.currentStreak
        )
      ),

    opportunities:
      numberValue(
        item?.opportunities
      ),

    continued:
      numberValue(
        item?.continued
      ),

    continuationRate:
      numberValue(
        firstDefined(
          item?.continuationRate,
          item?.rate
        )
      ),

    baselineRate:
      numberValue(
        item?.baselineRate
      ),

    edge:
      numberValue(
        item?.edge
      ),

    wilsonEdge:
      numberValue(
        item?.wilsonEdge
      ),

    posteriorEdge:
      numberValue(
        item?.posteriorEdge
      ),

    recentPosteriorEdge:
      numberValue(
        item?.recentPosteriorEdge
      ),

    stabilityScore:
      numberValue(
        firstDefined(
          item?.stabilityScore,
          item?.stability
        )
      ),

    sampleReliability:
      numberValue(
        item?.sampleReliability
      ),

    recentStatus:
      firstDefined(
        item?.recentStatus,
        item?.recent
      ),

    independentConsensus:
      numberValue(
        firstDefined(
          item?.independentConsensus,
          item?.independent
        )
      ),

    strength:
      firstDefined(
        item?.strength,
        item?.classification
      ),

    score:
      numberValue(
        firstDefined(
          item?.score,
          item?.finalScore,
          item?.baseScore
        )
      ),

    rawScore:
      numberValue(
        item?.rawScore
      )
  };
}


/*
========================================================
GET RANKED RECOMMENDATIONS FROM PREDICT RESPONSE
========================================================
*/

function getRecommendations(
  predict
) {

  /*
  topNumbers là ranking thực tế
  mà production đang hiển thị.
  */

  let ranked =
    Array.isArray(
      predict?.topNumbers
    )
      ?
      predict.topNumbers
      :
      null;


  if (
    !ranked?.length &&
    Array.isArray(
      predict?.data?.recommendations
    )
  ) {

    ranked =
      predict.data.recommendations;
  }


  if (
    !ranked?.length &&
    Array.isArray(
      predict?.recommendations
    )
  ) {

    ranked =
      predict.recommendations;
  }


  if (
    !ranked?.length
  ) {
    return [];
  }


  /*
  Tìm detail đầy đủ theo number.
  */

  const detailSources = [

    predict?.data?.recommendations,

    predict?.recommendations,

    predict?.topNumbers

  ]
    .filter(
      Array.isArray
    );


  const detailMap =
    new Map();


  for (
    const source
    of detailSources
  ) {

    for (
      const item
      of source
    ) {

      const number =
        normalizeNumber(
          item?.number
        );


      if (!number) {
        continue;
      }


      const old =
        detailMap.get(
          number
        )
        ||
        {};


      detailMap.set(
        number,
        {
          ...old,
          ...item
        }
      );
    }
  }


  const seen =
    new Set();


  const result =
    [];


  for (
    const item
    of ranked
  ) {

    const number =
      normalizeNumber(
        item?.number
      );


    if (
      !number ||
      seen.has(number)
    ) {
      continue;
    }


    seen.add(
      number
    );


    const detail =
      detailMap.get(
        number
      )
      ||
      {};


    result.push(
      normalizeRecommendation(
        {
          ...detail,
          ...item,
          number
        },
        result.length + 1
      )
    );


    if (
      result.length >=
      MAX_TRACK_NUMBERS
    ) {
      break;
    }
  }


  return result;
}


/*
========================================================
EVALUATE PENDING PREDICTIONS
========================================================
*/

async function evaluatePending(
  db
) {

  const pendingResult =
    await db
      .prepare(`
        SELECT
          id,
          prediction_date,
          model,
          numbers,
          pick_count,
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


  const pending =
    pendingResult.results
    ||
    [];


  let evaluatedNow =
    0;


  for (
    const prediction
    of pending
  ) {

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
          prediction.prediction_date
        )
        .first();


    /*
    Target chưa xổ hoặc chưa import.
    */

    if (!actual) {
      continue;
    }


    const actualNumbers =
      extractLotoNumbers(
        actual
      );


    if (
      !actualNumbers.length
    ) {
      continue;
    }


    const actualSet =
      new Set(
        actualNumbers
      );


    let recommendations = [];


    try {

      recommendations =
        JSON.parse(
          prediction.recommendations_json
          ||
          "[]"
        );

    }
    catch {

      recommendations =
        String(
          prediction.numbers
          ||
          ""
        )
          .split(",")
          .map(
            (
              number,
              index
            ) => ({
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


    const evaluation =
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


    const pickCount =
      evaluation.length;


    const top1 =
      evaluation.slice(
        0,
        1
      );


    const top3 =
      evaluation.slice(
        0,
        3
      );


    const top5 =
      evaluation.slice(
        0,
        5
      );


    const top1Hit =
      top1.some(
        x => x.hit
      )
        ? 1
        : 0;


    const top3Hit =
      top3.some(
        x => x.hit
      )
        ? 1
        : 0;


    const top5Hit =
      top5.some(
        x => x.hit
      )
        ? 1
        : 0;


    const uniqueCount =
      actualNumbers.length;


    const baselineTop1 =
      randomHitProbability(
        uniqueCount,
        Math.min(
          1,
          pickCount
        )
      );


    const baselineTop3 =
      randomHitProbability(
        uniqueCount,
        Math.min(
          3,
          pickCount
        )
      );


    const baselineTop5 =
      randomHitProbability(
        uniqueCount,
        Math.min(
          5,
          pickCount
        )
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
            evaluation
        }),

        prediction.id
      )
      .run();


    evaluatedNow++;
  }


  return evaluatedNow;
}


/*
========================================================
LIVE PERFORMANCE
========================================================
*/

async function getLiveStatistics(
  db
) {

  const row =
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
          ) AS baseline_top5,

          SUM(
            CASE
              WHEN pick_count >= 3
              THEN 1
              ELSE 0
            END
          ) AS full_top3_days,

          SUM(
            CASE
              WHEN pick_count >= 5
              THEN 1
              ELSE 0
            END
          ) AS full_top5_days

        FROM prediction_tracking

        WHERE
          model = ?
          AND evaluated_at IS NOT NULL
      `)
      .bind(
        TRACK_MODEL
      )
      .first();


  const trackedRow =
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
      trackedRow?.total
      ||
      0
    );


  const evaluated =
    Number(
      row?.evaluated
      ||
      0
    );


  const top1Hits =
    Number(
      row?.top1_hits
      ||
      0
    );


  const top3Hits =
    Number(
      row?.top3_hits
      ||
      0
    );


  const top5Hits =
    Number(
      row?.top5_hits
      ||
      0
    );


  const top1Rate =
    evaluated
      ?
      top1Hits /
      evaluated *
      100
      :
      0;


  const top3Rate =
    evaluated
      ?
      top3Hits /
      evaluated *
      100
      :
      0;


  const top5Rate =
    evaluated
      ?
      top5Hits /
      evaluated *
      100
      :
      0;


  const baselineTop1 =
    round2(
      row?.baseline_top1
    );


  const baselineTop3 =
    round2(
      row?.baseline_top3
    );


  const baselineTop5 =
    round2(
      row?.baseline_top5
    );


  const fullTop3Days =
    Number(
      row?.full_top3_days
      ||
      0
    );


  const fullTop5Days =
    Number(
      row?.full_top5_days
      ||
      0
    );


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

    top1: {

      hits:
        top1Hits,

      tested:
        evaluated,

      hitRate:
        round2(
          top1Rate
        ),

      baseline:
        baselineTop1,

      lift:
        round2(
          top1Rate -
          baselineTop1
        )
    },

    top3: {

      hits:
        top3Hits,

      tested:
        evaluated,

      hitRate:
        round2(
          top3Rate
        ),

      baseline:
        baselineTop3,

      lift:
        round2(
          top3Rate -
          baselineTop3
        ),

      fullPickDays:
        fullTop3Days,

      fullCoverage:
        evaluated
          ?
          round2(
            fullTop3Days /
            evaluated *
            100
          )
          :
          0
    },

    top5: {

      hits:
        top5Hits,

      tested:
        evaluated,

      hitRate:
        round2(
          top5Rate
        ),

      baseline:
        baselineTop5,

      lift:
        round2(
          top5Rate -
          baselineTop5
        ),

      fullPickDays:
        fullTop5Days,

      fullCoverage:
        evaluated
          ?
          round2(
            fullTop5Days /
            evaluated *
            100
          )
          :
          0
    }
  };
}


/*
========================================================
GET
========================================================
*/

export async function onRequestGet(
  context
) {

  try {

    const db =
      context.env.DB;


    if (!db) {

      throw new Error(
        "Không tìm thấy binding DB"
      );
    }


    /*
    ================================================
    CREATE TRACKING TABLE
    ================================================
    */

    await ensureTrackingTable(
      db
    );


    /*
    ================================================
    STEP 1:
    Chấm prediction cũ trước.
    ================================================
    */

    const evaluatedNow =
      await evaluatePending(
        db
      );


    /*
    ================================================
    STEP 2:
    Lấy prediction V2.6.2 hiện tại.
    ================================================
    */

    const origin =
      new URL(
        context.request.url
      )
        .origin;


    const response =
      await fetch(
        `${origin}/api/predict?top=5&t=${Date.now()}`,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `Predict API HTTP ${response.status}`
      );
    }


    const predict =
      await response.json();


    if (
      !predict.success
    ) {

      throw new Error(
        predict.message
        ||
        "Không lấy được dự đoán"
      );
    }


    /*
    ================================================
    VERIFY MODEL
    ================================================
    */

    const model =
      firstDefined(
        predict.model,
        predict?.data?.model,
        predict?.version
      );


    if (
      model !==
      TRACK_MODEL
    ) {

      return jsonResponse(
        {
          success: false,

          message:
            "Không lưu prediction vì model hiện tại không phải V2.6.2.",

          expectedModel:
            TRACK_MODEL,

          actualModel:
            model
        },
        409
      );
    }


    /*
    ================================================
    DATE
    ================================================
    */

    const predictionDate =
      firstDefined(
        predict?.data?.predictionDate,
        predict?.predictionDate
      );


    const sourceDate =
      firstDefined(
        predict?.data?.sourceDate,
        predict?.data?.latestResult,
        predict?.latestResult,
        predict?.sourceDate
      );


    if (
      !predictionDate
    ) {

      throw new Error(
        "Predict API không trả predictionDate"
      );
    }


    /*
    ================================================
    TOP 5 SNAPSHOT
    ================================================
    */

    const recommendations =
      getRecommendations(
        predict
      );


    if (
      !recommendations.length
    ) {

      throw new Error(
        "Không có recommendation để theo dõi"
      );
    }


    const numbers =
      recommendations
        .map(
          x => x.number
        )
        .filter(Boolean);


    const numbersText =
      numbers.join(",");


    /*
    ================================================
    LEGACY TABLE

    Giữ Top 2 như API cũ.

    Khác duy nhất:
    DO NOTHING thay vì UPDATE.

    => prediction đầu tiên được LOCK.
    ================================================
    */

    const legacyNumbers =
      numbers.slice(
        0,
        2
      );


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
    ================================================
    LIVE VALIDATION SNAPSHOT

    ON CONFLICT DO NOTHING
    = LOCKED FOREVER
    ================================================
    */

    const insertResult =
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

          numbersText,

          numbers.length,

          JSON.stringify(
            recommendations
          ),

          1
        )
        .run();


    const savedNew =
      Number(
        insertResult?.meta?.changes
        ||
        0
      ) > 0;


    /*
    ================================================
    Đọc snapshot thật trong DB.

    Nếu API gọi lần thứ 2,
    trả snapshot cũ chứ không trả
    prediction mới vừa regenerate.
    ================================================
    */

    const snapshot =
      await db
        .prepare(`
          SELECT

            prediction_date,

            source_date,

            model,

            numbers,

            pick_count,

            recommendations_json,

            points,

            status,

            created_at,

            evaluated_at,

            actual_unique_count,

            top1_hit,

            top3_hit,

            top5_hit,

            baseline_top1,

            baseline_top3,

            baseline_top5,

            evaluation_json

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


    let storedRecommendations =
      [];


    try {

      storedRecommendations =
        JSON.parse(
          snapshot
            ?.recommendations_json
          ||
          "[]"
        );

    }
    catch {
      storedRecommendations =
        [];
    }


    /*
    ================================================
    LIVE STATS
    ================================================
    */

    const live =
      await getLiveStatistics(
        db
      );


    /*
    ================================================
    RESPONSE
    ================================================
    */

    return jsonResponse({

      success: true,

      module:
        "v2.6.2-live-validation",

      model:
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

        predictionDate:
          snapshot
            ?.prediction_date,

        sourceDate:
          snapshot
            ?.source_date,

        numbers:
          String(
            snapshot?.numbers
            ||
            ""
          )
            .split(",")
            .filter(Boolean),

        pickCount:
          Number(
            snapshot?.pick_count
            ||
            0
          ),

        points:
          Number(
            snapshot?.points
            ||
            1
          ),

        model:
          snapshot?.model,

        status:
          snapshot?.status,

        createdAt:
          snapshot?.created_at,

        recommendations:
          storedRecommendations
      },

      evaluation: {

        evaluated:
          Boolean(
            snapshot?.evaluated_at
          ),

        evaluatedAt:
          snapshot?.evaluated_at
          ||
          null,

        actualUniqueCount:
          snapshot?.actual_unique_count
          ??
          null,

        top1Hit:
          snapshot?.top1_hit
          ??
          null,

        top3Hit:
          snapshot?.top3_hit
          ??
          null,

        top5Hit:
          snapshot?.top5_hit
          ??
          null,

        baselineTop1:
          snapshot?.baseline_top1
          ??
          null,

        baselineTop3:
          snapshot?.baseline_top3
          ??
          null,

        baselineTop5:
          snapshot?.baseline_top5
          ??
          null
      },

      livePerformance:
        live
    });

  }
  catch (
    error
  ) {

    console.error(
      "save-prediction:",
      error
    );


    return jsonResponse(
      {
        success: false,

        message:
          error?.message
          ||
          "Lỗi save prediction"
      },
      500
    );
  }
}