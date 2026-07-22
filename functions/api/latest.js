export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    const row = await db
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
        LIMIT 1
      `)
      .first();

    if (!row) {
      return Response.json({
        success: false,
        message: "Chưa có dữ liệu kết quả"
      });
    }

    function split(value) {
      if (!value) return [];

      return String(value)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    }

    return Response.json({
      success: true,

      drawDate: row.draw_date,

      results: {
        special: row.special,
        g1: split(row.g1),
        g2: split(row.g2),
        g3: split(row.g3),
        g4: split(row.g4),
        g5: split(row.g5),
        g6: split(row.g6),
        g7: split(row.g7)
      }
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