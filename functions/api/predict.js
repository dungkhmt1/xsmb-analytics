/*
========================================================
XSMB V2.6.2 LIVE VALIDATION + LIVE PRIORITY V1
/api/save-prediction
========================================================

BASE:
bridge-v2.6.2

PRIORITY VARIANT:
bridge-v2.6.2-live-priority-v1

Nguyên tắc:

1. Không sửa predict.js.
2. Lưu ranking gốc V2.6.2.
3. Chấm kết quả kỳ trước.
4. Xác định bridgeKey đã HIT kỳ trước.
5. Nếu bridgeKey đó vẫn xuất hiện trong suggestions
   của kỳ mới => đưa lên đầu.
6. Không hồi sinh cầu đã bị V2.6.2 loại.
7. Lưu BASE và PRIORITY riêng biệt.
8. prediction_daily sử dụng PRIORITY Top2 để theo dõi.
9. Snapshot đã lưu không được thay đổi.
========================================================
*/

const BASE_MODEL =
  "bridge-v2.6.2";

const PRIORITY_MODEL =
  "bridge-v2.6.2-live-priority-v1";

const MAX_TRACK =
  12;


/*
========================================================
JSON
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
TABLES
========================================================
*/

async function ensureTables(db) {

  /*
  ================================================
  BASE V2.6.2
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
  LIVE PRIORITY VARIANT
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
LOTTERY RESULT
========================================================
*/

function prizeTokens(value) {
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


  const result =
    new Set();


  for (
    const field
    of fields
  ) {

    const tokens =
      prizeTokens(
        row[field]
      );


    for (
      const token
      of tokens
    ) {

      result.add(
        token
          .padStart(2, "0")
          .slice(-2)
      );
    }
  }


  return [
    ...result
  ]
    .sort();
}


/*
========================================================
RANDOM BASELINE
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
NORMALIZE SUGGESTION
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
      Number(item.streak) || 0,

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
      item.strength ?? null
  };
}


/*
========================================================
READ RECOMMENDATIONS
========================================================
*/

function readRecommendations(text) {

  try {

    const payload =
      JSON.parse(
        text || "[]"
      );


    if (
      Array.isArray(payload)
    ) {
      return payload;
    }


    if (
      Array.isArray(
        payload?.recommendations
      )
    ) {

      return payload
        .recommendations;
    }


    return [];

  }
  catch {

    return [];
  }
}


/*
========================================================
GET ACTUAL RESULT
========================================================
*/

async function getResult(
  db,
  date
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
    .bind(date)
    .first();
}


/*
========================================================
EVALUATE BASE
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


  let evaluatedNow =
    0;


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


    if (
      !actualNumbers.length
    ) {
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


    const top1Hit =
      top1.some(
        item =>
          item.hit
      )
        ?
        1
        :
        0;


    const top3Hit =
      top3.some(
        item =>
          item.hit
      )
        ?
        1
        :
        0;


    const top5Hit =
      top5.some(
        item =>
          item.hit
      )
        ?
        1
        :
        0;


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

        top1Hit,
        top3Hit,
        top5Hit,

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
EVALUATE PRIORITY
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


  let evaluatedNow =
    0;


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


    if (
      !actualNumbers.length
    ) {
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
========================================================
*/

async function getPreviousHitContext(
  db,
  sourceDate
) {

  const row =
    await db
      .prepare(`
        SELECT
          prediction_date,
          evaluated_at,
          evaluation_json

        FROM prediction_tracking

        WHERE
          prediction_date = ?
          AND model = ?
          AND evaluated_at IS NOT NULL

        LIMIT 1
      `)
      .bind(
        sourceDate,
        BASE_MODEL
      )
      .first();


  if (!row) {

    return {
      available: false,

      predictionDate:
        sourceDate,

      hitBridgeKeys:
        new Set(),

      hits: []
    };
  }


  try {

    const evaluation =
      JSON.parse(
        row.evaluation_json ||
        "{}"
      );


    const recommendations =
      Array.isArray(
        evaluation
          ?.recommendations
      )
        ?
        evaluation.recommendations
        :
        [];


    const hits =
      recommendations
        .filter(
          item =>
            item.hit === true
            &&
            item.bridgeKey
        );


    const hitBridgeKeys =
      new Set(
        hits.map(
          item =>
            item.bridgeKey
        )
      );


    return {
      available: true,

      predictionDate:
        row.prediction_date,

      evaluatedAt:
        row.evaluated_at,

      hitBridgeKeys,

      hits:
        hits.map(
          item => ({

            baseRank:
              item.baseRank ??
              item.rank,

            number:
              item.number,

            bridgeKey:
              item.bridgeKey,

            bridge:
              item.bridge
          })
        )
    };

  }
  catch {

    return {
      available: false,

      predictionDate:
        sourceDate,

      hitBridgeKeys:
        new Set(),

      hits: []
    };
  }
}


/*
========================================================
BUILD LIVE PRIORITY
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


  const enriched =
    baseRecommendations
      .map(
        (
          item,
          index
        ) => {

          const baseRank =
            index + 1;


          const hitPreviousDay =
            Boolean(
              item.bridgeKey
              &&
              hitKeys.has(
                item.bridgeKey
              )
            );


          return {
            ...item,

            rank:
              baseRank,

            baseRank,

            livePriority:
              hitPreviousDay,

            priorityReason:
              hitPreviousDay
                ?
                "previous-day-bridge-hit"
                :
                null,

            previousHitDate:
              hitPreviousDay
                ?
                previousContext
                  .predictionDate
                :
                null
          };
        }
      );


  /*
  ================================================
  RULE:

  cầu HIT hôm trước lên đầu.

  Nếu nhiều cầu cùng HIT:
  giữ thứ tự baseRank V2.6.2.

  Các cầu còn lại:
  giữ nguyên baseRank.

  Không thay score.
  Không sửa strength.
  ================================================
  */

  enriched.sort(
    (
      a,
      b
    ) => {

      const priorityDiff =
        Number(
          b.livePriority
        )
        -
        Number(
          a.livePriority
        );


      if (
        priorityDiff !== 0
      ) {
        return priorityDiff;
      }


      return (
        a.baseRank -
        b.baseRank
      );
    }
  );


  return enriched.map(
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
SNAPSHOT HELPERS
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
SAVE BASE
========================================================
*/

async function saveBaseSnapshot(
  db,
  predict,
  recommendations
) {

  const predictionDate =
    predict.predictionDate;


  let existing =
    await getBaseSnapshot(
      db,
      predictionDate
    );


  if (existing) {

    return {
      savedNew: false,

      snapshot:
        existing
    };
  }


  /*
  Không tạo snapshot sau khi
  target đã có kết quả.
  */

  const target =
    await getResult(
      db,
      predictionDate
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

      activeCandidateCount:
        predict.activeCandidateCount,

      qualifiedCount:
        predict.qualifiedCount,

      recommendationCount:
        predict.recommendationCount,

      rule:
        predict.rule,

      rejected:
        predict.rejected,

      counts:
        predict.counts
    },

    recommendations
  };


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


  existing =
    await getBaseSnapshot(
      db,
      predictionDate
    );


  return {
    savedNew: true,

    snapshot:
      existing
  };
}


/*
========================================================
SAVE PRIORITY
========================================================
*/

async function savePrioritySnapshot(
  db,
  predict,
  recommendations
) {

  const predictionDate =
    predict.predictionDate;


  let existing =
    await getPrioritySnapshot(
      db,
      predictionDate
    );


  if (existing) {

    return {
      savedNew: false,

      snapshot:
        existing
    };
  }


  const target =
    await getResult(
      db,
      predictionDate
    );


  /*
  Không tạo priority retrospectively.
  */

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

    baseModel:
      BASE_MODEL,

    variant:
      PRIORITY_MODEL,

    rule: {
      name:
        "previous-day-bridge-hit",

      description:
        "Ưu tiên bridgeKey đã HIT ở kỳ liền trước nếu bridgeKey đó vẫn vượt bộ lọc V2.6.2 ở kỳ hiện tại.",

      resurrectRejectedBridge:
        false,

      modifyBaseScore:
        false
    },

    recommendations
  };


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
  prediction_daily

  Đây là dàn thực tế dùng để theo dõi.

  TOP2 lấy theo LIVE PRIORITY.
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


  existing =
    await getPrioritySnapshot(
      db,
      predictionDate
    );


  return {
    savedNew: true,

    snapshot:
      existing
  };
}


/*
========================================================
PERFORMANCE
========================================================
*/

async function performanceBase(db) {

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


  return buildPerformance(
    row
  );
}


async function performancePriority(db) {

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


  return buildPerformance(
    row
  );
}


function buildPerformance(row) {

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


    const rate =
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
          rate
        ),

      baseline,

      lift:
        round2(
          rate -
          baseline
        )
    };
  }


  return {

    tested,

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
MAIN
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
        "Không tìm thấy DB binding"
      );
    }


    await ensureTables(
      db
    );


    /*
    ================================================
    STEP 1
    Chấm prediction cũ.
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
    STEP 2
    Lấy V2.6.2 hiện tại.
    ================================================
    */

    const origin =
      new URL(
        context.request.url
      )
        .origin;


    const response =
      await fetch(
        `${origin}/api/predict?top=12&t=${Date.now()}`,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );


    if (!response.ok) {

      throw new Error(
        `Predict API HTTP ${response.status}`
      );
    }


    const predict =
      await response.json();


    if (!predict?.success) {

      throw new Error(
        predict?.message ||
        "Predict API thất bại"
      );
    }


    if (
      predict.version !==
      BASE_MODEL
    ) {

      return json(
        {
          success: false,

          message:
            "Predict API không phải bridge-v2.6.2",

          actualVersion:
            predict.version
        },
        409
      );
    }


    if (
      !predict.sourceDate ||
      !predict.predictionDate
    ) {

      throw new Error(
        "Predict API thiếu sourceDate/predictionDate"
      );
    }


    /*
    ================================================
    STEP 3
    BASE RECOMMENDATIONS
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

      throw new Error(
        "V2.6.2 không có suggestions"
      );
    }


    const baseRecommendations =
      sourceSuggestions
        .slice(
          0,
          MAX_TRACK
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


    /*
    ================================================
    STEP 4
    CẦU NÀO HIT Ở sourceDate?
    ================================================
    */

    const previousContext =
      await getPreviousHitContext(
        db,
        predict.sourceDate
      );


    /*
    ================================================
    STEP 5
    BUILD LIVE PRIORITY
    ================================================
    */

    const priorityRecommendations =
      buildPriorityRanking(
        baseRecommendations,
        previousContext
      );


    /*
    ================================================
    STEP 6
    LOCK BASE
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
    STEP 7
    LOCK PRIORITY
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
    RESPONSE HELPERS
    ================================================
    */

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

            bridgeKey:
              item.bridgeKey,

            bridge:
              item.bridge,

            previousHitDate:
              item.previousHitDate,

            baseRank:
              item.baseRank,

            liveRank:
              item.liveRank,

            currentNumber:
              item.number,

            score:
              item.score,

            strength:
              item.strength
          })
        );


    /*
    ================================================
    PERFORMANCE COMPARISON
    ================================================
    */

    const basePerformance =
      await performanceBase(
        db
      );


    const priorityPerformance =
      await performancePriority(
        db
      );


    /*
    ================================================
    OUTPUT
    ================================================
    */

    return json({

      success: true,

      module:
        "v2.6.2-live-validation-priority",

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
          previousContext
            .predictionDate,

        hits:
          previousContext.hits
      },


      basePrediction: {

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
          )
      },


      priorityPrediction: {

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

        promoted
      },


      comparison: {

        base:
          basePerformance,

        livePriority:
          priorityPerformance
      },


      rule: {

        priority:
          "previous-day-bridge-hit",

        sameBridgeKeyRequired:
          true,

        bridgeMustStillQualifyV262:
          true,

        resurrectRejectedBridge:
          false,

        modifyBaseScore:
          false,

        modifyPredictJs:
          false
      }
    });

  }
  catch (
    error
  ) {

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