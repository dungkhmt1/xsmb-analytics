function padNumber(
  number
) {
  return String(number)
    .padStart(
      2,
      "0"
    );
}


/* =========================================
   API
========================================= */

export async function onRequestGet(
  context
) {
  try {
    const db =
      context.env.DB;


    /*
      Lấy toàn bộ bảng loto.

      Dữ liệu hiện chỉ khoảng
      vài nghìn dòng nên nhẹ.
    */

    const { results: rows } =
      await db
        .prepare(`
          SELECT
            draw_date,
            number,
            count

          FROM loto

          ORDER BY
            draw_date DESC
        `)
        .all();


    if (
      !rows ||
      !rows.length
    ) {
      return Response.json({
        success: false,

        message:
          "Database chưa có dữ liệu loto."
      });
    }


    /*
      Danh sách ngày xổ
      mới -> cũ
    */

    const drawDates =
      [
        ...new Set(
          rows.map(
            row =>
              row.draw_date
          )
        )
      ];


    const totalDraws =
      drawDates.length;


    const latestDate =
      drawDates[0];


    /*
      Map:
      ngày -> số -> số lần xuất hiện
    */

    const dateMap =
      Object.create(null);


    for (
      const row
      of rows
    ) {

      if (
        !dateMap[
          row.draw_date
        ]
      ) {
        dateMap[
          row.draw_date
        ] =
          Object.create(null);
      }


      dateMap[
        row.draw_date
      ][
        String(row.number)
          .padStart(
            2,
            "0"
          )
      ] =
        Number(
          row.count || 0
        );
    }


    const statistics = [];


    /*
      =================================
      PHÂN TÍCH 00 -> 99
      =================================
    */

    for (
      let i = 0;
      i <= 99;
      i++
    ) {

      const number =
        padNumber(i);


      let totalCount = 0;

      let drawsAppeared = 0;

      let freq7 = 0;

      let freq30 = 0;

      let freq100 = 0;

      let gan = 0;

      let foundLatest =
        false;


      for (
        let index = 0;
        index <
          drawDates.length;
        index++
      ) {

        const date =
          drawDates[index];


        const count =
          Number(
            dateMap[
              date
            ]?.[
              number
            ] || 0
          );


        totalCount +=
          count;


        if (
          count > 0
        ) {
          drawsAppeared++;
        }


        if (
          index < 7
        ) {
          freq7 +=
            count;
        }


        if (
          index < 30
        ) {
          freq30 +=
            count;
        }


        if (
          index < 100
        ) {
          freq100 +=
            count;
        }


        /*
          Gan tính từ ngày
          mới nhất trở về trước.
        */

        if (!foundLatest) {

          if (
            count > 0
          ) {
            foundLatest =
              true;
          } else {
            gan++;
          }

        }

      }


      const appearanceRate =
        totalDraws > 0
          ? (
              drawsAppeared /
              totalDraws
            ) *
            100
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
            appearanceRate
              .toFixed(
                2
              )
          )

      });

    }


    /*
      =================================
      TOP GAN
      =================================
    */

    const topGan =
      [...statistics]
        .sort(
          (a, b) =>
            b.gan -
            a.gan
        )
        .slice(
          0,
          15
        );


    /*
      =================================
      HOT 7
      =================================
    */

    const hot7 =
      [...statistics]
        .sort(
          (a, b) => {

            if (
              b.freq7 !==
              a.freq7
            ) {
              return (
                b.freq7 -
                a.freq7
              );
            }


            return (
              b.freq30 -
              a.freq30
            );
          }
        )
        .slice(
          0,
          15
        );


    /*
      =================================
      HOT 30
      =================================
    */

    const hot30 =
      [...statistics]
        .sort(
          (a, b) => {

            if (
              b.freq30 !==
              a.freq30
            ) {
              return (
                b.freq30 -
                a.freq30
              );
            }


            return (
              b.freq100 -
              a.freq100
            );
          }
        )
        .slice(
          0,
          15
        );


    /*
      =================================
      CẶP ĐẢO
      =================================
    */

    const byNumber =
      new Map(
        statistics.map(
          item => [
            item.number,
            item
          ]
        )
      );


    const used =
      new Set();


    const reversePairs = [];


    for (
      const item
      of statistics
    ) {

      const reverse =
        item.number
          .split("")
          .reverse()
          .join("");


      const pairArray =
        [
          item.number,
          reverse
        ].sort();


      const pairKey =
        pairArray.join(
          "-"
        );


      if (
        used.has(
          pairKey
        )
      ) {
        continue;
      }


      used.add(
        pairKey
      );


      const reverseItem =
        byNumber.get(
          reverse
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
          reverseItem.freq30,

        freq100:
          item.freq100 +
          reverseItem.freq100

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
          (a, b) => {

            if (
              b.combinedGan !==
              a.combinedGan
            ) {
              return (
                b.combinedGan -
                a.combinedGan
              );
            }


            return (
              b.freq30 -
              a.freq30
            );
          }
        )
        .slice(
          0,
          15
        );


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

        message:
          error?.message ||
          "Lỗi Statistics"
      },
      {
        status: 500
      }
    );

  }
}