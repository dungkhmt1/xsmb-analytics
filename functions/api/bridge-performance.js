/*
========================================================
/api/bridge-performance
XSMB V2.8 BRIDGE PERFORMANCE REGISTRY
========================================================

READ ONLY.

Mục tiêu:
- Thống kê hiệu suất từng bridgeKey từ dữ liệu tracking.
- Phân biệt direct hit / reverse hit.
- Đo current hit streak và recent-5.
- Không xem score/rate là xác suất dự đoán tương lai.
========================================================
*/

const MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "bridge-performance-v2.8";

const RECENT_WINDOW =
  5;

const PRIOR_SAMPLES =
  8;

const RELIABLE_SAMPLES =
  20;


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


function round2(value) {
  return Number(
    (
      Number(value) || 0
    ).toFixed(2)
  );
}


function clamp100(value) {
  return Math.max(
    0,
    Math.min(
      100,
      Number(value) || 0
    )
  );
}


function streak(rows) {
  let value = 0;

  for (
    let i = rows.length - 1;
    i >= 0;
    i--
  ) {
    if (
      Number(rows[i].hit) === 1
    ) {
      value++;
      continue;
    }

    break;
  }

  return value;
}


function buildState(
  bridgeKey,
  rows,
  globalRate
) {
  const ordered =
    [...rows]
      .sort(
        (a, b) =>
          String(a.prediction_date)
            .localeCompare(
              String(b.prediction_date)
            )
      );


  const tested =
    ordered.length;


  const hits =
    ordered.filter(
      row =>
        Number(row.hit) === 1
    ).length;


  const directHits =
    ordered.filter(
      row =>
        Number(row.direct_hit) === 1
    ).length;


  const reverseHits =
    ordered.filter(
      row =>
        Number(row.reverse_hit) === 1
    ).length;


  const recent =
    ordered.slice(
      -RECENT_WINDOW
    );


  const recentHits =
    recent.filter(
      row =>
        Number(row.hit) === 1
    ).length;


  const hitRate =
    tested
      ? hits / tested * 100
      : 0;


  const recentRate =
    recent.length
      ? recentHits / recent.length * 100
      : 0;


  const shrunkRate =
    (
      hits +
      (
        globalRate /
        100
      ) *
      PRIOR_SAMPLES
    )
    /
    (
      tested +
      PRIOR_SAMPLES
    )
    *
    100;


  const sampleReliability =
    clamp100(
      tested /
      RELIABLE_SAMPLES *
      100
    );


  const stability =
    clamp100(
      100 -
      Math.abs(
        recentRate -
        hitRate
      )
    );


  const currentHitStreak =
    streak(
      ordered
    );


  const streakScore =
    clamp100(
      Math.min(
        currentHitStreak,
        3
      )
      /
      3
      *
      100
    );


  const carryScore =
    clamp100(
      streakScore * 0.35 +
      recentRate * 0.25 +
      shrunkRate * 0.20 +
      sampleReliability * 0.10 +
      stability * 0.10
    );


  let tier =
    "C";


  if (
    currentHitStreak >= 2 &&
    carryScore >= 55
  ) {
    tier =
      "A";
  }
  else if (
    carryScore >= 40
  ) {
    tier =
      "B";
  }


  return {
    bridgeKey,

    bridge:
      ordered.at(-1)
        ?.bridge
      ||
      null,

    tested,
    hits,

    hitRate:
      round2(
        hitRate
      ),

    directHits,
    reverseHits,

    directHitRate:
      tested
        ? round2(
            directHits /
            tested *
            100
          )
        : 0,

    reverseHitRate:
      tested
        ? round2(
            reverseHits /
            tested *
            100
          )
        : 0,

    currentHitStreak,

    recentSamples:
      recent.length,

    recentHits,

    recentRate:
      round2(
        recentRate
      ),

    shrunkRate:
      round2(
        shrunkRate
      ),

    sampleReliability:
      round2(
        sampleReliability
      ),

    stability:
      round2(
        stability
      ),

    carryScore:
      round2(
        carryScore
      ),

    carryTier:
      tier,

    lastTrackedDate:
      ordered.at(-1)
        ?.prediction_date
      ||
      null,

    lastHitDate:
      [...ordered]
        .reverse()
        .find(
          row =>
            Number(row.hit) === 1
        )
        ?.prediction_date
      ||
      null,

    recentHistory:
      recent.map(
        row => ({
          date:
            row.prediction_date,

          number:
            row.number,

          reverseNumber:
            row.reverse_number,

          hit:
            Number(
              row.hit
            ) === 1,

          directHit:
            Number(
              row.direct_hit
            ) === 1,

          reverseHit:
            Number(
              row.reverse_hit
            ) === 1,

          hitNumber:
            row.hit_number ||
            null
        })
      )
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


    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number.parseInt(
            url.searchParams.get(
              "limit"
            ) || "30",
            10
          )
          ||
          30
        )
      );


    let rows = [];


    try {
      const response =
        await db
          .prepare(`
            SELECT
              prediction_date,
              bridge_key,
              bridge,
              number,
              reverse_number,
              hit,
              hit_number,
              direct_hit,
              reverse_hit

            FROM prediction_bridge_evidence

            WHERE model = ?

            ORDER BY
              prediction_date ASC
          `)
          .bind(
            MODEL
          )
          .all();

      rows =
        response.results ||
        [];
    }
    catch {
      /*
      Fallback trước khi tracking-sync V2.8 tạo cột.
      */
      const response =
        await db
          .prepare(`
            SELECT
              prediction_date,
              bridge_key,
              bridge,
              number,
              reverse_number,
              hit,
              hit_number,
              0 AS direct_hit,
              0 AS reverse_hit

            FROM prediction_bridge_evidence

            WHERE model = ?

            ORDER BY
              prediction_date ASC
          `)
          .bind(
            MODEL
          )
          .all();

      rows =
        response.results ||
        [];
    }


    const tested =
      rows.length;


    const hits =
      rows.filter(
        row =>
          Number(row.hit) === 1
      ).length;


    const globalRate =
      tested
        ? hits / tested * 100
        : 0;


    const grouped =
      new Map();


    for (const row of rows) {
      if (
        !grouped.has(
          row.bridge_key
        )
      ) {
        grouped.set(
          row.bridge_key,
          []
        );
      }

      grouped
        .get(
          row.bridge_key
        )
        .push(
          row
        );
    }


    const states =
      [
        ...grouped.entries()
      ]
        .map(
          (
            [
              key,
              values
            ]
          ) =>
            buildState(
              key,
              values,
              globalRate
            )
        )
        .sort(
          (a, b) => {
            const tierRank = {
              A: 3,
              B: 2,
              C: 1
            };


            const tierDiff =
              (
                tierRank[
                  b.carryTier
                ] || 0
              )
              -
              (
                tierRank[
                  a.carryTier
                ] || 0
              );


            if (
              tierDiff !== 0
            ) {
              return tierDiff;
            }


            if (
              b.carryScore !==
              a.carryScore
            ) {
              return (
                b.carryScore -
                a.carryScore
              );
            }


            return (
              b.tested -
              a.tested
            );
          }
        );


    return json({
      success: true,

      module:
        "bridge-performance",

      version:
        VERSION,

      model:
        MODEL,

      methodology:
        {
          recentWindow:
            RECENT_WINDOW,

          shrinkagePriorSamples:
            PRIOR_SAMPLES,

          reliableSamples:
            RELIABLE_SAMPLES,

          warning:
            "carryScore là điểm ranking từ lịch sử tracking, không phải xác suất trúng."
        },

      global: {
        tested,
        hits,

        trackedHitRate:
          round2(
            globalRate
          ),

        uniqueBridges:
          states.length
      },

      states:
        states.slice(
          0,
          limit
        )
    });
  }
  catch (error) {
    return json(
      {
        success: false,

        module:
          "bridge-performance",

        version:
          VERSION,

        message:
          error?.message ||
          String(error)
      },
      500
    );
  }
}
