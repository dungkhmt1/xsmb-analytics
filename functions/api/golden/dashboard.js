/*
 * GOLDEN V4 - All Prizes Bridge to Special Target (Overridden in V3 route)
 * GET /api/golden/v3/dashboard
 */
const VERSION = "golden-v4-all-prizes";

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

function computeBridgeScore(hits, samples, recentHits, recentSamples, streak) {
  if (samples < 5) return 0;
  const rate = hits / samples;
  const recentRate = recentSamples > 0 ? recentHits / recentSamples : rate;
  const score = (recentRate * 40) + (rate * 30) + (Math.min(streak, 5) / 5 * 20) + (Math.min(samples, 60) / 60 * 10);
  return Number(score.toFixed(2));
}

function round(v,n=2) { const p = 10 ** n; return Math.round((Number(v)||0)*p)/p; }
function pct(a,b) { return b ? a / b * 100 : 0; }

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

    // Giới hạn 100 dòng để tối ưu CPU time (107 vị trí tổ hợp rất nặng)
    const dbRes = await db.prepare(`
      SELECT draw_date, special, g1, g2, g3, g4, g5, g6, g7
      FROM results
      WHERE special IS NOT NULL AND TRIM(special) <> ''
      ORDER BY draw_date DESC LIMIT 100
    `).all();

    const rows = (dbRes.results || []).filter(r => getSpecial(r)).reverse();
    if (rows.length < 20) {
      return json({ success: false, message: `Cần ít nhất 20 kỳ.` }, 422);
    }

    const n = rows.length;
    const digitsHistory = rows.map(r => extractDigits(r));
    const specialHistory = rows.map(r => {
      const sp = getSpecial(r);
      return { head: sp.slice(0, 2), tail: sp.slice(-2) };
    });

    const totalPositions = digitsHistory[0].length;
    const recentWindow = 30;
    const recentStartIndex = Math.max(1, n - recentWindow);

    const headBridgesMap = new Map();
    const tailBridgesMap = new Map();

    // Thuật toán: Dùng ngày i-1 để dự đoán ngày i
    // Tối ưu hóa: Chỉ chọn mẫu 1/3 vị trí để tránh crash 50ms của Cloudflare Workers
    const step = Math.ceil(totalPositions / 35); 
    for (let i = 0; i < totalPositions; i += step) {
      for (let j = i + 1; j < totalPositions; j += step) {
        for (const dir of ["AB", "BA"]) {
          let hitsHead = 0, hitsTail = 0;
          let recentHitsHead = 0, recentHitsTail = 0;
          let streakHead = 0, streakTail = 0;

          for (let d = 1; d < n; d++) {
            const prev = digitsHistory[d - 1];
            if(!prev[i] || !prev[j]) continue;
            
            const predictedNum = dir === "AB" ? `${prev[i].digit}${prev[j].digit}` : `${prev[j].digit}${prev[i].digit}`;

            if (predictedNum === specialHistory[d].head) {
              hitsHead++;
              if (d >= recentStartIndex) recentHitsHead++;
              streakHead++;
            } else streakHead = 0;

            if (predictedNum === specialHistory[d].tail) {
              hitsTail++;
              if (d >= recentStartIndex) recentHitsTail++;
              streakTail++;
            } else streakTail = 0;
          }

          const totalSamples = n - 1;
          const recentSamples = n - recentStartIndex;
          const latest = digitsHistory[n - 1];
          if(!latest[i] || !latest[j]) continue;
          
          const nextNum = dir === "AB" ? `${latest[i].digit}${latest[j].digit}` : `${latest[j].digit}${latest[i].digit}`;

          const headScore = computeBridgeScore(hitsHead, totalSamples, recentHitsHead, recentSamples, streakHead);
          if (headScore > 10) {
            if (!headBridgesMap.has(nextNum) || headBridgesMap.get(nextNum).score < headScore) {
              headBridgesMap.set(nextNum, { number: nextNum, score: headScore });
            }
          }

          const tailScore = computeBridgeScore(hitsTail, totalSamples, recentHitsTail, recentSamples, streakTail);
          if (tailScore > 10) {
            if (!tailBridgesMap.has(nextNum) || tailBridgesMap.get(nextNum).score < tailScore) {
              tailBridgesMap.set(nextNum, { number: nextNum, score: tailScore });
            }
          }
        }
      }
    }

    const headRows = Array.from(headBridgesMap.values()).sort((a,b) => b.score - a.score);
    const tailRows = Array.from(tailBridgesMap.values()).sort((a,b) => b.score - a.score);

    const candidates = [];
    for(let i=0; i < Math.min(10, headRows.length); i++) {
        for(let j=0; j < Math.min(10, tailRows.length); j++) {
            const h = headRows[i];
            const t = tailRows[j];
            const joint = Math.sqrt(h.score * t.score);
            const diversity = h.number === t.number ? -3 : 0;
            candidates.push({
                head: h.number,
                tail: t.number,
                pair: `${h.number}-${t.number}`,
                headScore: h.score,
                tailScore: t.score,
                jointScore: round(joint + diversity)
            });
        }
    }
    candidates.sort((a,b)=>b.jointScore - a.jointScore);
    const pairs = [];
    for (const c of candidates) {
        if (!pairs.length || pairs.every(x => x.head !== c.head || x.tail !== c.tail)) {
            pairs.push(c);
        }
        if (pairs.length >= 2) break;
    }

    const sourceDate = rows[n-1].draw_date.slice(0, 10);
    const predictionDate = new Date(`${sourceDate}T00:00:00Z`);
    predictionDate.setUTCDate(predictionDate.getUTCDate()+1);

    // Xử lý thống kê (Giữ nguyên cấu trúc trả về để UI không sập)
    const historyRows = await db.prepare(`SELECT * FROM golden_v3_predictions ORDER BY prediction_date DESC LIMIT 30`).all();
    const history = (historyRows.results || []).map(r => ({
      ...r, pairs: JSON.parse(r.pairs_json || "[]"), evaluation: JSON.parse(r.evaluation_json || "null")
    }));
    const completed = history.filter(x => x.evaluated_at && x.evaluation);
    const pairHits = completed.reduce((a,x)=>a + Number(x.evaluation?.pairHits||0),0);
    const headHits = completed.reduce((a,x)=>a + Number(x.evaluation?.headHits||0),0);
    const tailHits = completed.reduce((a,x)=>a + Number(x.evaluation?.tailHits||0),0);

    return json({
      success: true,
      version: VERSION,
      sourceLatestDate: sourceDate,
      predictionDate: predictionDate.toISOString().slice(0,10),
      sampleSize: rows.length,
      dataScope: "ALL PRIZES -> SPECIAL TARGET",
      method: { note: "Dựa trên thuật toán Cầu All-Prizes" },
      recommendation: {
        pair1: pairs[0] || null,
        pair2: pairs[1] || null,
        pairs
      },
      topHead: headRows.slice(0,10),
      topTail: tailRows.slice(0,10),
      performance: {
        tracked: completed.length, pairHits, headHits, tailHits,
        pairHitRate: round(pct(completed.filter(x=>(x.evaluation?.pairHits||0)>0).length, completed.length)),
        headHitRate: round(pct(completed.filter(x=>(x.evaluation?.headHits||0)>0).length, completed.length)),
        tailHitRate: round(pct(completed.filter(x=>(x.evaluation?.tailHits||0)>0).length, completed.length))
      },
      history: history.slice(0,15)
    });
  } catch (e) {
    return json({ success: false, version: VERSION, message: e.message, stack: e.stack }, 500);
  }
}