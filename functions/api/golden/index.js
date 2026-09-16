/**
 * Golden V4 Engine: All Prizes Bridge -> Special Target (Head & Tail)
 * Route: GET /api/golden
 */

const MODEL = "golden-v4-all-prizes-special-target";
const VERSION = "4.0.0";
const SOURCE_PRIZES = ["special", "g1", "g2", "g3", "g4", "g5", "g6", "g7"];
const DEFAULT_LIMIT = 120; // Giới hạn phù hợp để tối ưu CPU time của Cloudflare Functions
const MIN_HISTORY = 30;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });

function normalizeDate(val) {
  if (!val) return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10);
}

function getSpecial(row) {
  const v = row.special ?? row.db ?? row.dac_biet ?? "";
  const d = String(v).replace(/\D/g, "");
  return d.length >= 5 ? d.slice(-5) : "";
}

function splitPrize(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(splitPrize).filter(Boolean);
  return String(val).split(/[\s,;|]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
}

// Trích xuất toàn bộ 107 vị trí con số trong bảng kết quả thành mảng phẳng 1 chiều
function extractDigits(row) {
  const digits = [];
  for (const prize of SOURCE_PRIZES) {
    const nums = splitPrize(row[prize]);
    nums.forEach((val, idx) => {
      const s = String(val);
      for (let pos = 0; pos < s.length; pos++) {
        digits.push({
          label: `${prize.toUpperCase()}[${idx + 1}].D${pos + 1}`,
          digit: s[pos]
        });
      }
    });
  }
  return digits;
}

// Hàm chấm điểm thống kê cầu
function computeBridgeScore(hits, samples, recentHits, recentSamples, streak) {
  if (samples < 10) return 0;
  const rate = hits / samples;
  const recentRate = recentSamples > 0 ? recentHits / recentSamples : rate;
  // Ưu tiên: Tỷ lệ gần đây (40%) + Tỷ lệ lịch sử (30%) + Nhịp streak hiện tại (20%) + Độ phủ mẫu (10%)
  const score = (recentRate * 40) + (rate * 30) + (Math.min(streak, 5) / 5 * 20) + (Math.min(samples, 60) / 60 * 10);
  return Number(score.toFixed(2));
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), MIN_HISTORY), 180);

    const dbRes = await context.env.DB.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results
      WHERE special IS NOT NULL
      ORDER BY draw_date DESC
      LIMIT ?
    `).bind(limit).all();

    const rows = (dbRes.results || [])
      .filter(r => getSpecial(r).length === 5)
      .sort((a, b) => normalizeDate(a.draw_date).localeCompare(normalizeDate(b.draw_date)));

    if (rows.length < MIN_HISTORY) {
      return json({ success: false, message: `Cần ít nhất ${MIN_HISTORY} kỳ mở thưởng.` }, 400);
    }

    const n = rows.length;
    const digitsHistory = rows.map(r => extractDigits(r));
    const specialHistory = rows.map(r => {
      const sp = getSpecial(r);
      return { head: sp.slice(0, 2), tail: sp.slice(-2), full: sp };
    });

    const totalPositions = digitsHistory[0].length;
    const recentWindow = 30;
    const recentStartIndex = Math.max(1, n - recentWindow);

    const headBridges = [];
    const tailBridges = [];

    // Duyệt qua các cặp vị trí (i, j)
    for (let i = 0; i < totalPositions; i++) {
      for (let j = i + 1; j < totalPositions; j++) {
        for (const dir of ["AB", "BA"]) {
          let hitsHead = 0, hitsTail = 0;
          let recentHitsHead = 0, recentHitsTail = 0;
          let streakHead = 0, streakTail = 0;

          for (let d = 1; d < n; d++) {
            const prevDigits = digitsHistory[d - 1];
            const d1 = prevDigits[i].digit;
            const d2 = prevDigits[j].digit;
            const predictedNum = dir === "AB" ? `${d1}${d2}` : `${d2}${d1}`;

            const actualHead = specialHistory[d].head;
            const actualTail = specialHistory[d].tail;

            // Kiểm tra Head
            if (predictedNum === actualHead) {
              hitsHead++;
              if (d >= recentStartIndex) recentHitsHead++;
              streakHead++;
            } else {
              streakHead = 0;
            }

            // Kiểm tra Tail
            if (predictedNum === actualTail) {
              hitsTail++;
              if (d >= recentStartIndex) recentHitsTail++;
              streakTail++;
            } else {
              streakTail = 0;
            }
          }

          const totalSamples = n - 1;
          const recentSamples = n - recentStartIndex;

          // Tạo số dự đoán cho ngày tiếp theo từ bảng kết quả mới nhất
          const latestDigits = digitsHistory[n - 1];
          const nextNum = dir === "AB" 
            ? `${latestDigits[i].digit}${latestDigits[j].digit}` 
            : `${latestDigits[j].digit}${latestDigits[i].digit}`;

          const bridgeLabel = dir === "AB"
            ? `${latestDigits[i].label} + ${latestDigits[j].label}`
            : `${latestDigits[j].label} + ${latestDigits[i].label}`;

          const headScore = computeBridgeScore(hitsHead, totalSamples, recentHitsHead, recentSamples, streakHead);
          if (headScore > 15) {
            headBridges.push({
              number: nextNum,
              bridge: bridgeLabel,
              score: headScore,
              hits: hitsHead,
              samples: totalSamples,
              streak: streakHead
            });
          }

          const tailScore = computeBridgeScore(hitsTail, totalSamples, recentHitsTail, recentSamples, streakTail);
          if (tailScore > 15) {
            tailBridges.push({
              number: nextNum,
              bridge: bridgeLabel,
              score: tailScore,
              hits: hitsTail,
              samples: totalSamples,
              streak: streakTail
            });
          }
        }
      }
    }

    headBridges.sort((a, b) => b.score - a.score || b.hits - a.hits);
    tailBridges.sort((a, b) => b.score - a.score || b.hits - a.hits);

    // Ghép cặp Ưu tiên #1 và Ưu tiên #2
    const suggestions = [];
    for (let k = 0; k < 2; k++) {
      if (headBridges[k] && tailBridges[k]) {
        suggestions.push({
          rank: k + 1,
          head: headBridges[k].number,
          tail: tailBridges[k].number,
          score: Number(((headBridges[k].score + tailBridges[k].score) / 2).toFixed(2)),
          headBridge: headBridges[k].bridge,
          tailBridge: tailBridges[k].bridge,
          headStats: headBridges[k],
          tailStats: tailBridges[k]
        });
      }
    }

    const latestRow = rows[n - 1];

    return json({
      success: true,
      model: MODEL,
      version: VERSION,
      drawDate: normalizeDate(latestRow.draw_date),
      totalDraws: n,
      suggestions,
      topHead: headBridges.slice(0, 10),
      topTail: tailBridges.slice(0, 10)
    });
  } catch (err) {
    return json({ success: false, error: err.message, stack: err.stack }, 500);
  }
}