function padNumber(number) {
  return String(number).padStart(2, "0");
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    /*
      Lấy toàn bộ dữ liệu loto,
      mới nhất trước
    */
    const { results: rows } = await db
      .prepare(`
        SELECT
          draw_date,
          number,
          count
        FROM loto
        ORDER BY draw_date DESC
      `)
      .all();

    if (!rows || rows.length === 0) {
      return Response.json({
        success: false,
        message: "Database chưa có dữ liệu loto"
      });
    }

    /*
      Lấy danh sách ngày xổ duy nhất
    */
    const drawDates = [
      ...new Set(
        rows.map(row => row.draw_date)
      )
    ];

    const totalDraws = drawDates.length;

    /*
      Map:
      date -> number -> count
    */
    const dateMap = {};

    for (const row of rows) {
      if (!dateMap[row.draw_date]) {
        dateMap[row.draw_date] = {};
      }

      dateMap[row.draw_date][row.number] =
        row.count;
    }

    const latestDate = drawDates[0];

    const statistics = [];

    /*
      Phân tích 00 -> 99
    */
    for (let i = 0; i <= 99; i++) {
      const number = padNumber(i);

      let totalCount = 0;

      let drawsAppeared = 0;

      let freq7 = 0;

      let freq30 = 0;

      let freq100 = 0;

      let gan = 0;

      let foundLastAppearance = false;

      /*
        Duyệt theo ngày,
        mới nhất -> cũ nhất
      */
      for (
        let index = 0;
        index < drawDates.length;
        index++
      ) {
        const date = drawDates[index];

        const count =
          dateMap[date]?.[number] || 0;

        /*
          Tổng số lần xuất hiện
        */
        totalCount += count;

        /*
          Số kỳ có xuất hiện
        */
        if (count > 0) {
          drawsAppeared++;
        }

        /*
          Tần suất 7 kỳ
        */
        if (index < 7) {
          freq7 += count;
        }

        /*
          Tần suất 30 kỳ
        */
        if (index < 30) {
          freq30 += count;
        }

        /*
          Tần suất 100 kỳ
        */
        if (index < 100) {
          freq100 += count;
        }

        /*
          Gan hiện tại
        */
        if (!foundLastAppearance) {
          if (count > 0) {
            foundLastAppearance = true;
          } else {
            gan++;
          }
        }
      }

      /*
        Tỷ lệ số kỳ có mặt
      */
      const appearanceRate =
        totalDraws > 0
          ? drawsAppeared / totalDraws
          : 0;

      statistics.push({
        number,
        gan,
        freq7,
        freq30,
        freq100,
        totalCount,
        drawsAppeared,
        appearanceRate:
          Number(
            (
              appearanceRate * 100
            ).toFixed(2)
          )
      });
    }

    /*
      Top gan
    */
    const topGan = [...statistics]
      .sort(
        (a, b) =>
          b.gan - a.gan
      )
      .slice(0, 15);

    /*
      Top nóng 7 kỳ
    */
    const hot7 = [...statistics]
      .sort(
        (a, b) =>
          b.freq7 - a.freq7
      )
      .slice(0, 15);

    /*
      Top nóng 30 kỳ
    */
    const hot30 = [...statistics]
      .sort(
        (a, b) =>
          b.freq30 - a.freq30
      )
      .slice(0, 15);

    /*
      Tạo cặp đảo
      Ví dụ:
      12 <-> 21
    */
    const reversePairs = [];

    const used = new Set();

    for (const item of statistics) {
      const reverse =
        item.number
          .split("")
          .reverse()
          .join("");

      const pairKey =
        [item.number, reverse]
          .sort()
          .join("-");

      if (used.has(pairKey)) {
        continue;
      }

      used.add(pairKey);

      const reverseItem =
        statistics.find(
          s =>
            s.number === reverse
        );

      if (!reverseItem) {
        continue;
      }

      reversePairs.push({
        pair:
          `${item.number}-${reverse}`,

        number1:
          item.number,

        number2:
          reverse,

        gan1:
          item.gan,

        gan2:
          reverseItem.gan,

        combinedGan:
          item.gan +
          reverseItem.gan,

        freq7:
          item.freq7 +
          reverseItem.freq7,

        freq30:
          item.freq30 +
          reverseItem.freq30
      });
    }

    const topReverseGan =
      reversePairs
        .filter(
          item =>
            item.number1 !==
            item.number2
        )
        .sort(
          (a, b) =>
            b.combinedGan -
            a.combinedGan
        )
        .slice(0, 15);

    return Response.json({
      success: true,

      latestDate,

      totalDraws,

      topGan,

      hot7,

      hot30,

      topReverseGan,

      numbers:
        statistics
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