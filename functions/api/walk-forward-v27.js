/*
========================================================
XSMB WALK-FORWARD DATA V2.7.2
Lightweight D1 data endpoint
========================================================
*/

const VERSION = "walk-forward-data-v2.7.2";

const DEFAULT_LIMIT = 320;
const MIN_LIMIT = 120;
const MAX_LIMIT = 340;

function clampInteger(value, min, max, fallback) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, Math.floor(n))
  );
}

export async function onRequestGet(context) {
  try {
    const DB = context.env.DB;

    if (!DB) {
      return Response.json(
        {
          success: false,
          module: "walk-forward-data",
          version: VERSION,
          message: "Không tìm thấy D1 binding DB."
        },
        {
          status: 500
        }
      );
    }

    const url =
      new URL(context.request.url);

    const limit =
      clampInteger(
        url.searchParams.get("limit"),
        MIN_LIMIT,
        MAX_LIMIT,
        DEFAULT_LIMIT
      );

    /*
    Chỉ lấy dữ liệu.

    Không:
    - tìm cầu
    - backtest
    - Wilson
    - consensus
    - score
    */

    const query =
      await DB
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

          FROM (
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

            ORDER BY draw_date DESC

            LIMIT ?
          )

          ORDER BY draw_date ASC
        `)
        .bind(limit)
        .all();

    const rows =
      Array.isArray(query.results)
        ? query.results
        : [];

    return Response.json(
      {
        success: true,

        module:
          "walk-forward-data",

        version:
          VERSION,

        requestedLimit:
          limit,

        returnedRows:
          rows.length,

        firstDate:
          rows.length
            ? rows[0].draw_date
            : null,

        lastDate:
          rows.length
            ? rows[rows.length - 1].draw_date
            : null,

        rows,

        note:
          "Endpoint chỉ đọc dữ liệu D1. Walk-forward V2.7.2 được tính hoàn toàn trên trình duyệt."
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate"
        }
      }
    );

  } catch (error) {

    console.error(
      "Walk-forward data V2.7.2:",
      error
    );

    return Response.json(
      {
        success: false,

        module:
          "walk-forward-data",

        version:
          VERSION,

        message:
          error?.message ||
          "Lỗi khi đọc dữ liệu walk-forward từ D1."
      },
      {
        status: 500
      }
    );
  }
}