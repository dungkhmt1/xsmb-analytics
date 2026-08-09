/*
========================================================
XSMB TRACKING SYNC
/api/tracking-sync

V2.7.3.2 CHUNKED RECOVERY

Mục tiêu:
- Backfill tuần tự theo strict walk-forward.
- Ngày NO_SIGNAL được ghi skip, KHÔNG làm dừng chuỗi.
- Không bắt đầu scan từ tháng 1 khi chưa có tracking.
- Tự chấm HIT/MISS và ghi bridge evidence.
- Evidence ngày N có trước khi predict N+1.
- Hỗ trợ from / through / maxSaves.
========================================================
*/

const MODEL =
  "bridge-v2.7.1-abba-auto-tracking";

const VERSION =
  "tracking-sync-v2.7.3.2-chunked";


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


  /*
  Ghi những ngày thuật toán hợp lệ nhưng không có signal.
  Nhờ vậy tracking-sync không lặp vô hạn ở cùng ngày.
  */
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS prediction_tracking_skips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        source_date TEXT NOT NULL,
        prediction_date TEXT NOT NULL,

        model TEXT NOT NULL,

        reason TEXT NOT NULL,
        details_json TEXT,

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(
          prediction_date,
          model
        )
      )
    `)
    .run();


  await db
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_tracking_skips_model_date
      ON prediction_tracking_skips(
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


  /*
  Không signal KHÔNG phải lỗi.
  Không tạo prediction giả vì sẽ làm sai HIT/MISS.
  */
  if (!recommendations.length) {
    return {
      saved:
        false,

      noSignal:
        true,

      reason:
        "NO_SIGNAL"
    };
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


  return {
    saved:
      true,

    noSignal:
      false,

    count:
      recommendations.length
  };
}


async function skipExists(
  db,
  predictionDate
) {
  const row =
    await db
      .prepare(`
        SELECT id
        FROM prediction_tracking_skips

        WHERE prediction_date = ?
          AND model = ?

        LIMIT 1
      `)
      .bind(
        predictionDate,
        MODEL
      )
      .first();


  return Boolean(
    row
  );
}


async function saveSkip(
  db,
  sourceDate,
  predictionDate,
  payload
) {
  await db
    .prepare(`
      INSERT INTO prediction_tracking_skips (
        source_date,
        prediction_date,
        model,
        reason,
        details_json
      )

      VALUES (?, ?, ?, 'NO_SIGNAL', ?)

      ON CONFLICT(
        prediction_date,
        model
      )

      DO UPDATE SET
        source_date =
          excluded.source_date,

        reason =
          excluded.reason,

        details_json =
          excluded.details_json
    `)
    .bind(
      sourceDate,
      predictionDate,
      MODEL,
      JSON.stringify({
        version:
          payload?.version ||
          null,

        analyzedDraws:
          payload?.analyzedDraws ||
          null,

        activeCandidateCount:
          payload?.activeCandidateCount ||
          0,

        qualifiedCount:
          payload?.qualifiedCount ||
          0,

        recommendationCount:
          payload?.recommendationCount ||
          0
      })
    )
    .run();
}


async function getLatestResolvedDate(
  db
) {
  const prediction =
    await db
      .prepare(`
        SELECT prediction_date
        FROM prediction_live_v262

        WHERE model = ?

        ORDER BY prediction_date DESC

        LIMIT 1
      `)
      .bind(
        MODEL
      )
      .first();


  const skipped =
    await db
      .prepare(`
        SELECT prediction_date
        FROM prediction_tracking_skips

        WHERE model = ?

        ORDER BY prediction_date DESC

        LIMIT 1
      `)
      .bind(
        MODEL
      )
      .first();


  const dates =
    [
      prediction?.prediction_date,
      skipped?.prediction_date
    ]
      .filter(Boolean)
      .sort();


  return dates.length
    ? dates[
        dates.length - 1
      ]
    : null;
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


    /*
    ====================================================
    RECOVERY RANGE

    from:
      ngày source bắt đầu scan.

    Nếu không truyền from:
    - dùng ngày tracking/skip cuối cùng nếu đã có;
    - nếu hoàn toàn chưa có tracking, chỉ nhìn lùi 30 ngày
      từ `through`, tránh bắt đầu từ tháng 1.
    ====================================================
    */

    /*
    Tải danh sách ngày kết quả trước khi tính phạm vi recovery.
    V2.7.3 trước bị thiếu dòng này nên phát sinh:
    ReferenceError: dates is not defined
    */
    const dates =
      await getResultDates(
        db,
        through
      );


    if (!dates.length) {
      return json({
        success: true,

        module:
          "tracking-sync",

        version:
          VERSION,

        message:
          "Database chưa có kết quả để sync.",

        processed:
          0,

        savedCount:
          0,

        noSignalCount:
          0
      });
    }


    const requestedFrom =
      url.searchParams.get(
        "from"
      );


    if (
      requestedFrom &&
      !/^\d{4}-\d{2}-\d{2}$/.test(
        requestedFrom
      )
    ) {
      return json(
        {
          success: false,
          message:
            "from phải là YYYY-MM-DD"
        },
        400
      );
    }


    /*
    Cloudflare Pages Functions có giới hạn CPU.
    Predict là endpoint nặng, vì vậy recovery phải chia nhỏ.

    - maxSaves: số prediction thực sự được tạo trong 1 request.
    - maxScans: tổng số sourceDate được duyệt trong 1 request,
      kể cả NO_SIGNAL / EXISTING.

    Mặc định chỉ xử lý 1 prediction và tối đa 3 ngày.
    */
    const maxSaves =
      Math.min(
        3,
        Math.max(
          1,
          Number.parseInt(
            url.searchParams.get(
              "maxSaves"
            )
            ||
            url.searchParams.get(
              "maxDays"
            )
            ||
            "1",
            10
          )
          ||
          1
        )
      );


    const maxScans =
      Math.min(
        5,
        Math.max(
          1,
          Number.parseInt(
            url.searchParams.get(
              "maxScans"
            )
            ||
            "3",
            10
          )
          ||
          3
        )
      );


    const latestResolvedDate =
      await getLatestResolvedDate(
        db
      );


    const effectiveThrough =
      through ||
      dates.at(-1);


    let effectiveFrom =
      requestedFrom
      ||
      latestResolvedDate
      ||
      addDays(
        effectiveThrough,
        -30
      );


    /*
    Nếu resolved date là prediction N,
    source N vẫn cần được scan để tạo prediction N+1.
    */
    if (
      latestResolvedDate &&
      !requestedFrom
    ) {
      effectiveFrom =
        latestResolvedDate;
    }


    const sourceDates =
      dates.filter(
        date =>
          date >= effectiveFrom &&
          date <= effectiveThrough
      );


    const actions = [];

    let savedCount = 0;
    let noSignalCount = 0;
    let alreadyResolvedCount = 0;
    let scannedCount = 0;

    let lastScannedSourceDate =
      null;


    /*
    Strict walk-forward theo thứ tự thời gian.
    NO_SIGNAL chỉ ghi skip rồi tiếp tục,
    không làm dừng toàn bộ recovery.
    */
    for (
      const sourceDate of
      sourceDates
    ) {
      /*
      Chia recovery thành các chunk rất nhỏ để tránh Error 1102.
      */
      if (
        scannedCount >=
        maxScans
      ) {
        break;
      }


      const predictionDate =
        addDays(
          sourceDate,
          1
        );


      if (!predictionDate) {
        continue;
      }


      scannedCount++;

      lastScannedSourceDate =
        sourceDate;


      /*
      Nếu prediction đã tồn tại:
      chấm ngay nếu kết quả đã có,
      rồi tiếp tục ngày sau để evidence kịp sinh.
      */
      if (
        await predictionExists(
          db,
          predictionDate
        )
      ) {
        const evaluation =
          await evaluatePrediction(
            db,
            predictionDate
          );


        alreadyResolvedCount++;


        actions.push({
          sourceDate,
          predictionDate,

          action:
            "EXISTING",

          evaluation
        });


        continue;
      }


      if (
        await skipExists(
          db,
          predictionDate
        )
      ) {
        alreadyResolvedCount++;


        actions.push({
          sourceDate,
          predictionDate,

          action:
            "SKIPPED_NO_SIGNAL"
        });


        continue;
      }


      /*
      maxSaves chỉ giới hạn số prediction thực sự ghi.
      Ngày NO_SIGNAL không tiêu quota.
      */
      if (
        savedCount >=
        maxSaves
      ) {
        break;
      }


      const payload =
        await fetchPrediction(
          context.request,
          sourceDate
        );


      if (
        payload.sourceDate !==
        sourceDate
      ) {
        throw new Error(
          `Walk-forward mismatch: yêu cầu asOf ${sourceDate} nhưng predict dùng ${payload.sourceDate}`
        );
      }


      const saveResult =
        await savePrediction(
          db,
          payload
        );


      if (
        saveResult.noSignal
      ) {
        await saveSkip(
          db,
          sourceDate,
          predictionDate,
          payload
        );


        noSignalCount++;


        actions.push({
          sourceDate,
          predictionDate,

          action:
            "NO_SIGNAL",

          analyzedDraws:
            payload.analyzedDraws ||
            null
        });


        continue;
      }


      savedCount++;


      const evaluation =
        await evaluatePrediction(
          db,
          predictionDate
        );


      actions.push({
        sourceDate,
        predictionDate,

        action:
          "SAVED",

        suggestionCount:
          saveResult.count,

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
        effectiveThrough,

      from:
        effectiveFrom,

      scannedCount,

      savedCount,

      noSignalCount,

      alreadyResolvedCount,

      maxSaves,

      maxScans,

      processed:
        actions.length,

      evaluatedExisting,

      actions,

      latestTracking:
        latest ||
        null,

      /*
      nextFrom dùng chính sourceDate cuối vừa scan.
      Lần gọi tiếp theo endpoint sẽ tự bỏ qua record đã resolved
      rồi tiến sang ngày kế tiếp.
      */
      nextFrom:
        lastScannedSourceDate,

      hasMore:
        Boolean(
          lastScannedSourceDate &&
          lastScannedSourceDate <
          effectiveThrough
        ),

      remainingNote:
        (
          scannedCount >= maxScans ||
          savedCount >= maxSaves
        )
          ? "Đã hoàn thành một chunk nhỏ để tránh Error 1102. Gọi lại endpoint với nextFrom để tiếp tục."
          : "Đã scan hết phạm vi recovery hiện tại."
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
