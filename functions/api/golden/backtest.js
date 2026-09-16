/*
 * GET /api/golden/v3/backtest
 * GOLDEN V4 - All Prizes Walk-Forward
 */

const VERSION = "golden-v4-backtest";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

const SOURCE_PRIZES = ["special", "g1", "g2", "g3", "g4", "g5", "g6", "g7"];

function splitPrize(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(splitPrize).filter(Boolean);
  return String(val).split(/[\s,;|]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
}

function extractDigits(row) {
  const digits = [];
  for (const prize of SOURCE_PRIZES) {
    if (!row[prize]) continue;
    const nums = splitPrize(row[prize]);
    nums.forEach(val => {
      const s = String(val);
      for (let pos = 0; pos < s.length; pos++) digits.push(s[pos]);
    });
  }
  return digits;
}

function getSpecial(row) {
  const v = row.special ?? row.db ?? "";
  const d = String(v).replace(/\D/g, "");
  return d.length >= 5 ? d.slice(-5) : null;
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return json({ success: false, message: "No DB" }, 500);

    const url = new URL(context.request.url);
    const limit = Math.min(60, Math.max(10, Number(url.searchParams.get("limit") || 30)));

    const query = await db.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results WHERE special IS NOT NULL AND TRIM(special) <> ''
      ORDER BY draw_date DESC LIMIT ?
    `).bind(limit + 50).all();

    const rows = (query.results || []).filter(r => getSpecial(r)).reverse();
    if (rows.length < 30) return json({ success: false, message: `Cần ít nhất 30 kỳ.` }, 422);

    const start = Math.max(30, rows.length - limit);
    let tested = 0;
    let pairHits = 0, headHits = 0, tailHits = 0;
    const recent = [];

    const digitsHistory = rows.map(r => extractDigits(r));
    const specialHistory = rows.map(r => {
      const sp = getSpecial(r);
      return { head: sp.slice(0, 2), tail: sp.slice(-2) };
    });

    const totalPositions = digitsHistory[0].length;
    const step = Math.ceil(totalPositions / 30); // Lấy mẫu để tránh crash server

    for (let i = start; i < rows.length; i++) {
      let maxHeadScore = -1, maxTailScore = -1;
      let bestHead = "00", bestTail = "00";

      // Train trên i-1 ngày
      for (let x = 0; x < totalPositions; x += step) {
        for (let y = x + 1; y < totalPositions; y += step) {
          let hHits = 0, tHits = 0;
          for (let d = 1; d < i; d++) {
            const prev = digitsHistory[d - 1];
            if(!prev[x] || !prev[y]) continue;
            const pred = `${prev[x]}${prev[y]}`;
            if (pred === specialHistory[d].head) hHits++;
            if (pred === specialHistory[d].tail) tHits++;
          }
          
          const latest = digitsHistory[i - 1];
          if(!latest[x] || !latest[y]) continue;
          const cand = `${latest[x]}${latest[y]}`;
          if (hHits > maxHeadScore) { maxHeadScore = hHits; bestHead = cand; }
          if (tHits > maxTailScore) { maxTailScore = tHits; bestTail = cand; }
        }
      }

      const actual = { date: rows[i].draw_date.slice(0,10), special: getSpecial(rows[i]), head: specialHistory[i].head, tail: specialHistory[i].tail };
      
      const headHit = bestHead === actual.head;
      const tailHit = bestTail === actual.tail;
      const pairHit = headHit && tailHit;

      if (pairHit) pairHits++;
      if (headHit) headHits++;
      if (tailHit) tailHits++;
      tested++;

      recent.push({
        date: actual.date,
        actualSpecial: actual.special, actualHead: actual.head, actualTail: actual.tail,
        pairs: [{ head: bestHead, tail: bestTail, pair: `${bestHead}-${bestTail}`, score: 99 }],
        pairHit, headHit, tailHit
      });
    }

    const rate = val => tested > 0 ? Number((val / tested * 100).toFixed(2)) : 0;

    return json({
      success: true, version: VERSION, testedDraws: tested,
      pairHits, headHits, tailHits,
      pairHitRate: rate(pairHits), headHitRate: rate(headHits), tailHitRate: rate(tailHits),
      dataScope: "ALL PRIZES BRIDGE -> SPECIAL",
      recent: recent.reverse()
    });
  } catch (error) {
    return json({ success: false, message: error.message }, 500);
  }
}