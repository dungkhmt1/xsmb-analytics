function extractPrize(html, prize) {
  const pattern =
    new RegExp(
      `<span[^>]*id=(?:"|')?mb_prize${prize}_item\\d+(?:"|')?[^>]*>([^<]*)<\\/span>`,
      "gi"
    );

  const values = [];
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const value = match[1]
      .replace(/<[^>]*>/g, "")
      .trim();

    if (value) {
      values.push(value);
    }
  }

  return values;
}


function getLastTwoDigits(value) {
  return String(value)
    .trim()
    .slice(-2)
    .padStart(2, "0");
}


function formatDateForUrl(date) {
  // Input: 2026-07-20
  // Output: 20-07-2026

  const parts = date.split("-");

  if (parts.length !== 3) {
    throw new Error(
      "Ngày phải có định dạng YYYY-MM-DD"
    );
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}


export async function onRequestGet(context) {

  try {

    /*
      Cách dùng:

      /api/update?date=2026-07-20

      Nếu không truyền date,
      mặc định dùng ngày hiện tại theo UTC.
    */

    const url = new URL(context.request.url);

    let drawDate = url.searchParams.get("date");


    if (!drawDate) {

      const now = new Date();

      drawDate =
        now.toISOString().slice(0, 10);

    }


    const formattedDate =
      formatDateForUrl(drawDate);


    const SOURCE_URL =
      `https://xoso.com.vn/xsmb-${formattedDate}.html`;


    /*
      Tải HTML
    */

    const response =
      await fetch(
        SOURCE_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"
          }
        }
      );


    if (!response.ok) {

      return Response.json(
        {
          success: false,
          message:
            "Không tải được website nguồn",
          status: response.status,
          source: SOURCE_URL
        },
        {
          status: 500
        }
      );

    }


    const html =
      await response.text();


    /*
      Lấy từng giải
    */

    const special =
      extractPrize(
        html,
        "DB"
      );


    const g1 =
      extractPrize(
        html,
        "1"
      );


    const g2 =
      extractPrize(
        html,
        "2"
      );


    const g3 =
      extractPrize(
        html,
        "3"
      );


    const g4 =
      extractPrize(
        html,
        "4"
      );


    const g5 =
      extractPrize(
        html,
        "5"
      );


    const g6 =
      extractPrize(
        html,
        "6"
      );


    const g7 =
      extractPrize(
        html,
        "7"
      );


    /*
      Kiểm tra cấu trúc chuẩn XSMB
    */

function isValidNumber(value, length) {
  const text = String(value).trim();

  return (
    new RegExp(`^\\d{${length}}$`)
  ).test(text);
}

const valid =
  special.length === 1 &&
  special.every(x => isValidNumber(x, 5)) &&

  g1.length === 1 &&
  g1.every(x => isValidNumber(x, 5)) &&

  g2.length === 2 &&
  g2.every(x => isValidNumber(x, 5)) &&

  g3.length === 6 &&
  g3.every(x => isValidNumber(x, 5)) &&

  g4.length === 4 &&
  g4.every(x => isValidNumber(x, 4)) &&

  g5.length === 6 &&
  g5.every(x => isValidNumber(x, 4)) &&

  g6.length === 3 &&
  g6.every(x => isValidNumber(x, 3)) &&

  g7.length === 4 &&
  g7.every(x => isValidNumber(x, 2));


    const totalNumbers =
      special.length +
      g1.length +
      g2.length +
      g3.length +
      g4.length +
      g5.length +
      g6.length +
      g7.length;


    if (!valid) {

      return Response.json(
        {

          success: false,

          message:
            "Dữ liệu không đầy đủ hoặc cấu trúc website đã thay đổi",

          source:
            SOURCE_URL,

          totalNumbers,

          found: {

            DB:
              special.length,

            G1:
              g1.length,

            G2:
              g2.length,

            G3:
              g3.length,

            G4:
              g4.length,

            G5:
              g5.length,

            G6:
              g6.length,

            G7:
              g7.length

          }

        },
        {
          status: 400
        }
      );

    }


    /*
      Kết nối database
    */

    const db =
      context.env.DB;


    /*
      Lưu kết quả chính
    */

    await db
      .prepare(
        `
        INSERT INTO results (
          draw_date,
          special,
          g1,
          g2,
          g3,
          g4,
          g5,
          g6,
          g7
        )

        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )

        ON CONFLICT(draw_date)

        DO UPDATE SET

          special =
            excluded.special,

          g1 =
            excluded.g1,

          g2 =
            excluded.g2,

          g3 =
            excluded.g3,

          g4 =
            excluded.g4,

          g5 =
            excluded.g5,

          g6 =
            excluded.g6,

          g7 =
            excluded.g7
        `
      )

      .bind(

        drawDate,

        special[0],

        g1[0],

        g2.join(" "),

        g3.join(" "),

        g4.join(" "),

        g5.join(" "),

        g6.join(" "),

        g7.join(" ")

      )

      .run();


    /*
      Gom toàn bộ 27 số
    */

    const allNumbers = [

      ...special,

      ...g1,

      ...g2,

      ...g3,

      ...g4,

      ...g5,

      ...g6,

      ...g7

    ];


    /*
      Tách loto 2 số cuối
    */

    const lotoCount = {};


    for (
      const number
      of allNumbers
    ) {

      const loto =
        getLastTwoDigits(
          number
        );


      lotoCount[loto] =
        (
          lotoCount[loto]
          || 0
        )
        + 1;

    }


    /*
      Xóa dữ liệu loto cũ
      của ngày này nếu cập nhật lại
    */

    await db

      .prepare(
        `
        DELETE
        FROM loto
        WHERE draw_date = ?
        `
      )

      .bind(
        drawDate
      )

      .run();


    /*
      Lưu loto
    */

    for (
      const [
        number,
        count
      ]
      of
      Object.entries(
        lotoCount
      )
    ) {

      await db

        .prepare(
          `
          INSERT INTO loto (
            draw_date,
            number,
            count
          )

          VALUES (
            ?, ?, ?
          )
          `
        )

        .bind(
          drawDate,
          number,
          count
        )

        .run();

    }


    /*
      Trả kết quả
    */

    return Response.json({

      success: true,

      message:
        "Cập nhật XSMB thành công",

      draw_date:
        drawDate,

      source:
        SOURCE_URL,

      totalNumbers:
        allNumbers.length,

      results: {

        special:
          special[0],

        g1,

        g2,

        g3,

        g4,

        g5,

        g6,

        g7

      },

      loto:
        lotoCount

    });


  }

  catch (error) {

    return Response.json(
      {

        success: false,

        message:
          error.message

      },
      {
        status: 500
      }
    );

  }

}