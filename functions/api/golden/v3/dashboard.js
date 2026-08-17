/*
 * GOLDEN V3 - Special Prize Head/Tail Statistical Engine
 * GET /api/golden/v3/dashboard
 *
 * Reads only results.special from the shared D1 database.
 * Does not modify V2.6.2 / V2.8 prediction tables.
 */
const VERSION = "golden-v3.0.1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

const N = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

function num(v) {
  if (v === null || v === undefined) {
    return null;
  }

  const text = String(v).trim();

  const digits = text.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const normalized = digits.padStart(5, "0").slice(-5);

  return /^\d{5}$/.test(normalized)
    ? normalized
    : null;
}
function pct(a,b) { return b ? a / b * 100 : 0; }
function round(v,n=2) {
  const p = 10 ** n;
  return Math.round((Number(v)||0)*p)/p;
}
function clamp(v,a=0,b=100) { return Math.max(a, Math.min(b, Number(v)||0)); }
function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-12, Math.min(12,z)))); }

function extractRows(results) {
  return (results || [])
    .map((r) => {
      const special = num(r.special);
      const date = String(r?.draw_date ?? "").slice(0, 10);

      if (!special) {
        return null;
      }

      if (!/^\d{5}$/.test(special)) {
        return null;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
      }

      return {
        date,
        special,
        head: special.slice(0, 2),
        tail: special.slice(-2)
      };
    })
    .filter(Boolean);
}

function makeStats(rows, key) {
  const all = Object.fromEntries(N.map(x => [x,0]));
  const last30 = Object.fromEntries(N.map(x => [x,0]));
  const last60 = Object.fromEntries(N.map(x => [x,0]));
  const gaps = Object.fromEntries(N.map(x => [x,null]));
  const lastSeen = Object.fromEntries(N.map(x => [x,-1]));
  const total = rows.length;

  rows.forEach((r,i) => {
    const x = r[key];
    all[x]++;
    lastSeen[x] = i;
  });

  const r30 = rows.slice(-30);
  const r60 = rows.slice(-60);
  r30.forEach(r => last30[r[key]]++);
  r60.forEach(r => last60[r[key]]++);

  N.forEach(x => {
    gaps[x] = lastSeen[x] < 0 ? total : (total - 1 - lastSeen[x]);
  });

  return { all, last30, last60, gaps, total };
}

/*
  Beta-Binomial smoothing.
  Prior is intentionally weak; it prevents a number with 1/1 or 2/2
  historical hits from being treated as a certainty.
*/
function posteriorRate(hits, opportunities, priorHits=1, priorMisses=9) {
  return (hits + priorHits) / (opportunities + priorHits + priorMisses);
}

function transitionStats(rows, key) {
  const next = Object.fromEntries(N.map(x => Object.fromEntries(N.map(y => [y,0]))));
  for (let i=0;i<rows.length-1;i++) next[rows[i][key]][rows[i+1][key]]++;
  return next;
}

function runStats(rows, key, x) {
  let prev = 0, runs = [], current = 0;
  for (const r of rows) {
    if (r[key] === x) current++;
    else if (current) { runs.push(current); current = 0; }
  }
  if (current) runs.push(current);
  return {
    max: runs.length ? Math.max(...runs) : 0,
    count: runs.length,
    lastRun: current
  };
}

/*
  Build a score for one side (head or tail).

  We deliberately do NOT claim the score is a true probability.
  It is a ranking score built from independent historical features.
*/
function scoreSide(rows, key, external = {}) {
  const s = makeStats(rows,key);
  const transitions = transitionStats(rows,key);
  const last = rows.length ? rows[rows.length-1][key] : null;

  const scored = N.map(x => {
    const count = s.all[x];
    const r30 = s.last30[x];
    const r60 = s.last60[x];
    const baseRate = posteriorRate(count, s.total, 1, 99);
    const recentRate30 = posteriorRate(r30, Math.min(30,s.total), 1, 9);
    const recentRate60 = posteriorRate(r60, Math.min(60,s.total), 1, 19);

    const expectedAll = s.total / 100;
    const expected30 = Math.min(30,s.total) / 100;
    const expected60 = Math.min(60,s.total) / 100;

    const freqAll = clamp(50 + 25 * ((count - expectedAll) / Math.sqrt(expectedAll + 1)));
    const freq30 = clamp(50 + 25 * ((r30 - expected30) / Math.sqrt(expected30 + 1)));
    const freq60 = clamp(50 + 25 * ((r60 - expected60) / Math.sqrt(expected60 + 1)));

    /*
      Gap is treated as a cycle-state feature, not "overdue = due".
      The score peaks around a data-derived median gap rather than
      monotonically increasing with lateness.
    */
    const gap = s.gaps[x];
    const gaps = N.map(y => s.gaps[y]).filter(v => Number.isFinite(v)).sort((a,b)=>a-b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length/2)] : 0;
    const gapScale = Math.max(2, medianGap + 1);
    const gapScore = clamp(100 * Math.exp(-Math.abs(gap-medianGap)/gapScale));

    /*
      V3.0.1 FIX:
      Một số database có thể chứa giá trị head/tail không hợp lệ hoặc
      key không tồn tại trong ma trận transition. Không được truy cập
      transitions[last][x] trực tiếp vì sẽ gây:
      "Cannot read properties of undefined (reading '45')".
    */
    const transitionRow =
      last && transitions && transitions[last]
        ? transitions[last]
        : Object.fromEntries(N.map(y => [y, 0]));

    const transition = Number(transitionRow[x] || 0);
    const transitionTotal =
      Object.values(transitionRow)
        .reduce((a,b) => a + Number(b || 0), 0);
    const transitionRate = posteriorRate(transition, transitionTotal, 1, 9);
    const transitionScore = clamp(50 + (transitionRate - 0.1) * 250);

    const run = runStats(rows,key,x);
    const repeatScore = clamp(50 + Math.min(20, run.lastRun * 5));

    /*
      V2.8 live feature:
      external[x] is an optional 0..100 signal obtained from the current
      V2.8 prediction. It is not used in historical walk-forward.
    */
    const v28 = clamp(
      external && Object.prototype.hasOwnProperty.call(external, x)
        ? external[x]
        : 50
    );

    const final =
      0.25 * freqAll +
      0.20 * freq60 +
      0.15 * freq30 +
      0.10 * gapScore +
      0.10 * transitionScore +
      0.10 * repeatScore +
      0.10 * v28;

    return {
      number:x,
      score:round(final),
      historicalRate:round(baseRate*100),
      recent30: r30,
      recent60: r60,
      gap,
      transitionFromLast: last ? transition : 0,
      features:{
        frequency:round(freqAll),
        recent60:round(freq60),
        recent30:round(freq30),
        cycle:round(gapScore),
        transition:round(transitionScore),
        repeat:round(repeatScore),
        v28:round(v28)
      }
    };
  }).sort((a,b)=>b.score-a.score);

  return { rows:scored, stats:s };
}

async function readV28Signals(context) {
  /*
    Best-effort only. Golden must remain operational even if V2.8
    endpoint is unavailable.
  */
  const origin = new URL(context.request.url).origin;
  const map = Object.fromEntries(N.map(x=>[x,50]));
  try {
    const r = await fetch(`${origin}/api/predict?top=100&t=${Date.now()}`, {
      headers:{Accept:"application/json"}
    });
    const d = await r.json().catch(()=>null);
    const suggestions = Array.isArray(d?.suggestions) ? d.suggestions : [];
    const max = suggestions.length ? suggestions.length : 1;
    suggestions.forEach((item,i) => {
      const raw = typeof item === "string" ? item : (item.number ?? item.num ?? item.value);
      const x = String(raw ?? "").replace(/\D/g,"").slice(-2).padStart(2,"0");
      if (/^\d{2}$/.test(x)) map[x] = 100 - (i / max) * 70;
    });
  } catch {}
  return map;
}

function choosePairs(headRows, tailRows) {
  const topH = headRows.slice(0,10);
  const topT = tailRows.slice(0,10);
  const candidates = [];

  for (const h of topH) for (const t of topT) {
    /*
      Joint score is conservative: geometric mean prevents one very
      weak side from hiding behind a strong side.
    */
    const joint = Math.sqrt(h.score * t.score);
    const diversity = h.number === t.number ? -3 : 0;
    candidates.push({
      head:h.number,
      tail:t.number,
      pair:`${h.number}-${t.number}`,
      headScore:h.score,
      tailScore:t.score,
      jointScore:round(joint + diversity)
    });
  }

  candidates.sort((a,b)=>b.jointScore-a.jointScore);

  const selected=[];
  for (const c of candidates) {
    if (!selected.length || selected.every(x => x.head !== c.head || x.tail !== c.tail)) {
      selected.push(c);
    }
    if (selected.length >= 2) break;
  }
  return selected;
}

function evaluatePrediction(pred, actualSpecial) {
  const special = num(actualSpecial);
  if (!special) return null;
  const head = special.slice(0,2);
  const tail = special.slice(-2);
  const pairs = Array.isArray(pred?.pairs) ? pred.pairs : [];
  return {
    actualSpecial:special,
    actualHead:head,
    actualTail:tail,
    pairHits:pairs.filter(p => p.head === head && p.tail === tail).length,
    headHits:pairs.filter(p => p.head === head).length,
    tailHits:pairs.filter(p => p.tail === tail).length,
    top1Head: pairs[0]?.head === head,
    top1Tail: pairs[0]?.tail === tail
  };
}

async function ensureTable(db) {
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
}

async function getHistory(db, limit=30) {
  const rows = await db.prepare(`
    SELECT prediction_date, source_date, pairs_json, model_version,
           created_at, evaluated_at, actual_special, evaluation_json
    FROM golden_v3_predictions
    ORDER BY prediction_date DESC
    LIMIT ?
  `).bind(limit).all();
  return (rows.results || []).map(r => ({
    ...r,
    pairs: JSON.parse(r.pairs_json || "[]"),
    evaluation: JSON.parse(r.evaluation_json || "null")
  }));
}

async function evaluatePending(db, resultsByDate) {
  const pending = await db.prepare(`
    SELECT prediction_date, pairs_json
    FROM golden_v3_predictions
    WHERE evaluated_at IS NULL
  `).all();

  const now = new Date().toISOString();
  for (const p of (pending.results || [])) {
    const result = resultsByDate[p.prediction_date];
    if (!result) continue;
    const evaluation = evaluatePrediction({pairs:JSON.parse(p.pairs_json || "[]")}, result.special);
    if (!evaluation) continue;
    await db.prepare(`
      UPDATE golden_v3_predictions
      SET evaluated_at=?, actual_special=?, evaluation_json=?
      WHERE prediction_date=?
    `).bind(now, evaluation.actualSpecial, JSON.stringify(evaluation), p.prediction_date).run();
  }
}

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) throw new Error("Không tìm thấy DB binding");

    await ensureTable(db);

    const resultRows = await db.prepare(`
      SELECT draw_date, special
      FROM results
      WHERE special IS NOT NULL AND TRIM(special) <> ''
      ORDER BY draw_date ASC
    `).all();

    const rows = extractRows(resultRows.results || []);
    if (rows.length < 20) {
      return json({
        success:false,
        version:VERSION,
        message:`Cần ít nhất 20 kỳ có giải đặc biệt; hiện có ${rows.length}.`
      }, 422);
    }

    const byDate = Object.fromEntries((resultRows.results || []).map(r => [String(r.draw_date).slice(0,10), r]));
    await evaluatePending(db, byDate);

    const v28 = await readV28Signals(context);
    const head = scoreSide(rows, "head", v28);
    const tail = scoreSide(rows, "tail", v28);
    const pairs = choosePairs(head.rows, tail.rows);

    const sourceDate = rows[rows.length-1].date;
    const predictionDate = new Date(`${sourceDate}T00:00:00Z`);
    predictionDate.setUTCDate(predictionDate.getUTCDate()+1);

    const history = await getHistory(db, 30);
    const completed = history.filter(x => x.evaluated_at && x.evaluation);
    const pairHits = completed.reduce((a,x)=>a + Number(x.evaluation?.pairHits||0),0);
    const headHits = completed.reduce((a,x)=>a + Number(x.evaluation?.headHits||0),0);
    const tailHits = completed.reduce((a,x)=>a + Number(x.evaluation?.tailHits||0),0);

    return json({
      success:true,
      version:VERSION,
      sourceLatestDate:sourceDate,
      predictionDate:predictionDate.toISOString().slice(0,10),
      sampleSize:rows.length,
      dataScope:"TOÀN BỘ KỲ ĐB trong bảng results",
      method:{
        head:"2 số đầu giải đặc biệt",
        tail:"2 số cuối giải đặc biệt",
        weights:{
          historicalFrequency:0.25,
          recent60:0.20,
          recent30:0.15,
          cycleState:0.10,
          transition:0.10,
          repeatState:0.10,
          v28LiveSignal:0.10
        },
        note:"Score là ranking thống kê, không phải xác suất trúng."
      },
      recommendation:{
        pair1:pairs[0] || null,
        pair2:pairs[1] || null,
        pairs
      },
      topHead:head.rows.slice(0,10),
      topTail:tail.rows.slice(0,10),
      latestSpecial:rows[rows.length-1].special,
      latestHead:rows[rows.length-1].head,
      latestTail:rows[rows.length-1].tail,
      performance:{
        tracked:completed.length,
        pairHits,
        headHits,
        tailHits,
        pairHitRate:round(pct(completed.filter(x=>(x.evaluation?.pairHits||0)>0).length, completed.length)),
        headHitRate:round(pct(completed.filter(x=>(x.evaluation?.headHits||0)>0).length, completed.length)),
        tailHitRate:round(pct(completed.filter(x=>(x.evaluation?.tailHits||0)>0).length, completed.length))
      },
      history:history.slice(0,15)
    });
  } catch (e) {
    return json({success:false, version:VERSION, message:e.message},500);
  }
}
