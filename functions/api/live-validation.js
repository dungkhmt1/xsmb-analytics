/*
========================================================
XSMB LIVE VALIDATION READ API
/api/live-validation
========================================================

READ ONLY

Hiển thị:
- Kỳ BASE V2.6.2 gần nhất đã có kết quả
- Cầu nào HIT
- Carry hiện tại
- Số trước -> số Carry mới
- Carry streak
- Hiệu quả BASE / CARRY
========================================================
*/

const BASE_MODEL =
  "bridge-v2.6.2";

const CARRY_MODEL =
  "bridge-v2.6.2-live-priority-carry-v2";


function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate"
    }
  });
}


function round2(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(n * 100) / 100;
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


function parseJSON(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}


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

  const set =
    new Set();


  for (const field of fields) {

    const values =
      prizeTokens(
        row?.[field]
      );


    for (const value of values) {

      set.add(
        value
          .padStart(2, "0")
          .slice(-2)
      );
    }
  }


  return [
    ...set
  ].sort();
}


function readRecommendations(value) {
  const payload =
    parseJSON(
      value,
      []
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
    return payload.recommendations;
  }


  return [];
}


/*
========================================================
BASE COMPLETED HISTORY
========================================================
*/

async function getRecentBase(
  db
) {

  const response =
    await db
      .prepare(`
        SELECT

          p.prediction_date,
          p.source_date,
          p.numbers,
          p.recommendations_json,
          p.created_at,
          p.evaluated_at,

          p.top1_hit,
          p.top3_hit,
          p.top5_hit,

          r.draw_date AS result_date,

          r.special,
          r.g1,
          r.g2,
          r.g3,
          r.g4,
          r.g5,
          r.g6,
          r.g7

        FROM prediction_tracking p

        INNER JOIN results r
          ON r.draw_date =
             p.prediction_date

        WHERE p.model = ?

        ORDER BY
          p.prediction_date DESC

        LIMIT 10
      `)
      .bind(
        BASE_MODEL
      )
      .all();


  const rows =
    response.results || [];


  return rows.map(
    row =>
      buildBaseDay(
        row
      )
  );
}


function buildBaseDay(row) {

  const actualNumbers =
    extractUniqueLoto(
      row
    );


  const actualSet =
    new Set(
      actualNumbers
    );


  const recommendations =
    readRecommendations(
      row.recommendations_json
    )
      .filter(
        item =>
          item?.number
      )
      .sort(
        (
          a,
          b
        ) =>

          Number(
            a.baseRank ??
            a.rank ??
            9999
          )

          -

          Number(
            b.baseRank ??
            b.rank ??
            9999
          )
      );


  const evaluated =
    recommendations.map(
      (
        item,
        index
      ) => {

        const number =
          normalizeNumber(
            item.number
          );


        return {

          rank:
            Number(
              item.baseRank ??
              item.rank ??
              index + 1
            ),

          number,

          bridgeKey:
            item.bridgeKey ??
            null,

          bridge:
            item.bridge ??
            null,

          positionA:
            item.positionA ??
            null,

          positionB:
            item.positionB ??
            null,

          direction:
            item.direction ??
            null,

          score:
            item.score ??
            null,

          strength:
            item.strength ??
            null,

          hit:
            number
              ?
              actualSet.has(
                number
              )
              :
              false
        };
      }
    );


  const hits =
    evaluated.filter(
      item =>
        item.hit
    );


  return {

    date:
      row.prediction_date,

    sourceDate:
      row.source_date,

    actualNumbers,

    predictionNumbers:
      recommendations.map(
        item =>
          normalizeNumber(
            item.number
          )
      )
      .filter(Boolean),

    hitCount:
      hits.length,

    hits,

    top1Hit:
      evaluated
        .slice(0, 1)
        .some(x => x.hit),

    top3Hit:
      evaluated
        .slice(0, 3)
        .some(x => x.hit),

    top5Hit:
      evaluated
        .slice(0, 5)
        .some(x => x.hit),

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at
  };
}


/*
========================================================
CURRENT CARRY
========================================================
*/

async function getCurrentCarry(
  db
) {

  const row =
    await db
      .prepare(`
        SELECT

          p.prediction_date,
          p.source_date,
          p.numbers,
          p.recommendations_json,

          p.promoted_count,
          p.promoted_bridge_keys,

          p.created_at,
          p.evaluated_at,

          p.top1_hit,
          p.top3_hit,
          p.top5_hit,

          r.draw_date AS result_date,

          r.special,
          r.g1,
          r.g2,
          r.g3,
          r.g4,
          r.g5,
          r.g6,
          r.g7

        FROM prediction_priority_tracking p

        LEFT JOIN results r
          ON r.draw_date =
             p.prediction_date

        WHERE p.variant = ?

        ORDER BY
          p.prediction_date DESC

        LIMIT 1
      `)
      .bind(
        CARRY_MODEL
      )
      .first();


  if (!row) {
    return null;
  }


  const recommendations =
    readRecommendations(
      row.recommendations_json
    )
      .filter(
        item =>
          item?.number
      )
      .sort(
        (
          a,
          b
        ) =>

          Number(
            a.liveRank ??
            a.rank ??
            9999
          )

          -

          Number(
            b.liveRank ??
            b.rank ??
            9999
          )
      );


  const hasResult =
    Boolean(
      row.result_date
    );


  const actualNumbers =
    hasResult
      ?
      extractUniqueLoto(
        row
      )
      :
      [];


  const actualSet =
    new Set(
      actualNumbers
    );


  const promoted =
    recommendations

      .filter(
        item =>
          item.carryForward === true
      )

      .map(
        item => {

          const sources =
            Array.isArray(
              item.carrySources
            )
              ?
              item.carrySources
              :
              [];


          const primary =
            sources[0] ||
            {};


          const currentNumber =
            normalizeNumber(
              item.number
            );


          const hit =
            hasResult
              ?
              actualSet.has(
                currentNumber
              )
              :
              null;


          return {

            liveRank:
              Number(
                item.liveRank || 0
              ),

            currentNumber,

            previousNumber:
              normalizeNumber(
                item.previousNumber ??
                primary.previousNumber
              ),

            previousHitDate:
              item.previousHitDate ??
              primary.previousHitDate ??
              null,

            bridgeKey:
              primary.bridgeKey ??
              item.bridgeKey ??
              null,

            bridge:
              primary.bridge ??
              item.bridge ??
              null,

            positionA:
              primary.positionA ??
              item.positionA ??
              null,

            positionB:
              primary.positionB ??
              item.positionB ??
              null,

            direction:
              primary.direction ??
              item.direction ??
              null,

            carryHitStreak:
              Number(
                item.carryHitStreak ??
                primary.carryHitStreak ??
                0
              ),

            currentBaseQualified:
              Boolean(
                item.currentBaseQualified
              ),

            currentBaseNumberMatch:
              Boolean(
                item.currentBaseNumberMatch
              ),

            hit,

            status:
              !hasResult
                ?
                "pending"
                :
                hit
                  ?
                  "hit"
                  :
                  "miss"
          };
        }
      );


  return {

    sourceDate:
      row.source_date,

    predictionDate:
      row.prediction_date,

    numbers:
      recommendations.map(
        item =>
          normalizeNumber(
            item.number
          )
      )
      .filter(Boolean),

    top1:
      recommendations
        .slice(0, 1)
        .map(
          item =>
            normalizeNumber(
              item.number
            )
        ),

    top3:
      recommendations
        .slice(0, 3)
        .map(
          item =>
            normalizeNumber(
              item.number
            )
        ),

    top5:
      recommendations
        .slice(0, 5)
        .map(
          item =>
            normalizeNumber(
              item.number
            )
        ),

    promotedCount:
      promoted.length,

    promoted,

    hasResult,

    actualNumbers,

    status:
      hasResult
        ?
        "completed"
        :
        "pending",

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at
  };
}


/*
========================================================
PERFORMANCE
========================================================
*/

async function getPerformance(
  db,
  table,
  modelColumn,
  model
) {

  /*
   * table và modelColumn chỉ được gọi
   * bằng constant nội bộ phía dưới.
   */

  const row =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS total,

          SUM(
            CASE
              WHEN evaluated_at IS NOT NULL
              THEN 1
              ELSE 0
            END
          ) AS tested,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated_at IS NOT NULL
                THEN top1_hit
                ELSE 0
              END
            ),
            0
          ) AS top1_hits,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated_at IS NOT NULL
                THEN top3_hit
                ELSE 0
              END
            ),
            0
          ) AS top3_hits,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated_at IS NOT NULL
                THEN top5_hit
                ELSE 0
              END
            ),
            0
          ) AS top5_hits,

          AVG(
            CASE
              WHEN evaluated_at IS NOT NULL
              THEN baseline_top1
            END
          ) AS baseline_top1,

          AVG(
            CASE
              WHEN evaluated_at IS NOT NULL
              THEN baseline_top3
            END
          ) AS baseline_top3,

          AVG(
            CASE
              WHEN evaluated_at IS NOT NULL
              THEN baseline_top5
            END
          ) AS baseline_top5

        FROM ${table}

        WHERE ${modelColumn} = ?
      `)
      .bind(
        model
      )
      .first();


  const total =
    Number(
      row?.total || 0
    );


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
      Number(
        baselineValue || 0
      );


    return {

      hits,

      tested,

      hitRate:
        round2(
          hitRate
        ),

      baseline:
        round2(
          baseline
        ),

      lift:
        round2(
          hitRate -
          baseline
        )
    };
  }


  return {

    totalTracked:
      total,

    tested,

    pending:
      Math.max(
        0,
        total - tested
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

      return json(
        {
          success: false,
          message:
            "Không tìm thấy D1 binding DB"
        },
        500
      );
    }


    const [
      recentBase,
      currentCarry,
      basePerformance,
      carryPerformance
    ] =
      await Promise.all([

        getRecentBase(
          db
        ),

        getCurrentCarry(
          db
        ),

        getPerformance(
          db,
          "prediction_tracking",
          "model",
          BASE_MODEL
        ),

        getPerformance(
          db,
          "prediction_priority_tracking",
          "variant",
          CARRY_MODEL
        )
      ]);


    const lastCompleted =
      recentBase[0] ||
      null;


    const lastHit =
      recentBase.find(
        day =>
          day.hitCount > 0
      )
      ||
      null;


    return json({

      success: true,

      module:
        "live-validation-read",

      version:
        "live-validation-ui-v1",

      baseModel:
        BASE_MODEL,

      carryModel:
        CARRY_MODEL,

      lastCompleted,

      lastHit,

      currentCarry,

      recentBase,

      performance: {

        base:
          basePerformance,

        carry:
          carryPerformance
      }
    });

  }
  catch (error) {

    console.error(
      "live-validation:",
      error
    );


    return json(
      {
        success: false,

        message:
          error?.message ||
          "Không đọc được Live Validation"
      },
      500
    );
  }
}