const $=s=>document.querySelector(s);
const els={
 refreshBtn:$("#refreshBtn"),sourceInfo:$("#sourceInfo"),
 pair1:$("#pair1"),pair2:$("#pair2"),pair1Score:$("#pair1Score"),pair2Score:$("#pair2Score"),
 headTop:$("#headTop"),tailTop:$("#tailTop"),method:$("#method"),
 performance:$("#performance"),backtestBtn:$("#backtestBtn"),backtestResult:$("#backtestResult"),
 lockBtn:$("#lockBtn"),actionMessage:$("#actionMessage"),historyBody:$("#historyBody"),copyBtn:$("#copyBtn")
};
let state=null;
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function dateVN(v){if(!v)return"--/--/----";const [y,m,d]=String(v).slice(0,10).split("-");return`${d}/${m}/${y}`}
async function get(url,opt){const r=await fetch(url,{cache:"no-store",...(opt||{})});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||`HTTP ${r.status}`);return d}

// Hiển thị Top tín hiệu rõ ràng với Vị trí cầu và Số ngày chạy
function renderRank(el, rows) {
  const list = (rows || []).slice(0, 2);
  el.innerHTML = list.map((x, i) => `
  <div class="rank-row" style="grid-template-columns: 26px 48px 1fr; gap: 8px; padding: 10px; margin-bottom: 8px; background: #fffaf5; border: 1px solid #fed7aa; border-radius: 10px;">
    <b style="font-size: 12px; color: #b45309;">#${i + 1}</b>
    <strong style="font-size: 22px; color: #b91c1c;">${esc(x.number)}</strong>
    <div>
      <div style="font-size: 11px; color: #1f2937;">📍 Vị trí: <b>${esc(x.bridgePosition || "Cầu tổng hợp")}</b></div>
      <div style="font-size: 11px; color: #b45309; font-weight: bold; margin-top: 2px;">
        🔥 Cầu chạy: ${esc(x.runningDays || 0)} ngày liên tiếp
      </div>
      <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
        Độ tin cậy: ${Number(x.score).toFixed(1)} pts · Nổ ${esc(x.hits)}/${esc(x.samples)} kỳ
      </div>
    </div>
  </div>`).join("");
}

function render(d) {
  state = d;
  els.sourceInfo.textContent = `Dữ liệu ${d.sampleSize} kỳ · đến ${dateVN(d.sourceLatestDate)} · dự đoán ${dateVN(d.predictionDate)} · ĐB gần nhất: ${d.latestSpecial}`;
  
  const p = d.recommendation?.pairs || [];
  const a = p[0], b = p[1];

  // Render Cặp số Ưu tiên #1
  els.pair1.textContent = a ? `${a.head} — ${a.tail}` : "-- — --";
  els.pair1Score.innerHTML = a ? `
    <div style="font-size: 11px; line-height: 1.6; text-align: left; color: #374151; margin-top: 8px; background: #fffaf5; padding: 8px 10px; border-radius: 8px; border: 1px solid #fed7aa;">
      <div>🎯 <b>Đầu ${a.head}</b>: ${esc(a.headBridge)} <span style="color: #b45309; font-weight: bold;">(${a.headStreak} ngày)</span></div>
      <div>🎯 <b>Cuối ${a.tail}</b>: ${esc(a.tailBridge)} <span style="color: #b45309; font-weight: bold;">(${a.tailStreak} ngày)</span></div>
      <div style="font-size: 10px; color: #9ca3af; margin-top: 3px; text-align: right;">Điểm cầu: ${a.score} pts</div>
    </div>
  ` : "Score --";

  // Render Cặp số Ưu tiên #2
  els.pair2.textContent = b ? `${b.head} — ${b.tail}` : "-- — --";
  els.pair2Score.innerHTML = b ? `
    <div style="font-size: 11px; line-height: 1.6; text-align: left; color: #374151; margin-top: 8px; background: #fffaf5; padding: 8px 10px; border-radius: 8px; border: 1px solid #fed7aa;">
      <div>🎯 <b>Đầu ${b.head}</b>: ${esc(b.headBridge)} <span style="color: #b45309; font-weight: bold;">(${b.headStreak} ngày)</span></div>
      <div>🎯 <b>Cuối ${b.tail}</b>: ${esc(b.tailBridge)} <span style="color: #b45309; font-weight: bold;">(${b.tailStreak} ngày)</span></div>
      <div style="font-size: 10px; color: #9ca3af; margin-top: 3px; text-align: right;">Điểm cầu: ${b.score} pts</div>
    </div>
  ` : "Score --";

  // Render Top 2 Tín hiệu
  renderRank(els.headTop, d.topHead);
  renderRank(els.tailTop, d.topTail);

  // Render Thống kê hiệu suất
  const p2 = d.performance || {};
  els.performance.innerHTML = [
    ["Đã khóa", p2.tracked || 0],
    ["Pair HIT", p2.pairHitRate + "%"],
    ["Đầu HIT", p2.headHitRate + "%"],
    ["Cuối HIT", p2.tailHitRate + "%"]
  ].map(x => `<div class="stat-box"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join("");
}

function renderHistory(d) {
  const rows = d.history || [];
  els.historyBody.innerHTML = rows.length ? rows.map(r => {
    const e = r.evaluation;
    const result = !e ? "<span class='pending'>Chờ</span>" : `
    <span class="${e.pairHits ? "hit" : "miss"}">${e.pairHits ? "✓ Pair HIT" : "✕ Pair trượt"}</span>
    <small>Đầu ${e.actualHead} · Cuối ${e.actualTail}</small>`;
    return `<tr><td>${dateVN(r.prediction_date)}</td><td>${(r.pairs || []).map(p => `${esc(p.head)}-${esc(p.tail)}`).join(" · ")}</td><td>${result}</td></tr>`;
  }).join("") : `<tr><td colspan="3" class="muted">Chưa có dữ liệu.</td></tr>`;
}

async function refresh() {
  els.refreshBtn.disabled = true; els.actionMessage.textContent = "Đang tính...";
  try {
    const [d, h] = await Promise.all([
      get(`/api/golden/v3/dashboard?t=${Date.now()}`),
      get(`/api/golden/v3/history?limit=30&t=${Date.now()}`)
    ]);
    render(d); renderHistory(h); els.actionMessage.textContent = "";
  } catch (e) {
    els.actionMessage.textContent = `Lỗi: ${e.message}`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.lockBtn.onclick = async () => {
  els.lockBtn.disabled = true; els.actionMessage.textContent = "Đang khóa...";
  try {
    const d = await get("/api/golden/v3/predict", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    els.actionMessage.textContent = d.existed ? "Prediction hôm nay đã tồn tại." : "Đã khóa Golden V3.";
    await refresh();
  } catch (e) {
    els.actionMessage.textContent = `Không khóa được: ${e.message}`;
  } finally {
    els.lockBtn.disabled = false;
  }
};

els.backtestBtn.onclick = async () => {
  els.backtestBtn.disabled = true; els.backtestResult.textContent = "Đang chạy strict walk-forward...";
  try {
    const d = await get("/api/golden/v3/backtest?limit=50");
    els.backtestResult.innerHTML = `${d.testedDraws} kỳ · Pair <b>${d.pairHitRate}%</b> · Đầu <b>${d.headHitRate}%</b> · Cuối <b>${d.tailHitRate}%</b>`;
  } catch (e) {
    els.backtestResult.textContent = `Backtest lỗi: ${e.message}`;
  } finally {
    els.backtestBtn.disabled = false;
  }
};

els.copyBtn.onclick = async () => {
  const p = state?.recommendation?.pairs || []; if (!p.length) return;
  await navigator.clipboard.writeText(p.map(x => `${x.head}-${x.tail}`).join("\n"));
  const old = els.copyBtn.textContent; els.copyBtn.textContent = "Đã copy"; setTimeout(() => els.copyBtn.textContent = old, 1200);
};

els.refreshBtn.onclick = refresh;
refresh();