/**
 * Golden V4 Prediction History & Audit
 * Route: GET /api/golden/history
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });

export async function onRequestGet(context) {
  try {
    // Truy vấn lịch sử dự đoán kết hợp đối soát với bảng results
    const records = await context.env.DB.prepare(`
      SELECT 
        p.draw_date,
        p.pair1,
        p.pair2,
        r.special
      FROM golden_predictions p
      LEFT JOIN results r ON p.draw_date = r.draw_date
      ORDER BY p.draw_date DESC
      LIMIT 30
    `).all();

    const history = (records.results || []).map(row => {
      const sp = row.special ? String(row.special).replace(/\D/g, "").slice(-5) : null;
      let status = "PENDING";

      if (sp && sp.length === 5) {
        const head = sp.slice(0, 2);
        const tail = sp.slice(-2);
        
        const isHit = [row.pair1, row.pair2].some(pair => {
          if (!pair) return false;
          const [pHead, pTail] = pair.split("-").map(s => s.trim());
          return pHead === head || pTail === tail;
        });

        status = isHit ? "WIN" : "LOSS";
      }

      return {
        drawDate: row.draw_date,
        pair1: row.pair1,
        pair2: row.pair2,
        actualSpecial: sp,
        status
      };
    });

    return json({ success: true, history });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}