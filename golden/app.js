const $ = s => document.querySelector(s);
const els = {
  refreshBtn: $("#refreshBtn"), sourceInfo: $("#sourceInfo"),
  pair1: $("#pair1"), pair2: $("#pair2"), pair1Score: $("#pair1Score"), pair2Score: $("#pair2Score"),
  headTop: $("#headTop"), tailTop: $("#tailTop"),
  copyBtn: $("#copyBtn")
};

let state = null;
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function dateVN(v) { if (!v) return "--/--/----"; const [y, m, d] = String(v).slice(0, 10).split("-"); return `${d}/${m}/${y}`; }

async function get(url) {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.message || `HTTP ${r.status}`);
  return d;
}

// Vẽ Top 2 gợi ý kèm Vị trí cầu và Số lần nổ
function renderRank(el, rows, totalSamples) {
  el.innerHTML = (rows || []).slice(0, 2).map((x, i) => `
    <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px; margin-bottom: 8px; background: #fffaf5; border: 1px solid #fed7aa; border-radius: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 900; color: #b45309;">#${i + 1}</span>
        <strong style="font-size: 24px; color: #b91c1c;">${esc(x.number)}</strong>
        <span style="font-weight: bold; color: #047857;">Đã nổ: ${esc(x.totalHits)} lần</span>
      </div>
      <div style="font-size: 11px; color: #374151;">📍 Vị trí cầu: <b>${esc(x.bridgePosition)}</b></div>
      <div style="font-size: 10px; color: #6b7280;">
        Tần suất: ${esc(x.totalHits)}/${esc(totalSamples)} kỳ (${((x.totalHits / totalSamples) * 100).toFixed(1)}%) 
        ${x.runningDays > 0 ? `· <b style="color: #b45309;">Đang thông ${x.runningDays} ngày</b>` : ""}
      </div>
    </div>
  `).join("");
}

function render(d) {
  state = d;
  els.sourceInfo.textContent = `Quét ${d.sampleSize} kỳ · Cầu ngày ${dateVN(d.sourceLatestDate)} dự đoán cho ${dateVN(d.predictionDate)} · ĐB kỳ trước: ${d.latestSpecial}`;

  const a = d.recommendation?.pair1;
  const b = d.recommendation?.pair2;

  // Thẻ ƯU TIÊN #1
  els.pair1.textContent = a ? `${a.head} — ${a.tail}` : "-- — --";
  els.pair1Score.innerHTML = a ? `
    <div style="text-align: left; font-size: 11px; line-height: 1.6; color: #1f2937; margin-top: 6px; padding: 8px; background: #fffaf5; border-radius: 8px; border: 1px solid #fed7aa;">
      <div>🎯 <b>Đầu ${a.head}</b>: ${esc(a.headBridge)} — <b style="color: #047857;">Nổ ${a.headHits} lần</b> ${a.headStreak > 0 ? `(Thông ${a.headStreak} ngày)` : ""}</div>
      <div>🎯 <b>Cuối ${a.tail}</b>: ${esc(a.tailBridge)} — <b style="color: #047857;">Nổ ${a.tailHits} lần</b> ${a.tailStreak > 0 ? `(Thông ${a.tailStreak} ngày)` : ""}</div>
    </div>
  ` : "";

  // Thẻ ƯU TIÊN #2
  els.pair2.textContent = b ? `${b.head} — ${b.tail}` : "-- — --";
  els.pair2Score.innerHTML = b ? `
    <div style="text-align: left; font-size: 11px; line-height: 1.6; color: #1f2937; margin-top: 6px; padding: 8px; background: #fffaf5; border-radius: 8px; border: 1px solid #fed7aa;">
      <div>🎯 <b>Đầu ${b.head}</b>: ${esc(b.headBridge)} — <b style="color: #047857;">Nổ ${b.headHits} lần</b> ${b.headStreak > 0 ? `(Thông ${b.headStreak} ngày)` : ""}</div>
      <div>🎯 <b>Cuối ${b.tail}</b>: ${esc(b.tailBridge)} — <b style="color: #047857;">Nổ ${b.tailHits} lần</b> ${b.tailStreak > 0 ? `(Thông ${b.tailStreak} ngày)` : ""}</div>
    </div>
  ` : "";

  // Top 2 Đầu & Cuối
  renderRank(els.headTop, d.topHead, d.sampleSize);
  renderRank(els.tailTop, d.topTail, d.sampleSize);
}

async function refresh() {
  els.refreshBtn.disabled = true;
  try {
    const d = await get(`/api/golden/v3/dashboard?t=${Date.now()}`);
    render(d);
  } catch (e) {
    els.sourceInfo.textContent = `Lỗi tải dữ liệu: ${e.message}`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.copyBtn.onclick = async () => {
  const p = state?.recommendation?.pairs || [];
  if (!p.length) return;
  await navigator.clipboard.writeText(p.map(x => `${x.head}-${x.tail}`).join("\n"));
  const old = els.copyBtn.textContent;
  els.copyBtn.textContent = "Đã copy";
  setTimeout(() => els.copyBtn.textContent = old, 1200);
};

els.refreshBtn.onclick = refresh;
refresh();