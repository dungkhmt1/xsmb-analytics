/*
 * GET /api/golden/v3/backtest?limit=50
 *
 * Golden V3.1.2
 *
 * Strict walk-forward:
 * - Target day is NEVER included in training.
 * - Uses only historical special-prize results.
 * - Evaluates:
 *      1. exact HEAD + TAIL pair
 *      2. HEAD
 *      3. TAIL
 *
 * IMPORTANT:
 * This backtest is for validating the Golden statistical engine.
 */

const VERSION = "golden-v3.1.2";

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control": "no-store",
        "pragma": "no-cache"
      }
    }
  );
}


/*
 * =========================================================
 * 00 -> 99
 * =========================================================
 */

const N = Array.from(
  { length: 100 },
  (_, i) =>
    String(i).padStart(2, "0")
);


/*
 * =========================================================
 * Normalize special prize
 * =========================================================
 */

function norm(value) {

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

  const normalized =
    digits
      .padStart(5, "0")
      .slice(-5);

  if (!/^\d{5}$/.test(normalized)) {
    return null;
  }

  return normalized;
}


/*
 * =========================================================
 * Convert DB rows
 * =========================================================
 */

function rowsOf(results) {

  return (results || [])
    .map(row => {

      const special =
        norm(row?.special);

      const date =
        String(
          row?.draw_date ?? ""
        ).slice(0, 10);

      if (!special) {
        return null;
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
      ) {
        return null;
      }

      return {
        date,
        special,

        head:
          special.slice(0, 2),

        tail:
          special.slice(-2)
      };

    })
    .filter(Boolean);

}


/*
 * =========================================================
 * Bayesian smoothing
 * =========================================================
 */

function posterior(
  hits,
  total,
  alpha = 1,
  beta = 9
) {

  return (
    hits + alpha
  ) / (
    total + alpha + beta
  );

}


/*
 * =========================================================
 * Score one side
 * =========================================================
 */

function score(
  rows,
  key,
  value
) {

  const n =
    rows.length;

  if (!n) {
    return 0;
  }


  /*
   * -------------------------------------------------------
   * Full history
   * -------------------------------------------------------
   */

  const all =
    rows.filter(
      row =>
        row[key] === value
    ).length;


  /*
   * -------------------------------------------------------
   * Recent windows
   * -------------------------------------------------------
   */

  const r30 =
    rows
      .slice(-30)
      .filter(
        row =>
          row[key] === value
      )
      .length;


  const r60 =
    rows
      .slice(-60)
      .filter(
        row =>
          row[key] === value
      )
      .length;


  /*
   * -------------------------------------------------------
   * Expected frequency
   * -------------------------------------------------------
   */

  const expected =
    n / 100;

  const expected30 =
    Math.min(30, n) / 100;

  const expected60 =
    Math.min(60, n) / 100;


  /*
   * -------------------------------------------------------
   * Frequency score
   * -------------------------------------------------------
   */

  const fullScore =
    50 +
    25 *
      (
        (all - expected) /
        Math.sqrt(expected + 1)
      );


  const score30 =
    50 +
    25 *
      (
        (r30 - expected30) /
        Math.sqrt(expected30 + 1)
      );


  const score60 =
    50 +
    25 *
      (
        (r60 - expected60) /
        Math.sqrt(expected60 + 1)
      );


  /*
   * -------------------------------------------------------
   * Transition
   *
   * P(current = value | previous = lastValue)
   * -------------------------------------------------------
   */

  const last =
    rows.length
      ? rows[rows.length - 1][key]
      : null;


  let transitionHits = 0;
  let transitionTotal = 0;


  if (last !== null) {

    for (
      let i = 0;
      i < rows.length - 1;
      i++
    ) {

      if (
        rows[i][key] !== last
      ) {
        continue;
      }

      transitionTotal++;

      if (
        rows[i + 1][key] === value
      ) {
        transitionHits++;
      }

    }

  }


  const transitionRate =
    posterior(
      transitionHits,
      transitionTotal
    );


  const transitionScore =
    50 +
    (
      transitionRate * 100 -
      10
    ) * 2.5;


  /*
   * -------------------------------------------------------
   * Gap
   * -------------------------------------------------------
   */

  const indexes =
    rows.map(
      row => row[key]
    );


  const lastSeen =
    indexes.lastIndexOf(value);


  const gap =
    lastSeen < 0
      ? n
      : n - 1 - lastSeen;


  /*
   * -------------------------------------------------------
   * Median gap of all numbers
   * -------------------------------------------------------
   */

  const gaps =
    N.map(number => {

      const index =
        indexes.lastIndexOf(
          number
        );

      return index < 0
        ? n
        : n - 1 - index;

    })
    .sort(
      (a, b) => a - b
    );


  const medianGap =
    gaps[
      Math.floor(
        gaps.length / 2
      )
    ] || 0;


  const cycleScore =
    100 *
    Math.exp(
      -Math.abs(
        gap - medianGap
      ) /
      Math.max(
        2,
        medianGap + 1
      )
    );


  /*
   * -------------------------------------------------------
   * Final score
   * -------------------------------------------------------
   */

  const clamp =
    value =>
      Math.max(
        0,
        Math.min(
          100,
          value
        )
      );


  return (

    0.35 *
      clamp(fullScore)

    +

    0.25 *
      clamp(score60)

    +

    0.15 *
      clamp(score30)

    +

    0.15 *
      clamp(transitionScore)

    +

    0.10 *
      clamp(cycleScore)

  );

}


/*
 * =========================================================
 * Pick Top 10
 * =========================================================
 */

function pick(
  rows,
  key
) {

  return N
    .map(value => ({
      number: value,

      score:
        score(
          rows,
          key,
          value
        )
    }))
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 10);

}


/*
 * =========================================================
 * Build candidate pairs
 * =========================================================
 */

function buildPairs(
  heads,
  tails
) {

  const candidates = [];

  for (
    const head of heads
  ) {

    for (
      const tail of tails
    ) {

      const pairScore =
        Math.sqrt(
          head.score *
          tail.score
        );


      candidates.push({

        head:
          head.number,

        tail:
          tail.number,

        pair:
          `${head.number}-${tail.number}`,

        score:
          pairScore

      });

    }

  }


  candidates.sort(
    (a, b) =>
      b.score - a.score
  );


  /*
   * Không cho cùng HEAD hoặc TAIL
   * chiếm cả 2 vị trí nếu có lựa chọn khác.
   */

  const selected = [];

  for (
    const candidate
    of candidates
  ) {

    if (
      selected.length >= 2
    ) {
      break;
    }

    const duplicate =
      selected.some(
        item =>
          item.head === candidate.head ||
          item.tail === candidate.tail
      );

    if (!duplicate) {
      selected.push(
        candidate
      );
    }

  }


  /*
   * Fallback nếu không đủ 2 cặp
   */

  if (
    selected.length < 2
  ) {

    for (
      const candidate
      of candidates
    ) {

      if (
        selected.length >= 2
      ) {
        break;
      }

      const exists =
        selected.some(
          item =>
            item.pair ===
            candidate.pair
        );

      if (!exists) {
        selected.push(
          candidate
        );
      }

    }

  }


  return selected;

}


/*
 * =========================================================
 * GET
 * =========================================================
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


    const url =
      new URL(
        context.request.url
      );


    const requestedRaw =
      Number(
        url.searchParams.get(
          "limit"
        ) || 50
      );


    const requested =
      Math.min(
        200,
        Math.max(
          10,
          Number.isFinite(
            requestedRaw
          )
            ? requestedRaw
            : 50
        )
      );


    /*
     * =====================================================
     * Load ALL special-prize history
     * =====================================================
     */

    const query =
      await db.prepare(`
        SELECT
          draw_date,
          special
        FROM results
        WHERE special IS NOT NULL
          AND TRIM(special) <> ''
        ORDER BY draw_date ASC
      `).all();


    const rows =
      rowsOf(
        query?.results || []
      );


    if (
      rows.length < 30
    ) {

      return json(
        {
          success: false,
          version: VERSION,
          message:
            `Cần ít nhất 30 kỳ; hiện có ${rows.length}.`,
          databaseRows:
            query?.results?.length || 0,
          validSpecialRows:
            rows.length
        },
        422
      );

    }


    /*
     * =====================================================
     * Walk-forward start
     * =====================================================
     */

    const start =
      Math.max(
        30,
        rows.length - requested
      );


    let tested = 0;

    let pairHits = 0;
    let headHits = 0;
    let tailHits = 0;


    const recent = [];


    /*
     * =====================================================
     * WALK FORWARD
     * =====================================================
     */

    for (
      let i = start;
      i < rows.length;
      i++
    ) {

      /*
       * CRITICAL:
       *
       * rows[i] is target.
       * It is NOT included in training.
       */

      const train =
        rows.slice(
          0,
          i
        );


      const heads =
        pick(
          train,
          "head"
        );


      const tails =
        pick(
          train,
          "tail"
        );


      const prediction =
        buildPairs(
          heads,
          tails
        );


      const actual =
        rows[i];


      /*
       * Exact pair
       */

      const pairHit =
        prediction.some(
          pair =>
            pair.head ===
              actual.head &&
            pair.tail ===
              actual.tail
        );


      /*
       * HEAD only
       */

      const headHit =
        prediction.some(
          pair =>
            pair.head ===
            actual.head
        );


      /*
       * TAIL only
       */

      const tailHit =
        prediction.some(
          pair =>
            pair.tail ===
            actual.tail
        );


      if (pairHit) {
        pairHits++;
      }

      if (headHit) {
        headHits++;
      }

      if (tailHit) {
        tailHits++;
      }


      tested++;


      recent.push({

        date:
          actual.date,

        actualSpecial:
          actual.special,

        actualHead:
          actual.head,

        actualTail:
          actual.tail,

        pairs:
          prediction.map(
            pair => ({
              ...pair,

              score:
                Number(
                  pair.score.toFixed(
                    2
                  )
                )
            })
          ),

        pairHit,

        headHit,

        tailHit

      });

    }


    /*
     * =====================================================
     * Rates
     * =====================================================
     */

    const rate =
      value =>
        tested > 0
          ? Number(
              (
                value /
                tested *
                100
              ).toFixed(2)
            )
          : 0;


    /*
     * =====================================================
     * Return
     * =====================================================
     */

    return json({

      success: true,

      version: VERSION,

      testedDraws:
        tested,

      pairHits,

      headHits,

      tailHits,

      pairHitRate:
        rate(pairHits),

      headHitRate:
        rate(headHits),

      tailHitRate:
        rate(tailHits),

      leakage:
        "none: target day is excluded from training",

      dataScope:
        "special prize only",

      recent:
        recent.slice(-30)

    });

  } catch (error) {

    return json(
      {
        success: false,
        version: VERSION,
        module:
          "golden-v3-backtest",
        message:
          error?.message ||
          String(error),
        stack:
          error?.stack || null
      },
      500
    );

  }

}