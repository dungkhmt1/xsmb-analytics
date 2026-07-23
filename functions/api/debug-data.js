function splitPrize(value) {
  if (!value) return [];

  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    const { results } = await db
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
        LIMIT 3
      `)
      .all();

    const debug = results.map(row => {

      const prizes = {
        special: splitPrize(row.special),
        g1: splitPrize(row.g1),
        g2: splitPrize(row.g2),
        g3: splitPrize(row.g3),
        g4: splitPrize(row.g4),
        g5: splitPrize(row.g5),
        g6: splitPrize(row.g6),
        g7: splitPrize(row.g7)
      };

      const loto = [];

      for (const values of Object.values(prizes)) {
        for (const value of values) {
          loto.push(
            String(value)
              .slice(-2)
              .padStart(2, "0")
          );
        }
      }

      return {
        date: row.draw_date,

        raw: {
          special: row.special,
          g1: row.g1,
          g2: row.g2,
          g3: row.g3,
          g4: row.g4,
          g5: row.g5,
          g6: row.g6,
          g7: row.g7
        },

        parsed: prizes,

        counts: {
          DB: prizes.special.length,
          G1: prizes.g1.length,
          G2: prizes.g2.length,
          G3: prizes.g3.length,
          G4: prizes.g4.length,
          G5: prizes.g5.length,
          G6: prizes.g6.length,
          G7: prizes.g7.length,
          total:
            Object.values(prizes)
              .reduce(
                (sum, arr) =>
                  sum + arr.length,
                0
              )
        },

        lotoCount: loto.length,

        loto
      };
    });

    return Response.json({
      success: true,
      rows: debug
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