/*
 * GOLDEN V3.2.0
 * GET /api/golden/v3/dashboard
 *
 * Statistical engine for:
 * - 2 số đầu giải đặc biệt
 * - 2 số cuối giải đặc biệt
 *
 * FIX:
 * - Không truy cập object bằng key không tồn tại.
 * - Không để dữ liệu DB lỗi làm API crash.
 * - Không để transition matrix gây lỗi "reading '45'".
 * - JSON lịch sử lỗi không làm dashboard chết.
 */

const VERSION = "golden-v3.2.0";

const N = Array.from(
  { length: 100 },
  (_, i) => String(i).padStart(2, "0")
);

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}

function num(v) {
  if (v === null || v === undefined) {
    return null;
  }

  const digits = String(v)
    .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const normalized =
    digits
      .padStart(5, "0")
      .slice(-5);

  return /^\d{5}$/.test(normalized)
    ? normalized
    : null;
}

function key2(v) {
  if (v === null || v === undefined) {
    return null;
  }

  const digits =
    String(v).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const x =
    digits
      .slice(-2)
      .padStart(2, "0");

  return /^\d{2}$/.test(x)
    ? x
    : null;
}

function isKey(v) {
  return (
    typeof v === "string" &&
    /^\d{2}$/.test(v)
  );
}

function pct(a, b) {
  return b
    ? Number(a) / Number(b) * 100
    : 0;
}

function round(v, n = 2) {
  const p = 10 ** n;

  return Math.round(
    (Number(v) || 0) * p
  ) / p;
}

function clamp(
  v,
  a = 0,
  b = 100
) {
  return Math.max(
    a,
    Math.min(
      b,
      Number(v) || 0
    )
  );
}

function zeroMap() {
  return Object.fromEntries(
    N.map(x => [x, 0])
  );
}

function extractRows(results) {

  const output = [];

  for (const r of results || []) {

    const special =
      num(r?.special);

    const date =
      String(
        r?.draw_date ?? ""
      ).slice(0, 10);

    if (!special) {
      continue;
    }

    if (
      !/^\d{5}$/.test(special)
    ) {
      continue;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(date)
    ) {
      continue;
    }

    const head =
      key2(
        special.slice(0, 2)
      );

    const tail =
      key2(
        special.slice(-2)
      );

    if (
      !isKey(head) ||
      !isKey(tail)
    ) {
      continue;
    }

    output.push({
      date,
      special,
      head,
      tail
    });
  }

  return output;
}

/*
 * Statistics
 */

function makeStats(
  rows,
  key
) {

  const all = zeroMap();
  const last30 = zeroMap();
  const last60 = zeroMap();

  const lastSeen =
    Object.fromEntries(
      N.map(x => [x, -1])
    );

  const gaps =
    Object.fromEntries(
      N.map(x => [x, null])
    );

  const total =
    Array.isArray(rows)
      ? rows.length
      : 0;

  for (
    let i = 0;
    i < total;
    i++
  ) {

    const x =
      key2(rows[i]?.[key]);

    if (!isKey(x)) {
      continue;
    }

    if (
      !Object.prototype
        .hasOwnProperty
        .call(all, x)
    ) {
      all[x] = 0;
    }

    all[x] =
      Number(all[x] || 0) + 1;

    lastSeen[x] = i;
  }

  for (
    const r of rows.slice(-30)
  ) {

    const x =
      key2(r?.[key]);

    if (!isKey(x)) {
      continue;
    }

    if (
      !Object.prototype
        .hasOwnProperty
        .call(last30, x)
    ) {
      last30[x] = 0;
    }

    last30[x] =
      Number(last30[x] || 0) + 1;
  }

  for (
    const r of rows.slice(-60)
  ) {

    const x =
      key2(r?.[key]);

    if (!isKey(x)) {
      continue;
    }

    if (
      !Object.prototype
        .hasOwnProperty
        .call(last60, x)
    ) {
      last60[x] = 0;
    }

    last60[x] =
      Number(last60[x] || 0) + 1;
  }

  for (const x of N) {

    const seen =
      Number(lastSeen[x]);

    gaps[x] =
      seen < 0
        ? total
        : Math.max(
            0,
            total - 1 - seen
          );
  }

  return {
    all,
    last30,
    last60,
    gaps,
    total
  };
}

/*
 * Bayesian smoothing
 */

function posteriorRate(
  hits,
  opportunities,
  priorHits = 1,
  priorMisses = 9
) {

  return (
    Number(hits || 0) +
    priorHits
  ) / (
    Number(opportunities || 0) +
    priorHits +
    priorMisses
  );
}

/*
 * Transition matrix
 */

function transitionStats(
  rows,
  key
) {

  const next =
    Object.fromEntries(
      N.map(x => [
        x,
        zeroMap()
      ])
    );

  for (
    let i = 0;
    i < rows.length - 1;
    i++
  ) {

    const from =
      key2(
        rows[i]?.[key]
      );

    const to =
      key2(
        rows[i + 1]?.[key]
      );

    if (
      !isKey(from) ||
      !isKey(to)
    ) {
      continue;
    }

    if (
      !next[from] ||
      typeof next[from] !== "object"
    ) {
      next[from] =
        zeroMap();
    }

    if (
      !Object.prototype
        .hasOwnProperty
        .call(next[from], to)
    ) {
      next[from][to] = 0;
    }

    next[from][to] =
      Number(
        next[from][to] || 0
      ) + 1;
  }

  return next;
}

/*
 * Run statistics
 */

function runStats(
  rows,
  key,
  x
) {

  let current = 0;
  const runs = [];

  for (const r of rows) {

    const value =
      key2(r?.[key]);

    if (value === x) {

      current++;

    } else if (current) {

      runs.push(current);
      current = 0;
    }
  }

  if (current) {
    runs.push(current);
  }

  return {
    max:
      runs.length
        ? Math.max(...runs)
        : 0,

    count:
      runs.length,

    lastRun:
      current
  };
}

/*
 * Score
 */

function scoreSide(
  rows,
  key,
  external = {}
) {

  const s =
    makeStats(
      rows,
      key
    );

  const transitions =
    transitionStats(
      rows,
      key
    );

  const last =
    rows.length
      ? key2(
          rows[
            rows.length - 1
          ]?.[key]
        )
      : null;

  const scored =
    N.map(x => {

      const count =
        Number(
          s.all[x] || 0
        );

      const r30 =
        Number(
          s.last30[x] || 0
        );

      const r60 =
        Number(
          s.last60[x] || 0
        );

      const baseRate =
        posteriorRate(
          count,
          s.total,
          1,
          99
        );

      const recentRate30 =
        posteriorRate(
          r30,
          Math.min(
            30,
            s.total
          ),
          1,
          9
        );

      const recentRate60 =
        posteriorRate(
          r60,
          Math.min(
            60,
            s.total
          ),
          1,
          19
        );

      const expectedAll =
        s.total / 100;

      const expected30 =
        Math.min(
          30,
          s.total
        ) / 100;

      const expected60 =
        Math.min(
          60,
          s.total
        ) / 100;

      const freqAll =
        clamp(
          50 +
          25 *
          (
            (count - expectedAll) /
            Math.sqrt(
              expectedAll + 1
            )
          )
        );

      const freq30 =
        clamp(
          50 +
          25 *
          (
            (r30 - expected30) /
            Math.sqrt(
              expected30 + 1
            )
          )
        );

      const freq60 =
        clamp(
          50 +
          25 *
          (
            (r60 - expected60) /
            Math.sqrt(
              expected60 + 1
            )
          )
        );

      /*
       * Gap / cycle
       */

      const gap =
        Number(
          s.gaps[x] || 0
        );

      const gapValues =
        N.map(
          y =>
            Number(
              s.gaps[y]
            )
        )
        .filter(
          v => Number.isFinite(v)
        )
        .sort(
          (a, b) => a - b
        );

      const medianGap =
        gapValues.length
          ? gapValues[
              Math.floor(
                gapValues.length / 2
              )
            ]
          : 0;

      const gapScale =
        Math.max(
          2,
          medianGap + 1
        );

      const gapScore =
        clamp(
          100 *
          Math.exp(
            -Math.abs(
              gap - medianGap
            ) /
            gapScale
          )
        );

      /*
       * CRITICAL FIX:
       * Không bao giờ truy cập
       * transitions[last][x]
       * khi transitions[last]
       * không tồn tại.
       */

      let transitionRow =
        null;

      if (
        last &&
        isKey(last) &&
        transitions &&
        transitions[last] &&
        typeof transitions[last]
          === "object"
      ) {

        transitionRow =
          transitions[last];
      }

      if (
        !transitionRow
      ) {

        transitionRow =
          zeroMap();
      }

      const transition =
        Object.prototype
          .hasOwnProperty
          .call(
            transitionRow,
            x
          )
          ? Number(
              transitionRow[x] || 0
            )
          : 0;

      const transitionTotal =
        Object.values(
          transitionRow
        )
        .reduce(
          (a, b) =>
            a +
            Number(b || 0),
          0
        );

      const transitionRate =
        posteriorRate(
          transition,
          transitionTotal,
          1,
          9
        );

      const transitionScore =
        clamp(
          50 +
          (
            transitionRate -
            0.1
          ) *
          250
        );

      /*
       * Repeat
       */

      const run =
        runStats(
          rows,
          key,
          x
        );

      const repeatScore =
        clamp(
          50 +
          Math.min(
            20,
            run.lastRun * 5
          )
        );

      /*
       * V2.8 external signal
       */

      const v28 =
        clamp(
          external &&
          Object.prototype
            .hasOwnProperty
            .call(
              external,
              x
            )
            ? external[x]
            : 50
        );

      /*
       * Golden score
       */

      const final =
        0.25 * freqAll +
        0.20 * freq60 +
        0.15 * freq30 +
        0.10 * gapScore +
        0.10 * transitionScore +
        0.10 * repeatScore +
        0.10 * v28;

      return {

        number: x,

        score:
          round(final),

        historicalRate:
          round(
            baseRate * 100
          ),

        recent30: r30,
        recent60: r60,

        gap,

        transitionFromLast:
          last
            ? transition
            : 0,

        features: {

          frequency:
            round(freqAll),

          recent60:
            round(freq60),

          recent30:
            round(freq30),

          cycle:
            round(gapScore),

          transition:
            round(
              transitionScore
            ),

          repeat:
            round(
              repeatScore
            ),

          v28:
            round(v28)
        }
      };

    })
    .sort(
      (a, b) =>
        b.score - a.score
    );

  return {
    rows: scored,
    stats: s
  };
}

/*
 * V2.8 signal
 */

async function readV28Signals(
  context
) {

  const map =
    Object.fromEntries(
      N.map(
        x => [x, 50]
      )
    );

  try {

    const origin =
      new URL(
        context.request.url
      ).origin;

    const r =
      await fetch(
        `${origin}/api/predict?top=100&t=${Date.now()}`,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );

    if (!r.ok) {
      return map;
    }

    const d =
      await r.json()
        .catch(() => null);

    const suggestions =
      Array.isArray(
        d?.suggestions
      )
        ? d.suggestions
        : [];

    const max =
      suggestions.length || 1;

    suggestions.forEach(
      (item, i) => {

        const raw =
          typeof item === "string"
            ? item
            : (
                item?.number ??
                item?.num ??
                item?.value
              );

        const digits =
          String(
            raw ?? ""
          )
          .replace(
            /\D/g,
            ""
          );

        const x =
          digits
            .slice(-2)
            .padStart(
              2,
              "0"
            );

        if (
          /^\d{2}$/.test(x)
        ) {

          map[x] =
            100 -
            (
              i / max
            ) * 70;
        }
      }
    );

  } catch {
    /*
     * Golden vẫn chạy
     * nếu V2.8 lỗi.
     */
  }

  return map;
}

/*
 * Pair selection
 */

function choosePairs(
  headRows,
  tailRows
) {

  const topH =
    headRows.slice(0, 10);

  const topT =
    tailRows.slice(0, 10);

  const candidates = [];

  for (
    const h of topH
  ) {

    for (
      const t of topT
    ) {

      const joint =
        Math.sqrt(
          Number(h.score || 0) *
          Number(t.score || 0)
        );

      const diversity =
        h.number === t.number
          ? -3
          : 0;

      candidates.push({

        head:
          h.number,

        tail:
          t.number,

        pair:
          `${h.number}-${t.number}`,

        headScore:
          h.score,

        tailScore:
          t.score,

        jointScore:
          round(
            joint +
            diversity
          )
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.jointScore -
      a.jointScore
  );

  const selected = [];

  for (
    const c of candidates
  ) {

    if (
      selected.some(
        x =>
          x.head === c.head &&
          x.tail === c.tail
      )
    ) {

      continue;
    }

    selected.push(c);

    if (
      selected.length >= 2
    ) {

      break;
    }
  }

  return selected;
}

/*
 * Evaluation
 */

function evaluatePrediction(
  pred,
  actualSpecial
) {

  const special =
    num(actualSpecial);

  if (!special) {
    return null;
  }

  const head =
    special.slice(0, 2);

  const tail =
    special.slice(-2);

  const pairs =
    Array.isArray(
      pred?.pairs
    )
      ? pred.pairs
      : [];

  return {

    actualSpecial:
      special,

    actualHead:
      head,

    actualTail:
      tail,

    pairHits:
      pairs.filter(
        p =>
          String(
            p?.head ?? ""
          ) === head &&
          String(
            p?.tail ?? ""
          ) === tail
      ).length,

    headHits:
      pairs.filter(
        p =>
          String(
            p?.head ?? ""
          ) === head
      ).length,

    tailHits:
      pairs.filter(
        p =>
          String(
            p?.tail ?? ""
          ) === tail
      ).length,

    top1Head:
      String(
        pairs[0]?.head ?? ""
      ) === head,

    top1Tail:
      String(
        pairs[0]?.tail ?? ""
      ) === tail
  };
}

/*
 * Golden prediction table
 */

async function ensureTable(
  db
) {

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS golden_v3_predictions (

      prediction_date TEXT PRIMARY KEY,

      source_date TEXT NOT NULL,

      pairs_json TEXT NOT NULL,

      head_top_json TEXT NOT NULL,

      tail_top_json TEXT NOT NULL,

      model_version TEXT NOT NULL,

      created_at TEXT NOT NULL,

      evaluated_at TEXT,

      actual_special TEXT,

      evaluation_json TEXT
    )
  `).run();
}

function parseJSON(
  value,
  fallback
) {

  try {

    return JSON.parse(
      value || ""
    );

  } catch {

    return fallback;
  }
}

async function getHistory(
  db,
  limit = 30
) {

  const rows =
    await db.prepare(`
      SELECT
        prediction_date,
        source_date,
        pairs_json,
        model_version,
        created_at,
        evaluated_at,
        actual_special,
        evaluation_json

      FROM golden_v3_predictions

      ORDER BY
        prediction_date DESC

      LIMIT ?
    `)
    .bind(limit)
    .all();

  return (
    rows?.results || []
  ).map(
    r => ({

      ...r,

      pairs:
        parseJSON(
          r.pairs_json,
          []
        ),

      evaluation:
        parseJSON(
          r.evaluation_json,
          null
        )
    })
  );
}

/*
 * Evaluate pending predictions
 */

async function evaluatePending(
  db,
  resultsByDate
) {

  const pending =
    await db.prepare(`
      SELECT
        prediction_date,
        pairs_json

      FROM golden_v3_predictions

      WHERE evaluated_at IS NULL
    `)
    .all();

  const now =
    new Date().toISOString();

  let evaluated = 0;

  for (
    const p of
    pending?.results || []
  ) {

    const date =
      String(
        p?.prediction_date ?? ""
      ).slice(0, 10);

    const result =
      resultsByDate[date];

    if (!result) {
      continue;
    }

    const pairs =
      parseJSON(
        p.pairs_json,
        []
      );

    const evaluation =
      evaluatePrediction(
        { pairs },
        result.special
      );

    if (!evaluation) {
      continue;
    }

    await db.prepare(`
      UPDATE golden_v3_predictions

      SET
        evaluated_at = ?,
        actual_special = ?,
        evaluation_json = ?,
        model_version = ?

      WHERE prediction_date = ?
    `)
    .bind(
      now,
      evaluation.actualSpecial,
      JSON.stringify(
        evaluation
      ),
      VERSION,
      date
    )
    .run();

    evaluated++;
  }

  return evaluated;
}

/*
 * Main dashboard
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
          version: VERSION,
          message:
            "Không tìm thấy DB binding"
        },
        500
      );
    }

    await ensureTable(db);

    const resultRows =
      await db.prepare(`
        SELECT
          draw_date,
          special

        FROM results

        WHERE
          special IS NOT NULL
          AND TRIM(special) <> ''

        ORDER BY
          draw_date ASC
      `)
      .all();

    const rawResults =
      Array.isArray(
        resultRows?.results
      )
        ? resultRows.results
        : [];

    const rows =
      extractRows(
        rawResults
      );

    if (
      rows.length < 20
    ) {

      return json(
        {
          success: false,

          version:
            VERSION,

          message:
            `Cần ít nhất 20 kỳ có giải đặc biệt; hiện có ${rows.length}.`,

          databaseRows:
            rawResults.length
        },
        422
      );
    }

    /*
     * Result lookup by date
     */

    const byDate =
      Object.fromEntries(
        rawResults
          .filter(
            r =>
              r &&
              r.draw_date
          )
          .map(
            r => [
              String(
                r.draw_date
              ).slice(0, 10),
              r
            ]
          )
      );

    const evaluated =
      await evaluatePending(
        db,
        byDate
      );

    /*
     * V2.8
     */

    const v28 =
      await readV28Signals(
        context
      );

    /*
     * Score head / tail
     */

    const head =
      scoreSide(
        rows,
        "head",
        v28
      );

    const tail =
      scoreSide(
        rows,
        "tail",
        v28
      );

    const pairs =
      choosePairs(
        head.rows,
        tail.rows
      );

    /*
     * Latest source
     */

    const latest =
      rows[
        rows.length - 1
      ];

    const sourceDate =
      latest.date;

    const next =
      new Date(
        `${sourceDate}T00:00:00Z`
      );

    next.setUTCDate(
      next.getUTCDate() + 1
    );

    const predictionDate =
      next
        .toISOString()
        .slice(0, 10);

    /*
     * History
     */

    const history =
      await getHistory(
        db,
        30
      );

    const completed =
      history.filter(
        x =>
          x.evaluated_at &&
          x.evaluation
      );

    const pairHitDays =
      completed.filter(
        x =>
          Number(
            x.evaluation
              ?.pairHits || 0
          ) > 0
      ).length;

    const headHitDays =
      completed.filter(
        x =>
          Number(
            x.evaluation
              ?.headHits || 0
          ) > 0
      ).length;

    const tailHitDays =
      completed.filter(
        x =>
          Number(
            x.evaluation
              ?.tailHits || 0
          ) > 0
      ).length;

    return json({

      success:
        true,

      version:
        VERSION,

      sourceLatestDate:
        sourceDate,

      predictionDate,

      sampleSize:
        rows.length,

      databaseRows:
        rawResults.length,

      dataScope:
        "TOÀN BỘ KỲ ĐB trong bảng results",

      method: {

        head:
          "2 số đầu giải đặc biệt",

        tail:
          "2 số cuối giải đặc biệt",

        weights: {

          historicalFrequency:
            0.25,

          recent60:
            0.20,

          recent30:
            0.15,

          cycleState:
            0.10,

          transition:
            0.10,

          repeatState:
            0.10,

          v28LiveSignal:
            0.10
        },

        note:
          "Score là ranking thống kê, không phải xác suất trúng."
      },

      recommendation: {

        pair1:
          pairs[0] || null,

        pair2:
          pairs[1] || null,

        pairs
      },

      topHead:
        head.rows.slice(
          0,
          10
        ),

      topTail:
        tail.rows.slice(
          0,
          10
        ),

      latestSpecial:
        latest.special,

      latestHead:
        latest.head,

      latestTail:
        latest.tail,

      performance: {

        tracked:
          completed.length,

        evaluatedThisRequest:
          evaluated,

        pairHits:
          pairHitDays,

        headHits:
          headHitDays,

        tailHits:
          tailHitDays,

        pairHitRate:
          round(
            pct(
              pairHitDays,
              completed.length
            )
          ),

        headHitRate:
          round(
            pct(
              headHitDays,
              completed.length
            )
          ),

        tailHitRate:
          round(
            pct(
              tailHitDays,
              completed.length
            )
          )
      },

      history:
        history.slice(
          0,
          15
        ),

      diagnostics: {

        transitionSafe:
          true,

        numericKeySafe:
          true,

        version:
          VERSION
      }

    });

  } catch (e) {

    return json(
      {
        success:
          false,

        version:
          VERSION,

        module:
          "golden-v3-dashboard",

        message:
          e?.message ||
          String(e),

        stack:
          e?.stack ||
          null
      },
      500
    );
  }
}