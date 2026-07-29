// ============================================================
// functions/api/save-prediction.js
// XSMB Analytics V2.6.3
//
// Live Validation + Carry Priority
//
// Mục tiêu:
// 1. Chấm prediction cũ khi kết quả xuất hiện.
// 2. Ghi tất cả suggestion HIT vào bridge evidence.
// 3. Bridge nào HIT hôm trước được ưu tiên carry cho kỳ mới.
// 4. ACTIVE: bridge vẫn nằm trong suggestions hôm nay.
// 5. SHADOW: bridge còn trong candidate pool nhưng đã bị filter.
// 6. Prediction cùng ngày được lock, không ghi đè.
// ============================================================

const BASE_MODEL =
  "bridge-v2.6.2";

const PRIORITY_MODEL =
  "bridge-v2.6.2-live-priority-v2";

const MODULE =
  "v2.6.3-live-validation-priority";

const VERSION =
  "live-priority-v2.6.3";


// ============================================================
// Helpers
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
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


function safeJSON(value, fallback = null) {
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
  } catch {
    return fallback;
  }
}


function round2(value) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return (
    Math.round(n * 100) /
    100
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
      .trim()
      .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits
    .slice(-2)
    .padStart(2, "0");
}


function uniqueNumbers(values = []) {
  return [
    ...new Set(
      values
        .map(normalizeNumber)
        .filter(Boolean)
    )
  ];
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


// ============================================================
// D1 result parsing
// ============================================================

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
    for (
      const item of value
    ) {
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

  const directCandidates = [
    row.loto,
    row.loto_json,
    row.lotoJson,
    row.loto_numbers,
    row.lotoNumbers
  ];


  for (
    const candidate of
    directCandidates
  ) {
    if (!candidate) {
      continue;
    }

    const parsed =
      safeJSON(
        candidate,
        candidate
      );

    const values =
      collectStrings(parsed);

    const numbers =
      uniqueNumbers(values);

    if (
      numbers.length >= 10
    ) {
      return numbers;
    }
  }


  const prizeKeys = [
    "special",
    "db",
    "g0",
    "g1",
    "g2",
    "g3",
    "g4",
    "g5",
    "g6",
    "g7",
    "prize_special",
    "prize1",
    "prize2",
    "prize3",
    "prize4",
    "prize5",
    "prize6",
    "prize7"
  ];


  const rawValues = [];


  for (
    const key of prizeKeys
  ) {
    if (
      row[key] === undefined ||
      row[key] === null
    ) {
      continue;
    }

    const parsed =
      safeJSON(
        row[key],
        row[key]
      );

    collectStrings(
      parsed,
      rawValues
    );
  }


  if (!rawValues.length) {
    const possibleJSON = [
      row.result_json,
      row.resultJson,
      row.data_json,
      row.data
    ];

    for (
      const item of
      possibleJSON
    ) {
      if (!item) {
        continue;
      }

      const parsed =
        safeJSON(item);

      if (parsed) {
        collectStrings(
          parsed,
          rawValues
        );
      }
    }
  }


  return uniqueNumbers(
    rawValues
  );
}


// ============================================================
// Predict parser
// ============================================================

function parsePredictPayload(payload) {
  if (
    !payload ||
    typeof payload !==
    "object"
  ) {
    throw new Error(
      "Predict API không trả JSON object hợp lệ"
    );
  }


  if (
    payload.success === false
  ) {
    throw new Error(
      payload.message ||
      payload.error ||
      "Predict API trả success=false"
    );
  }


  const data =
    payload.data &&
    typeof payload.data ===
    "object"
      ? payload.data
      : {};


  const sourceDate =
    normalizeDate(
      payload.sourceDate ||
      data.sourceDate ||
      payload.latestResult ||
      data.latestResult ||
      payload.latestDate ||
      data.latestDate
    );


  let predictionDate =
    normalizeDate(
      payload.predictionDate ||
      data.predictionDate ||
      payload.targetDate ||
      data.targetDate
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


  let recommendations =
    payload.suggestions ||
    data.suggestions ||
    payload.recommendations ||
    data.recommendations ||
    payload.topNumbers ||
    data.topNumbers ||
    [];


  if (
    !Array.isArray(
      recommendations
    )
  ) {
    recommendations = [];
  }


  recommendations =
    recommendations
      .map(
        (
          item,
          index
        ) => {
          if (
            typeof item ===
            "string" ||
            typeof item ===
            "number"
          ) {
            return {
              rank:
                index + 1,

              baseRank:
                index + 1,

              number:
                normalizeNumber(item),

              bridgeKey:
                null,

              bridge:
                null
            };
          }


          if (
            !item ||
            typeof item !==
            "object"
          ) {
            return null;
          }


          return {
            ...item,

            rank:
              Number(
                item.rank
              ) ||
              index + 1,

            baseRank:
              Number(
                item.baseRank
              ) ||
              Number(
                item.rank
              ) ||
              index + 1,

            number:
              normalizeNumber(
                item.number ??
                item.value ??
                item.loto
              ),

            bridgeKey:
              item.bridgeKey ||
              item.ruleKey ||
              null,

            bridge:
              item.bridge ||
              item.rule ||
              null
          };
        }
      )
      .filter(
        item =>
          item &&
          item.number
      );


  let candidates =
    payload.candidates ||
    data.candidates ||
    payload.candidatePool ||
    data.candidatePool ||
    payload.activeCandidates ||
    data.activeCandidates ||
    [];


  if (
    !Array.isArray(
      candidates
    )
  ) {
    candidates = [];
  }


  candidates =
    candidates
      .map(
        (
          item,
          index
        ) => {
          if (
            !item ||
            typeof item !==
            "object"
          ) {
            return null;
          }

          return {
            ...item,

            candidateIndex:
              index,

            number:
              normalizeNumber(
                item.number ??
                item.value ??
                item.loto
              ),

            bridgeKey:
              item.bridgeKey ||
              item.ruleKey ||
              null,

            bridge:
              item.bridge ||
              item.rule ||
              null
          };
        }
      )
      .filter(
        item =>
          item &&
          item.number &&
          item.bridgeKey
      );


  if (!sourceDate) {
    throw new Error(
      "Predict API không có sourceDate"
    );
  }


  if (!predictionDate) {
    throw new Error(
      "Không xác định được predictionDate"
    );
  }


  if (
    !recommendations.length
  ) {
    throw new Error(
      "Predict API không có suggestions để theo dõi"
    );
  }


  return {
    model:
      payload.model ||
      payload.version ||
      data.model ||
      data.version ||
      BASE_MODEL,

    sourceDate,

    predictionDate,

    recommendations,

    candidates
  };
}


// ============================================================
// Fetch Predict
// ============================================================

async function fetchPredict(request) {
  const origin =
    new URL(
      request.url
    ).origin;

  const url =
    `${origin}/api/predict?t=${Date.now()}`;


  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );


  const body =
    await response.text();


  let payload;

  try {
    payload =
      JSON.parse(body);
  }
  catch {
    const error =
      new Error(
        `Predict API không trả JSON. HTTP ${response.status}`
      );

    error.stage =
      "predict-json";

    error.status =
      response.status;

    error.url =
      url;

    error.body =
      body.slice(
        0,
        1000
      );

    throw error;
  }


  if (!response.ok) {
    const error =
      new Error(
        payload?.message ||
        payload?.error ||
        `Predict API HTTP ${response.status}`
      );

    error.stage =
      "predict-http";

    error.status =
      response.status;

    error.url =
      url;

    error.body =
      body.slice(
        0,
        1000
      );

    throw error;
  }


  return parsePredictPayload(
    payload
  );
}


// ============================================================
// Schema
// ============================================================

async function ensureSchema(db) {
  await db.prepare(`
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

      UNIQUE(
        prediction_date,
        model
      )
    )
  `).run();


  await db.prepare(`
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
  `).run();


  await db.prepare(`
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
  `).run();


  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_live_v262_date
    ON prediction_live_v262(
      prediction_date
    )
  `).run();


  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_bridge_evidence_date
    ON prediction_bridge_evidence(
      prediction_date
    )
  `).run();


  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_carry_v262_date
    ON prediction_carry_v262(
      prediction_date
    )
  `).run();
}


// ============================================================
// Result lookup
// ============================================================

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


// ============================================================
// Baseline
// ============================================================

function baselineProbability(
  k,
  uniqueCount
) {
  const m =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          uniqueCount
        ) || 0
      )
    );

  const picks =
    Math.max(
      0,
      Math.min(
        100,
        Number(k) || 0
      )
    );


  if (
    !m ||
    !picks
  ) {
    return 0;
  }


  let noHit = 1;


  for (
    let i = 0;
    i < picks;
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


  return round2(
    (1 - noHit) * 100
  );
}


// ============================================================
// Evaluate BASE
// ============================================================

async function evaluatePendingBase(db) {
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
      continue;
    }


    const numbers =
      recommendations
        .map(
          item =>
            normalizeNumber(
              item.number
            )
        )
        .filter(Boolean);


    const hit =
      list =>
        list.some(
          number =>
            actualSet.has(
              number
            )
        );


    const top1 =
      numbers.slice(0, 1);

    const top3 =
      numbers.slice(0, 3);

    const top5 =
      numbers.slice(0, 5);


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

        hit(top1) ? 1 : 0,
        hit(top3) ? 1 : 0,
        hit(top5) ? 1 : 0,

        baselineProbability(
          top1.length,
          actual.length
        ),

        baselineProbability(
          top3.length,
          actual.length
        ),

        baselineProbability(
          top5.length,
          actual.length
        ),

        row.id
      )
      .run();


    /*
    ======================================================
    TẤT CẢ SỐ GỢI Ý ĐÃ VỀ ĐƯỢC GHI VÀO EVIDENCE.

    Đây là dữ liệu nền để tạo gợi ý ưu tiên ngày tiếp theo.
    ======================================================
    */

    for (
      let i = 0;
      i < recommendations.length;
      i++
    ) {
      const rec =
        recommendations[i];

      const number =
        normalizeNumber(
          rec.number
        );

      const bridgeKey =
        rec.bridgeKey ||
        rec.ruleKey ||
        null;


      if (
        !number ||
        !bridgeKey
      ) {
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
            base_rank,

            hit,

            score,
            strength
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )

          ON CONFLICT(
            prediction_date,
            model,
            bridge_key,
            number
          )

          DO UPDATE SET
            hit = excluded.hit,
            base_rank = excluded.base_rank,
            score = excluded.score,
            strength = excluded.strength
        `)
        .bind(
          row.prediction_date,
          row.source_date,

          BASE_MODEL,

          bridgeKey,
          rec.bridge ||
          rec.rule ||
          null,

          number,

          Number(
            rec.baseRank ||
            rec.rank ||
            i + 1
          ),

          actualSet.has(number)
            ? 1
            : 0,

          Number(
            rec.score
          ) || 0,

          rec.strength ||
          null
        )
        .run();
    }


    evaluated++;
  }


  return evaluated;
}


// ============================================================
// Evaluate Carry
// ============================================================

async function evaluatePendingCarry(db) {
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


    const currentNumber =
      normalizeNumber(
        row.current_number
      );


    const hit =
      currentNumber &&
      new Set(actual)
        .has(
          currentNumber
        )
        ? 1
        : 0;


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
        hit,
        row.id
      )
      .run();


    evaluated++;
  }


  return evaluated;
}


// ============================================================
// Previous HIT evidence
// ============================================================

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

          bridgeKey:
            row.bridge_key,

          bridge:
            row.bridge,

          score:
            round2(
              row.score
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


// ============================================================
// Save BASE
// ============================================================

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

      numbers:
        String(
          existing.numbers || ""
        )
          .split(",")
          .filter(Boolean),

      recommendations:
        safeJSON(
          existing.recommendations_json,
          []
        ),

      status:
        existing.status,

      createdAt:
        existing.created_at
    };
  }


  const recommendations =
    predict.recommendations;


  const numbers =
    recommendations
      .map(
        item =>
          item.number
      )
      .filter(Boolean);


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

      numbers.join(","),

      JSON.stringify(
        recommendations
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

    numbers,

    recommendations,

    status:
      "locked"
  };
}


// ============================================================
// Find bridge hôm nay
// ============================================================

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
        "active",

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
        "shadow",

      data:
        shadow
    };
  }


  return {
    status:
      "shadow-unresolved",

    data:
      null
  };
}


// ============================================================
// Save Carry / ưu tiên bridge đã HIT
// ============================================================

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


    let carryStatus;
    let currentNumber = null;
    let currentRank = null;
    let currentScore = null;
    let currentStrength = null;


    if (
      current.status ===
      "active" &&
      current.data
    ) {
      carryStatus =
        "ACTIVE";

      currentNumber =
        normalizeNumber(
          current.data.number
        );

      currentRank =
        Number(
          current.data.baseRank ||
          current.data.rank
        ) || null;

      currentScore =
        Number(
          current.data.score
        ) || 0;

      currentStrength =
        current.data.strength ||
        null;
    }
    else if (
      current.status ===
      "shadow" &&
      current.data
    ) {
      carryStatus =
        "SHADOW";

      currentNumber =
        normalizeNumber(
          current.data.number
        );

      currentScore =
        Number(
          current.data.score
        ) || 0;

      currentStrength =
        current.data.strength ||
        null;
    }
    else {
      carryStatus =
        "SHADOW_UNRESOLVED";
    }


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
          previous_rank,

          current_number,
          current_rank,

          carry_status,

          previous_score,
          current_score,

          previous_strength,
          current_strength
        )

        VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )

        ON CONFLICT(
          prediction_date,
          model,
          bridge_key
        )

        DO UPDATE SET
          current_number =
            excluded.current_number,

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
        null,

        previous.number,
        previous.baseRank,

        currentNumber,
        currentRank,

        carryStatus,

        previous.score || 0,
        currentScore,

        previous.strength ||
        null,

        currentStrength
      )
      .run();


    saved.push({
      previousDate:
        previousEvidence.date,

      previousNumber:
        previous.number,

      previousRank:
        previous.baseRank,

      bridgeKey:
        previous.bridgeKey,

      bridge:
        previous.bridge,

      status:
        carryStatus,

      currentNumber,
      currentRank,

      previousScore:
        previous.score,

      currentScore,

      previousStrength:
        previous.strength,

      currentStrength
    });
  }


  return saved;
}


// ============================================================
// Main
// ============================================================

export async function onRequestGet(
  context
) {
  const db =
    context.env.DB;


  if (!db) {
    return json(
      {
        success: false,

        module:
          MODULE,

        stage:
          "database",

        message:
          "Không tìm thấy binding DB"
      },
      500
    );
  }


  let evaluatedBase = 0;
  let evaluatedCarry = 0;


  try {
    await ensureSchema(db);


    /*
    1. Chấm dữ liệu cũ trước.

    Số nào trong suggestions đã về sẽ được ghi
    vào prediction_bridge_evidence với hit=1.
    */
    evaluatedBase =
      await evaluatePendingBase(
        db
      );


    evaluatedCarry =
      await evaluatePendingCarry(
        db
      );


    /*
    2. Tạo prediction BASE hiện tại.
    */
    const predict =
      await fetchPredict(
        context.request
      );


    /*
    3. Lấy tất cả bridge đã HIT ở ngày trước.
    Đây là nhóm được đưa sang "ưu tiên".
    */
    const previousDayEvidence =
      await getPreviousDayEvidence(
        db,
        predict.predictionDate
      );


    /*
    4. Lock prediction BASE.
    */
    const basePrediction =
      await saveBasePrediction(
        db,
        predict
      );


    /*
    5. Carry từng bridge HIT.
    */
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
      },

      diagnostic: {
        recommendations:
          predict.recommendations.length,

        candidatePoolExposed:
          predict.candidates.length
      }
    });
  }
  catch (error) {
    return json(
      {
        success: false,

        module:
          MODULE,

        version:
          VERSION,

        stage:
          error.stage ||
          "save-prediction",

        message:
          error.message ||
          String(error),

        evaluatedNow: {
          base:
            evaluatedBase,

          carry:
            evaluatedCarry
        }
      },
      500
    );
  }
}
