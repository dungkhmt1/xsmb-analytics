/*
 * GOLDEN V4 - Pure Bridge Engine (All Prizes -> Special Target)
 * Logic: Quét toàn bộ vị trí giải T-1 đối soát ĐB ngày T.
 * Ưu tiên: Xếp hạng duy nhất theo TỔNG SỐ LẦN NỔ trong lịch sử.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

const SOURCE_PRIZES = ["special", "g1", "g2", "g3", "g4", "g5", "g6", "g7"];

function splitPrize(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(splitPrize).filter(Boolean);
  return String(val).split(/[\s,;|]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
}

// Bóc tách 107 vị trí con số từ toàn bộ bảng giải
function extractCells(row) {
  const cells = [];
  for (const prize of SOURCE_PRIZES) {
    if (!row[prize]) continue;
    const nums = splitPrize(row[prize]);
    nums.forEach((val, idx) => {
      const s = String(val);
      for (let pos = 0; pos < s.length; pos++) {
        cells.push({
          label: `${prize.toUpperCase()}[${idx + 1}].D${pos + 1}`,
          digit: Number(s[pos])
        });
      }
    });
  }
  return cells;
}

function getSpecial(row) {
  const v = row.special ?? row.db ?? "";
  const d = String(v).replace(/\D/g, "");
  return d.length >= 5 ? d.slice(-5) : null;
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Không tìm thấy DB binding");

    // Lấy 60 kỳ gần nhất để thống kê nhịp cầu
    const dbRes = await db.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results
      WHERE special IS NOT NULL AND TRIM(special) <> ''
      ORDER BY draw_date DESC LIMIT 60
    `).all();

    const rows = (dbRes.results || []).filter(r => getSpecial(r)).reverse();
    const n = rows.length;
    if (n < 15) {
      return json({ success: false, message: "Cần tối thiểu 15 kỳ mở thưởng để quét cầu." }, 422);
    }

    const firstCells = extractCells(rows[0]);
    const totalPos = firstCells.length;
    const labels = firstCells.map(c => c.label);

    // Chuyển toàn bộ dữ liệu về ma trận số nguyên phẳng để tăng tốc độ quét
    const grid = rows.map(r => extractCells(r).map(c => c.digit));
    const heads = rows.map(r => Number(getSpecial(r).slice(0, 2)));
    const tails = rows.map(r => Number(getSpecial(r).slice(-2)));

    const headBridges = [];
    const tailBridges = [];
    const totalSamples = n - 1;

    // Duyệt qua tất cả các cặp vị trí (i, j) và 2 chiều AB, BA
    for (let i = 0; i < totalPos; i++) {
      for (let j = i + 1; j < totalPos; j++) {
        for (const dir of ["AB", "BA"]) {
          let headHits = 0;
          let tailHits = 0;
          let headStreak = 0;
          let tailStreak = 0;

          // Kiểm tra lịch sử: vị trí ngày d-1 tạo ra kết quả ngày d
          for (let d = 1; d < n; d++) {
            const prev = grid[d - 1];
            const num = dir === "AB" ? (prev[i] * 10 + prev[j]) : (prev[j] * 10 + prev[i]);

            if (num === heads[d]) {
              headHits++;
              headStreak++;
            } else {
              headStreak = 0;
            }

            if (num === tails[d]) {
              tailHits++;
              tailStreak++;
            } else {
              tailStreak = 0;
            }
          }

          // Lấy con số dự đoán cho ngày tiếp theo từ ngày gần nhất
          const lastGrid = grid[n - 1];
          const nextInt = dir === "AB" ? (lastGrid[i] * 10 + lastGrid[j]) : (lastGrid[j] * 10 + lastGrid[i]);
          const nextNum = String(nextInt).padStart(2, "0");
          const bridgeLabel = dir === "AB" ? `${labels[i]} + ${labels[j]}` : `${labels[j]} + ${labels[i]}`;

          if (headHits > 0) {
            headBridges.push({
              number: nextNum,
              bridgePosition: bridgeLabel,
              totalHits: headHits,
              runningDays: headStreak,
              samples: totalSamples
            });
          }

          if (tailHits > 0) {
            tailBridges.push({
              number: nextNum,
              bridgePosition: bridgeLabel,
              totalHits: tailHits,
              runningDays: tailStreak,
              samples: totalSamples
            });
          }
        }
      }
    }

    // XẾP HẠNG DUY NHẤT THEO: TỔNG SỐ LẦN NỔ (Hits) GIẢM DẦN
    headBridges.sort((a, b) => b.totalHits - a.totalHits || b.runningDays - a.runningDays);
    tailBridges.sort((a, b) => b.totalHits - a.totalHits || b.runningDays - a.runningDays);

    // Lọc lấy 2 số khác nhau cho Top 2 Đầu
    const top2Head = [];
    const seenHead = new Set();
    for (const b of headBridges) {
      if (!seenHead.has(b.number)) {
        seenHead.add(b.number);
        top2Head.push(b);
        if (top2Head.length >= 2) break;
      }
    }

    // Lọc lấy 2 số khác nhau cho Top 2 Cuối
    const top2Tail = [];
    const seenTail = new Set();
    for (const b of tailBridges) {
      if (!seenTail.has(b.number)) {
        seenTail.add(b.number);
        top2Tail.push(b);
        if (top2Tail.length >= 2) break;
      }
    }

    const h1 = top2Head[0] || { number: "--", bridgePosition: "Không có", totalHits: 0, runningDays: 0 };
    const t1 = top2Tail[0] || { number: "--", bridgePosition: "Không có", totalHits: 0, runningDays: 0 };
    const h2 = top2Head[1] || h1;
    const t2 = top2Tail[1] || t1;

    const pair1 = {
      head: h1.number,
      tail: t1.number,
      headBridge: h1.bridgePosition,
      tailBridge: t1.bridgePosition,
      headHits: h1.totalHits,
      tailHits: t1.totalHits,
      headStreak: h1.runningDays,
      tailStreak: t1.runningDays
    };

    const pair2 = {
      head: h2.number,
      tail: t2.number,
      headBridge: h2.bridgePosition,
      tailBridge: t2.bridgePosition,
      headHits: h2.totalHits,
      tailHits: t2.totalHits,
      headStreak: h2.runningDays,
      tailStreak: t2.runningDays
    };

    const sourceDate = rows[n - 1].draw_date.slice(0, 10);
    const predictionDate = new Date(`${sourceDate}T00:00:00Z`);
    predictionDate.setUTCDate(predictionDate.getUTCDate() + 1);

    const latestSpecial = getSpecial(rows[n - 1]);

    return json({
      success: true,
      sourceLatestDate: sourceDate,
      predictionDate: predictionDate.toISOString().slice(0, 10),
      sampleSize: totalSamples,
      latestSpecial,
      recommendation: {
        pair1,
        pair2,
        pairs: [pair1, pair2]
      },
      topHead: top2Head,
      topTail: top2Tail
    });
  } catch (e) {
    return json({ success: false, message: e.message, stack: e.stack }, 500);
  }
}