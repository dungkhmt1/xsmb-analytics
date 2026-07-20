function getLastTwoDigits(value) {
  const text = String(value).trim();
  return text.slice(-2).padStart(2, "0");
}

function splitNumbers(value) {
  if (!value) return [];
  return String(value)
    .split(/[\s,;|]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const {
      draw_date,
      special,
      g1,
      g2,
      g3,
      g4,
      g5,
      g6,
      g7
    } = body;

    if (!draw_date || !special || !g1) {
      return Response.json(
        {
          success: false,
          message: "Thiếu draw_date, special hoặc g1"
        },
        { status: 400 }
      );
    }

    const db = context.env.DB;

    await db.prepare(`
      INSERT INTO results (
        draw_date, special, g1, g2, g3, g4, g5, g6, g7
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(draw_date) DO UPDATE SET
        special = excluded.special,
        g1 = excluded.g1,
        g2 = excluded.g2,
        g3 = excluded.g3,
        g4 = excluded.g4,
        g5 = excluded.g5,
        g6 = excluded.g6,
        g7 = excluded.g7
    `).bind(
      draw_date,
      String(special),
      String(g1),
      String(g2 || ""),
      String(g3 || ""),
      String(g4 || ""),
      String(g5 || ""),
      String(g6 || ""),
      String(g7 || "")
    ).run();

    const allPrizeNumbers = [
      special,
      ...splitNumbers(g1),
      ...splitNumbers(g2),
      ...splitNumbers(g3),
      ...splitNumbers(g4),
      ...splitNumbers(g5),
      ...splitNumbers(g6),
      ...splitNumbers(g7)
    ];

    const lotoCount = {};

    for (const number of allPrizeNumbers) {
      const loto = getLastTwoDigits(number);
      lotoCount[loto] = (lotoCount[loto] || 0) + 1;
    }

    await db.prepare(
      "DELETE FROM loto WHERE draw_date = ?"
    ).bind(draw_date).run();

    for (const [number, count] of Object.entries(lotoCount)) {
      await db.prepare(`
        INSERT INTO loto (draw_date, number, count)
        VALUES (?, ?, ?)
      `).bind(
        draw_date,
        number,
        count
      ).run();
    }

    return Response.json({
      success: true,
      draw_date,
      total_prizes: allPrizeNumbers.length,
      loto: lotoCount
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