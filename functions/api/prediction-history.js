export async function onRequestGet(context) {
  try {
    const db =
      context.env.DB;

    /*
     * Giá trị theo quy ước của bạn
     */

    const COST_PER_POINT =
      27000;

    const PAYOUT_PER_HIT =
      99000;

    /*
     * Lấy lịch sử dự đoán
     */

    const {
      results: predictions
    } =
      await db
        .prepare(`
          SELECT
            prediction_date,
            numbers,
            points,
            model,
            created_at
          FROM prediction_daily
          ORDER BY prediction_date DESC
        `)
        .all();

    const rows = [];

    let totalCost = 0;
    let totalPayout = 0;
    let totalProfit = 0;
    let totalHits = 0;

    for (
      const prediction
      of predictions
    ) {
      const numbers =
        String(
          prediction.numbers
        )
          .split(",")
          .map(x => x.trim())
          .filter(Boolean);

      const points =
        Number(
          prediction.points || 1
        );

      /*
       * Tiền bỏ ra:
       *
       * số lượng số
       * × điểm
       * × 27.000
       */

      const cost =
        numbers.length *
        points *
        COST_PER_POINT;

      /*
       * Kiểm tra xem kỳ đó
       * đã có kết quả chưa
       */

      const resultExists =
        await db
          .prepare(`
            SELECT draw_date
            FROM results
            WHERE draw_date = ?
            LIMIT 1
          `)
          .bind(
            prediction.prediction_date
          )
          .first();

      /*
       * Nếu chưa xổ
       */

      if (!resultExists) {
        rows.push({
          date:
            prediction.prediction_date,

          numbers,

          points,

          status:
            "pending",

          hitsByNumber: {},

          totalHits: 0,

          cost,

          payout: 0,

          profit: null,

          model:
            prediction.model
        });

        continue;
      }

      /*
       * Đọc loto của đúng kỳ
       *
       * bảng loto đã lưu:
       * number + count
       */

      const placeholders =
        numbers
          .map(() => "?")
          .join(",");

      const query = `
        SELECT
          number,
          count
        FROM loto
        WHERE draw_date = ?
        AND number IN (${placeholders})
      `;

      const {
        results: lotoRows
      } =
        await db
          .prepare(query)
          .bind(
            prediction.prediction_date,
            ...numbers
          )
          .all();

      /*
       * Mặc định mỗi số = 0 lần
       */

      const hitsByNumber = {};

      for (
        const number
        of numbers
      ) {
        hitsByNumber[number] = 0;
      }

      let hitCount = 0;

      for (
        const loto
        of lotoRows
      ) {
        const count =
          Number(
            loto.count || 0
          );

        hitsByNumber[
          String(loto.number)
            .padStart(2, "0")
        ] =
          count;

        hitCount +=
          count;
      }

      /*
       * Tiền nhận:
       *
       * số lần về
       * × điểm
       * × 99.000
       */

      const payout =
        hitCount *
        points *
        PAYOUT_PER_HIT;

      const profit =
        payout -
        cost;

      totalCost += cost;
      totalPayout += payout;
      totalProfit += profit;
      totalHits += hitCount;

      rows.push({
        date:
          prediction.prediction_date,

        numbers,

        points,

        status:
          "completed",

        hitsByNumber,

        totalHits:
          hitCount,

        cost,

        payout,

        profit,

        model:
          prediction.model
      });
    }

    return Response.json({
      success: true,

      rules: {
        costPerPoint:
          COST_PER_POINT,

        payoutPerHit:
          PAYOUT_PER_HIT
      },

      summary: {
        totalPredictions:
          rows.length,

        completed:
          rows.filter(
            x =>
              x.status ===
              "completed"
          ).length,

        totalHits,

        totalCost,

        totalPayout,

        totalProfit
      },

      history:
        rows
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