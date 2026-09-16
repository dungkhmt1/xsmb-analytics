/**
 * Golden V4 Walk-Forward Backtest
 * Route: GET /api/golden/backtest
 */

const SOURCE_PRIZES = ["special", "g1", "g2", "g3", "g4", "g5", "g6", "g7"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });

function getSpecial(row) {
  const v = row.special ?? row.db ?? "";
  const d = String(v).replace(/\D/g, "");
  return d.length >= 5 ? d.slice(-5) : "";
}

function splitPrize(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(splitPrize).filter(Boolean);
  return String(val).split(/[\s,;|]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
}

function extractDigits(row) {
  const digits = [];
  for (const prize of SOURCE_PRIZES) {
    const nums = splitPrize(row[prize]);
    nums.forEach(val => {
      const s = String(val);
      for (let pos = 0; pos < s.length; pos++) digits.push(s[pos]);
    });
  }
  return digits;
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const testDays = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 7), 60);

    const dbRes = await context.env.DB.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results
      WHERE special IS NOT NULL
      ORDER BY draw_date DESC
      LIMIT ?
    `).bind(testDays + 60).all();

    const rows = (dbRes.results || [])
      .filter(r => getSpecial(r).length === 5)
      .reverse();

    const n = rows.length;
    if (n < testDays + 20) {
      return json({ success: false, message: "Không đủ dữ liệu chạy Backtest." }, 400);
    }

    const logs = [];
    let hitHeadCount = 0, hitTailCount = 0, hitAnyCount = 0;

    // Chạy vòng lặp Walk-forward
    for (let targetIdx = n - testDays; targetIdx < n; targetIdx++) {
      const targetRow = rows[targetIdx];
      const actualSpecial = getSpecial(targetRow);
      const actualHead = actualSpecial.slice(0, 2);
      const actualTail = actualSpecial.slice(-2);

      // Dự đoán cho ngày targetIdx dựa trên dữ liệu từ 0 đến targetIdx - 1
      const trainRows = rows.slice(0, targetIdx);
      const trainLen = trainRows.length;
      const digitsList = trainRows.map(extractDigits);
      const totalPos = digitsList[0].length;

      let bestHead = null, bestTail = null;
      let maxHeadScore = -1, maxTailScore = -1;

      // Quét nhanh top cầu
      for (let i = 0; i < totalPos; i += 2) {
        for (let j = i + 1; j < totalPos; j += 2) {
          let hHits = 0, tHits = 0;
          for (let d = Math.max(1, trainLen - 25); d < trainLen; d++) {
            const num = `${digitsList[d - 1][i]}${digitsList[d - 1][j]}`;
            const sp = getSpecial(trainRows[d]);
            if (num === sp.slice(0, 2)) hHits++;
            if (num === sp.slice(-2)) tHits++;
          }

          const lastDigits = digitsList[trainLen - 1];
          const cand = `${lastDigits[i]}${lastDigits[j]}`;

          if (hHits > maxHeadScore) {
            maxHeadScore = hHits;
            bestHead = cand;
          }
          if (tHits > maxTailScore) {
            maxTailScore = tHits;
            bestTail = cand;
          }
        }
      }

      const isHitHead = bestHead === actualHead;
      const isHitTail = bestTail === actualTail;
      const isHit = isHitHead || isHitTail;

      if (isHitHead) hitHeadCount++;
      if (isHitTail) hitTailCount++;
      if (isHit) hitAnyCount++;

      logs.push({
        date: targetRow.draw_date,
        predicted: `${bestHead} — ${bestTail}`,
        actual: actualSpecial,
        actualHead,
        actualTail,
        isHitHead,
        isHitTail,
        result: isHit ? "HIT" : "MISS"
      });
    }

    return json({
      success: true,
      testedDays: testDays,
      metrics: {
        hitAnyRate: Number(((hitAnyCount / testDays) * 100).toFixed(2)),
        hitHeadRate: Number(((hitHeadCount / testDays) * 100).toFixed(2)),
        hitTailRate: Number(((hitTailCount / testDays) * 100).toFixed(2)),
        hitHeadCount,
        hitTailCount,
        hitAnyCount
      },
      logs: logs.reverse()
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}