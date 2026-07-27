export async function onRequestGet(context) {

  try {

    const db = context.env.DB;

    if (!db) {
      throw new Error("DB binding không tồn tại");
    }

    const url =
      new URL(context.request.url);

    const date =
      (url.searchParams.get("date") || "")
        .trim();


    /*
    ====================================================
    VALIDATE DATE
    ====================================================
    */

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {

      return Response.json(
        {
          success: false,
          message: "Ngày không hợp lệ. Định dạng yêu cầu YYYY-MM-DD."
        },
        {
          status: 400
        }
      );
    }


    /*
    ====================================================
    ĐỌC KẾT QUẢ

    Dùng cùng bảng results mà hệ thống hiện tại đang sử dụng.
    ====================================================
    */

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


    if (!row) {

      return Response.json(
        {
          success: false,
          drawDate: date,
          message: "Không có kết quả ngày này."
        },
        {
          status: 404
        }
      );
    }


    /*
    ====================================================
    HELPER
    ====================================================
    */

    function parseArray(value) {

  if (Array.isArray(value)) {
    return value
      .map(x => String(x).trim())
      .filter(Boolean);
  }


  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return [];
  }


  if (typeof value === "string") {

    /*
    Thử JSON trước.
    */

    try {

      const parsed =
        JSON.parse(value);

      if (Array.isArray(parsed)) {

        return parsed
          .map(x => String(x).trim())
          .filter(Boolean);
      }

    } catch (_) {
      // không phải JSON
    }


    /*
    Database XSMB hiện tại lưu
    nhiều giải bằng dấu cách.

    Ví dụ:
    "86786 24867"
    */

    return value
      .trim()
      .split(/\s+/)
      .map(x => x.trim())
      .filter(Boolean);
  }


  return [
    String(value)
  ];
}


    function clean(value) {

      if (
        value === null ||
        value === undefined
      ) {
        return "";
      }

      return String(value);
    }


    /*
    ====================================================
    RESPONSE CHUẨN GIỐNG /api/latest
    ====================================================
    */

    return Response.json(
      {
        success: true,

        drawDate:
          row.draw_date,

        results: {

          special:
            clean(
              row.special
            ),

          g1:
            parseArray(
              row.g1
            ),

          g2:
            parseArray(
              row.g2
            ),

          g3:
            parseArray(
              row.g3
            ),

          g4:
            parseArray(
              row.g4
            ),

          g5:
            parseArray(
              row.g5
            ),

          g6:
            parseArray(
              row.g6
            ),

          g7:
            parseArray(
              row.g7
            )
        }
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
      "RESULT API ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Không đọc được kết quả."
      },
      {
        status: 500
      }
    );
  }
}   