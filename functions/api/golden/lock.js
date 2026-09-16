/**
 * Golden V4 Snapshot / Lock Prediction
 * Route: POST /api/golden/lock
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { drawDate, suggestions } = body;

    if (!drawDate || !suggestions || !Array.isArray(suggestions)) {
      return json({ success: false, message: "Dữ liệu payload không hợp lệ." }, 400);
    }

    // Đảm bảo bảng lưu trữ dự đoán Golden đã tồn tại trong D1
    await context.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS golden_predictions (
        draw_date TEXT PRIMARY KEY,
        pair1 TEXT,
        pair2 TEXT,
        payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const pair1 = suggestions[0] ? `${suggestions[0].head} - ${suggestions[0].tail}` : "";
    const pair2 = suggestions[1] ? `${suggestions[1].head} - ${suggestions[1].tail}` : "";

    await context.env.DB.prepare(`
      INSERT INTO golden_predictions (draw_date, pair1, pair2, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(draw_date) DO UPDATE SET
        pair1 = excluded.pair1,
        pair2 = excluded.pair2,
        payload = excluded.payload
    `).bind(drawDate, pair1, pair2, JSON.stringify(suggestions)).run();

    return json({ success: true, message: `Đã khóa dự đoán cho ngày ${drawDate}` });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}