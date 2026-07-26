// ============================================================
// functions/api/save-prediction.js
// XSMB Analytics
//
// Live Validation + Carry Evidence
//
// BASE MODEL:
//   bridge-v2.6.2
//
// LIVE MODULE:
//   live-priority-v2
//
// Mục tiêu:
// 1. Không sửa thuật toán BASE V2.6.2
// 2. Lưu prediction trước khi có kết quả
// 3. Chấm prediction cũ khi kết quả xuất hiện
// 4. Tìm TẤT CẢ bridge đã HIT
// 5. Carry theo bridgeKey, không carry theo number
// 6. ACTIVE = bridge vẫn xuất hiện hôm nay
// 7. SHADOW = bridge HIT hôm trước nhưng hôm nay bị filter
// 8. Không dùng target result để tạo prediction
// ============================================================

const BASE_MODEL = "bridge-v2.6.2";
const PRIORITY_MODEL = "bridge-v2.6.2-live-priority-v2";
const MODULE = "v2.6.2-live-validation-priority";
const VERSION = "live-priority-v2";


// ============================================================
// Helpers
// ============================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
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


function round2(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Math.round(n * 100) / 100;
}


function normalizeNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const s = String(value).trim();

  if (!s) {
    return null;
  }

  const digits = s.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits.slice(-2).padStart(2, "0");
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

  return String(value).slice(0, 10);
}


function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  d.setUTCDate(d.getUTCDate() + days);

  return d.toISOString().slice(0, 10);
}


// ============================================================
// D1 result parsing
// Hỗ trợ nhiều dạng dữ liệu khác nhau
// ============================================================

function collectStrings(value, output = []) {
  if (value === null || value === undefined) {
    return output;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    output.push(String(value));
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }

    return output;
  }

  if (typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }

  return output;
}


function extractLotoFromResult(row) {
  if (!row) {
    return [];
  }

  // Trường hợp DB đã có loto / loto_json
  const directCandidates = [
    row.loto,
    row.loto_json,
    row.lotoJson,
    row.loto_numbers,
    row.lotoNumbers
  ];

  for (const candidate of directCandidates) {
    if (!candidate) continue;

    const parsed = safeJSON(candidate, candidate);

    const values = collectStrings(parsed);

    const numbers = uniqueNumbers(values);

    if (numbers.length >= 10) {
      return numbers;
    }
  }

  // ----------------------------------------------------------
  // Nếu DB lưu từng giải
  // ----------------------------------------------------------

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

  for (const key of prizeKeys) {
    if (row[key] === undefined || row[key] === null) {
      continue;
    }

    const parsed = safeJSON(row[key], row[key]);

    collectStrings(parsed, rawValues);
  }

  // Nếu không tìm được theo key chuẩn,
  // thử result_json / data_json
  if (!rawValues.length) {
    const possibleJSON = [
      row.result_json,
      row.resultJson,
      row.data_json,
      row.data
    ];

    for (const item of possibleJSON) {
      if (!item) continue;

      const parsed = safeJSON(item);

      if (parsed) {
        collectStrings(parsed, rawValues);
      }
    }
  }

  return uniqueNumbers(rawValues);
}


// ============================================================
// Predict parser
//
// Không phụ thuộc cứng vào:
// predict.data.predictionDate
//
// Hỗ trợ:
// predictionDate
// data.predictionDate
// recommendations
// data.recommendations
// topNumbers
// ============================================================
function parsePredictPayload(payload) {

  if (
    !payload ||
    typeof payload !== "object"
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
      "Predict API trả success=false"
    );
  }


  const data =
    payload.data &&
    typeof payload.data === "object"
      ?
      payload.data
      :
      {};


  /*
  ====================================================
  SOURCE DATE
  ====================================================
  */

  const sourceDate =
    normalizeDate(

      payload.sourceDate ||

      data.sourceDate ||

      payload.latestResult ||

      data.latestResult ||

      payload.latestDate ||

      data.latestDate
    );


  /*
  ====================================================
  PREDICTION DATE
  ====================================================
  */

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


  /*
  ====================================================
  V2.6.2 DÙNG "suggestions"

  Đây là điểm lỗi của bản cũ.
  ====================================================
  */

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


  /*
  ====================================================
  NORMALIZE TẤT CẢ SUGGESTIONS
  ====================================================
  */

  recommendations =
    recommendations

      .map(
        (
          item,
          index
        ) => {

          /*
          Chỉ có số.
          */

          if (
            typeof item === "string" ||
            typeof item === "number"
          ) {

            return {

              rank:
                index + 1,

              baseRank:
                index + 1,

              number:
                normalizeNumber(
                  item
                ),

              bridgeKey:
                null,

              bridge:
                null
            };
          }


          if (
            !item ||
            typeof item !== "object"
          ) {

            return null;
          }


          const number =
            normalizeNumber(

              item.number ??

              item.value ??

              item.loto
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


  /*
  ====================================================
  CANDIDATE POOL

  Không ảnh hưởng BASE.

  Chỉ dùng cho SHADOW Carry nếu predict.js
  expose candidate pool.
  ====================================================
  */

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
            typeof item !== "object"
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


  /*
  ====================================================
  VALIDATION
  ====================================================
  */

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

    raw:
      payload,


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
    new URL(request.url).origin;

  const url =
    `${origin}/api/predict?t=${Date.now()}`;

  let response;

  try {
    response = await fetch(
      url,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    const e =
      new Error(
        `Không gọi được Predict API: ${error.message}`
      );

    e.stage = "predict-fetch";
    e.url = url;

    throw e;
  }


  const body = await response.text();

  let payload = null;

  try {
    payload = JSON.parse(body);
  } catch {
    const e =
      new Error(
        `Predict API không trả JSON. HTTP ${response.status}`
      );

    e.stage = "predict-json";
    e.status = response.status;
    e.url = url;
    e.body = body.slice(0, 1000);

    throw e;
  }


  if (!response.ok) {
    const e =
      new Error(
        payload?.message ||
        `Predict API HTTP ${response.status}`
      );

    e.stage = "predict-http";
    e.status = response.status;
    e.url = url;
    e.body = body.slice(0, 1000);
    e.parsed = payload;

    throw e;
  }


  return parsePredictPayload(payload);
}


// ============================================================
// DB schema
//
// Tạo table mới riêng cho live validation.
//
// Không phá prediction_daily cũ.
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

      UNIQUE(prediction_date, model)
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
    ON prediction_live_v262(prediction_date)
  `).run();


  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_bridge_evidence_date
    ON prediction_bridge_evidence(prediction_date)
  `).run();


  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_carry_v262_date
    ON prediction_carry_v262(prediction_date)
  `).run();
}


// ============================================================
// Lấy kết quả D1 theo ngày
//
// Nếu table của bạn tên khác "results",
// chỉ cần sửa hàm này.
// ============================================================

async function getResultByDate(db, date) {

  // ----------------------------------------------------------
  // Project hiện tại trước đây dùng dữ liệu XSMB trong DB.
  // Thử một số tên cột ngày phổ biến.
  // ----------------------------------------------------------

  const queries = [
    `
      SELECT *
      FROM results
      WHERE date = ?
      LIMIT 1
    `,

    `
      SELECT *
      FROM results
      WHERE draw_date = ?
      LIMIT 1
    `,

    `
      SELECT *
      FROM xsmb_results
      WHERE date = ?
      LIMIT 1
    `,

    `
      SELECT *
      FROM xsmb_results
      WHERE draw_date = ?
      LIMIT 1
    `
  ];


  let lastError = null;


  for (const sql of queries) {
    try {
      const row =
        await db
          .prepare(sql)
          .bind(date)
          .first();

      if (row) {
        return row;
      }

    } catch (error) {
      lastError = error;
    }
  }


  // Không throw khi đơn giản là chưa có kết quả.
  // Chỉ trả null.
  return null;
}


// ============================================================
// Baseline
//
// Probability ít nhất 1 số trong k số,
// khi target có m unique loto / 100.
// ============================================================

function baselineProbability(k, uniqueCount) {
  const m =
    Math.max(
      0,
      Math.min(
        100,
        Number(uniqueCount) || 0
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


  if (!m || !picks) {
    return 0;
  }


  // P(no hit) =
  // C(100-m,k) / C(100,k)

  let noHit = 1;

  for (let i = 0; i < picks; i++) {

    const numerator =
      100 - m - i;

    const denominator =
      100 - i;

    if (numerator <= 0) {
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
// Evaluate BASE predictions
// ============================================================

async function evaluatePendingBase(db) {

  const pending =
    await db.prepare(`
      SELECT *
      FROM prediction_live_v262
      WHERE model = ?
        AND evaluated = 0
      ORDER BY prediction_date ASC
    `)
      .bind(BASE_MODEL)
      .all();


  let evaluated = 0;


  for (const row of pending.results || []) {

    const result =
      await getResultByDate(
        db,
        row.prediction_date
      );


    if (!result) {
      continue;
    }


    const actual =
      extractLotoFromResult(result);


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


    if (!Array.isArray(recommendations)) {
      continue;
    }


    const numbers =
      recommendations
        .map(x => normalizeNumber(x.number))
        .filter(Boolean);


    const top1 =
      numbers.slice(0, 1);

    const top3 =
      numbers.slice(0, 3);

    const top5 =
      numbers.slice(0, 5);


    const hit = arr =>
      arr.some(n => actualSet.has(n));


    const top1Hit =
      hit(top1) ? 1 : 0;

    const top3Hit =
      hit(top3) ? 1 : 0;

    const top5Hit =
      hit(top5) ? 1 : 0;


    const uniqueCount =
      actual.length;


    await db.prepare(`
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
        uniqueCount,

        top1Hit,
        top3Hit,
        top5Hit,

        baselineProbability(
          top1.length,
          uniqueCount
        ),

        baselineProbability(
          top3.length,
          uniqueCount
        ),

        baselineProbability(
          top5.length,
          uniqueCount
        ),

        row.id
      )
      .run();


    // --------------------------------------------------------
    // Quan trọng:
    // chấm TẤT CẢ recommendation.
    //
    // Không chỉ rank #1.
    // Vì vậy nếu:
    // #1 94 HIT
    // #5 98 HIT
    //
    // cả hai bridge đều được ghi nhận.
    // --------------------------------------------------------

    for (
      let i = 0;
      i < recommendations.length;
      i++
    ) {

      const rec =
        recommendations[i];

      const number =
        normalizeNumber(rec.number);

      const bridgeKey =
        rec.bridgeKey || null;


      if (!number || !bridgeKey) {
        continue;
      }


      const isHit =
        actualSet.has(number)
          ? 1
          : 0;


      await db.prepare(`
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

        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

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
          rec.bridge || null,

          number,
          Number(rec.baseRank || rec.rank || i + 1),

          isHit,

          Number(rec.score) || 0,
          rec.strength || null
        )
        .run();
    }


    evaluated++;
  }


  return evaluated;
}


// ============================================================
// Evaluate carry prediction
// ============================================================

async function evaluatePendingCarry(db) {

  const pending =
    await db.prepare(`
      SELECT *
      FROM prediction_carry_v262

      WHERE model = ?
        AND evaluated = 0
        AND current_number IS NOT NULL

      ORDER BY prediction_date ASC
    `)
      .bind(PRIORITY_MODEL)
      .all();


  let evaluated = 0;


  for (const row of pending.results || []) {

    const result =
      await getResultByDate(
        db,
        row.prediction_date
      );


    if (!result) {
      continue;
    }


    const actual =
      extractLotoFromResult(result);


    if (!actual.length) {
      continue;
    }


    const actualSet =
      new Set(actual);


    const currentNumber =
      normalizeNumber(
        row.current_number
      );


    const hit =
      currentNumber &&
      actualSet.has(currentNumber)
        ? 1
        : 0;


    await db.prepare(`
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
// Previous day HIT evidence
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
    await db.prepare(`
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
      .map(row => ({
        baseRank:
          Number(row.base_rank) || null,

        number:
          normalizeNumber(row.number),

        bridgeKey:
          row.bridge_key,

        bridge:
          row.bridge,

        score:
          round2(row.score),

        strength:
          row.strength
      }));


  return {
    available:
      hits.length > 0,

    date:
      previousDate,

    hits
  };
}


// ============================================================
// Save BASE prediction
//
// Prediction bị LOCK.
// Nếu gọi API nhiều lần cùng ngày,
// không ghi đè.
// ============================================================

async function saveBasePrediction(
  db,
  predict
) {

  const existing =
    await db.prepare(`
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
      action: "already-locked",
      savedNew: false,

      sourceDate:
        existing.source_date,

      predictionDate:
        existing.prediction_date,

      numbers:
        String(existing.numbers || "")
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
      .map(x => x.number)
      .filter(Boolean);


  await db.prepare(`
    INSERT INTO prediction_live_v262 (
      prediction_date,
      source_date,

      model,

      numbers,
      recommendations_json,

      status
    )

    VALUES (?, ?, ?, ?, ?, 'locked')
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
    action: "saved-and-locked",
    savedNew: true,

    sourceDate:
      predict.sourceDate,

    predictionDate:
      predict.predictionDate,

    numbers,

    recommendations,

    status: "locked"
  };
}


// ============================================================
// Find bridge hôm nay
//
// Ưu tiên:
// 1. recommendations
// 2. candidate pool
//
// Nếu không tìm thấy => SHADOW_NO_NUMBER
// ============================================================

function findCurrentBridge(
  bridgeKey,
  predict
) {

  const active =
    predict.recommendations.find(
      x =>
        x.bridgeKey === bridgeKey
    );


  if (active) {
    return {
      status: "active",
      data: active
    };
  }


  const shadowCandidate =
    predict.candidates.find(
      x =>
        x.bridgeKey === bridgeKey
    );


  if (shadowCandidate) {
    return {
      status: "shadow",
      data: shadowCandidate
    };
  }


  return {
    status: "shadow-unresolved",
    data: null
  };
}


// ============================================================
// Save carry
//
// Mỗi bridge HIT hôm trước được xử lý độc lập.
// ============================================================

async function saveCarry(
  db,
  predict,
  previousEvidence
) {

  const saved = [];


  if (
    !previousEvidence ||
    !previousEvidence.hits ||
    !previousEvidence.hits.length
  ) {
    return saved;
  }


  for (
    const previous of previousEvidence.hits
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
      current.status === "active" &&
      current.data
    ) {

      carryStatus = "ACTIVE";

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

    } else if (
      current.status === "shadow" &&
      current.data
    ) {

      carryStatus = "SHADOW";

      currentNumber =
        normalizeNumber(
          current.data.number
        );

      currentRank = null;

      currentScore =
        Number(
          current.data.score
        ) || 0;

      currentStrength =
        current.data.strength ||
        null;

    } else {

      // Bridge đã HIT nhưng predict.js không expose
      // candidate sau filter.
      //
      // Không được đoán current number.
      carryStatus =
        "SHADOW_UNRESOLVED";
    }


    await db.prepare(`
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

      DO NOTHING
    `)
      .bind(
        predict.predictionDate,
        predict.sourceDate,

        previousEvidence.date,

        PRIORITY_MODEL,

        previous.bridgeKey,
        previous.bridge || null,

        previous.number,
        previous.baseRank,

        currentNumber,
        currentRank,

        carryStatus,

        previous.score || 0,
        currentScore,

        previous.strength || null,
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
// Performance BASE
// ============================================================

async function getBasePerformance(db) {

  const row =
    await db.prepare(`
      SELECT

        COUNT(*) AS total_tracked,

        SUM(
          CASE
            WHEN evaluated = 1
            THEN 1
            ELSE 0
          END
        ) AS tested,

        SUM(
          CASE
            WHEN evaluated = 0
            THEN 1
            ELSE 0
          END
        ) AS pending,

        SUM(
          CASE
            WHEN evaluated = 1
             AND top1_hit = 1
            THEN 1
            ELSE 0
          END
        ) AS top1_hits,

        SUM(
          CASE
            WHEN evaluated = 1
             AND top3_hit = 1
            THEN 1
            ELSE 0
          END
        ) AS top3_hits,

        SUM(
          CASE
            WHEN evaluated = 1
             AND top5_hit = 1
            THEN 1
            ELSE 0
          END
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


  const tested =
    Number(row?.tested) || 0;


  function metric(
    hitsValue,
    baselineValue
  ) {

    const hits =
      Number(hitsValue) || 0;

    const baseline =
      round2(
        Number(baselineValue) || 0
      );

    const hitRate =
      tested
        ? round2(
            hits /
            tested *
            100
          )
        : 0;


    return {
      hits,
      tested,
      hitRate,
      baseline,
      lift:
        round2(
          hitRate -
          baseline
        )
    };
  }


  return {
    model:
      BASE_MODEL,

    totalTracked:
      Number(row?.total_tracked) || 0,

    tested,

    pending:
      Number(row?.pending) || 0,

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


// ============================================================
// Carry performance
// ============================================================

async function getCarryPerformance(db) {

  const rows =
    await db.prepare(`
      SELECT

        carry_status,

        COUNT(*) AS total,

        SUM(
          CASE
            WHEN evaluated = 1
            THEN 1
            ELSE 0
          END
        ) AS tested,

        SUM(
          CASE
            WHEN evaluated = 1
             AND hit = 1
            THEN 1
            ELSE 0
          END
        ) AS hits

      FROM prediction_carry_v262

      WHERE model = ?

      GROUP BY carry_status
    `)
      .bind(PRIORITY_MODEL)
      .all();


  const result = {
    active: {
      total: 0,
      tested: 0,
      hits: 0,
      hitRate: 0
    },

    shadow: {
      total: 0,
      tested: 0,
      hits: 0,
      hitRate: 0
    },

    shadowUnresolved: {
      total: 0,
      tested: 0,
      hits: 0,
      hitRate: 0
    },

    allResolved: {
      total: 0,
      tested: 0,
      hits: 0,
      hitRate: 0
    }
  };


  for (const row of rows.results || []) {

    const metric = {
      total:
        Number(row.total) || 0,

      tested:
        Number(row.tested) || 0,

      hits:
        Number(row.hits) || 0
    };


    metric.hitRate =
      metric.tested
        ? round2(
            metric.hits /
            metric.tested *
            100
          )
        : 0;


    if (row.carry_status === "ACTIVE") {
      result.active = metric;
    }

    if (row.carry_status === "SHADOW") {
      result.shadow = metric;
    }

    if (
      row.carry_status ===
      "SHADOW_UNRESOLVED"
    ) {
      result.shadowUnresolved =
        metric;
    }
  }


  result.allResolved.total =
    result.active.total +
    result.shadow.total;


  result.allResolved.tested =
    result.active.tested +
    result.shadow.tested;


  result.allResolved.hits =
    result.active.hits +
    result.shadow.hits;


  result.allResolved.hitRate =
    result.allResolved.tested
      ? round2(
          result.allResolved.hits /
          result.allResolved.tested *
          100
        )
      : 0;


  return result;
}


// ============================================================
// Main
// ============================================================

export async function onRequestGet(context) {

  const db =
    context.env.DB;


  if (!db) {
    return json(
      {
        success: false,
        module: MODULE,
        stage: "database",
        message:
          "Không tìm thấy binding DB"
      },
      500
    );
  }


  let evaluatedBase = 0;
  let evaluatedCarry = 0;


  try {

    // --------------------------------------------------------
    // 1. Schema
    // --------------------------------------------------------

    await ensureSchema(db);


    // --------------------------------------------------------
    // 2. Chấm prediction cũ TRƯỚC
    //
    // Đây là bước khiến 94, 98... được ghi nhận
    // nếu chúng thực sự HIT.
    // --------------------------------------------------------

    evaluatedBase =
      await evaluatePendingBase(db);


    evaluatedCarry =
      await evaluatePendingCarry(db);


    // --------------------------------------------------------
    // 3. Gọi V2.6.2 hôm nay
    // --------------------------------------------------------

    const predict =
      await fetchPredict(
        context.request
      );


    // --------------------------------------------------------
    // 4. Lấy evidence ngày trước
    //
    // Lúc này bridge_evidence đã chứa
    // tất cả recommendation HIT.
    // --------------------------------------------------------

    const previousDayEvidence =
      await getPreviousDayEvidence(
        db,
        predict.predictionDate
      );


    // --------------------------------------------------------
    // 5. Save BASE
    // --------------------------------------------------------

    const basePrediction =
      await saveBasePrediction(
        db,
        predict
      );


    // --------------------------------------------------------
    // 6. Save Carry
    // --------------------------------------------------------

    const carry =
      await saveCarry(
        db,
        predict,
        previousDayEvidence
      );


    // --------------------------------------------------------
    // 7. Performance
    // --------------------------------------------------------

    const livePerformance =
      await getBasePerformance(db);


    const carryPerformance =
      await getCarryPerformance(db);


    // --------------------------------------------------------
    // 8. Response
    // --------------------------------------------------------

    return json({
      success: true,

      module: MODULE,
      version: VERSION,

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

      carry: {
        count:
          carry.length,

        active:
          carry.filter(
            x =>
              x.status === "ACTIVE"
          ),

        shadow:
          carry.filter(
            x =>
              x.status === "SHADOW"
          ),

        unresolved:
          carry.filter(
            x =>
              x.status ===
              "SHADOW_UNRESOLVED"
          )
      },

      livePerformance,

      carryPerformance,

      diagnostic: {
        recommendations:
          predict.recommendations.length,

        candidatePoolExposed:
          predict.candidates.length,

        note:
          predict.candidates.length
            ? "Predict API có candidate pool: có thể tính ACTIVE và SHADOW."
            : "Predict API chưa expose candidate pool. SHADOW bridge vẫn được lưu nhưng chưa thể xác định số mới nếu bridge bị filter."
      }
    });


  } catch (error) {

    let livePerformance = null;
    let carryPerformance = null;


    try {
      livePerformance =
        await getBasePerformance(db);
    } catch {}


    try {
      carryPerformance =
        await getCarryPerformance(db);
    } catch {}


    return json(
      {
        success: false,

        module: MODULE,
        version: VERSION,

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
        },

        livePerformance,
        carryPerformance,

        predictDiagnostic:
          error.stage
            ? {
                status:
                  error.status || null,

                url:
                  error.url || null,

                body:
                  error.body || null,

                parsed:
                  error.parsed || null
              }
            : null
      },
      500
    );
  }
}