/*
========================================================
XSMB LIVE VALIDATION READ API
/api/live-validation

V2.6.3 - READ ONLY

Đọc trực tiếp hệ thống Live mới:
- prediction_live_v262
- prediction_bridge_evidence
- prediction_carry_v262

Mục tiêu:
1. Hiển thị BASE gần nhất đã có kết quả.
2. Xác định tất cả số gợi ý đã HIT.
3. Hiển thị các bridge HIT làm "ưu tiên carry" cho kỳ kế tiếp.
4. Không tự tạo prediction trong endpoint READ này.
========================================================
*/

const BASE_MODEL = "bridge-v2.6.2";
const CARRY_MODEL = "bridge-v2.6.2-live-priority-v2";
const VERSION = "live-validation-ui-v2.6.3";


function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}


function round2(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.round(n * 100) / 100
    : 0;
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


function safeJSON(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}


function splitNumbers(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map(normalizeNumber)
      .filter(Boolean);
  }

  return String(value)
    .split(/[\s,;|]+/)
    .map(normalizeNumber)
    .filter(Boolean);
}


/*
========================================================
BASE HISTORY
========================================================
*/

async function getRecentBase(db) {
  const response =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
          numbers,
          recommendations_json,
          created_at,
          evaluated,
          evaluated_at,
          actual_numbers,
          actual_unique_count,
          top1_hit,
          top3_hit,
          top5_hit,
          baseline_top1,
          baseline_top3,
          baseline_top5
        FROM prediction_live_v262
        WHERE model = ?
        ORDER BY prediction_date DESC
        LIMIT 10
      `)
      .bind(BASE_MODEL)
      .all();

  const rows = response.results || [];

  return Promise.all(
    rows.map(row => buildBaseDay(db, row))
  );
}


async function getEvidenceForDay(db, predictionDate) {
  const response =
    await db
      .prepare(`
        SELECT
          bridge_key,
          bridge,
          number,
          base_rank,
          hit,
          score,
          strength
        FROM prediction_bridge_evidence
        WHERE prediction_date = ?
          AND model = ?
        ORDER BY
          base_rank ASC,
          score DESC
      `)
      .bind(
        predictionDate,
        BASE_MODEL
      )
      .all();

  return response.results || [];
}


async function buildBaseDay(db, row) {
  const recommendations =
    safeJSON(
      row.recommendations_json,
      []
    );

  const evidence =
    await getEvidenceForDay(
      db,
      row.prediction_date
    );

  const evidenceByKey =
    new Map(
      evidence.map(item => [
        `${item.bridge_key}|${normalizeNumber(item.number)}`,
        item
      ])
    );

  const evaluatedRecommendations =
    Array.isArray(recommendations)
      ? recommendations
          .map((item, index) => {
            const number =
              normalizeNumber(
                item?.number
              );

            if (!number) {
              return null;
            }

            const bridgeKey =
              item.bridgeKey ||
              item.ruleKey ||
              null;

            const evidenceRow =
              bridgeKey
                ? evidenceByKey.get(
                    `${bridgeKey}|${number}`
                  )
                : null;

            return {
              rank:
                Number(
                  item.baseRank ??
                  item.rank ??
                  index + 1
                ),

              number,

              bridgeKey,

              bridge:
                item.bridge ??
                item.rule ??
                evidenceRow?.bridge ??
                null,

              positionA:
                item.positionA ?? null,

              positionB:
                item.positionB ?? null,

              direction:
                item.direction ?? null,

              score:
                item.score ??
                evidenceRow?.score ??
                null,

              strength:
                item.strength ??
                evidenceRow?.strength ??
                null,

              hit:
                Boolean(
                  evidenceRow?.hit
                )
            };
          })
          .filter(Boolean)
      : [];

  const hits =
    evaluatedRecommendations.filter(
      item => item.hit
    );

  return {
    date:
      row.prediction_date,

    sourceDate:
      row.source_date,

    actualNumbers:
      splitNumbers(
        row.actual_numbers
      ),

    predictionNumbers:
      evaluatedRecommendations.length
        ? evaluatedRecommendations.map(x => x.number)
        : splitNumbers(row.numbers),

    hitCount:
      hits.length,

    hits,

    top1Hit:
      Boolean(
        Number(row.top1_hit)
      ),

    top3Hit:
      Boolean(
        Number(row.top3_hit)
      ),

    top5Hit:
      Boolean(
        Number(row.top5_hit)
      ),

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at,

    evaluated:
      Boolean(
        Number(row.evaluated)
      )
  };
}


/*
========================================================
CURRENT CARRY / GỢI Ý ƯU TIÊN

Mỗi bridge đã HIT ở ngày trước được lưu tại
prediction_carry_v262 cho prediction_date hiện tại.
========================================================
*/

async function getLatestCarryDate(db) {
  const row =
    await db
      .prepare(`
        SELECT prediction_date
        FROM prediction_carry_v262
        WHERE model = ?
        ORDER BY prediction_date DESC
        LIMIT 1
      `)
      .bind(CARRY_MODEL)
      .first();

  return row?.prediction_date || null;
}


async function getCurrentCarry(db) {
  const predictionDate =
    await getLatestCarryDate(db);

  if (!predictionDate) {
    return null;
  }

  const response =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
          previous_prediction_date,

          bridge_key,
          bridge,

          previous_number,
          previous_rank,

          current_number,
          current_rank,

          carry_status,

          previous_score,
          current_score,

          previous_strength,
          current_strength,

          hit,
          evaluated,
          evaluated_at,

          created_at
        FROM prediction_carry_v262
        WHERE model = ?
          AND prediction_date = ?
        ORDER BY
          CASE
            WHEN carry_status = 'ACTIVE' THEN 0
            WHEN carry_status = 'SHADOW' THEN 1
            ELSE 2
          END,
          COALESCE(current_rank, 9999) ASC,
          COALESCE(current_score, 0) DESC
      `)
      .bind(
        CARRY_MODEL,
        predictionDate
      )
      .all();

  const rows =
    response.results || [];

  if (!rows.length) {
    return null;
  }

  const promoted =
    rows
      .filter(
        row =>
          row.current_number
      )
      .map(
        (row, index) => {
          const evaluated =
            Boolean(
              Number(row.evaluated)
            );

          const hit =
            evaluated
              ? Boolean(
                  Number(row.hit)
                )
              : null;

          return {
            liveRank:
              Number(
                row.current_rank
              ) ||
              index + 1,

            currentNumber:
              normalizeNumber(
                row.current_number
              ),

            previousNumber:
              normalizeNumber(
                row.previous_number
              ),

            previousHitDate:
              row.previous_prediction_date,

            bridgeKey:
              row.bridge_key,

            bridge:
              row.bridge,

            positionA:
              null,

            positionB:
              null,

            direction:
              null,

            carryStatus:
              row.carry_status,

            carryHitStreak:
              1,

            currentBaseQualified:
              row.carry_status ===
              "ACTIVE",

            currentBaseNumberMatch:
              row.carry_status ===
              "ACTIVE",

            previousScore:
              round2(
                row.previous_score
              ),

            currentScore:
              round2(
                row.current_score
              ),

            previousStrength:
              row.previous_strength,

            currentStrength:
              row.current_strength,

            hit,

            status:
              !evaluated
                ? "pending"
                : hit
                  ? "hit"
                  : "miss",

            createdAt:
              row.created_at,

            evaluatedAt:
              row.evaluated_at
          };
        }
      );

  const numbers =
    promoted
      .map(item => item.currentNumber)
      .filter(Boolean);

  const allEvaluated =
    rows.length > 0 &&
    rows.every(
      row =>
        Boolean(
          Number(row.evaluated)
        )
    );

  return {
    sourceDate:
      rows[0].source_date,

    predictionDate,

    numbers,

    top1:
      numbers.slice(0, 1),

    top3:
      numbers.slice(0, 3),

    top5:
      numbers.slice(0, 5),

    promotedCount:
      promoted.length,

    promoted,

    hasResult:
      allEvaluated,

    actualNumbers:
      [],

    status:
      allEvaluated
        ? "completed"
        : "pending",

    createdAt:
      rows[0].created_at,

    evaluatedAt:
      allEvaluated
        ? rows.find(x => x.evaluated_at)?.evaluated_at || null
        : null
  };
}


/*
========================================================
PERFORMANCE
========================================================
*/

async function getBasePerformance(db) {
  const row =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS total,

          SUM(
            CASE
              WHEN evaluated = 1
              THEN 1
              ELSE 0
            END
          ) AS tested,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated = 1
                THEN top1_hit
                ELSE 0
              END
            ),
            0
          ) AS top1_hits,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated = 1
                THEN top3_hit
                ELSE 0
              END
            ),
            0
          ) AS top3_hits,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated = 1
                THEN top5_hit
                ELSE 0
              END
            ),
            0
          ) AS top5_hits,

          AVG(
            CASE
              WHEN evaluated = 1
              THEN baseline_top1
            END
          ) AS baseline_top1,

          AVG(
            CASE
              WHEN evaluated = 1
              THEN baseline_top3
            END
          ) AS baseline_top3,

          AVG(
            CASE
              WHEN evaluated = 1
              THEN baseline_top5
            END
          ) AS baseline_top5

        FROM prediction_live_v262
        WHERE model = ?
      `)
      .bind(BASE_MODEL)
      .first();

  const total =
    Number(row?.total || 0);

  const tested =
    Number(row?.tested || 0);

  const metric =
    (
      hitsValue,
      baselineValue
    ) => {
      const hits =
        Number(
          hitsValue || 0
        );

      const hitRate =
        tested
          ? hits / tested * 100
          : 0;

      const baseline =
        Number(
          baselineValue || 0
        );

      return {
        hits,
        tested,
        hitRate:
          round2(hitRate),
        baseline:
          round2(baseline),
        lift:
          round2(
            hitRate - baseline
          )
      };
    };

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


async function getCarryPerformance(db) {
  const row =
    await db
      .prepare(`
        SELECT

          COUNT(*) AS total,

          SUM(
            CASE
              WHEN evaluated = 1
              THEN 1
              ELSE 0
            END
          ) AS tested,

          COALESCE(
            SUM(
              CASE
                WHEN evaluated = 1
                 AND hit = 1
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS hits

        FROM prediction_carry_v262
        WHERE model = ?
          AND current_number IS NOT NULL
      `)
      .bind(CARRY_MODEL)
      .first();

  const total =
    Number(row?.total || 0);

  const tested =
    Number(row?.tested || 0);

  const hits =
    Number(row?.hits || 0);

  const hitRate =
    tested
      ? hits / tested * 100
      : 0;

  return {
    totalTracked:
      total,

    tested,

    pending:
      Math.max(
        0,
        total - tested
      ),

    top1: {
      hits,
      tested,
      hitRate:
        round2(hitRate),
      baseline:
        0,
      lift:
        round2(hitRate)
    },

    top3: {
      hits,
      tested,
      hitRate:
        round2(hitRate),
      baseline:
        0,
      lift:
        round2(hitRate)
    },

    top5: {
      hits,
      tested,
      hitRate:
        round2(hitRate),
      baseline:
        0,
      lift:
        round2(hitRate)
    }
  };
}


/*
========================================================
MAIN
========================================================
*/

export async function onRequestGet(context) {
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
        getRecentBase(db),
        getCurrentCarry(db),
        getBasePerformance(db),
        getCarryPerformance(db)
      ]);

    const completed =
      recentBase.filter(
        day =>
          day.evaluated
      );

    const lastCompleted =
      completed[0] ||
      null;

    const lastHit =
      completed.find(
        day =>
          day.hitCount > 0
      ) ||
      null;

    return json({
      success: true,

      module:
        "live-validation-read",

      version:
        VERSION,

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
