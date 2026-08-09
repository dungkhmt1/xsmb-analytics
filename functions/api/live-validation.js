/*
========================================================
XSMB LIVE VALIDATION READ API
/api/live-validation
V2.7 AB-BA
========================================================

READ ONLY.

Hiển thị:
- Các cặp AB-BA đã được khóa.
- Pair nào HIT (AB hoặc BA đều tính HIT).
- Số thực tế đã HIT trong pair.
- Bridge đã HIT -> cặp ưu tiên kỳ tiếp theo.
========================================================
*/

const BASE_MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const CARRY_MODEL =
  "bridge-v2.7-abba-live-priority-v1";

const VERSION =
  "live-validation-abba-v2.7";


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


function reverseNumber(value) {
  const number =
    normalizeNumber(
      value
    );

  if (!number) {
    return null;
  }

  return `${number[1]}${number[0]}`;
}


function safeJSON(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  }
  catch {
    return fallback;
  }
}


function pairNumbers(
  number,
  reverse,
  pairJson = null
) {
  const parsed =
    safeJSON(
      pairJson,
      null
    );

  if (
    Array.isArray(parsed) &&
    parsed.length
  ) {
    return [
      ...new Set(
        parsed
          .map(normalizeNumber)
          .filter(Boolean)
      )
    ];
  }

  const a =
    normalizeNumber(
      number
    );

  if (!a) {
    return [];
  }

  const b =
    normalizeNumber(
      reverse
    )
    ||
    reverseNumber(a);

  return a === b
    ? [a]
    : [a, b];
}


function pairText(numbers) {
  if (!numbers.length) {
    return "--";
  }

  return numbers.length === 1
    ? numbers[0]
    : `${numbers[0]}-${numbers[1]}`;
}


function splitNumbers(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[\s,;|]+/)
    .map(normalizeNumber)
    .filter(Boolean);
}


async function getEvidence(
  db,
  predictionDate
) {
  const response =
    await db
      .prepare(`
        SELECT
          bridge_key,
          bridge,
          number,
          reverse_number,
          pair_key,
          pair_json,
          base_rank,
          hit,
          hit_number,
          hit_count,
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


async function buildBaseDay(
  db,
  row
) {
  const recommendations =
    safeJSON(
      row.recommendations_json,
      []
    );

  const evidence =
    await getEvidence(
      db,
      row.prediction_date
    );

  const byBridge =
    new Map();

  for (const item of evidence) {
    byBridge.set(
      item.bridge_key,
      item
    );
  }


  const evaluated =
    Array.isArray(
      recommendations
    )
      ? recommendations
          .map(
            (
              item,
              index
            ) => {
              const ev =
                byBridge.get(
                  item.bridgeKey
                );

              const pair =
                pairNumbers(
                  item.number,
                  item.reverseNumber,
                  JSON.stringify(
                    item.pairNumbers ||
                    []
                  )
                );

              return {
                rank:
                  Number(
                    item.baseRank ||
                    item.rank ||
                    index + 1
                  ),

                number:
                  item.number,

                reverseNumber:
                  item.reverseNumber,

                pairNumbers:
                  pair,

                pair:
                  pairText(
                    pair
                  ),

                pairKey:
                  item.pairKey,

                bridgeKey:
                  item.bridgeKey,

                bridge:
                  item.bridge,

                score:
                  Number(
                    item.pairScore ||
                    item.score ||
                    0
                  ),

                strength:
                  item.strength ||
                  null,

                hit:
                  Boolean(
                    Number(
                      ev?.hit || 0
                    )
                  ),

                hitNumber:
                  ev?.hit_number ||
                  null,

                hitCount:
                  Number(
                    ev?.hit_count || 0
                  )
              };
            }
          )
          .filter(
            item =>
              item.pairNumbers.length
          )
      : [];


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

    actualNumbers:
      splitNumbers(
        row.actual_numbers
      ),

    predictionNumbers:
      evaluated.map(
        item =>
          item.pair
      ),

    predictions:
      evaluated,

    hitCount:
      hits.length,

    hits,

    top1Hit:
      Boolean(
        Number(
          row.top1_hit
        )
      ),

    top3Hit:
      Boolean(
        Number(
          row.top3_hit
        )
      ),

    top5Hit:
      Boolean(
        Number(
          row.top5_hit
        )
      ),

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at,

    evaluated:
      Boolean(
        Number(
          row.evaluated
        )
      )
  };
}


async function getRecentBase(
  db
) {
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
          top1_hit,
          top3_hit,
          top5_hit

        FROM prediction_live_v262

        WHERE model = ?

        ORDER BY
          prediction_date DESC

        LIMIT 10
      `)
      .bind(
        BASE_MODEL
      )
      .all();

  return Promise.all(
    (response.results || [])
      .map(
        row =>
          buildBaseDay(
            db,
            row
          )
      )
  );
}


async function getCurrentCarry(
  db
) {
  const latest =
    await db
      .prepare(`
        SELECT prediction_date
        FROM prediction_carry_v262

        WHERE model = ?

        ORDER BY
          prediction_date DESC

        LIMIT 1
      `)
      .bind(
        CARRY_MODEL
      )
      .first();

  if (
    !latest?.prediction_date
  ) {
    return null;
  }


  const response =
    await db
      .prepare(`
        SELECT *
        FROM prediction_carry_v262

        WHERE model = ?
          AND prediction_date = ?

        ORDER BY
          CASE
            WHEN carry_status = 'ACTIVE'
            THEN 0

            WHEN carry_status = 'SHADOW'
            THEN 1

            ELSE 2
          END,

          COALESCE(
            current_rank,
            9999
          ) ASC,

          COALESCE(
            current_score,
            0
          ) DESC
      `)
      .bind(
        CARRY_MODEL,
        latest.prediction_date
      )
      .all();


  const rows =
    response.results || [];


  const promoted =
    rows
      .filter(
        row =>
          row.current_number
      )
      .map(
        (
          row,
          index
        ) => {
          const previousPair =
            pairNumbers(
              row.previous_number,
              row.previous_reverse_number
            );

          const currentPair =
            pairNumbers(
              row.current_number,
              row.current_reverse_number
            );

          const evaluated =
            Boolean(
              Number(
                row.evaluated
              )
            );

          const hit =
            evaluated
              ? Boolean(
                  Number(
                    row.hit
                  )
                )
              : null;

          return {
            liveRank:
              Number(
                row.current_rank
              )
              ||
              index + 1,

            previousNumber:
              normalizeNumber(
                row.previous_number
              ),

            previousReverseNumber:
              normalizeNumber(
                row.previous_reverse_number
              ),

            previousPairNumbers:
              previousPair,

            previousPair:
              pairText(
                previousPair
              ),

            previousHitDate:
              row.previous_prediction_date,

            previousHitNumber:
              row.previous_hit_number ||
              null,

            currentNumber:
              normalizeNumber(
                row.current_number
              ),

            currentReverseNumber:
              normalizeNumber(
                row.current_reverse_number
              ),

            currentPairNumbers:
              currentPair,

            currentPair:
              pairText(
                currentPair
              ),

            bridgeKey:
              row.bridge_key,

            bridge:
              row.bridge,

            carryStatus:
              row.carry_status,

            currentBaseQualified:
              row.carry_status ===
              "ACTIVE",

            currentBaseNumberMatch:
              row.carry_status ===
              "ACTIVE",

            previousScore:
              Number(
                row.previous_score || 0
              ),

            currentScore:
              Number(
                row.current_score || 0
              ),

            hit,

            status:
              !evaluated
                ? "pending"
                : hit
                  ? "hit"
                  : "miss",

            history: [
              {
                date:
                  row.previous_prediction_date,

                number:
                  pairText(
                    previousPair
                  ),

                status:
                  "hit",

                hitNumber:
                  row.previous_hit_number ||
                  null
              },

              {
                date:
                  row.prediction_date,

                number:
                  pairText(
                    currentPair
                  ),

                status:
                  !evaluated
                    ? "pending"
                    : hit
                      ? "hit"
                      : "miss"
              }
            ]
          };
        }
      );


  const allEvaluated =
    rows.length > 0 &&
    rows.every(
      row =>
        Boolean(
          Number(
            row.evaluated
          )
        )
    );


  return {
    sourceDate:
      rows[0]?.source_date ||
      null,

    predictionDate:
      latest.prediction_date,

    numbers:
      promoted.map(
        item =>
          item.currentPair
      ),

    top1:
      promoted
        .slice(0, 1)
        .map(
          item =>
            item.currentPair
        ),

    top3:
      promoted
        .slice(0, 3)
        .map(
          item =>
            item.currentPair
        ),

    top5:
      promoted
        .slice(0, 5)
        .map(
          item =>
            item.currentPair
        ),

    promotedCount:
      promoted.length,

    promoted,

    hasResult:
      allEvaluated,

    status:
      allEvaluated
        ? "completed"
        : "pending",

    createdAt:
      rows[0]?.created_at ||
      null,

    evaluatedAt:
      allEvaluated
        ? rows.find(
            row =>
              row.evaluated_at
          )
            ?.evaluated_at
          ||
          null
        : null
  };
}


async function getPerformance(
  db
) {
  const base =
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
          ) AS top5_hits

        FROM prediction_live_v262

        WHERE model = ?
      `)
      .bind(
        BASE_MODEL
      )
      .first();


  const carry =
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
      .bind(
        CARRY_MODEL
      )
      .first();


  function metric(
    hits,
    tested
  ) {
    const h =
      Number(
        hits || 0
      );

    const t =
      Number(
        tested || 0
      );

    return {
      hits:
        h,

      tested:
        t,

      hitRate:
        t
          ? Number(
              (
                h /
                t *
                100
              )
                .toFixed(2)
            )
          : 0
    };
  }


  const baseTested =
    Number(
      base?.tested || 0
    );


  const carryTested =
    Number(
      carry?.tested || 0
    );


  return {
    base: {
      totalTracked:
        Number(
          base?.total || 0
        ),

      tested:
        baseTested,

      pending:
        Math.max(
          0,
          Number(
            base?.total || 0
          )
          -
          baseTested
        ),

      top1:
        metric(
          base?.top1_hits,
          baseTested
        ),

      top3:
        metric(
          base?.top3_hits,
          baseTested
        ),

      top5:
        metric(
          base?.top5_hits,
          baseTested
        )
    },

    carry: {
      totalTracked:
        Number(
          carry?.total || 0
        ),

      tested:
        carryTested,

      pending:
        Math.max(
          0,
          Number(
            carry?.total || 0
          )
          -
          carryTested
        ),

      top1:
        metric(
          carry?.hits,
          carryTested
        ),

      top3:
        metric(
          carry?.hits,
          carryTested
        ),

      top5:
        metric(
          carry?.hits,
          carryTested
        )
    }
  };
}


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
      performance
    ] =
      await Promise.all([
        getRecentBase(
          db
        ),

        getCurrentCarry(
          db
        ),

        getPerformance(
          db
        )
      ]);


    const completed =
      recentBase.filter(
        item =>
          item.evaluated
      );


    return json({
      success: true,

      module:
        "live-validation-read",

      version:
        VERSION,

      suggestionMode:
        "AB-BA",

      baseModel:
        BASE_MODEL,

      carryModel:
        CARRY_MODEL,

      lastCompleted:
        completed[0] ||
        null,

      lastHit:
        completed.find(
          item =>
            item.hitCount > 0
        )
        ||
        null,

      currentCarry,

      recentBase,

      performance
    });
  }
  catch (error) {
    console.error(
      "live-validation ABBA:",
      error
    );

    return json(
      {
        success: false,
        message:
          error?.message ||
          "Không đọc được Live Validation AB-BA"
      },
      500
    );
  }
}
