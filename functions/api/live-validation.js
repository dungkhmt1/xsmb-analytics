/*
========================================================
XSMB LIVE VALIDATION
/api/live-validation

V2.7.4 - DERIVED FROM AUTO TRACKING

Quan trọng:
- KHÔNG còn phụ thuộc prediction_carry_v262.
- Auto Tracking V2.7.3.x lưu prediction vào prediction_live_v262.
- Predict lưu carryPriority ngay trong recommendations_json.
- LIVE đọc trực tiếp prediction mới nhất + evidence.

Nhờ vậy LIVE tự cập nhật theo tracking-sync.
========================================================
*/

const BASE_MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "live-validation-v2.8-learning";


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
    return JSON.parse(
      value
    );
  }
  catch {
    return fallback;
  }
}


function normalizeNumber(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const digits =
    String(value)
      .replace(
        /\D/g,
        ""
      );

  if (!digits) {
    return null;
  }

  return digits
    .padStart(
      2,
      "0"
    )
    .slice(-2);
}


function reverseNumber(
  value
) {
  const number =
    normalizeNumber(
      value
    );

  if (!number) {
    return null;
  }

  return (
    number[1] +
    number[0]
  );
}


function pairNumbersFromItem(
  item
) {
  if (
    Array.isArray(
      item?.pairNumbers
    ) &&
    item.pairNumbers.length
  ) {
    return [
      ...new Set(
        item.pairNumbers
          .map(
            normalizeNumber
          )
          .filter(Boolean)
      )
    ];
  }


  const a =
    normalizeNumber(
      item?.number
    );

  if (!a) {
    return [];
  }


  const b =
    normalizeNumber(
      item?.reverseNumber
    )
    ||
    reverseNumber(
      a
    );


  return a === b
    ? [a]
    : [a, b];
}


function pairText(
  numbers
) {
  if (!numbers.length) {
    return "--";
  }

  return numbers.length === 1
    ? numbers[0]
    : `${numbers[0]}-${numbers[1]}`;
}


function splitNumbers(
  value
) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(
      /[\s,;|]+/
    )
    .map(
      normalizeNumber
    )
    .filter(Boolean);
}


/* =====================================================
   EVIDENCE / FULL HISTORY
===================================================== */

async function getEvidenceForDay(
  db,
  predictionDate
) {
  const response =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
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
          strength,
          created_at

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


  return (
    response.results ||
    []
  );
}


async function getFullBridgeHistory(
  db,
  bridgeKey
) {
  if (!bridgeKey) {
    return [];
  }


  const response =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
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
          strength,
          created_at

        FROM prediction_bridge_evidence

        WHERE bridge_key = ?
          AND model = ?

        ORDER BY
          prediction_date ASC,
          base_rank ASC,
          score DESC
      `)
      .bind(
        bridgeKey,
        BASE_MODEL
      )
      .all();


  const byDate =
    new Map();


  for (
    const row of
    response.results || []
  ) {
    const pair =
      safeJSON(
        row.pair_json,
        null
      );


    const numbers =
      Array.isArray(pair)
        ? pair
            .map(
              normalizeNumber
            )
            .filter(Boolean)
        : [
            normalizeNumber(
              row.number
            ),

            normalizeNumber(
              row.reverse_number
            )
            ||
            reverseNumber(
              row.number
            )
          ]
            .filter(Boolean);


    if (!numbers.length) {
      continue;
    }


    const item = {
      date:
        row.prediction_date,

      sourceDate:
        row.source_date,

      pairNumbers:
        [
          ...new Set(
            numbers
          )
        ],

      pair:
        pairText(
          [
            ...new Set(
              numbers
            )
          ]
        ),

      number:
        pairText(
          [
            ...new Set(
              numbers
            )
          ]
        ),

      bridgeKey:
        row.bridge_key,

      bridge:
        row.bridge,

      rank:
        Number(
          row.base_rank || 0
        )
        ||
        null,

      score:
        Number(
          row.score || 0
        ),

      strength:
        row.strength ||
        null,

      hit:
        Boolean(
          Number(
            row.hit || 0
          )
        ),

      hitNumber:
        row.hit_number ||
        null,

      hitCount:
        Number(
          row.hit_count || 0
        ),

      status:
        Boolean(
          Number(
            row.hit || 0
          )
        )
          ? "hit"
          : "miss",

      createdAt:
        row.created_at
    };


    const existing =
      byDate.get(
        row.prediction_date
      );


    if (
      !existing ||
      (
        item.rank !== null &&
        (
          existing.rank === null ||
          item.rank <
          existing.rank
        )
      )
    ) {
      byDate.set(
        row.prediction_date,
        item
      );
    }
  }


  return [
    ...byDate.values()
  ]
    .sort(
      (
        a,
        b
      ) =>
        String(
          a.date
        )
          .localeCompare(
            String(
              b.date
            )
          )
    );
}


function historyStats(
  history
) {
  const completed =
    history.filter(
      item =>
        item.status ===
        "hit"
        ||
        item.status ===
        "miss"
    );


  const hits =
    completed.filter(
      item =>
        item.status ===
        "hit"
    ).length;


  const misses =
    completed.length -
    hits;


  const pending =
    history.filter(
      item =>
        item.status ===
        "pending"
    ).length;


  return {
    totalDays:
      history.length,

    completed:
      completed.length,

    hits,

    misses,

    pending,

    hitRate:
      completed.length
        ? Number(
            (
              hits /
              completed.length *
              100
            )
              .toFixed(2)
          )
        : 0
  };
}


/* =====================================================
   BASE DAY
===================================================== */

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
    await getEvidenceForDay(
      db,
      row.prediction_date
    );


  const byBridgeNumber =
    new Map();


  for (
    const item of
    evidence
  ) {
    byBridgeNumber.set(
      `${item.bridge_key}|${normalizeNumber(item.number)}`,
      item
    );
  }


  const predictions =
    Array.isArray(
      recommendations
    )
      ? recommendations
          .map(
            (
              item,
              index
            ) => {
              const pair =
                pairNumbersFromItem(
                  item
                );


              const bridgeKey =
                item.bridgeKey ||
                item.ruleKey ||
                null;


              const number =
                normalizeNumber(
                  item.number
                );


              const ev =
                bridgeKey &&
                number
                  ? byBridgeNumber.get(
                      `${bridgeKey}|${number}`
                    )
                  : null;


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
                        ev?.hit || 0
                      )
                    )
                  : null;


              return {
                rank:
                  Number(
                    item.baseRank ||
                    item.rank ||
                    index + 1
                  ),

                pair:
                  item.pair ||
                  pairText(
                    pair
                  ),

                pairNumbers:
                  pair,

                number:
                  number,

                reverseNumber:
                  pair[1] ||
                  pair[0] ||
                  null,

                bridgeKey,

                bridge:
                  item.bridge ||
                  item.rule ||
                  null,

                score:
                  Number(
                    item.pairScore ||
                    item.score ||
                    0
                  ),

                strength:
                  item.strength ||
                  null,

                carryPriority:
                  Boolean(
                    item.carryPriority
                  ),

                carryReason:
                  item.carryReason ||
                  null,

                previousHitDate:
                  item.previousHitDate ||
                  null,

                previousHitNumber:
                  item.previousHitNumber ||
                  null,

                evaluated,

                hit,

                status:
                  !evaluated
                    ? "pending"
                    : hit
                      ? "hit"
                      : "miss",

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
    predictions.filter(
      item =>
        item.hit
    );


  return {
    date:
      row.prediction_date,

    sourceDate:
      row.source_date,

    evaluated:
      Boolean(
        Number(
          row.evaluated
        )
      ),

    evaluatedAt:
      row.evaluated_at,

    createdAt:
      row.created_at,

    actualNumbers:
      splitNumbers(
        row.actual_numbers
      ),

    predictionNumbers:
      predictions.map(
        item =>
          item.pair
      ),

    predictions,

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
      )
  };
}


/* =====================================================
   RECENT BASE
===================================================== */

async function getRecentBase(
  db
) {
  const response =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
          recommendations_json,
          evaluated,
          evaluated_at,
          actual_numbers,
          top1_hit,
          top3_hit,
          top5_hit,
          created_at

        FROM prediction_live_v262

        WHERE model = ?

        ORDER BY
          prediction_date DESC

        LIMIT 20
      `)
      .bind(
        BASE_MODEL
      )
      .all();


  return Promise.all(
    (
      response.results ||
      []
    )
      .map(
        row =>
          buildBaseDay(
            db,
            row
          )
      )
  );
}


/* =====================================================
   CURRENT CARRY DERIVED FROM LATEST PREDICTION
===================================================== */

async function getCurrentCarry(
  db
) {
  const row =
    await db
      .prepare(`
        SELECT
          prediction_date,
          source_date,
          recommendations_json,
          evaluated,
          evaluated_at,
          actual_numbers,
          created_at

        FROM prediction_live_v262

        WHERE model = ?

        ORDER BY
          prediction_date DESC

        LIMIT 1
      `)
      .bind(
        BASE_MODEL
      )
      .first();


  if (!row) {
    return null;
  }


  const recommendations =
    safeJSON(
      row.recommendations_json,
      []
    );


  if (
    !Array.isArray(
      recommendations
    )
  ) {
    return null;
  }


  /*
  Chỉ lấy cặp được predict đánh dấu carryPriority.
  Đây chính là các cầu HIT ngày trước được ưu tiên.
  */
  const carryItems =
    recommendations
      .filter(
        item =>
          Boolean(
            item.carryPriority
          )
      );


  const promoted =
    await Promise.all(
      carryItems
        .map(
          async (
            item,
            index
          ) => {
            const pair =
              pairNumbersFromItem(
                item
              );


            const bridgeKey =
              item.bridgeKey ||
              item.ruleKey ||
              null;


            let history =
              await getFullBridgeHistory(
                db,
                bridgeKey
              );


            /*
            Append kỳ hiện tại nếu chưa được evaluate/evidence.
            */
            const exists =
              history.some(
                h =>
                  h.date ===
                  row.prediction_date
              );


            if (!exists) {
              history.push({
                date:
                  row.prediction_date,

                sourceDate:
                  row.source_date,

                pairNumbers:
                  pair,

                pair:
                  item.pair ||
                  pairText(
                    pair
                  ),

                number:
                  item.pair ||
                  pairText(
                    pair
                  ),

                bridgeKey,

                bridge:
                  item.bridge ||
                  null,

                rank:
                  Number(
                    item.baseRank ||
                    item.rank ||
                    index + 1
                  ),

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
                  null,

                hitNumber:
                  null,

                hitCount:
                  0,

                status:
                  Boolean(
                    Number(
                      row.evaluated
                    )
                  )
                    ? "miss"
                    : "pending",

                createdAt:
                  row.created_at
              });
            }


            history =
              history.sort(
                (
                  a,
                  b
                ) =>
                  String(
                    a.date
                  )
                    .localeCompare(
                      String(
                        b.date
                      )
                    )
              );


            /*
            Nếu current row đã evaluated,
            lấy evidence để sửa status kỳ hiện tại.
            */
            if (
              Boolean(
                Number(
                  row.evaluated
                )
              )
            ) {
              const evidence =
                await getEvidenceForDay(
                  db,
                  row.prediction_date
                );


              const currentEvidence =
                evidence.find(
                  ev =>
                    ev.bridge_key ===
                    bridgeKey
                );


              const currentHistory =
                history.find(
                  h =>
                    h.date ===
                    row.prediction_date
                );


              if (
                currentHistory &&
                currentEvidence
              ) {
                currentHistory.hit =
                  Boolean(
                    Number(
                      currentEvidence.hit
                    )
                  );

                currentHistory.status =
                  currentHistory.hit
                    ? "hit"
                    : "miss";

                currentHistory.hitNumber =
                  currentEvidence.hit_number ||
                  null;

                currentHistory.hitCount =
                  Number(
                    currentEvidence.hit_count ||
                    0
                  );
              }
            }


            const stats =
              historyStats(
                history
              );


            /*
            Chuỗi HIT gần nhất.
            */
            let streak = 0;


            for (
              let i =
                history.length - 1;
              i >= 0;
              i--
            ) {
              const status =
                history[i]
                  .status;


              if (
                status ===
                "pending"
              ) {
                continue;
              }


              if (
                status ===
                "hit"
              ) {
                streak++;
                continue;
              }


              break;
            }


            return {
              liveRank:
                Number(
                  item.baseRank ||
                  item.rank ||
                  index + 1
                ),

              currentNumber:
                pair[0] ||
                null,

              currentReverseNumber:
                pair[1] ||
                pair[0] ||
                null,

              currentPairNumbers:
                pair,

              currentPair:
                item.pair ||
                pairText(
                  pair
                ),

              previousNumber:
                normalizeNumber(
                  item.previousNumber
                )
                ||
                null,

              previousHitDate:
                item.previousHitDate ||
                null,

              previousHitNumber:
                item.previousHitNumber ||
                null,

              bridgeKey,

              bridge:
                item.bridge ||
                null,

              carryStatus:
                "ACTIVE",

              carryReason:
                item.carryReason ||
                "Tiếp tục vị trí đã HIT",

              carryTier:
                item.carryTier ||
                null,

              carryScore:
                Number(
                  item.carryScore || 0
                ),

              bridgeState:
                item.bridgeState ||
                null,

              carryHitStreak:
                streak,

              currentBaseQualified:
                true,

              currentBaseNumberMatch:
                true,

              currentScore:
                Number(
                  item.pairScore ||
                  item.score ||
                  0
                ),

              hit:
                null,

              status:
                Boolean(
                  Number(
                    row.evaluated
                  )
                )
                  ? (
                      history.find(
                        h =>
                          h.date ===
                          row.prediction_date
                      )?.status
                      ||
                      "miss"
                    )
                  : "pending",

              history,

              historyStats:
                stats
            };
          }
        )
    );


  return {
    sourceDate:
      row.source_date,

    predictionDate:
      row.prediction_date,

    numbers:
      promoted.map(
        item =>
          item.currentPair
      ),

    top1:
      promoted
        .slice(
          0,
          1
        )
        .map(
          item =>
            item.currentPair
        ),

    top3:
      promoted
        .slice(
          0,
          3
        )
        .map(
          item =>
            item.currentPair
        ),

    top5:
      promoted
        .slice(
          0,
          5
        )
        .map(
          item =>
            item.currentPair
        ),

    promotedCount:
      promoted.length,

    promoted,

    hasResult:
      Boolean(
        Number(
          row.evaluated
        )
      ),

    actualNumbers:
      splitNumbers(
        row.actual_numbers
      ),

    status:
      Boolean(
        Number(
          row.evaluated
        )
      )
        ? "completed"
        : "pending",

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at
  };
}


/* =====================================================
   PERFORMANCE
===================================================== */

async function getPerformance(
  db
) {
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
          ) AS top5_hits

        FROM prediction_live_v262

        WHERE model = ?
      `)
      .bind(
        BASE_MODEL
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
    hits
  ) {
    const h =
      Number(
        hits || 0
      );

    return {
      hits:
        h,

      tested,

      hitRate:
        tested
          ? Number(
              (
                h /
                tested *
                100
              )
                .toFixed(2)
            )
          : 0
    };
  }


  return {
    totalTracked:
      total,

    tested,

    pending:
      Math.max(
        0,
        total -
        tested
      ),

    top1:
      metric(
        row?.top1_hits
      ),

    top3:
      metric(
        row?.top3_hits
      ),

    top5:
      metric(
        row?.top5_hits
      )
  };
}


/* =====================================================
   MAIN
===================================================== */

export async function onRequestGet(
  context
) {
  try {
    const db =
      context.env.DB;


    if (!db) {
      return json(
        {
          success:
            false,

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


    const lastCompleted =
      completed[0] ||
      null;


    const lastHit =
      completed.find(
        item =>
          item.hitCount > 0
      )
      ||
      null;


    return json({
      success:
        true,

      module:
        "live-validation-read",

      version:
        VERSION,

      architecture:
        "derived-from-auto-tracking",

      baseModel:
        BASE_MODEL,

      lastCompleted,

      lastHit,

      currentCarry,

      recentBase,

      performance: {
        base:
          performance,

        carry: {
          totalTracked:
            currentCarry
              ?.promotedCount
            ||
            0,

          promoted:
            currentCarry
              ?.promotedCount
            ||
            0
        }
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
        success:
          false,

        module:
          "live-validation-read",

        version:
          VERSION,

        message:
          error?.message ||
          "Không đọc được Live Validation"
      },
      500
    );
  }
}
