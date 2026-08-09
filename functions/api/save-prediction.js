// ============================================================
// functions/api/save-prediction.js
// XSMB Analytics V2.7 AB-BA
//
// Mục tiêu:
// - Lưu dàn AB-BA trước khi có kết quả.
// - Một trong hai số AB hoặc BA về => pair HIT.
// - Ghi bridge đã HIT để ưu tiên kỳ tiếp theo.
// - Carry theo bridgeKey, KHÔNG carry cứng số cũ.
// ============================================================

const BASE_MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const PRIORITY_MODEL =
  "bridge-v2.7-abba-live-priority-v1";

const MODULE =
  "v2.7-abba-live-validation";

const VERSION =
  "abba-live-priority-v2.7";


function json(data, status = 200) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control":
          "no-store"
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
    return JSON.parse(value);
  }
  catch {
    return fallback;
  }
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


function canonicalPairKey(value) {
  const a =
    normalizeNumber(value);

  if (!a) {
    return null;
  }

  const b =
    reverseNumber(a);

  return [a, b]
    .sort()
    .join("-");
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


function pairDisplay(numbers) {
  if (!numbers.length) {
    return "--";
  }

  return numbers.length === 1
    ? numbers[0]
    : `${numbers[0]}-${numbers[1]}`;
}


function normalizeDate(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .slice(0, 10);
}


function addDays(
  dateString,
  days
) {
  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function collectStrings(
  value,
  output = []
) {
  if (
    value === null ||
    value === undefined
  ) {
    return output;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    output.push(
      String(value)
    );

    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(
        item,
        output
      );
    }

    return output;
  }

  if (
    typeof value ===
    "object"
  ) {
    for (
      const item of
      Object.values(value)
    ) {
      collectStrings(
        item,
        output
      );
    }
  }

  return output;
}


function extractLotoFromResult(row) {
  if (!row) {
    return [];
  }

  const prizeKeys = [
    "special",
    "g1",
    "g2",
    "g3",
    "g4",
    "g5",
    "g6",
    "g7"
  ];

  const raw = [];

  for (const key of prizeKeys) {
    const value =
      row[key];

    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    const parsed =
      safeJSON(
        value,
        value
      );

    collectStrings(
      parsed,
      raw
    );
  }

  const set =
    new Set();

  for (const value of raw) {
    const tokens =
      String(value)
        .match(/\d+/g)
      ||
      [];

    for (const token of tokens) {
      if (
        token.length >= 2
      ) {
        set.add(
          token.slice(-2)
        );
      }
    }
  }

  return [
    ...set
  ];
}


function normalizeRecommendation(
  item,
  index
) {
  if (
    !item ||
    typeof item !==
    "object"
  ) {
    return null;
  }

  const number =
    normalizeNumber(
      item.number
    );

  if (!number) {
    return null;
  }

  const pairNumbers =
    pairNumbersFromItem(
      item
    );

  return {
    ...item,

    rank:
      Number(
        item.rank
      )
      ||
      index + 1,

    baseRank:
      Number(
        item.baseRank
      )
      ||
      Number(
        item.rank
      )
      ||
      index + 1,

    number,

    reverseNumber:
      pairNumbers[1]
      ||
      pairNumbers[0],

    pairNumbers,

    pairKey:
      item.pairKey
      ||
      canonicalPairKey(
        number
      ),

    pair:
      item.pair
      ||
      pairDisplay(
        pairNumbers
      ),

    bridgeKey:
      item.bridgeKey
      ||
      item.ruleKey
      ||
      null,

    bridge:
      item.bridge
      ||
      item.rule
      ||
      null
  };
}


function parsePredictPayload(
  payload
) {
  if (
    !payload ||
    typeof payload !==
    "object"
  ) {
    throw new Error(
      "Predict API không trả JSON hợp lệ"
    );
  }

  if (
    payload.success === false
  ) {
    throw new Error(
      payload.message ||
      payload.error ||
      "Predict API success=false"
    );
  }

  const sourceDate =
    normalizeDate(
      payload.sourceDate ||
      payload.latestResult ||
      payload.latestDate
    );

  let predictionDate =
    normalizeDate(
      payload.predictionDate ||
      payload.targetDate
    );

  if (
    !predictionDate &&
    sourceDate
  ) {
    predictionDate =
      addDays(
        sourceDate,
        1
      );
  }

  const rawRecommendations =
    Array.isArray(
      payload.suggestions
    )
      ? payload.suggestions
      : [];

  const recommendations =
    rawRecommendations
      .map(
        normalizeRecommendation
      )
      .filter(Boolean);

  const rawCandidates =
    Array.isArray(
      payload.candidates
    )
      ? payload.candidates
      : [];

  const candidates =
    rawCandidates
      .map(
        normalizeRecommendation
      )
      .filter(Boolean);

  if (!sourceDate) {
    throw new Error(
      "Predict API thiếu sourceDate"
    );
  }

  if (!predictionDate) {
    throw new Error(
      "Predict API thiếu predictionDate"
    );
  }

  if (
    !recommendations.length
  ) {
    throw new Error(
      "Predict API không có AB-BA suggestions"
    );
  }

  return {
    sourceDate,
    predictionDate,
    recommendations,
    candidates
  };
}


async function fetchPredict(
  request
) {
  const origin =
    new URL(
      request.url
    ).origin;

  const response =
    await fetch(
      `${origin}/api/predict?t=${Date.now()}`,
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );

  const text =
    await response.text();

  let payload;

  try {
    payload =
      JSON.parse(text);
  }
  catch {
    throw new Error(
      `Predict API không trả JSON. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Predict API HTTP ${response.status}`
    );
  }

  return parsePredictPayload(
    payload
  );
}


async function ensureColumn(
  db,
  table,
  column,
  definition
) {
  const info =
    await db
      .prepare(
        `PRAGMA table_info(${table})`
      )
      .all();

  const exists =
    (info.results || [])
      .some(
        item =>
          item.name === column
      );

  if (!exists) {
    await db
      .prepare(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      )
      .run();
  }
}


async function ensureSchema(db) {
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_live_v262 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_date TEXT NOT NULL,
        source_date TEXT NOT NULL,
        model TEXT NOT NULL,
        numbers TEXT NOT NULL,
        recommendations_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'locked',
        evaluated INTEGER NOT NULL DEFAULT 0,
        evaluated_at TEXT,
        actual_numbers TEXT,
        actual_unique_count INTEGER,
        top1_hit INTEGER,
        top3_hit INTEGER,
        top5_hit INTEGER,
        baseline_top1 REAL,
        baseline_top3 REAL,
        baseline_top5 REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(prediction_date, model)
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_bridge_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_date TEXT NOT NULL,
        source_date TEXT,
        model TEXT NOT NULL,
        bridge_key TEXT NOT NULL,
        bridge TEXT,
        number TEXT NOT NULL,
        base_rank INTEGER,
        hit INTEGER NOT NULL DEFAULT 0,
        score REAL,
        strength TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(
          prediction_date,
          model,
          bridge_key,
          number
        )
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_carry_v262 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_date TEXT NOT NULL,
        source_date TEXT NOT NULL,
        previous_prediction_date TEXT NOT NULL,
        model TEXT NOT NULL,
        bridge_key TEXT NOT NULL,
        bridge TEXT,
        previous_number TEXT NOT NULL,
        previous_rank INTEGER,
        current_number TEXT,
        current_rank INTEGER,
        carry_status TEXT NOT NULL,
        previous_score REAL,
        current_score REAL,
        previous_strength TEXT,
        current_strength TEXT,
        hit INTEGER,
        evaluated INTEGER NOT NULL DEFAULT 0,
        evaluated_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(
          prediction_date,
          model,
          bridge_key
        )
      )
    `)
    .run();


  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "reverse_number",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "pair_key",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "pair_json",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "hit_number",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "hit_count",
    "INTEGER DEFAULT 0"
  );

  await ensureColumn(
    db,
    "prediction_carry_v262",
    "previous_reverse_number",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_carry_v262",
    "current_reverse_number",
    "TEXT"
  );

  await ensureColumn(
    db,
    "prediction_carry_v262",
    "previous_hit_number",
    "TEXT"
  );


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_live_v262_date
      ON prediction_live_v262(prediction_date)
    `)
    .run();

  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_bridge_evidence_date
      ON prediction_bridge_evidence(prediction_date)
    `)
    .run();

  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_carry_v262_date
      ON prediction_carry_v262(prediction_date)
    `)
    .run();
}


async function getResultByDate(
  db,
  date
) {
  try {
    const row =
      await db
        .prepare(`
          SELECT *
          FROM results
          WHERE draw_date = ?
          LIMIT 1
        `)
        .bind(date)
        .first();

    if (row) {
      return row;
    }
  }
  catch {}

  try {
    return await db
      .prepare(`
        SELECT *
        FROM results
        WHERE date = ?
        LIMIT 1
      `)
      .bind(date)
      .first();
  }
  catch {
    return null;
  }
}


function baselineProbability(
  pairCount,
  uniqueCount
) {
  /*
  pairCount = số lượng cặp.
  Mỗi cặp thường phủ 2 số.
  Dùng số covered thực tế ở evaluate để tính.
  */
  const m =
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
        Number(pairCount) || 0
      )
    );

  if (
    !m ||
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
      100 - m - i;

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

  return Number(
    (
      (1 - noHit) *
      100
    ).toFixed(2)
  );
}


function pairHit(
  pairNumbers,
  actualSet
) {
  const hitNumbers =
    pairNumbers.filter(
      number =>
        actualSet.has(
          number
        )
    );

  return {
    hit:
      hitNumbers.length > 0,

    hitNumbers,

    hitCount:
      hitNumbers.length
  };
}


async function evaluatePendingBase(
  db
) {
  const pending =
    await db
      .prepare(`
        SELECT *
        FROM prediction_live_v262
        WHERE model = ?
          AND evaluated = 0
        ORDER BY prediction_date ASC
      `)
      .bind(BASE_MODEL)
      .all();

  let evaluated = 0;


  for (
    const row of
    pending.results || []
  ) {
    const result =
      await getResultByDate(
        db,
        row.prediction_date
      );

    if (!result) {
      continue;
    }

    const actual =
      extractLotoFromResult(
        result
      );

    if (!actual.length) {
      continue;
    }

    const actualSet =
      new Set(actual);

    const rawRecommendations =
      safeJSON(
        row.recommendations_json,
        []
      );

    const recommendations =
      Array.isArray(
        rawRecommendations
      )
        ? rawRecommendations
            .map(
              normalizeRecommendation
            )
            .filter(Boolean)
        : [];

    if (!recommendations.length) {
      continue;
    }


    const evaluatedPairs =
      recommendations.map(
        item => ({
          item,
          result:
            pairHit(
              item.pairNumbers,
              actualSet
            )
        })
      );


    const topHit =
      count =>
        evaluatedPairs
          .slice(
            0,
            count
          )
          .some(
            entry =>
              entry.result.hit
          );


    /*
    Baseline phải dùng số lượng số thực sự được bao phủ,
    không dùng "5 cặp = 5 số".
    */
    const coveredCount =
      count =>
        new Set(
          recommendations
            .slice(
              0,
              count
            )
            .flatMap(
              item =>
                item.pairNumbers
            )
        ).size;


    await db
      .prepare(`
        UPDATE prediction_live_v262

        SET
          evaluated = 1,
          evaluated_at = CURRENT_TIMESTAMP,
          actual_numbers = ?,
          actual_unique_count = ?,
          top1_hit = ?,
          top3_hit = ?,
          top5_hit = ?,
          baseline_top1 = ?,
          baseline_top3 = ?,
          baseline_top5 = ?

        WHERE id = ?
      `)
      .bind(
        actual.join(","),
        actual.length,

        topHit(1) ? 1 : 0,
        topHit(3) ? 1 : 0,
        topHit(5) ? 1 : 0,

        baselineProbability(
          coveredCount(1),
          actual.length
        ),

        baselineProbability(
          coveredCount(3),
          actual.length
        ),

        baselineProbability(
          coveredCount(5),
          actual.length
        ),

        row.id
      )
      .run();


    /*
    Mọi pair gợi ý đều được lưu evidence.
    Nếu AB hoặc BA về -> bridge HIT.
    */
    for (
      let i = 0;
      i < evaluatedPairs.length;
      i++
    ) {
      const {
        item,
        result: hitResult
      } =
        evaluatedPairs[i];

      if (!item.bridgeKey) {
        continue;
      }

      await db
        .prepare(`
          INSERT INTO prediction_bridge_evidence (
            prediction_date,
            source_date,
            model,
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
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )

          ON CONFLICT(
            prediction_date,
            model,
            bridge_key,
            number
          )

          DO UPDATE SET
            reverse_number =
              excluded.reverse_number,
            pair_key =
              excluded.pair_key,
            pair_json =
              excluded.pair_json,
            hit =
              excluded.hit,
            hit_number =
              excluded.hit_number,
            hit_count =
              excluded.hit_count,
            base_rank =
              excluded.base_rank,
            score =
              excluded.score,
            strength =
              excluded.strength
        `)
        .bind(
          row.prediction_date,
          row.source_date,

          BASE_MODEL,

          item.bridgeKey,
          item.bridge ||
          null,

          item.number,
          item.reverseNumber,

          item.pairKey,
          JSON.stringify(
            item.pairNumbers
          ),

          Number(
            item.baseRank ||
            item.rank ||
            i + 1
          ),

          hitResult.hit
            ? 1
            : 0,

          hitResult.hitNumbers
            .join(","),

          hitResult.hitCount,

          Number(
            item.pairScore ||
            item.score ||
            0
          ),

          item.strength ||
          null
        )
        .run();
    }

    evaluated++;
  }

  return evaluated;
}


async function evaluatePendingCarry(
  db
) {
  const pending =
    await db
      .prepare(`
        SELECT *
        FROM prediction_carry_v262

        WHERE model = ?
          AND evaluated = 0
          AND current_number IS NOT NULL

        ORDER BY prediction_date ASC
      `)
      .bind(
        PRIORITY_MODEL
      )
      .all();

  let evaluated = 0;


  for (
    const row of
    pending.results || []
  ) {
    const result =
      await getResultByDate(
        db,
        row.prediction_date
      );

    if (!result) {
      continue;
    }

    const actual =
      extractLotoFromResult(
        result
      );

    if (!actual.length) {
      continue;
    }

    const actualSet =
      new Set(actual);

    const currentPair =
      [
        normalizeNumber(
          row.current_number
        ),
        normalizeNumber(
          row.current_reverse_number
        )
      ]
        .filter(Boolean);

    const hitResult =
      pairHit(
        [
          ...new Set(
            currentPair
          )
        ],
        actualSet
      );


    await db
      .prepare(`
        UPDATE prediction_carry_v262

        SET
          hit = ?,
          evaluated = 1,
          evaluated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `)
      .bind(
        hitResult.hit
          ? 1
          : 0,

        row.id
      )
      .run();

    evaluated++;
  }

  return evaluated;
}


async function getPreviousDayEvidence(
  db,
  predictionDate
) {
  const previousDate =
    addDays(
      predictionDate,
      -1
    );

  if (!previousDate) {
    return {
      available: false,
      date: null,
      hits: []
    };
  }

  const rows =
    await db
      .prepare(`
        SELECT *
        FROM prediction_bridge_evidence

        WHERE prediction_date = ?
          AND model = ?
          AND hit = 1

        ORDER BY
          base_rank ASC,
          score DESC
      `)
      .bind(
        previousDate,
        BASE_MODEL
      )
      .all();

  const hits =
    (rows.results || [])
      .map(
        row => ({
          baseRank:
            Number(
              row.base_rank
            ) || null,

          number:
            normalizeNumber(
              row.number
            ),

          reverseNumber:
            normalizeNumber(
              row.reverse_number
            )
            ||
            reverseNumber(
              row.number
            ),

          pairKey:
            row.pair_key
            ||
            canonicalPairKey(
              row.number
            ),

          pairNumbers:
            safeJSON(
              row.pair_json,
              null
            )
            ||
            [
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
              .filter(Boolean),

          bridgeKey:
            row.bridge_key,

          bridge:
            row.bridge,

          hitNumber:
            row.hit_number ||
            null,

          score:
            Number(
              row.score || 0
            ),

          strength:
            row.strength
        })
      );

  return {
    available:
      hits.length > 0,

    date:
      previousDate,

    hits
  };
}


async function saveBasePrediction(
  db,
  predict
) {
  const existing =
    await db
      .prepare(`
        SELECT *
        FROM prediction_live_v262

        WHERE prediction_date = ?
          AND model = ?

        LIMIT 1
      `)
      .bind(
        predict.predictionDate,
        BASE_MODEL
      )
      .first();

  if (existing) {
    return {
      action:
        "already-locked",

      savedNew:
        false,

      sourceDate:
        existing.source_date,

      predictionDate:
        existing.prediction_date,

      recommendations:
        safeJSON(
          existing.recommendations_json,
          []
        )
    };
  }


  const pairLabels =
    predict.recommendations
      .map(
        item =>
          item.pair
      );


  await db
    .prepare(`
      INSERT INTO prediction_live_v262 (
        prediction_date,
        source_date,
        model,
        numbers,
        recommendations_json,
        status
      )

      VALUES (
        ?, ?, ?, ?, ?, 'locked'
      )
    `)
    .bind(
      predict.predictionDate,
      predict.sourceDate,
      BASE_MODEL,
      pairLabels.join(","),
      JSON.stringify(
        predict.recommendations
      )
    )
    .run();


  return {
    action:
      "saved-and-locked",

    savedNew:
      true,

    sourceDate:
      predict.sourceDate,

    predictionDate:
      predict.predictionDate,

    pairs:
      pairLabels,

    recommendations:
      predict.recommendations
  };
}


function findCurrentBridge(
  bridgeKey,
  predict
) {
  const active =
    predict.recommendations
      .find(
        item =>
          item.bridgeKey ===
          bridgeKey
      );

  if (active) {
    return {
      status:
        "ACTIVE",

      data:
        active
    };
  }


  const shadow =
    predict.candidates
      .find(
        item =>
          item.bridgeKey ===
          bridgeKey
      );

  if (shadow) {
    return {
      status:
        "SHADOW",

      data:
        shadow
    };
  }


  return {
    status:
      "SHADOW_UNRESOLVED",

    data:
      null
  };
}


async function saveCarry(
  db,
  predict,
  previousEvidence
) {
  const saved = [];

  if (
    !previousEvidence?.hits?.length
  ) {
    return saved;
  }


  for (
    const previous of
    previousEvidence.hits
  ) {
    if (!previous.bridgeKey) {
      continue;
    }

    const current =
      findCurrentBridge(
        previous.bridgeKey,
        predict
      );

    const currentItem =
      current.data;

    const currentPair =
      currentItem
        ? pairNumbersFromItem(
            currentItem
          )
        : [];

    const currentNumber =
      currentPair[0] ||
      null;

    const currentReverseNumber =
      currentPair[1] ||
      currentPair[0] ||
      null;


    await db
      .prepare(`
        INSERT INTO prediction_carry_v262 (
          prediction_date,
          source_date,
          previous_prediction_date,
          model,
          bridge_key,
          bridge,
          previous_number,
          previous_reverse_number,
          previous_hit_number,
          previous_rank,
          current_number,
          current_reverse_number,
          current_rank,
          carry_status,
          previous_score,
          current_score,
          previous_strength,
          current_strength
        )

        VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )

        ON CONFLICT(
          prediction_date,
          model,
          bridge_key
        )

        DO UPDATE SET
          current_number =
            excluded.current_number,
          current_reverse_number =
            excluded.current_reverse_number,
          current_rank =
            excluded.current_rank,
          carry_status =
            excluded.carry_status,
          current_score =
            excluded.current_score,
          current_strength =
            excluded.current_strength
      `)
      .bind(
        predict.predictionDate,
        predict.sourceDate,
        previousEvidence.date,
        PRIORITY_MODEL,

        previous.bridgeKey,
        previous.bridge ||
        currentItem?.bridge ||
        null,

        previous.number,
        previous.reverseNumber,
        previous.hitNumber,

        previous.baseRank,

        currentNumber,
        currentReverseNumber,

        Number(
          currentItem?.baseRank ||
          currentItem?.rank ||
          0
        )
        ||
        null,

        current.status,

        Number(
          previous.score || 0
        ),

        Number(
          currentItem?.pairScore ||
          currentItem?.score ||
          0
        ),

        previous.strength ||
        null,

        currentItem?.strength ||
        null
      )
      .run();


    saved.push({
      previousDate:
        previousEvidence.date,

      previousPair:
        pairDisplay(
          previous.pairNumbers
        ),

      previousHitNumber:
        previous.hitNumber,

      bridgeKey:
        previous.bridgeKey,

      bridge:
        previous.bridge,

      status:
        current.status,

      currentPair:
        pairDisplay(
          currentPair
        ),

      currentNumber,

      currentReverseNumber
    });
  }

  return saved;
}


export async function onRequestGet(
  context
) {
  const db =
    context.env.DB;

  if (!db) {
    return json(
      {
        success: false,
        module: MODULE,
        message:
          "Không tìm thấy D1 binding DB"
      },
      500
    );
  }


  try {
    await ensureSchema(
      db
    );


    const evaluatedBase =
      await evaluatePendingBase(
        db
      );


    const evaluatedCarry =
      await evaluatePendingCarry(
        db
      );


    const predict =
      await fetchPredict(
        context.request
      );


    const previousDayEvidence =
      await getPreviousDayEvidence(
        db,
        predict.predictionDate
      );


    const basePrediction =
      await saveBasePrediction(
        db,
        predict
      );


    const carry =
      await saveCarry(
        db,
        predict,
        previousDayEvidence
      );


    return json({
      success: true,

      module:
        MODULE,

      version:
        VERSION,

      baseModel:
        BASE_MODEL,

      priorityModel:
        PRIORITY_MODEL,

      suggestionMode:
        "AB-BA",

      sourceDate:
        predict.sourceDate,

      predictionDate:
        predict.predictionDate,

      evaluatedNow: {
        base:
          evaluatedBase,

        carry:
          evaluatedCarry
      },

      previousDayEvidence,

      basePrediction,

      carryAllHitPositions: true,

      prioritySuggestions: {
        count:
          carry.filter(
            item =>
              item.currentNumber
          ).length,

        active:
          carry.filter(
            item =>
              item.status ===
              "ACTIVE"
          ),

        shadow:
          carry.filter(
            item =>
              item.status ===
              "SHADOW"
          ),

        unresolved:
          carry.filter(
            item =>
              item.status ===
              "SHADOW_UNRESOLVED"
          )
      }
    });
  }
  catch (error) {
    console.error(
      "save-prediction ABBA:",
      error
    );

    return json(
      {
        success: false,
        module:
          MODULE,
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
