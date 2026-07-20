function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);

    const from = requestUrl.searchParams.get("from");
    const to = requestUrl.searchParams.get("to");

    if (!from || !to) {
      return Response.json(
        {
          success: false,
          message:
            "Cách dùng: /api/import-history?from=2026-07-01&to=2026-07-20"
        },
        { status: 400 }
      );
    }

    const startDate = new Date(`${from}T00:00:00Z`);
    const endDate = new Date(`${to}T00:00:00Z`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      return Response.json(
        {
          success: false,
          message: "Ngày không hợp lệ"
        },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return Response.json(
        {
          success: false,
          message: "Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc"
        },
        { status: 400 }
      );
    }

    const totalDays =
      Math.floor(
        (endDate - startDate) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    if (totalDays > 30) {
      return Response.json(
        {
          success: false,
          message:
            "Mỗi lần chỉ nhập tối đa 30 ngày"
        },
        { status: 400 }
      );
    }

    const origin = requestUrl.origin;

    const imported = [];
    const failed = [];

    let currentDate = startDate;

    while (currentDate <= endDate) {
      const drawDate = formatDate(currentDate);

      try {
        const response = await fetch(
          `${origin}/api/update?date=${drawDate}`
        );

        const data = await response.json();

        if (data.success) {
          imported.push({
            date: drawDate,
            special:
              data.results?.special || null
          });
        } else {
          failed.push({
            date: drawDate,
            error:
              data.message || "Không xác định"
          });
        }
      } catch (error) {
        failed.push({
          date: drawDate,
          error: error.message
        });
      }

      currentDate = addDays(currentDate, 1);
    }

    return Response.json({
      success: true,

      requested: totalDays,

      importedCount:
        imported.length,

      failedCount:
        failed.length,

      imported,

      failed
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message
      },
      { status: 500 }
    );
  }
}