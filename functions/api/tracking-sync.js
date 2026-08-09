/*
========================================================
XSMB TRACKING SYNC
/api/tracking-sync

V2.7.1

Mục tiêu:
- Tự tìm các ngày prediction AB-BA bị thiếu.
- Backfill tuần tự theo strict walk-forward.
- Prediction ngày N chỉ dùng dữ liệu <= N-1.
- Tự chấm HIT/MISS nếu kết quả ngày N đã có.
- Ghi bridge evidence để carry sang ngày kế tiếp.
========================================================
*/

const MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "tracking-sync-v2.7.1";


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

  const raw = [];

  for (
    const key of [
      "special",
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
      "g6",
      "g7"
    ]
  ) {
    if (
      row[key] === null ||
      row[key] === undefined
    ) {
      continue;
    }

    collectStrings(
      safeJSON(
        row[key],
        row[key]
      ),
      raw
    );
  }

  const numbers =
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
        numbers.add(
          token.slice(-2)
        );
      }
    }
  }

  return [
    ...numbers
  ];
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


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_tracking_model_date
      ON prediction_live_v262(
        model,
        prediction_date
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_tracking_evidence_model_date
      ON prediction_bridge_evidence(
        model,
        prediction_date
      )
    `)
    .run();
}


async function fetchPrediction(
  request,
  sourceDate
) {
  const origin =
    new URL(
      request.url
    ).origin;

  const url =
    `${origin}/api/predict?asOf=${encodeURIComponent(sourceDate)}&t=${Date.now()}`;

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

  const text =
    await response.text();

  let payload;

  try {
    payload =
      JSON.parse(text);
  }
  catch {
    throw new Error(
      `Predict asOf ${sourceDate} không trả JSON. HTTP ${response.status}`
    );
  }

  if (
    !response.ok ||
    payload.success === false
  ) {
    throw new Error(
      payload?.message ||
      payload?.error ||
      `Predict asOf ${sourceDate} HTTP ${response.status}`
    );
  }

  return payload;
}


async function predictionExists(
  db,
  predictionDate
) {
  const row =
    await db
      .prepare(`
        SELECT id
        FROM prediction_live_v262
        WHERE prediction_date = ?
          AND model = ?
        LIMIT 1
      `)
      .bind(
        predictionDate,
        MODEL
      )
      .first();

  return Boolean(row);
}


async function savePrediction(
  db,
  payload
) {
  const recommendations =
    Array.isArray(
      payload.suggestions
    )
      ? payload.suggestions
      : [];

  if (!recommendations.length) {
    throw new Error(
      `Prediction ${payload.predictionDate} không có suggestions`
    );
  }

  const labels =
    recommendations
      .map(
        item =>
          item.pair ||
          (
            pairNumbersFromItem(
              item
            )
              .join("-")
          )
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

      VALUES (?, ?, ?, ?, ?, 'locked')

      ON CONFLICT(
        prediction_date,
        model
      )

      DO NOTHING
    `)
    .bind(
      payload.predictionDate,
      payload.sourceDate,
      MODEL,
      labels.join(","),
      JSON.stringify(
        recommendations
      )
    )
    .run();
}


async function getResultByDate(
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


async function evaluatePrediction(
  db,
  predictionDate
) {
  const row =
    await db
      .prepare(`
        SELECT *
        FROM prediction_live_v262

        WHERE prediction_date = ?
          AND model = ?

        LIMIT 1
      `)
      .bind(
        predictionDate,
        MODEL
      )
      .first();

  if (
    !row ||
    Number(row.evaluated) === 1
  ) {
    return {
      evaluated:
        false,
      reason:
        row
          ? "already-evaluated"
          : "missing-prediction"
    };
  }


  const result =
    await getResultByDate(
      db,
      predictionDate
    );

  if (!result) {
    return {
      evaluated:
        false,
      reason:
        "result-pending"
    };
  }


  const actual =
    extractLotoFromResult(
      result
    );

  if (!actual.length) {
    return {
      evaluated:
        false,
      reason:
        "empty-result"
    };
  }


  const actualSet =
    new Set(actual);


  const recommendations =
    safeJSON(
      row.recommendations_json,
      []
    );


  const evaluatedPairs =
    recommendations
      .map(
        (
          item,
          index
        ) => {
          const pair =
            pairNumbersFromItem(
              item
            );

          const hitNumbers =
            pair.filter(
              number =>
                actualSet.has(
                  number
                )
            );

          return {
            item,
            index,
            pair,
            hitNumbers,
            hit:
              hitNumbers.length > 0
          };
        }
      );


  const rankHit =
    count =>
      evaluatedPairs
        .slice(0, count)
        .some(
          entry =>
            entry.hit
        );


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
        top5_hit = ?

      WHERE id = ?
    `)
    .bind(
      actual.join(","),
      actual.length,
      rankHit(1) ? 1 : 0,
      rankHit(3) ? 1 : 0,
      rankHit(5) ? 1 : 0,
      row.id
    )
    .run();


  let hitPairs = 0;


  for (
    const entry of
    evaluatedPairs
  ) {
    const item =
      entry.item;

    const number =
      normalizeNumber(
        item.number
      );

    const bridgeKey =
      item.bridgeKey ||
      item.ruleKey ||
      null;

    if (
      !number ||
      !bridgeKey
    ) {
      continue;
    }


    const reverse =
      normalizeNumber(
        item.reverseNumber
      )
      ||
      reverseNumber(
        number
      );


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
        predictionDate,
        row.source_date,
        MODEL,
        bridgeKey,
        item.bridge ||
        item.rule ||
        null,
        number,
        reverse,
        item.pairKey ||
        null,
        JSON.stringify(
          entry.pair
        ),
        Number(
          item.baseRank ||
          item.rank ||
          entry.index + 1
        ),
        entry.hit
          ? 1
          : 0,
        entry.hitNumbers
          .join(","),
        entry.hitNumbers.length,
        Number(
          item.pairScore ||
          item.score ||
          0
        ),
        item.strength ||
        null
      )
      .run();


    if (entry.hit) {
      hitPairs++;
    }
  }


  return {
    evaluated:
      true,

    actualCount:
      actual.length,

    hitPairs,

    pairCount:
      evaluatedPairs.length
  };
}


async function getResultDates(
  db,
  through
) {
  const response =
    through
      ?
      await db
        .prepare(`
          SELECT draw_date
          FROM results
          WHERE draw_date <= ?
          ORDER BY draw_date ASC
        `)
        .bind(
          through
        )
        .all()
      :
      await db
        .prepare(`
          SELECT draw_date
          FROM results
          ORDER BY draw_date ASC
        `)
        .all();

  return (
    response.results || []
  )
    .map(
      row =>
        row.draw_date
    )
    .filter(Boolean);
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


    await ensureSchema(
      db
    );


    const url =
      new URL(
        context.request.url
      );


    const through =
      url.searchParams.get(
        "through"
      );


    if (
      through &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        through
      )
    ) {
      return json(
        {
          success: false,
          message:
            "through phải là YYYY-MM-DD"
        },
        400
      );
    }


    const maxDays =
      Math.min(
        30,
        Math.max(
          1,
          Number.parseInt(
            url.searchParams.get(
              "maxDays"
            ) || "14",
            10
          )
          ||
          14
        )
      );


    const dates =
      await getResultDates(
        db,
        through
      );


    if (
      dates.length < 31
    ) {
      return json({
        success: true,
        version:
          VERSION,
        message:
          "Chưa đủ 31 kỳ để sync tracking.",
        processed:
          0
      });
    }


    /*
    Source date đầu tiên phải có ít nhất 30 kỳ lịch sử.
    target = source + 1.
    */
    const candidates =
      dates
        .slice(29)
        .map(
          sourceDate => ({
            sourceDate,

            predictionDate:
              addDays(
                sourceDate,
                1
              )
          })
        );


    const missing = [];


    for (
      const candidate of
      candidates
    ) {
      if (
        await predictionExists(
          db,
          candidate.predictionDate
        )
      ) {
        continue;
      }

      missing.push(
        candidate
      );

      if (
        missing.length >=
        maxDays
      ) {
        break;
      }
    }


    const actions = [];


    /*
    Quan trọng:
    chạy tuần tự, không Promise.all.
    Sau khi target N được evaluate,
    evidence của N đã tồn tại trước khi
    predict target N+1.
    */
    for (
      const item of missing
    ) {
      const payload =
        await fetchPrediction(
          context.request,
          item.sourceDate
        );


      if (
        payload.sourceDate !==
        item.sourceDate
      ) {
        throw new Error(
          `Walk-forward mismatch: yêu cầu asOf ${item.sourceDate} nhưng predict dùng ${payload.sourceDate}`
        );
      }


      await savePrediction(
        db,
        payload
      );


      const evaluation =
        await evaluatePrediction(
          db,
          payload.predictionDate
        );


      actions.push({
        sourceDate:
          payload.sourceDate,

        predictionDate:
          payload.predictionDate,

        saved:
          true,

        evaluation
      });
    }


    /*
    Chấm thêm các row đã tồn tại nhưng trước đó chưa được evaluate.
    Không tạo mới ở bước này.
    */
    const pending =
      await db
        .prepare(`
          SELECT prediction_date
          FROM prediction_live_v262
          WHERE model = ?
            AND evaluated = 0
          ORDER BY prediction_date ASC
          LIMIT 30
        `)
        .bind(
          MODEL
        )
        .all();


    let evaluatedExisting = 0;


    for (
      const row of
      pending.results || []
    ) {
      const evaluation =
        await evaluatePrediction(
          db,
          row.prediction_date
        );

      if (
        evaluation.evaluated
      ) {
        evaluatedExisting++;
      }
    }


    const latest =
      await db
        .prepare(`
          SELECT
            prediction_date,
            source_date,
            evaluated

          FROM prediction_live_v262

          WHERE model = ?

          ORDER BY prediction_date DESC

          LIMIT 1
        `)
        .bind(
          MODEL
        )
        .first();


    return json({
      success: true,

      module:
        "tracking-sync",

      version:
        VERSION,

      model:
        MODEL,

      methodology:
        "strict walk-forward",

      through:
        through ||
        dates.at(-1),

      missingFound:
        missing.length,

      processed:
        actions.length,

      evaluatedExisting,

      actions,

      latestTracking:
        latest ||
        null,

      remainingNote:
        missing.length >= maxDays
          ? `Đã đạt maxDays=${maxDays}. Gọi lại tracking-sync để tiếp tục nếu còn ngày thiếu.`
          : "Đã xử lý hết các ngày thiếu trong phạm vi hiện có."
    });
  }
  catch (error) {
    console.error(
      "tracking-sync:",
      error
    );

    return json(
      {
        success: false,

        module:
          "tracking-sync",

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
