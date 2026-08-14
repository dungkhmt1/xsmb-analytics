/*
========================================================
XSMB AB-BA PREDICTION HISTORY API
/api/prediction-history
V2.7
========================================================

Theo dõi TOÀN BỘ cặp AB-BA đã gợi ý.

Quy ước:
- AB hoặc BA xuất hiện => HIT.
- Không xuất hiện => MISS.
- Chưa có kết quả => PENDING.
========================================================
*/

const MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "prediction-history-abba-v2.7";


function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate"
    }
  });
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
    normalizeNumber(value);

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


function pairNumbersFromItem(item) {
  if (
    Array.isArray(
      item?.pairNumbers
    ) &&
    item.pairNumbers.length
  ) {
    return [
      ...new Set(
        item.pairNumbers
          .map(normalizeNumber)
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
  /*
  V2.8.1:
  direct_hit / reverse_hit là cột mới.

  Trong thời gian migration D1 chưa chạy,
  endpoint vẫn phải đọc được lịch sử cũ thay vì trả SQLITE_ERROR.
  */

  try {
    const response =
      await db
        .prepare(`
          SELECT
            bridge_key,
            number,
            reverse_number,
            pair_key,
            pair_json,
            hit,
            hit_number,
            hit_count,
            direct_hit,
            reverse_hit,
            score,
            strength

          FROM prediction_bridge_evidence

          WHERE prediction_date = ?
            AND model = ?
        `)
        .bind(
          predictionDate,
          MODEL
        )
        .all();

    return (
      response.results ||
      []
    );
  }
  catch (error) {
    /*
    Fallback cho database V2.7.x chưa có 2 cột mới.

    Không giả định direct/reverse cho dữ liệu lịch sử cũ;
    trả false/0 để tránh làm sai thống kê.
    */
    const response =
      await db
        .prepare(`
          SELECT
            bridge_key,
            number,
            reverse_number,
            pair_key,
            pair_json,
            hit,
            hit_number,
            hit_count,
            0 AS direct_hit,
            0 AS reverse_hit,
            score,
            strength

          FROM prediction_bridge_evidence

          WHERE prediction_date = ?
            AND model = ?
        `)
        .bind(
          predictionDate,
          MODEL
        )
        .all();

    return (
      response.results ||
      []
    );
  }
}


async function buildDay(
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

  const evidenceMap =
    new Map();

  for (const item of evidence) {
    const key =
      `${item.bridge_key}|${normalizeNumber(item.number)}`;

    evidenceMap.set(
      key,
      item
    );
  }


  const pairs =
    Array.isArray(recommendations)
      ? recommendations
          .map(
            (
              item,
              index
            ) => {
              const numbers =
                pairNumbersFromItem(
                  item
                );

              if (!numbers.length) {
                return null;
              }

              const bridgeKey =
                item.bridgeKey ||
                item.ruleKey ||
                null;

              const number =
                normalizeNumber(
                  item.number
                );

              const ev =
                bridgeKey && number
                  ? evidenceMap.get(
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
                    numbers
                  ),

                pairNumbers:
                  numbers,

                pairKey:
                  item.pairKey ||
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

                evaluated,

                hit,

                miss:
                  evaluated
                    ? !hit
                    : false,

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
                  ),

                directHit:
                  Boolean(
                    Number(
                      ev?.direct_hit || 0
                    )
                  ),

                reverseHit:
                  Boolean(
                    Number(
                      ev?.reverse_hit || 0
                    )
                  )
              };
            }
          )
          .filter(Boolean)
      : [];


  const evaluatedPairs =
    pairs.filter(
      item =>
        item.evaluated
    );

  const hitPairs =
    evaluatedPairs.filter(
      item =>
        item.hit
    );

  const missPairs =
    evaluatedPairs.filter(
      item =>
        item.miss
    );


  return {
    date:
      row.prediction_date,

    sourceDate:
      row.source_date,

    createdAt:
      row.created_at,

    evaluatedAt:
      row.evaluated_at,

    evaluated:
      Boolean(
        Number(
          row.evaluated
        )
      ),

    status:
      Boolean(
        Number(
          row.evaluated
        )
      )
        ? "completed"
        : "pending",

    actualNumbers:
      splitNumbers(
        row.actual_numbers
      ),

    pairCount:
      pairs.length,

    evaluatedPairCount:
      evaluatedPairs.length,

    hitPairs:
      hitPairs.length,

    missPairs:
      missPairs.length,

    pairHitRate:
      evaluatedPairs.length
        ? Number(
            (
              hitPairs.length /
              evaluatedPairs.length *
              100
            ).toFixed(2)
          )
        : 0,

    pairs
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


    const url =
      new URL(
        context.request.url
      );

    const rawLimit =
      Number.parseInt(
        url.searchParams.get(
          "limit"
        ) || "30",
        10
      );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number.isFinite(rawLimit)
            ? rawLimit
            : 30
        )
      );


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
            created_at

          FROM prediction_live_v262

          WHERE model = ?

          ORDER BY
            prediction_date DESC

          LIMIT ?
        `)
        .bind(
          MODEL,
          limit
        )
        .all();


    const history =
      await Promise.all(
        (response.results || [])
          .map(
            row =>
              buildDay(
                db,
                row
              )
          )
      );


    const completedDays =
      history.filter(
        day =>
          day.evaluated
      );

    const pendingDays =
      history.filter(
        day =>
          !day.evaluated
      );

    const allPairs =
      history.flatMap(
        day =>
          day.pairs
      );

    const evaluatedPairs =
      allPairs.filter(
        item =>
          item.evaluated
      );

    const hitPairs =
      evaluatedPairs.filter(
        item =>
          item.hit
      );

    const missPairs =
      evaluatedPairs.filter(
        item =>
          item.miss
      );


    function rankDayMetric(
      maxRank
    ) {
      let tested = 0;
      let hits = 0;

      for (
        const day of
        completedDays
      ) {
        const selected =
          day.pairs.filter(
            item =>
              item.rank <=
              maxRank
          );

        if (!selected.length) {
          continue;
        }

        tested++;

        if (
          selected.some(
            item =>
              item.hit
          )
        ) {
          hits++;
        }
      }

      return {
        hits,
        tested,

        hitRate:
          tested
            ? Number(
                (
                  hits /
                  tested *
                  100
                ).toFixed(2)
              )
            : 0
      };
    }


    return json({
      success: true,

      module:
        "prediction-history-abba",

      version:
        VERSION,

      model:
        MODEL,

      suggestionMode:
        "AB-BA",

      summary: {
        totalDays:
          history.length,

        completed:
          completedDays.length,

        pending:
          pendingDays.length,

        totalPairs:
          allPairs.length,

        evaluatedPairs:
          evaluatedPairs.length,

        pendingPairs:
          allPairs.length -
          evaluatedPairs.length,

        hitPairs:
          hitPairs.length,

        missPairs:
          missPairs.length,

        pairHitRate:
          evaluatedPairs.length
            ? Number(
                (
                  hitPairs.length /
                  evaluatedPairs.length *
                  100
                ).toFixed(2)
              )
            : 0,

        pairMissRate:
          evaluatedPairs.length
            ? Number(
                (
                  missPairs.length /
                  evaluatedPairs.length *
                  100
                ).toFixed(2)
              )
            : 0,

        top1:
          rankDayMetric(1),

        top3:
          rankDayMetric(3),

        top5:
          rankDayMetric(5)
      },

      history
    });
  }
  catch (error) {
    console.error(
      "prediction-history ABBA:",
      error
    );

    return json(
      {
        success: false,

        message:
          error?.message ||
          "Không đọc được lịch sử AB-BA"
      },
      500
    );
  }
}
