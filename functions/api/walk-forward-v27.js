/*
========================================================
XSMB WALK-FORWARD V2.7.2
DATA ONLY ENDPOINT
========================================================

Cloudflare chỉ:
- đọc D1
- trả dữ liệu JSON

Không:
- tìm cầu
- backtest
- Wilson
- consensus
- walk-forward

Toàn bộ tính toán V2.7.2 chạy trên trình duyệt.
========================================================
*/

const VERSION =
  "walk-forward-data-v2.7.2";

const DEFAULT_LIMIT = 320;
const MIN_LIMIT = 100;
const MAX_LIMIT = 340;


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(
      max,
      Math.floor(number)
    )
  );
}


function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate"
      }
    }
  );
}


export async function onRequestGet(
  context
) {
  try {

    const DB =
      context.env.DB;


    if (!DB) {

      return jsonResponse(
        {
          success: false,

          module:
            "walk-forward-data",

          version:
            VERSION,

          message:
            "Không tìm thấy D1 binding DB."
        },
        500
      );
    }


    const url =
      new URL(
        context.request.url
      );


    const limit =
      clampInteger(
        url.searchParams.get(
          "limit"
        ),
        MIN_LIMIT,
        MAX_LIMIT,
        DEFAULT_LIMIT
      );


    /*
    Chỉ SELECT dữ liệu.
    Đây là phần rất nhẹ.
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

          FROM results

          ORDER BY draw_date DESC

          LIMIT ?
        `)
        .bind(limit)
        .all();


    /*
    Query trả mới -> cũ.

    Walk-forward cần:
    cũ -> mới.
    */

    const rows =
      Array.isArray(
        query.results
      )
        ?
        [...query.results]
          .reverse()
        :
        [];


    return jsonResponse({
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
          ?
          rows[0].draw_date
          :
          null,

      lastDate:
        rows.length
          ?
          rows[
            rows.length - 1
          ].draw_date
          :
          null,

      rows,

      note:
        "V2.7.2 chỉ tải dữ liệu D1. Toàn bộ walk-forward được xử lý local trên trình duyệt."
    });


  } catch (error) {

    console.error(
      "Walk-forward Data V2.7.2:",
      error
    );


    return jsonResponse(
      {
        success: false,

        module:
          "walk-forward-data",

        version:
          VERSION,

        message:
          error?.message
          ||
          "Lỗi đọc dữ liệu D1."
      },
      500
    );
  }
}