const BASE_MODEL = "bridge-v2.6.2";
const PRIORITY_MODEL = "bridge-v2.6.2-live-priority-carry-v2";
const MAX_TRACK = 12;


/*
========================================================
JSON
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

  return Number.isFinite(n)
    ? Math.round(n * 100) / 100
    : 0;
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


function asInt(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? Math.trunc(n)
    : fallback;
}


/*
========================================================
DATABASE TABLES
========================================================
*/

async function ensureTables(db) {

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
RESULT HELPERS
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


  const set =
    new Set();


  for (const field of fields) {

    for (
      const token
      of prizeTokens(row[field])
    ) {

      set.add(
        token
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
BASELINE
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
    !u ||
    !k
  ) {
    return 0;
  }


  let noHit = 1;


  for (
    let i = 0;
    i < k;
    i++
  ) {

    const numerator =
      100 - u - i;

    const denominator =
      100 - i;


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
NORMALIZE V2.6.2
========================================================
*/

function normalizeSuggestion(
  item,
  rank
) {

  return {

    rank,
    baseRank: rank,

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
PARSE BRIDGE KEY

Ví dụ:

g3:3:0|g6:0:2|A+B

g3:3:0
= G3 item 4
= digit 1

g6:0:2
= G6 item 1
= digit 3
========================================================
*/

function parseBridgePoint(text) {

  const parts =
    String(text || "")
      .split(":");


  if (
    parts.length !== 3
  ) {
    return null;
  }


  const field =
    parts[0];

  const itemIndex =
    Number(parts[1]);

  const digitIndex =
    Number(parts[2]);


  const allowed =
    new Set([
      "special",
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
      "g6",
      "g7"
    ]);


  if (
    !allowed.has(field)
  ) {
    return null;
  }


  if (
    !Number.isInteger(itemIndex)
    ||
    itemIndex < 0
  ) {
    return null;
  }


  if (
    !Number.isInteger(digitIndex)
    ||
    digitIndex < 0
  ) {
    return null;
  }


  return {
    field,
    itemIndex,
    digitIndex
  };
}


function parseBridgeKey(
  bridgeKey
) {

  const parts =
    String(
      bridgeKey || ""
    )
      .split("|");


  if (
    parts.length !== 3
  ) {
    return null;
  }


  const pointA =
    parseBridgePoint(
      parts[0]
    );


  const pointB =
    parseBridgePoint(
      parts[1]
    );


  const direction =
    parts[2];


  if (
    !pointA ||
    !pointB
  ) {
    return null;
  }


  if (
    direction !== "A+B"
    &&
    direction !== "B+A"
  ) {
    return null;
  }


  return {
    pointA,
    pointB,
    direction
  };
}


/*
========================================================
READ DIGIT FROM RESULT
========================================================
*/

function getDigitAtPoint(
  resultRow,
  point
) {

  const prizes =
    prizeTokens(
      resultRow?.[
        point.field
      ]
    );


  const prize =
    prizes[
      point.itemIndex
    ];


  if (!prize) {
    return null;
  }


  if (
    point.digitIndex >=
    prize.length
  ) {
    return null;
  }


  const digit =
    prize.charAt(
      point.digitIndex
    );


  return /^\d$/.test(digit)
    ?
    digit
    :
    null;
}


/*
========================================================
GENERATE NUMBER FROM SAME BRIDGE

Đây là lõi Carry Forward.
========================================================
*/

function generateNumberFromBridge(
  resultRow,
  bridgeKey
) {

  const parsed =
    parseBridgeKey(
      bridgeKey
    );


  if (!parsed) {

    return {
      success: false,

      reason:
        "invalid-bridge-key",

      bridgeKey
    };
  }


  const digitA =
    getDigitAtPoint(
      resultRow,
      parsed.pointA
    );


  const digitB =
    getDigitAtPoint(
      resultRow,
      parsed.pointB
    );


  if (
    digitA === null ||
    digitB === null
  ) {

    return {

      success: false,

      reason:
        "bridge-position-not-found",

      bridgeKey,

      digitA,
      digitB
    };
  }


  const number =
    parsed.direction === "A+B"

      ?

      `${digitA}${digitB}`

      :

      `${digitB}${digitA}`;


  return {

    success: true,

    bridgeKey,

    number,

    digitA,
    digitB,

    direction:
      parsed.direction
  };
}


/*
========================================================
CALL PREDICT V2.6.2
========================================================
*/

async function fetchPrediction(
  requestUrl
) {

  const origin =
    new URL(
      requestUrl
    )
      .origin;


  const url =
    `${origin}/api/predict?t=${Date.now()}`;


  let response;


  try {

    response =
      await fetch(
        url,
        {
          headers: {

            Accept:
              "application/json",

            "Cache-Control":
              "no-cache"
          }
        }
      );

  }
  catch (error) {

    return {

      success: false,

      stage:
        "predict-network",

      status: 0,

      url,

      message:
        error?.message ||
        "Không gọi được /api/predict"
    };
  }


  const rawText =
    await response.text();


  let data = null;


  try {

    data =
      JSON.parse(
        rawText
      );

  }
  catch {

    data = null;
  }


  if (
    !response.ok
  ) {

    return {

      success: false,

      stage:
        "predict-http",

      status:
        response.status,

      url,

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


  if (!data) {

    return {

      success: false,

      stage:
        "predict-json",

      status:
        response.status,

      url,

      message:
        "Predict API không trả JSON hợp lệ",

      body:
        rawText.slice(
          0,
          1500
        )
    };
  }


  if (!data.success) {

    return {

      success: false,

      stage:
        "predict-response",

      status:
        response.status,

      url,

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

    url,

    data
  };
}


/*
========================================================
EVALUATE BASE V2.6.2
========================================================
*/

async function evaluateBasePending(
  db
) {

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


  let evaluatedNow = 0;


  for (
    const saved
    of query.results || []
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
            x =>
              x.number
          );
    }


    recommendations =
      recommendations

        .filter(
          x =>
            x.number
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


    const evaluated =
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
      evaluated.slice(
        0,
        1
      );


    const top3 =
      evaluated.slice(
        0,
        3
      );


    const top5 =
      evaluated.slice(
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
EVALUATE CARRY PRIORITY
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


  let evaluatedNow = 0;


  for (
    const saved
    of query.results || []
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

        .filter(
          x =>
            x.number
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


    const evaluated =
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

          carryForward:
            Boolean(
              item.carryForward
            ),

          carryHitStreak:
            asInt(
              item.carryHitStreak,
              0
            ),

          carrySources:
            Array.isArray(
              item.carrySources
            )
              ?
              item.carrySources
              :
              [],

          priorityReason:
            item.priorityReason ?? null,

          hit:
            actualSet.has(
              item.number
            )
        })
      );


    const top1 =
      evaluated.slice(
        0,
        1
      );


    const top3 =
      evaluated.slice(
        0,
        3
      );


    const top5 =
      evaluated.slice(
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
BUILD HIT SOURCE
========================================================
*/

function sourceFromRecommendation(
  item,
  sourceType,
  hitDate,
  defaultStreak
) {

  if (
    !item?.bridgeKey
  ) {
    return null;
  }


  return {

    bridgeKey:
      item.bridgeKey,

    bridge:
      item.bridge ?? null,

    positionA:
      item.positionA ?? null,

    positionB:
      item.positionB ?? null,

    direction:
      item.direction ?? null,

    previousNumber:
      item.number ?? null,

    previousRank:
      item.liveRank ??
      item.baseRank ??
      item.rank ??
      null,

    previousScore:
      item.score ?? null,

    previousStrength:
      item.strength ?? null,

    previousHitDate:
      hitDate,

    carryHitStreak:
      defaultStreak,

    sourceType
  };
}


/*
========================================================
DEDUPE BRIDGE SOURCES
========================================================
*/

function mergeCarrySource(
  map,
  source
) {

  if (
    !source?.bridgeKey
  ) {
    return;
  }


  const old =
    map.get(
      source.bridgeKey
    );


  if (!old) {

    map.set(
      source.bridgeKey,
      source
    );

    return;
  }


  const oldStreak =
    asInt(
      old.carryHitStreak,
      0
    );


  const newStreak =
    asInt(
      source.carryHitStreak,
      0
    );


  const oldRank =
    Number(
      old.previousRank ??
      9999
    );


  const newRank =
    Number(
      source.previousRank ??
      9999
    );


  if (
    newStreak > oldStreak
    ||
    (
      newStreak === oldStreak
      &&
      newRank < oldRank
    )
  ) {

    map.set(
      source.bridgeKey,
      {
        ...old,
        ...source
      }
    );
  }
}


/*
========================================================
PREVIOUS DAY HIT CONTEXT

Đọc cả:

1. BASE V2.6.2
2. Carry Priority trước đó

Nhờ vậy cầu Carry có thể chạy nhiều ngày liên tiếp.
========================================================
*/

async function getPreviousHitContext(
  db,
  sourceDate
) {

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

      actualNumbers: [],

      hits: [],

      hitBridgeKeys:
        new Set()
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


  const byBridge =
    new Map();


  /*
  ================================================
  BASE SNAPSHOT
  ================================================
  */

  const baseSnapshot =
    await db
      .prepare(`
        SELECT
          recommendations_json

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


  if (baseSnapshot) {

    const baseRecommendations =
      readRecommendations(
        baseSnapshot
          .recommendations_json
      );


    for (
      const item
      of baseRecommendations
    ) {

      if (
        !item?.number
        ||
        !actualSet.has(
          item.number
        )
      ) {
        continue;
      }


      mergeCarrySource(

        byBridge,

        sourceFromRecommendation(
          item,
          "base-hit",
          sourceDate,
          1
        )
      );
    }
  }


  /*
  ================================================
  PREVIOUS CARRY SNAPSHOT
  ================================================
  */

  const prioritySnapshot =
    await db
      .prepare(`
        SELECT
          recommendations_json

        FROM prediction_priority_tracking

        WHERE
          prediction_date = ?
          AND variant = ?

        LIMIT 1
      `)

      .bind(
        sourceDate,
        PRIORITY_MODEL
      )

      .first();


  if (prioritySnapshot) {

    const priorityRecommendations =
      readRecommendations(
        prioritySnapshot
          .recommendations_json
      );


    for (
      const item
      of priorityRecommendations
    ) {

      if (
        !item?.number
        ||
        !actualSet.has(
          item.number
        )
      ) {
        continue;
      }


      /*
      ==============================================
      Cầu Carry đã HIT tiếp

      streak:
      1 → 2 → 3...
      ==============================================
      */

      const carrySources =
        Array.isArray(
          item.carrySources
        )
          ?
          item.carrySources
          :
          [];


      for (
        const carrySource
        of carrySources
      ) {

        if (
          !carrySource?.bridgeKey
        ) {
          continue;
        }


        mergeCarrySource(
          byBridge,
          {

            ...carrySource,

            previousNumber:
              item.number,

            previousRank:
              item.liveRank ??
              item.rank ??
              carrySource.previousRank ??
              null,

            previousHitDate:
              sourceDate,

            carryHitStreak:

              asInt(
                carrySource
                  .carryHitStreak,

                asInt(
                  item.carryHitStreak,
                  1
                )
              )

              +

              1,

            sourceType:
              "carry-hit"
          }
        );
      }


      /*
      ==============================================
      Nếu bản thân item cũng là một cầu BASE
      và hôm nay HIT thì nó cũng được bắt đầu carry.
      ==============================================
      */

      const ownSource =
        sourceFromRecommendation(
          item,
          "priority-base-hit",
          sourceDate,
          1
        );


      if (ownSource) {

        mergeCarrySource(
          byBridge,
          ownSource
        );
      }
    }
  }


  const hits =
    [
      ...byBridge.values()
    ]
      .sort(
        (
          a,
          b
        ) => {

          const streakDiff =

            asInt(
              b.carryHitStreak
            )

            -

            asInt(
              a.carryHitStreak
            );


          if (streakDiff) {
            return streakDiff;
          }


          return (

            Number(
              a.previousRank ??
              9999
            )

            -

            Number(
              b.previousRank ??
              9999
            )
          );
        }
      );


  return {

    available:
      Boolean(
        baseSnapshot ||
        prioritySnapshot
      ),

    date:
      sourceDate,

    actualNumbers,

    hits,

    hitBridgeKeys:

      new Set(
        hits.map(
          x =>
            x.bridgeKey
        )
      )
  };
}


/*
========================================================
GENERATE CARRY NUMBERS

Cầu có thể không còn trong V2.6.2 hôm nay.
Vẫn dùng bridgeKey đó để sinh số mới.
========================================================
*/

function buildCarryCandidates(
  sourceResult,
  previousContext,
  baseRecommendations
) {

  const baseByBridge =
    new Map();


  const baseByNumber =
    new Map();


  for (
    const item
    of baseRecommendations
  ) {

    if (
      item.bridgeKey
    ) {

      baseByBridge.set(
        item.bridgeKey,
        item
      );
    }


    if (
      item.number &&
      !baseByNumber.has(
        item.number
      )
    ) {

      baseByNumber.set(
        item.number,
        item
      );
    }
  }


  const generated = [];
  const failed = [];


  for (
    const source
    of previousContext.hits || []
  ) {

    const result =
      generateNumberFromBridge(
        sourceResult,
        source.bridgeKey
      );


    if (
      !result.success
    ) {

      failed.push({

        ...source,

        reason:
          result.reason
      });

      continue;
    }


    generated.push({

      ...source,

      currentNumber:
        result.number,

      digitA:
        result.digitA,

      digitB:
        result.digitB,

      direction:
        result.direction,

      currentBaseBridgeMatch:

        baseByBridge.has(
          source.bridgeKey
        ),

      currentBaseNumberMatch:

        baseByNumber.has(
          result.number
        ),

      currentBaseRank:

        baseByBridge
          .get(
            source.bridgeKey
          )
          ?.baseRank

        ??

        baseByNumber
          .get(
            result.number
          )
          ?.baseRank

        ??

        null
    });
  }


  generated.sort(
    (
      a,
      b
    ) => {

      const streakDiff =

        asInt(
          b.carryHitStreak
        )

        -

        asInt(
          a.carryHitStreak
        );


      if (streakDiff) {
        return streakDiff;
      }


      return (

        Number(
          a.previousRank ??
          9999
        )

        -

        Number(
          b.previousRank ??
          9999
        )
      );
    }
  );


  return {
    generated,
    failed
  };
}


/*
========================================================
BUILD PRIORITY RANKING

Ưu tiên:

1. Carry cầu đã HIT
2. Base V2.6.2

Không lặp số.
========================================================
*/

function buildPriorityRanking(
  baseRecommendations,
  carryInfo
) {

  /*
  ================================================
  Group carry theo NUMBER.

  Nhiều cầu cùng sinh một số
  → chỉ đưa số đó một lần.
  ================================================
  */

  const carriesByNumber =
    new Map();


  for (
    const carry
    of carryInfo.generated || []
  ) {

    if (
      !carry.currentNumber
    ) {
      continue;
    }


    const list =
      carriesByNumber.get(
        carry.currentNumber
      )
      ||
      [];


    list.push(
      carry
    );


    carriesByNumber.set(
      carry.currentNumber,
      list
    );
  }


  const baseByBridge =
    new Map();


  const baseByNumber =
    new Map();


  for (
    const item
    of baseRecommendations
  ) {

    if (
      item.bridgeKey
    ) {

      baseByBridge.set(
        item.bridgeKey,
        item
      );
    }


    if (
      item.number
      &&
      !baseByNumber.has(
        item.number
      )
    ) {

      baseByNumber.set(
        item.number,
        item
      );
    }
  }


  const priority = [];

  const usedNumbers =
    new Set();


  /*
  ================================================
  CARRY FIRST
  ================================================
  */

  for (
    const [
      number,
      sourcesRaw
    ]
    of carriesByNumber.entries()
  ) {

    const sources =
      [
        ...sourcesRaw
      ]
        .sort(
          (
            a,
            b
          ) => {

            const streakDiff =

              asInt(
                b.carryHitStreak
              )

              -

              asInt(
                a.carryHitStreak
              );


            if (streakDiff) {
              return streakDiff;
            }


            return (

              Number(
                a.previousRank ??
                9999
              )

              -

              Number(
                b.previousRank ??
                9999
              )
            );
          }
        );


    const primary =
      sources[0];


    /*
     * Nếu cùng bridge vẫn nằm trong BASE
     * thì dùng metadata BASE hôm nay.
     */

    const sameBridgeBase =
      baseByBridge.get(
        primary.bridgeKey
      );


    /*
     * Nếu cùng number đã được BASE chọn bởi cầu khác
     * thì dùng metadata BASE của number đó.
     */

    const sameNumberBase =
      baseByNumber.get(
        number
      );


    const baseItem =
      sameBridgeBase
      ||
      sameNumberBase
      ||
      null;


    /*
     * Carry-only candidate.
     *
     * Không gán score giả khi V2.6.2
     * hôm nay đã loại cầu này.
     */

    const item =
      baseItem

      ?

      {
        ...baseItem
      }

      :

      {

        rank: null,
        baseRank: null,

        number,

        bridgeKey:
          primary.bridgeKey,

        bridge:
          primary.bridge ??
          null,

        positionA:
          primary.positionA ??
          null,

        positionB:
          primary.positionB ??
          null,

        direction:
          primary.direction ??
          null,

        streak: null,

        opportunities: null,
        continued: null,

        continuationRate: null,
        weightedRate: null,

        baselineRate: null,

        edge: null,

        wilsonLowerBound: null,
        wilsonEdge: null,

        rate30: null,
        samples30: null,

        rate60: null,
        samples60: null,

        rate100: null,
        samples100: null,

        recentRate: null,
        recentSamples: null,

        recentStatus:
          "carry-only",

        stabilityRange: null,
        stabilityScore: null,

        sampleReliability: null,

        rawScore: null,

        independentConsensus: null,
        relatedBridgeCount: null,

        consensusBonus: null,
        correlationPenalty: null,
        recentAdjustment: null,

        score: null,

        strength:
          "carry"
      };


    item.number =
      number;


    item.livePriority =
      true;


    item.carryForward =
      true;


    item.priorityReason =
      "carry-forward-after-hit";


    item.previousHitDate =
      primary.previousHitDate;


    item.previousNumber =
      primary.previousNumber;


    item.carryHitStreak =
      Math.max(
        ...sources.map(
          x =>
            asInt(
              x.carryHitStreak,
              1
            )
        )
      );


    /*
     * True chỉ khi chính bridge Carry
     * vẫn được V2.6.2 chọn hôm nay.
     */

    item.currentBaseQualified =
      Boolean(
        sameBridgeBase
      );


    /*
     * Có thể cùng số nhưng do một bridge BASE khác.
     */

    item.currentBaseNumberMatch =
      Boolean(
        sameNumberBase
      );


    /*
     * Giữ toàn bộ cầu tạo ra cùng một number.
     */

    item.carrySources =
      sources.map(
        source => ({

          bridgeKey:
            source.bridgeKey,

          bridge:
            source.bridge ??
            null,

          positionA:
            source.positionA ??
            null,

          positionB:
            source.positionB ??
            null,

          direction:
            source.direction ??
            null,

          previousNumber:
            source.previousNumber ??
            null,

          previousRank:
            source.previousRank ??
            null,

          previousScore:
            source.previousScore ??
            null,

          previousStrength:
            source.previousStrength ??
            null,

          previousHitDate:
            source.previousHitDate ??
            null,

          carryHitStreak:
            asInt(
              source.carryHitStreak,
              1
            ),

          sourceType:
            source.sourceType ??
            null,

          currentNumber:
            source.currentNumber,

          currentBaseBridgeMatch:
            Boolean(
              source
                .currentBaseBridgeMatch
            ),

          currentBaseNumberMatch:
            Boolean(
              source
                .currentBaseNumberMatch
            )
        })
      );


    priority.push(
      item
    );


    usedNumbers.add(
      number
    );
  }


  /*
  ================================================
  APPEND BASE V2.6.2
  ================================================
  */

  for (
    const base
    of baseRecommendations
  ) {

    if (
      !base.number
      ||
      usedNumbers.has(
        base.number
      )
    ) {
      continue;
    }


    priority.push({

      ...base,

      livePriority: false,

      carryForward: false,

      priorityReason: null,

      previousHitDate: null,

      previousNumber: null,

      carryHitStreak: 0,

      currentBaseQualified:
        true,

      currentBaseNumberMatch:
        true,

      carrySources: []
    });


    usedNumbers.add(
      base.number
    );
  }


  return priority

    .slice(
      0,
      MAX_TRACK
    )

    .map(
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
SNAPSHOTS
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

  let snapshot =
    await getBaseSnapshot(
      db,
      predict.predictionDate
    );


  if (snapshot) {

    return {

      savedNew: false,

      blocked: null,

      snapshot
    };
  }


  const target =
    await getResult(
      db,
      predict.predictionDate
    );


  /*
   * Không backfill prediction
   * sau khi đã biết kết quả.
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
      x =>
        x.number
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
        insert
          ?.meta
          ?.changes
        ||
        0
      ) > 0,

    blocked: null,

    snapshot
  };
}


/*
========================================================
SAVE CARRY PRIORITY
========================================================
*/

async function savePrioritySnapshot(
  db,
  predict,
  recommendations,
  carryInfo
) {

  let snapshot =
    await getPrioritySnapshot(
      db,
      predict.predictionDate
    );


  if (snapshot) {

    return {

      savedNew: false,

      blocked: null,

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
    recommendations

      .map(
        x =>
          x.number
      )

      .filter(Boolean);


  const promoted =
    recommendations.filter(
      x =>
        x.carryForward
    );


  const promotedBridgeKeys =
    [
      ...new Set(

        promoted.flatMap(
          item =>

            Array.isArray(
              item.carrySources
            )

              ?

              item.carrySources

                .map(
                  x =>
                    x.bridgeKey
                )

                .filter(Boolean)

              :

              [
                item.bridgeKey
              ].filter(Boolean)
        )
      )
    ];


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
        "carry-forward-after-hit",

      /*
       * Khác bản Priority cũ:
       *
       * Cầu bị V2.6.2 loại hôm nay
       * vẫn được phép carry nếu hôm qua HIT.
       */

      carryRejectedBridge:
        true,

      stopAfterMiss:
        true,

      sameBridgeKeyRequiredForContinuation:
        true,

      modifyBaseScore:
        false,

      modifyPredictJs:
        false,

      generatedCarryCount:
        carryInfo.generated.length,

      failedCarryCount:
        carryInfo.failed.length,

      failedCarry:
        carryInfo.failed
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

        promotedBridgeKeys
          .join(",")
      )

      .run();


  /*
  ================================================
  PREDICTION DAILY

  Dùng Carry Top2 làm dàn thực tế.

  Khác code cũ:
  Cho phép UPDATE khi target CHƯA có kết quả.

  Vì 26/07 đã có prediction Priority V1 cũ,
  Carry V2 cần thay dàn sử dụng thực tế.
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

      DO UPDATE SET

        numbers =
          excluded.numbers,

        points =
          excluded.points,

        model =
          excluded.model
    `)

    .bind(

      predict.predictionDate,

      numbers
        .slice(
          0,
          2
        )
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
        insert
          ?.meta
          ?.changes
        ||
        0
      ) > 0,

    blocked: null,

    snapshot
  };
}


/*
========================================================
PERFORMANCE
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
        )

        -

        tested
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


async function getBasePerformance(
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

          stage:
            "database",

          message:
            "Không tìm thấy D1 binding DB"
        },
        500
      );
    }


    await ensureTables(
      db
    );


    /*
    ================================================
    STEP 1
    CHẤM CÁC KỲ CŨ
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
    PERFORMANCE
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
    STEP 3
    V2.6.2
    ================================================
    */

    const predictResult =
      await fetchPrediction(
        context.request.url
      );


    if (
      !predictResult.success
    ) {

      return json(
        {

          success: false,

          module:
            "v2.6.2-live-validation-carry",

          stage:
            predictResult.stage,

          message:
            predictResult.message,

          evaluatedNow: {

            base:
              evaluatedBaseNow,

            carry:
              evaluatedPriorityNow
          },

          livePerformance: {

            base:
              basePerformance,

            carry:
              priorityPerformance
          },

          predictDiagnostic: {

            status:
              predictResult.status,

            url:
              predictResult.url,

            body:
              predictResult.body ??
              null,

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
    STEP 4
    VALIDATE MODEL
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
    STEP 5
    BASE SUGGESTIONS
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
            predict.predictionDate
        },
        409
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
    STEP 6
    SOURCE RESULT

    Dùng kết quả SOURCE để sinh số mới
    từ cầu Carry.
    ================================================
    */

    const sourceResult =
      await getResult(
        db,
        predict.sourceDate
      );


    if (
      !sourceResult
    ) {

      return json(
        {

          success: false,

          stage:
            "source-result",

          message:
            `Không tìm thấy kết quả source ${predict.sourceDate} để sinh carry`
        },
        409
      );
    }


    /*
    ================================================
    STEP 7
    CẦU NÀO HIT KỲ TRƯỚC?
    ================================================
    */

    const previousContext =
      await getPreviousHitContext(
        db,
        predict.sourceDate
      );


    /*
    ================================================
    STEP 8
    SINH CARRY NUMBER

    Đây là bước quan trọng nhất.
    ================================================
    */

    const carryInfo =
      buildCarryCandidates(
        sourceResult,
        previousContext,
        baseRecommendations
      );


    /*
    ================================================
    STEP 9
    PRIORITY RANKING
    ================================================
    */

    const priorityRecommendations =
      buildPriorityRanking(
        baseRecommendations,
        carryInfo
      );


    /*
    ================================================
    STEP 10
    SAVE BASE
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
    STEP 11
    SAVE CARRY
    ================================================
    */

    const prioritySave =
      await savePrioritySnapshot(
        db,
        predict,
        priorityRecommendations,
        carryInfo
      );


    /*
    ================================================
    STEP 12
    PERFORMANCE REFRESH
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
        x =>
          x.number
      );


    const priorityNumbers =
      priorityRecommendations.map(
        x =>
          x.number
      );


    const promoted =
      priorityRecommendations

        .filter(
          x =>
            x.carryForward
        )

        .map(
          item => ({

            liveRank:
              item.liveRank,

            currentNumber:
              item.number,

            baseRank:
              item.baseRank ??
              null,

            currentBaseQualified:
              Boolean(
                item.currentBaseQualified
              ),

            carryHitStreak:
              item.carryHitStreak,

            previousHitDate:
              item.previousHitDate,

            previousNumber:
              item.previousNumber,

            carrySources:
              item.carrySources
          })
        );


    /*
    ================================================
    OUTPUT
    ================================================
    */

    return json({

      success: true,

      module:
        "v2.6.2-live-validation-carry",

      version:
        "carry-v2",

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

        carry:
          evaluatedPriorityNow
      },


      /*
      ==============================================
      CẦU HIT NGÀY SOURCE
      ==============================================
      */

      previousDayEvidence: {

        available:
          previousContext.available,

        date:
          previousContext.date,

        actualNumbers:
          previousContext.actualNumbers,

        hits:
          previousContext.hits
      },


      /*
      ==============================================
      CẦU ĐƯỢC SINH LẠI
      ==============================================
      */

      carryForward: {

        generatedCount:
          carryInfo.generated.length,

        failedCount:
          carryInfo.failed.length,

        generated:
          carryInfo.generated,

        failed:
          carryInfo.failed
      },


      /*
      ==============================================
      BASE V2.6.2
      ==============================================
      */

      basePrediction: {

        action:

          baseSave.savedNew

            ?

            "saved-and-locked"

            :

            baseSave.blocked
            ||
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
          )
      },


      /*
      ==============================================
      CARRY PRIORITY
      ==============================================
      */

      priorityPrediction: {

        action:

          prioritySave.savedNew

            ?

            "saved-and-locked"

            :

            prioritySave.blocked
            ||
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


      /*
      ==============================================
      PERFORMANCE
      ==============================================
      */

      comparison: {

        base:
          basePerformance,

        carry:
          priorityPerformance
      },


      /*
      ==============================================
      RULE
      ==============================================
      */

      rule: {

        carryAfterPreviousHit:
          true,

        /*
         * Quan trọng:
         * cầu có thể bị V2.6.2 loại hôm nay
         * nhưng vẫn được Carry.
         */

        carryEvenIfV262RejectsToday:
          true,

        generateFromSameBridgeKeyOnLatestResult:
          true,

        /*
         * MISS kỳ tiếp theo thì dừng.
         */

        stopCarryAfterMiss:
          true,

        multipleCarryBridgesAllowed:
          true,

        deduplicateByNumber:
          true,

        baseV262Unchanged:
          true,

        modifyPredictJs:
          false
      }
    });

  }
  catch (error) {

    console.error(
      "save-prediction-carry:",
      error
    );


    return json(
      {

        success: false,

        module:
          "v2.6.2-live-validation-carry",

        stage:
          "save-prediction",

        message:
          error?.message
          ||
          "Lỗi save prediction",

        stack:

          error?.stack

            ?

            String(
              error.stack
            )
              .slice(
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