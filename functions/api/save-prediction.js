/*
========================================================
XSMB V2.6.2
LIVE VALIDATION + LIVE PRIORITY V1
/api/save-prediction
========================================================

BASE MODEL:
bridge-v2.6.2

PRIORITY MODEL:
bridge-v2.6.2-live-priority-v1

QUY TẮC PRIORITY:
- Cầu đã HIT ở kỳ liền trước.
- Cùng bridgeKey.
- Cầu vẫn phải xuất hiện trong suggestions V2.6.2 hiện tại.
- Không hồi sinh cầu đã bị V2.6.2 loại.
- Không sửa score / strength / filter V2.6.2.
- Chỉ thay thứ tự dùng thực tế.

BASE và PRIORITY được lưu riêng để kiểm chứng.
========================================================
*/

const BASE_MODEL =
  "bridge-v2.6.2";

const PRIORITY_MODEL =
  "bridge-v2.6.2-live-priority-v1";

const MAX_TRACK_RECOMMENDATIONS =
  12;


/*
========================================================
JSON RESPONSE
========================================================
*/

function json(
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


function normalizeNumber(value) {

  if (
    value === null ||
    value === undefined
  ) {
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
DATABASE TABLES
========================================================
*/

async function ensureTables(db) {

  /*
  ================================================
  BASE V2.6.2 TRACKING
  ================================================
  */

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


  /*
  ================================================
  PRIORITY VARIANT TRACKING
  ================================================
  */

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_priority_tracking (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        prediction_date TEXT NOT NULL,
        source_date TEXT,

        base_model TEXT NOT NULL,
        variant TEXT NOT NULL,

        numbers TEXT NOT NULL,
        pick_count INTEGER NOT NULL DEFAULT 0,

        recommendations_json TEXT NOT NULL,

        promoted_count INTEGER NOT NULL DEFAULT 0,
        promoted_bridge_keys TEXT,

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
          variant
        )
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


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS
      idx_prediction_priority_pending

      ON prediction_priority_tracking (
        variant,
        evaluated_at
      )
    `)
    .run();
}


/*
========================================================
LOTTERY RESULT HELPERS
========================================================
*/

function extractPrizeNumbers(value) {

  if (
    value === null ||
    value === undefined
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


  for (
    const field
    of fields
  ) {

    const prizes =
      extractPrizeNumbers(
        row[field]
      );


    for (
      const prize
      of prizes
    ) {

      set.add(
        prize
          .padStart(2, "0")
          .slice(-2)
      );
    }
  }


  return [
    ...set
  ].sort();
}


async function getResult(
  db,
  drawDate
) {

  return db
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
      drawDate
    )
    .first();
}


/*
========================================================
RANDOM BASELINE

Xác suất >= 1 số trúng khi chọn K số,
target có U loto unique.
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

    baseRank:
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
      Number(
        item.streak
      ) || 0,

    opportunities:
      Number(
        item.opportunities
      ) || 0,

    continued:
      Number(
        item.continued
      ) || 0,

    continuationRate:
      Number(
        item.continuationRate
      ) || 0,

    weightedRate:
      Number(
        item.weightedRate
      ) || 0,

    baselineRate:
      Number(
        item.baselineRate
      ) || 0,

    edge:
      Number(
        item.edge
      ) || 0,

    wilsonLowerBound:
      Number(
        item.wilsonLowerBound
      ) || 0,

    wilsonEdge:
      Number(
        item.wilsonEdge
      ) || 0,

    rate30:
      Number(
        item.rate30
      ) || 0,

    samples30:
      Number(
        item.samples30
      ) || 0,

    rate60:
      Number(
        item.rate60
      ) || 0,

    samples60:
      Number(
        item.samples60
      ) || 0,

    rate100:
      Number(
        item.rate100
      ) || 0,

    samples100:
      Number(
        item.samples100
      ) || 0,

    recentRate:
      Number(
        item.recentRate
      ) || 0,

    recentSamples:
      Number(
        item.recentSamples
      ) || 0,

    recentStatus:
      item.recentStatus ?? null,

    stabilityRange:
      Number(
        item.stabilityRange
      ) || 0,

    stabilityScore:
      Number(
        item.stabilityScore
      ) || 0,

    sampleReliability:
      Number(
        item.sampleReliability
      ) || 0,

    rawScore:
      Number(
        item.rawScore
      ) || 0,

    independentConsensus:
      Number(
        item.independentConsensus
      ) || 0,

    relatedBridgeCount:
      Number(
        item.relatedBridgeCount
      ) || 0,

    consensusBonus:
      Number(
        item.consensusBonus
      ) || 0,

    correlationPenalty:
      Number(
        item.correlationPenalty
      ) || 0,

    recentAdjustment:
      Number(
        item.recentAdjustment
      ) || 0,

    score:
      Number(
        item.score
      ) || 0,

    strength:
      item.strength ?? null,

    history:
      Array.isArray(
        item.history
      )
        ?
        item.history
        :
        []
  };
}


/*
========================================================
READ STORED RECOMMENDATIONS
========================================================
*/

function readRecommendations(text) {

  try {

    const parsed =
      JSON.parse(
        text || "[]"
      );


    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }


    if (
      Array.isArray(
        parsed?.recommendations
      )
    ) {

      return parsed
        .recommendations;
    }


    return [];

  } catch {

    return [];
  }
}


/*
========================================================
CALL /api/predict SAFELY

Quan trọng:
- Không truyền ?top=12
- Đọc BODY kể cả HTTP 500
- Trả lỗi thật từ predict
========================================================
*/

async function fetchPrediction(
  requestUrl
) {

  const origin =
    new URL(
      requestUrl
    ).origin;


  const predictUrl =
    `${origin}/api/predict?t=${Date.now()}`;


  let response;


  try {

    response =
      await fetch(
        predictUrl,
        {
          headers: {
            Accept:
              "application/json",

            "Cache-Control":
              "no-cache"
          }
        }
      );

  } catch (error) {

    return {
      success: false,

      stage:
        "predict-network",

      status:
        0,

      url:
        predictUrl,

      message:
        error?.message ||
        "Không gọi được /api/predict",

      body:
        null
    };
  }


  let rawText = "";


  try {

    rawText =
      await response.text();

  } catch (error) {

    return {
      success: false,

      stage:
        "predict-read-body",

      status:
        response.status,

      url:
        predictUrl,

      message:
        error?.message ||
        "Không đọc được response /api/predict",

      body:
        null
    };
  }


  let data = null;


  try {

    data =
      JSON.parse(
        rawText
      );

  } catch {

    data = null;
  }


  /*
  ================================================
  HTTP ERROR
  ================================================
  */

  if (!response.ok) {

    return {
      success: false,

      stage:
        "predict-http",

      status:
        response.status,

      url:
        predictUrl,

      message:
        data?.message
        ||
        `Predict API HTTP ${response.status}`,

      body:
        rawText.slice(
          0,
          1500
        ),

      parsed:
        data
    };
  }


  /*
  ================================================
  INVALID JSON
  ================================================
  */

  if (!data) {

    return {
      success: false,

      stage:
        "predict-json",

      status:
        response.status,

      url:
        predictUrl,

      message:
        "Predict API không trả JSON hợp lệ",

      body:
        rawText.slice(
          0,
          1500
        )
    };
  }


  /*
  ================================================
  success:false
  ================================================
  */

  if (!data.success) {

    return {
      success: false,

      stage:
        "predict-response",

      status:
        response.status,

      url:
        predictUrl,

      message:
        data.message
        ||
        "Predict API trả success=false",

      body:
        rawText.slice(
          0,
          1500
        ),

      parsed:
        data
    };
  }


  return {
    success: true,

    status:
      response.status,

    url:
      predictUrl,

    data
  };
}


/*
========================================================
EVALUATE BASE PENDING
========================================================
*/

async function evaluateBasePending(db) {

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
        BASE_MODEL
      )
      .all();


  const pending =
    query.results || [];


  let evaluatedNow = 0;


  for (
    const saved
    of pending
  ) {

    const actual =
      await getResult(
        db,
        saved.prediction_date
      );


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
     * Fallback cho snapshot rất cũ.
     */
    if (
      !recommendations.length
    ) {

      recommendations =
        String(
          saved.numbers || ""
        )
          .split(",")
          .map(
            (
              number,
              index
            ) => ({

              rank:
                index + 1,

              baseRank:
                index + 1,

              number:
                normalizeNumber(
                  number
                ),

              bridgeKey:
                null,

              bridge:
                null
            })
          )
          .filter(
            item =>
              item.number
          );
    }


    recommendations =
      recommendations
        .filter(
          item =>
            item.number
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(
              a.baseRank ??
              a.rank
            )
            -
            Number(
              b.baseRank ??
              b.rank
            )
        );


    /*
     * Lưu bridgeKey trong evaluation.
     * Đây là dữ liệu dùng cho Live Priority.
     */
    const evaluation =
      recommendations.map(
        (
          item,
          index
        ) => ({

          rank:
            index + 1,

          baseRank:
            item.baseRank ??
            item.rank ??
            index + 1,

          number:
            item.number,

          bridgeKey:
            item.bridgeKey ?? null,

          bridge:
            item.bridge ?? null,

          hit:
            actualSet.has(
              item.number
            )
        })
      );


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


    const uniqueCount =
      actualNumbers.length;


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

        top1.some(
          item =>
            item.hit
        )
          ? 1
          : 0,

        top3.some(
          item =>
            item.hit
        )
          ? 1
          : 0,

        top5.some(
          item =>
            item.hit
        )
          ? 1
          : 0,

        randomHitProbability(
          uniqueCount,
          top1.length
        ),

        randomHitProbability(
          uniqueCount,
          top3.length
        ),

        randomHitProbability(
          uniqueCount,
          top5.length
        ),

        JSON.stringify({
          actualNumbers,

          recommendations:
            evaluation
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
EVALUATE PRIORITY PENDING
========================================================
*/

async function evaluatePriorityPending(
  db
) {

  const query =
    await db
      .prepare(`
        SELECT
          id,
          prediction_date,
          recommendations_json

        FROM prediction_priority_tracking

        WHERE
          variant = ?
          AND evaluated_at IS NULL

        ORDER BY prediction_date ASC
      `)
      .bind(
        PRIORITY_MODEL
      )
      .all();


  const pending =
    query.results || [];


  let evaluatedNow = 0;


  for (
    const saved
    of pending
  ) {

    const actual =
      await getResult(
        db,
        saved.prediction_date
      );


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


    const recommendations =
      readRecommendations(
        saved.recommendations_json
      )
        .filter(
          item =>
            item.number
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(
              a.liveRank ??
              a.rank
            )
            -
            Number(
              b.liveRank ??
              b.rank
            )
        );


    const evaluation =
      recommendations.map(
        (
          item,
          index
        ) => ({

          liveRank:
            index + 1,

          baseRank:
            item.baseRank ?? null,

          number:
            item.number,

          bridgeKey:
            item.bridgeKey ?? null,

          bridge:
            item.bridge ?? null,

          promoted:
            Boolean(
              item.livePriority
            ),

          priorityReason:
            item.priorityReason ??
            null,

          hit:
            actualSet.has(
              item.number
            )
        })
      );


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


    const uniqueCount =
      actualNumbers.length;


    await db
      .prepare(`
        UPDATE prediction_priority_tracking

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

        top1.some(
          x => x.hit
        )
          ? 1
          : 0,

        top3.some(
          x => x.hit
        )
          ? 1
          : 0,

        top5.some(
          x => x.hit
        )
          ? 1
          : 0,

        randomHitProbability(
          uniqueCount,
          top1.length
        ),

        randomHitProbability(
          uniqueCount,
          top3.length
        ),

        randomHitProbability(
          uniqueCount,
          top5.length
        ),

        JSON.stringify({
          actualNumbers,

          recommendations:
            evaluation
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
PREVIOUS DAY HIT CONTEXT

Không phụ thuộc evaluation_json cũ có bridgeKey hay không.

Đọc trực tiếp:
- prediction_tracking
- recommendations_json
- results

=> snapshot 25/07 cũ vẫn dùng được.
========================================================
*/

async function getPreviousHitContext(
  db,
  sourceDate
) {

  const snapshot =
    await db
      .prepare(`
        SELECT
          prediction_date,
          recommendations_json,
          numbers

        FROM prediction_tracking

        WHERE
          prediction_date = ?
          AND model = ?

        LIMIT 1
      `)
      .bind(
        sourceDate,
        BASE_MODEL
      )
      .first();


  if (!snapshot) {

    return {
      available: false,

      date:
        sourceDate,

      hitBridgeKeys:
        new Set(),

      hits: []
    };
  }


  const actual =
    await getResult(
      db,
      sourceDate
    );


  if (!actual) {

    return {
      available: false,

      date:
        sourceDate,

      hitBridgeKeys:
        new Set(),

      hits: []
    };
  }


  const actualNumbers =
    extractUniqueLoto(
      actual
    );


  const actualSet =
    new Set(
      actualNumbers
    );


  const recommendations =
    readRecommendations(
      snapshot.recommendations_json
    );


  const hits =
    recommendations
      .filter(
        item =>
          item.number &&
          item.bridgeKey &&
          actualSet.has(
            item.number
          )
      )
      .map(
        item => ({

          baseRank:
            item.baseRank ??
            item.rank,

          number:
            item.number,

          bridgeKey:
            item.bridgeKey,

          bridge:
            item.bridge,

          score:
            item.score,

          strength:
            item.strength
        })
      );


  return {

    available: true,

    date:
      sourceDate,

    actualNumbers,

    hitBridgeKeys:
      new Set(
        hits.map(
          item =>
            item.bridgeKey
        )
      ),

    hits
  };
}


/*
========================================================
BUILD PRIORITY RANKING
========================================================
*/

function buildPriorityRanking(
  baseRecommendations,
  previousContext
) {

  const hitKeys =
    previousContext
      ?.hitBridgeKeys
    ||
    new Set();


  const ranked =
    baseRecommendations
      .map(
        (
          item,
          index
        ) => {

          const baseRank =
            index + 1;


          const livePriority =
            Boolean(
              item.bridgeKey &&
              hitKeys.has(
                item.bridgeKey
              )
            );


          return {

            ...item,

            rank:
              baseRank,

            baseRank,

            livePriority,

            priorityReason:
              livePriority
                ?
                "previous-day-same-bridge-hit"
                :
                null,

            previousHitDate:
              livePriority
                ?
                previousContext.date
                :
                null
          };
        }
      );


  /*
  ================================================
  Cầu vừa HIT lên đầu.

  Nếu nhiều cầu HIT:
  giữ nguyên thứ tự V2.6.2 giữa chúng.

  Các cầu còn lại:
  giữ nguyên thứ tự V2.6.2.
  ================================================
  */

  ranked.sort(
    (
      a,
      b
    ) => {

      const priorityDifference =
        Number(
          b.livePriority
        )
        -
        Number(
          a.livePriority
        );


      if (
        priorityDifference !== 0
      ) {

        return priorityDifference;
      }


      return (
        a.baseRank -
        b.baseRank
      );
    }
  );


  return ranked.map(
    (
      item,
      index
    ) => ({

      ...item,

      liveRank:
        index + 1
    })
  );
}


/*
========================================================
GET SNAPSHOTS
========================================================
*/

async function getBaseSnapshot(
  db,
  predictionDate
) {

  return db
    .prepare(`
      SELECT *

      FROM prediction_tracking

      WHERE
        prediction_date = ?
        AND model = ?

      LIMIT 1
    `)
    .bind(
      predictionDate,
      BASE_MODEL
    )
    .first();
}


async function getPrioritySnapshot(
  db,
  predictionDate
) {

  return db
    .prepare(`
      SELECT *

      FROM prediction_priority_tracking

      WHERE
        prediction_date = ?
        AND variant = ?

      LIMIT 1
    `)
    .bind(
      predictionDate,
      PRIORITY_MODEL
    )
    .first();
}


/*
========================================================
SAVE BASE SNAPSHOT
========================================================
*/

async function saveBaseSnapshot(
  db,
  predict,
  recommendations
) {

  let snapshot =
    await getBaseSnapshot(
      db,
      predict.predictionDate
    );


  if (snapshot) {

    return {
      savedNew: false,

      blocked:
        null,

      snapshot
    };
  }


  /*
  * Không được tạo prediction sau khi
  * kết quả target đã tồn tại.
  */
  const target =
    await getResult(
      db,
      predict.predictionDate
    );


  if (target) {

    return {
      savedNew: false,

      blocked:
        "target-result-already-exists",

      snapshot:
        null
    };
  }


  const numbers =
    recommendations.map(
      item =>
        item.number
    );


  const payload = {

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

    recommendations
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

        predict.predictionDate,

        predict.sourceDate,

        BASE_MODEL,

        numbers.join(","),

        numbers.length,

        JSON.stringify(
          payload
        ),

        1
      )
      .run();


  snapshot =
    await getBaseSnapshot(
      db,
      predict.predictionDate
    );


  return {

    savedNew:
      Number(
        insert?.meta?.changes || 0
      ) > 0,

    blocked:
      null,

    snapshot
  };
}


/*
========================================================
SAVE PRIORITY SNAPSHOT
========================================================
*/

async function savePrioritySnapshot(
  db,
  predict,
  recommendations
) {

  let snapshot =
    await getPrioritySnapshot(
      db,
      predict.predictionDate
    );


  if (snapshot) {

    return {
      savedNew: false,

      blocked:
        null,

      snapshot
    };
  }


  const target =
    await getResult(
      db,
      predict.predictionDate
    );


  if (target) {

    return {
      savedNew: false,

      blocked:
        "target-result-already-exists",

      snapshot:
        null
    };
  }


  const numbers =
    recommendations.map(
      item =>
        item.number
    );


  const promoted =
    recommendations.filter(
      item =>
        item.livePriority
    );


  const payload = {

    meta: {

      baseModel:
        BASE_MODEL,

      variant:
        PRIORITY_MODEL,

      sourceDate:
        predict.sourceDate,

      predictionDate:
        predict.predictionDate,

      priorityRule:
        "previous-day-same-bridge-hit",

      sameBridgeKeyRequired:
        true,

      bridgeMustStillQualifyV262:
        true,

      resurrectRejectedBridge:
        false,

      modifyBaseScore:
        false
    },

    recommendations
  };


  const insert =
    await db
      .prepare(`
        INSERT INTO prediction_priority_tracking (

          prediction_date,
          source_date,

          base_model,
          variant,

          numbers,
          pick_count,

          recommendations_json,

          promoted_count,
          promoted_bridge_keys,

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
          ?,
          ?,
          'locked'
        )

        ON CONFLICT(
          prediction_date,
          variant
        )

        DO NOTHING
      `)
      .bind(

        predict.predictionDate,

        predict.sourceDate,

        BASE_MODEL,

        PRIORITY_MODEL,

        numbers.join(","),

        numbers.length,

        JSON.stringify(
          payload
        ),

        promoted.length,

        promoted
          .map(
            item =>
              item.bridgeKey
          )
          .join(",")
      )
      .run();


  /*
  ================================================
  prediction_daily = dàn sử dụng thực tế.

  Top2 lấy theo Live Priority.

  Không ghi đè prediction đã tồn tại.
  ================================================
  */

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

      predict.predictionDate,

      numbers
        .slice(0, 2)
        .join(","),

      1,

      PRIORITY_MODEL
    )
    .run();


  snapshot =
    await getPrioritySnapshot(
      db,
      predict.predictionDate
    );


  return {

    savedNew:
      Number(
        insert?.meta?.changes || 0
      ) > 0,

    blocked:
      null,

    snapshot
  };
}


/*
========================================================
PERFORMANCE HELPER
========================================================
*/

function buildPerformance(
  row,
  totalTracked
) {

  const tested =
    Number(
      row?.tested || 0
    );


  function metric(
    hitsValue,
    baselineValue
  ) {

    const hits =
      Number(
        hitsValue || 0
      );


    const hitRate =
      tested
        ?
        hits /
        tested *
        100
        :
        0;


    const baseline =
      round2(
        baselineValue
      );


    return {

      hits,

      tested,

      hitRate:
        round2(
          hitRate
        ),

      baseline,

      lift:
        round2(
          hitRate -
          baseline
        )
    };
  }


  return {

    totalTracked:

      Number(
        totalTracked || 0
      ),

    tested,

    pending:
      Math.max(
        0,
        Number(
          totalTracked || 0
        ) - tested
      ),

    top1:
      metric(
        row?.top1_hits,
        row?.baseline_top1
      ),

    top3:
      metric(
        row?.top3_hits,
        row?.baseline_top3
      ),

    top5:
      metric(
        row?.top5_hits,
        row?.baseline_top5
      )
  };
}


/*
========================================================
BASE PERFORMANCE
========================================================
*/

async function getBasePerformance(db) {

  const row =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS tested,

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
        BASE_MODEL
      )
      .first();


  const count =
    await db
      .prepare(`
        SELECT
          COUNT(*) AS total

        FROM prediction_tracking

        WHERE model = ?
      `)
      .bind(
        BASE_MODEL
      )
      .first();


  return buildPerformance(
    row,
    count?.total
  );
}


/*
========================================================
PRIORITY PERFORMANCE
========================================================
*/

async function getPriorityPerformance(
  db
) {

  const row =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS tested,

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

        FROM prediction_priority_tracking

        WHERE
          variant = ?
          AND evaluated_at IS NOT NULL
      `)
      .bind(
        PRIORITY_MODEL
      )
      .first();


  const count =
    await db
      .prepare(`
        SELECT
          COUNT(*) AS total

        FROM prediction_priority_tracking

        WHERE variant = ?
      `)
      .bind(
        PRIORITY_MODEL
      )
      .first();


  return buildPerformance(
    row,
    count?.total
  );
}


/*
========================================================
MAIN GET
========================================================
*/

export async function onRequestGet(
  context
) {

  try {

    const db =
      context.env.DB;


    if (!db) {

      return json(
        {
          success: false,

          stage:
            "database",

          message:
            "Không tìm thấy D1 binding DB"
        },
        500
      );
    }


    /*
    ================================================
    1. TABLES
    ================================================
    */

    await ensureTables(
      db
    );


    /*
    ================================================
    2. CHẤM PREDICTION CŨ TRƯỚC

    Việc này vẫn chạy kể cả khi
    /api/predict hiện tại bị lỗi.
    ================================================
    */

    const evaluatedBaseNow =
      await evaluateBasePending(
        db
      );


    const evaluatedPriorityNow =
      await evaluatePriorityPending(
        db
      );


    /*
    ================================================
    3. PERFORMANCE HIỆN TẠI
    ================================================
    */

    let basePerformance =
      await getBasePerformance(
        db
      );


    let priorityPerformance =
      await getPriorityPerformance(
        db
      );


    /*
    ================================================
    4. CALL /api/predict

    KHÔNG dùng ?top=12.
    ================================================
    */

    const predictResult =
      await fetchPrediction(
        context.request.url
      );


    /*
    ================================================
    PREDICT ERROR

    Không che lỗi thật nữa.
    ================================================
    */

    if (
      !predictResult.success
    ) {

      return json(
        {
          success: false,

          module:
            "v2.6.2-live-validation-priority",

          stage:
            predictResult.stage,

          message:
            predictResult.message,

          evaluatedNow: {

            base:
              evaluatedBaseNow,

            priority:
              evaluatedPriorityNow
          },

          livePerformance: {

            base:
              basePerformance,

            livePriority:
              priorityPerformance
          },

          predictDiagnostic: {

            status:
              predictResult.status,

            url:
              predictResult.url,

            body:
              predictResult.body,

            parsed:
              predictResult.parsed ??
              null
          }
        },
        502
      );
    }


    const predict =
      predictResult.data;


    /*
    ================================================
    5. VALIDATE V2.6.2 SCHEMA
    ================================================
    */

    if (
      predict.version !==
      BASE_MODEL
    ) {

      return json(
        {
          success: false,

          stage:
            "model-version",

          message:
            "Predict API không phải bridge-v2.6.2",

          expected:
            BASE_MODEL,

          actual:
            predict.version ??
            null
        },
        409
      );
    }


    if (
      !predict.sourceDate ||
      !predict.predictionDate
    ) {

      return json(
        {
          success: false,

          stage:
            "predict-schema",

          message:
            "Predict API thiếu sourceDate hoặc predictionDate",

          sourceDate:
            predict.sourceDate ??
            null,

          predictionDate:
            predict.predictionDate ??
            null
        },
        500
      );
    }


    /*
    ================================================
    6. SUGGESTIONS
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


    if (
      !sourceSuggestions.length
    ) {

      return json(
        {
          success: false,

          stage:
            "suggestions",

          message:
            "V2.6.2 không có suggestions để lưu",

          sourceDate:
            predict.sourceDate,

          predictionDate:
            predict.predictionDate,

          activeCandidateCount:
            predict.activeCandidateCount,

          qualifiedCount:
            predict.qualifiedCount,

          rejected:
            predict.rejected
        },
        409
      );
    }


    const baseRecommendations =
      sourceSuggestions
        .slice(
          0,
          MAX_TRACK_RECOMMENDATIONS
        )
        .map(
          (
            item,
            index
          ) =>
            normalizeSuggestion(
              item,
              index + 1
            )
        )
        .filter(
          item =>
            item.number
        );


    if (
      !baseRecommendations.length
    ) {

      return json(
        {
          success: false,

          stage:
            "normalize",

          message:
            "Không lấy được số hợp lệ từ suggestions V2.6.2"
        },
        500
      );
    }


    /*
    ================================================
    7. XÁC ĐỊNH CẦU HIT NGÀY SOURCE

    Ví dụ:
    prediction 25/07 đã HIT
    source hiện tại = 25/07

    => lấy bridgeKey HIT của 25/07.
    ================================================
    */

    const previousContext =
      await getPreviousHitContext(
        db,
        predict.sourceDate
      );


    /*
    ================================================
    8. PRIORITY RANKING
    ================================================
    */

    const priorityRecommendations =
      buildPriorityRanking(
        baseRecommendations,
        previousContext
      );


    /*
    ================================================
    9. SAVE BASE
    ================================================
    */

    const baseSave =
      await saveBaseSnapshot(
        db,
        predict,
        baseRecommendations
      );


    /*
    ================================================
    10. SAVE PRIORITY
    ================================================
    */

    const prioritySave =
      await savePrioritySnapshot(
        db,
        predict,
        priorityRecommendations
      );


    /*
    ================================================
    11. UPDATE PERFORMANCE
    ================================================
    */

    basePerformance =
      await getBasePerformance(
        db
      );


    priorityPerformance =
      await getPriorityPerformance(
        db
      );


    const baseNumbers =
      baseRecommendations.map(
        item =>
          item.number
      );


    const priorityNumbers =
      priorityRecommendations.map(
        item =>
          item.number
      );


    const promoted =
      priorityRecommendations
        .filter(
          item =>
            item.livePriority
        )
        .map(
          item => ({

            previousHitDate:
              item.previousHitDate,

            bridgeKey:
              item.bridgeKey,

            bridge:
              item.bridge,

            previousBaseRank:
              previousContext
                ?.hits
                ?.find(
                  old =>
                    old.bridgeKey ===
                    item.bridgeKey
                )
                ?.baseRank
              ??
              null,

            previousNumber:
              previousContext
                ?.hits
                ?.find(
                  old =>
                    old.bridgeKey ===
                    item.bridgeKey
                )
                ?.number
              ??
              null,

            currentNumber:
              item.number,

            baseRank:
              item.baseRank,

            liveRank:
              item.liveRank,

            score:
              item.score,

            strength:
              item.strength,

            recentStatus:
              item.recentStatus
          })
        );


    /*
    ================================================
    RESPONSE
    ================================================
    */

    return json({

      success: true,

      module:
        "v2.6.2-live-validation-priority",

      version:
        "live-priority-v1",

      baseModel:
        BASE_MODEL,

      priorityModel:
        PRIORITY_MODEL,

      sourceDate:
        predict.sourceDate,

      predictionDate:
        predict.predictionDate,


      evaluatedNow: {

        base:
          evaluatedBaseNow,

        priority:
          evaluatedPriorityNow
      },


      previousDayEvidence: {

        available:
          previousContext.available,

        date:
          previousContext.date,

        hits:
          previousContext.hits
      },


      basePrediction: {

        action:
          baseSave.savedNew
            ?
            "saved-and-locked"
            :
            baseSave.blocked
              ?
              baseSave.blocked
              :
              "already-locked",

        savedNew:
          baseSave.savedNew,

        numbers:
          baseNumbers,

        top1:
          baseNumbers.slice(
            0,
            1
          ),

        top3:
          baseNumbers.slice(
            0,
            3
          ),

        top5:
          baseNumbers.slice(
            0,
            5
          ),

        recommendations:
          baseRecommendations
      },


      priorityPrediction: {

        action:
          prioritySave.savedNew
            ?
            "saved-and-locked"
            :
            prioritySave.blocked
              ?
              prioritySave.blocked
              :
              "already-locked",

        savedNew:
          prioritySave.savedNew,

        numbers:
          priorityNumbers,

        top1:
          priorityNumbers.slice(
            0,
            1
          ),

        top2:
          priorityNumbers.slice(
            0,
            2
          ),

        top3:
          priorityNumbers.slice(
            0,
            3
          ),

        top5:
          priorityNumbers.slice(
            0,
            5
          ),

        promotedCount:
          promoted.length,

        promoted,

        recommendations:
          priorityRecommendations
      },


      comparison: {

        base:
          basePerformance,

        livePriority:
          priorityPerformance
      },


      rule: {

        priority:
          "previous-day-same-bridge-hit",

        sameBridgeKeyRequired:
          true,

        bridgeMustStillAppearInV262:
          true,

        resurrectRejectedBridge:
          false,

        modifyPredictJs:
          false,

        modifyBaseScore:
          false,

        modifyStrength:
          false
      }
    });

  } catch (error) {

    console.error(
      "save-prediction:",
      error
    );


    return json(
      {
        success: false,

        module:
          "v2.6.2-live-validation-priority",

        stage:
          "save-prediction",

        message:
          error?.message ||
          "Lỗi save prediction",

        stack:
          error?.stack
            ?
            String(
              error.stack
            ).slice(
              0,
              1500
            )
            :
            null
      },
      500
    );
  }
}