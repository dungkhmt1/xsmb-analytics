/*
========================================================
DB SCHEMA — thư viện dùng chung
========================================================

File này gộp ensureSchema()/ensureColumn() trước đây bị
định nghĩa RIÊNG RẼ ở cả tracking-sync.js và
save-prediction.js.

QUAN TRỌNG — đã phát hiện khi gộp:
Hai bản cũ KHÔNG hoàn toàn giống nhau:
  - tracking-sync.js có thêm bảng "prediction_tracking_skips"
    và các cột direct_hit / reverse_hit / generated_number /
    strategy_version MÀ save-prediction.js không có.
  - save-prediction.js có thêm bảng "prediction_carry_v262"
    và các cột previous_reverse_number /
    current_reverse_number / previous_hit_number MÀ
    tracking-sync.js không có.

File này là bản GỘP ĐẦY ĐỦ (union) của cả hai, để đảm bảo
dù request nào chạy trước cũng tạo đủ toàn bộ bảng/cột cần
thiết. Từ nay CHỈ sửa schema ở ĐÂY.
========================================================
*/


export async function ensureColumn(
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


export async function ensureSchema(db) {
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


  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "direct_hit",
    "INTEGER DEFAULT 0"
  );


  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "reverse_hit",
    "INTEGER DEFAULT 0"
  );


  await ensureColumn(
    db,
    "prediction_bridge_evidence",
    "generated_number",
    "TEXT"
  );


  await ensureColumn(
    db,
    "prediction_live_v262",
    "strategy_version",
    "TEXT"
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


  /*
  Gộp từ save-prediction.js (trước đây có ensureSchema
  riêng, định nghĩa thêm bảng/cột dưới đây mà
  tracking-sync.js không có). Giữ lại toàn bộ để không
  mất dữ liệu carry-tracking hiện có.
  */

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
