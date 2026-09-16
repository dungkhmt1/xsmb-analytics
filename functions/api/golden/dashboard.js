/*
 * GOLDEN V4 ENGINE - All Prizes Bridge to Special Target
 * GET /api/golden/v3/dashboard
 */
const VERSION = "golden-v4.2.0";

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

function extractDigits(row) {
  const digits = [];
  for (const prize of SOURCE_PRIZES) {
    if (!row[prize]) continue;
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

function getSpecial(row) {
  const v = row.special ?? row.db ?? "";
  const d = String(v).replace(/\D/g, "");
  return d.length >= 5 ? d.slice(-5) : null;
}

function round(v, n = 2) { const p = 10 ** n; return Math.round((Number(v) || 0) * p) / p; }
function pct(a, b) { return b ? a / b * 100 : 0; }

async function evaluatePending(db, rows) {
  const pending = await db.prepare(`SELECT prediction_date, pairs_json FROM golden_v3_predictions WHERE evaluated_at IS NULL`).all();
  if (!pending.results || !pending.results.length) return;
  
  const byDate = Object.fromEntries(rows.map(r => [r.draw_date.slice(0, 10), getSpecial(r)]));
  const now = new Date().toISOString();

  for (const p of pending.results) {
    const special = byDate[p.prediction_date];
    if (!special) continue;
    
    const head = special.slice(0, 2);
    const tail = special.slice(-2);
    const pairs = JSON.parse(p.pairs_json || "[]");
    
    const evaluation = {
      actualSpecial: special,
      actualHead: head,
      actualTail: tail,
      pairHits: pairs.filter(x => x.head === head && x.tail === tail).length,
      headHits: pairs.filter(x => x.head === head).length,
      tailHits: pairs.filter(x => x.tail === tail).length,
      top1Head: pairs[0]?.head === head,
      top1Tail: pairs[0]?.tail === tail
    };

    await db.prepare(`
      UPDATE golden_v3_predictions
      SET evaluated_at=?, actual_special=?, evaluation_json=?
      WHERE prediction_date=?
    `).bind(now, special, JSON.stringify(evaluation), p.prediction_date).run();
  }
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Không tìm thấy DB binding");

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS golden_v3_predictions (
        prediction_date TEXT PRIMARY KEY,
        source_date TEXT NOT NULL,
        pairs_json TEXT NOT NULL,
        head_top_json TEXT NOT NULL,
        tail_top_json TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        evaluated_at TEXT,
        actual_special TEXT,
        evaluation_json TEXT
      )
    `).run();

    const dbRes = await db.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results
      WHERE special IS NOT NULL AND TRIM(special) <> ''
      ORDER BY draw_date DESC LIMIT 70
    `).all();

    const rows = (dbRes.results || []).filter(r => getSpecial(r)).reverse();
    if (rows.length < 20) {
      return json({ success: false, message: `Cần ít nhất 20 kỳ dữ liệu.` }, 422);
    }

    await evaluatePending(db, rows);

    const n = rows.length;
    const digitsHistory = rows.map(r => extractDigits(r));
    const specialHistory = rows.map(r => {
      const sp = getSpecial(r);
      return { head: sp.slice(0, 2), tail: sp.slice(-2) };
    });

    const totalPositions = digitsHistory[0].length;
    const allHeadBridges = [];
    const allTailBridges = [];

    // Duyệt toàn bộ 107 vị trí kết hợp 2 chiều A+B và B+A
    for (let i = 0; i < totalPositions; i++) {
      for (let j = i + 1; j < totalPositions; j++) {
        for (const dir of ["AB", "BA"]) {
          
          // 1. Đo độ dài chuỗi ăn thông (Streak) lùi dần từ kỳ gần nhất
          let streakHead = 0;
          for (let d = n - 1; d >= 1; d--) {
            const p = digitsHistory[d - 1];
            const num = dir === "AB" ? `${p[i].digit}${p[j].digit}` : `${p[j].digit}${p[i].digit}`;
            if (num === specialHistory[d].head) {
              streakHead++;
            } else {
              break; // Cầu gãy thì dừng kiểm tra streak
            }
          }

          let streakTail = 0;
          for (let d = n - 1; d >= 1; d--) {
            const p = digitsHistory[d - 1];
            const num = dir === "AB" ? `${p[i].digit}${p[j].digit}` : `${p[j].digit}${p[i].digit}`;
            if (num === specialHistory[d].tail) {
              streakTail++;
            } else {
              break;
            }
          }

          // Lấy con số và tên vị trí dự đoán cho kỳ tiếp theo
          const latest = digitsHistory[n - 1];
          const nextNum = dir === "AB" ? `${latest[i].digit}${latest[j].digit}` : `${latest[j].digit}${latest[i].digit}`;
          const bridgeLabel = dir === "AB" ? `${latest[i].label} + ${latest[j].label}` : `${latest[j].label} + ${latest[i].label}`;

          // 2. Tính điểm và lưu các cầu tiềm năng (ưu tiên cầu đang chạy)
          if (streakHead > 0 || Math.random() < 0.05) {
            let totalHits = 0;
            for (let d = 1; d < n; d++) {
              const p = digitsHistory[d - 1];
              const num = dir === "AB" ? `${p[i].digit}${p[j].digit}` : `${p[j].digit}${p[i].digit}`;
              if (num === specialHistory[d].head) totalHits++;
            }
            const score = round(50 + (streakHead * 18) + (totalHits / (n - 1)) * 40, 1);
            allHeadBridges.push({
              number: nextNum,
              bridgePosition: bridgeLabel,
              runningDays: streakHead,
              hits: totalHits,
              samples: n - 1,
              historicalRate: round((totalHits / (n - 1)) * 100, 1),
              score
            });
          }

          if (streakTail > 0 || Math.random() < 0.05) {
            let totalHits = 0;
            for (let d = 1; d < n; d++) {
              const p = digitsHistory[d - 1];
              const num = dir === "AB" ? `${p[i].digit}${p[j].digit}` : `${p[j].digit}${p[i].digit}`;
              if (num === specialHistory[d].tail) totalHits++;
            }
            const score = round(50 + (streakTail * 18) + (totalHits / (n - 1)) * 40, 1);
            allTailBridges.push({
              number: nextNum,
              bridgePosition: bridgeLabel,
              runningDays: streakTail,
              hits: totalHits,
              samples: n - 1,
              historicalRate: round((totalHits / (n - 1)) * 100, 1),
              score
            });
          }
        }
      }
    }

    // Sắp xếp ưu tiên: Số ngày chạy cao nhất -> Điểm cao nhất
    allHeadBridges.sort((a, b) => b.runningDays - a.runningDays || b.score - a.score);
    allTailBridges.sort((a, b) => b.runningDays - a.runningDays || b.score - a.score);

    // Lọc lấy 2 con số KHÁC NHAU cho Top 2 Đầu và Top 2 Cuối
    const top2Head = [];
    const seenHead = new Set();
    for (const b of allHeadBridges) {
      if (!seenHead.has(b.number)) {
        seenHead.add(b.number);
        top2Head.push(b);
        if (top2Head.length >= 2) break;
      }
    }

    const top2Tail = [];
    const seenTail = new Set();
    for (const b of allTailBridges) {
      if (!seenTail.has(b.number)) {
        seenTail.add(b.number);
        top2Tail.push(b);
        if (top2Tail.length >= 2) break;
      }
    }

    // Ghép cặp Ưu tiên #1 (Top 1 Đầu + Top 1 Cuối) và Ưu tiên #2 (Top 2 Đầu + Top 2 Cuối)
    const h1 = top2Head[0] || { number: "--", bridgePosition: "Đang tính", runningDays: 0, score: 50 };
    const t1 = top2Tail[0] || { number: "--", bridgePosition: "Đang tính", runningDays: 0, score: 50 };
    const h2 = top2Head[1] || top2Head[0] || { number: "--", bridgePosition: "Đang tính", runningDays: 0, score: 50 };
    const t2 = top2Tail[1] || top2Tail[0] || { number: "--", bridgePosition: "Đang tính", runningDays: 0, score: 50 };

    const pair1 = {
      head: h1.number,
      tail: t1.number,
      headBridge: h1.bridgePosition,
      tailBridge: t1.bridgePosition,
      headStreak: h1.runningDays,
      tailStreak: t1.runningDays,
      score: round((h1.score + t1.score) / 2, 1),
      jointScore: round((h1.score + t1.score) / 2, 1)
    };

    const pair2 = {
      head: h2.number,
      tail: t2.number,
      headBridge: h2.bridgePosition,
      tailBridge: t2.bridgePosition,
      headStreak: h2.runningDays,
      tailStreak: t2.runningDays,
      score: round((h2.score + t2.score) / 2, 1),
      jointScore: round((h2.score + t2.score) / 2, 1)
    };

    const pairs = [pair1, pair2];

    const sourceDate = rows[n - 1].draw_date.slice(0, 10);
    const predictionDate = new Date(`${sourceDate}T00:00:00Z`);
    predictionDate.setUTCDate(predictionDate.getUTCDate() + 1);

    const historyRows = await db.prepare(`SELECT * FROM golden_v3_predictions ORDER BY prediction_date DESC LIMIT 30`).all();
    const history = (historyRows.results || []).map(r => ({
      ...r, pairs: JSON.parse(r.pairs_json || "[]"), evaluation: JSON.parse(r.evaluation_json || "null")
    }));
    const completed = history.filter(x => x.evaluated_at && x.evaluation);
    const pairHits = completed.reduce((a, x) => a + Number(x.evaluation?.pairHits || 0), 0);
    const headHits = completed.reduce((a, x) => a + Number(x.evaluation?.headHits || 0), 0);
    const tailHits = completed.reduce((a, x) => a + Number(x.evaluation?.tailHits || 0), 0);

    const latestSpecialFull = getSpecial(rows[n - 1]);

    return json({
      success: true,
      version: VERSION,
      sourceLatestDate: sourceDate,
      predictionDate: predictionDate.toISOString().slice(0, 10),
      sampleSize: rows.length,
      dataScope: "ALL PRIZES BRIDGE -> SPECIAL TARGET",
      recommendation: {
        pair1,
        pair2,
        pairs
      },
      topHead: top2Head,
      topTail: top2Tail,
      latestSpecial: latestSpecialFull,
      latestHead: latestSpecialFull ? latestSpecialFull.slice(0, 2) : "",
      latestTail: latestSpecialFull ? latestSpecialFull.slice(-2) : "",
      performance: {
        tracked: completed.length, pairHits, headHits, tailHits,
        pairHitRate: round(pct(completed.filter(x => (x.evaluation?.pairHits || 0) > 0).length, completed.length)),
        headHitRate: round(pct(completed.filter(x => (x.evaluation?.headHits || 0) > 0).length, completed.length)),
        tailHitRate: round(pct(completed.filter(x => (x.evaluation?.tailHits || 0) > 0).length, completed.length))
      },
      history: history.slice(0, 15)
    });
  } catch (e) {
    return json({ success: false, version: VERSION, message: e.message, stack: e.stack }, 500);
  }
}