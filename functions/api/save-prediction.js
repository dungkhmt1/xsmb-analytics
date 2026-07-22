export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    /*
     * Lấy dự đoán hiện tại từ API predict
     */

    const origin =
      new URL(context.request.url).origin;

    const response =
      await fetch(
        `${origin}/api/predict?top=2`,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );

    const predict =
      await response.json();

    if (!predict.success) {
      throw new Error(
        predict.message ||
        "Không lấy được dự đoán"
      );
    }

    const predictionDate =
      predict.data.predictionDate;

    /*
     * Hiện tại lấy Top 2 số.
     *
     * Sau này có thể đổi thành
     * Top pair / Top 3 / dàn 5 số.
     */

    const numbers =
      predict.topNumbers
        .slice(0, 2)
        .map(x => x.number);

    if (!numbers.length) {
      throw new Error(
        "Không có dàn số dự đoán"
      );
    }

    const numbersText =
      numbers.join(",");

    await db
      .prepare(`
        INSERT INTO prediction_daily (
          prediction_date,
          numbers,
          points,
          model
        )

        VALUES (?, ?, ?, ?)

        ON CONFLICT(prediction_date)
        DO UPDATE SET

          numbers = excluded.numbers,
          points = excluded.points,
          model = excluded.model
      `)
      .bind(
        predictionDate,
        numbersText,
        1,
        predict.model
      )
      .run();

    return Response.json({
      success: true,

      predictionDate,

      numbers,

      points: 1,

      model:
        predict.model
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message
      },
      {
        status: 500
      }
    );
  }
}