const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const els = {
  refreshBtn: $("#refreshBtn"),
  v1Panel: $("#v1Panel"),
  v2Panel: $("#v2Panel"),
  v1Summary: $("#v1Summary"),

  latestDate: $("#latestDate"),
  songThu: $("#songThu"),
  pairScore: $("#pairScore"),
  main10: $("#main10"),
  details: $("#details"),
  weights: $("#weights"),
  calibrationInfo: $("#calibrationInfo"),
  copyBtn: $("#copyBtn"),

  tracked: $("#tracked"),
  hits: $("#hits"),
  rate: $("#rate"),
  historyBody: $("#historyBody"),

  lockPredictionBtn: $("#lockPredictionBtn"),
  actionMessage: $("#actionMessage"),

  backtestBtn: $("#backtestBtn"),
  backtestResult: $("#backtestResult"),
};

let stateV2 = null;

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateVN(iso) {
  if (!iso) return "--/--/----";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function fetchJson(url, options) {
  const r = await fetch(url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  return data;
}

function modelLabel(name) {
  return {
    frequency: "Frequency",
    cycle: "Cycle",
    position: "Position",
    temporal: "Temporal",
  }[name] || name;
}

function renderV2(data) {
  stateV2 = data;

  els.latestDate.textContent =
    `Dữ liệu đến ${dateVN(data.sourceLatestDate)} · dự đoán ${dateVN(data.predictionDate)}`;

  const [a, b] = data.songThu || ["--", "--"];
  els.songThu.innerHTML =
    `<span>${esc(a)}</span><span class="dash">—</span><span>${esc(b)}</span>`;
  els.pairScore.textContent = Number(data.pairScore ?? 0).toFixed(0);

  els.main10.innerHTML = (data.main10 || [])
    .map((n) => `<div class="number-chip">${esc(n)}</div>`)
    .join("");

  els.details.innerHTML = (data.details || [])
    .map((x) => `
      <article class="detail-row">
        <div class="detail-number">${esc(x.number)}</div>
        <div class="detail-main">
          <div>
            <strong>${esc(modelLabel(x.strongestModel))}</strong>
            · Final ${Number(x.finalScore).toFixed(1)}
          </div>
          <div class="detail-reason">
            Top10 đồng thuận: ${esc(x.modelsInTop10)}/4 ·
            Gap: ${esc(x.gap)} ·
            Cycle median: ${esc(x.cycleMedian)} ·
            Momentum 10/30: ${esc(x.momentum10_30)}
          </div>
        </div>
      </article>
    `)
    .join("");

  els.weights.innerHTML = Object.entries(data.modelWeights || {})
    .map(([name, weight]) => `
      <article class="weight-box">
        <span>${esc(modelLabel(name))}</span>
        <strong>${(Number(weight) * 100).toFixed(1)}%</strong>
      </article>
    `)
    .join("");

  els.calibrationInfo.textContent =
    `Trọng số được hiệu chỉnh từ ${data.calibration?.tested ?? 0} kỳ walk-forward gần nhất.`;

  els.tracked.textContent = data.performance?.tracked ?? 0;
  els.hits.textContent = data.performance?.hits ?? 0;
  els.rate.textContent = `${data.performance?.rate ?? 0}%`;

  const rows = data.history || [];
  els.historyBody.innerHTML = rows.length
    ? rows.map((r) => {
        let result = `<span class="pending">Chờ kết quả</span>`;
        if (r.evaluated) {
          result = r.hit
            ? `<span class="hit">✓ Nổ (${esc(r.hitNumber)})</span>`
            : `<span class="miss">✕ Trượt</span>`;
        }

        return `
          <tr>
            <td>${dateVN(r.predictionDate)}</td>
            <td><strong>${esc(r.songThu.join(" - "))}</strong></td>
            <td>${result}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="3" class="muted">Chưa có prediction V2 đã khóa.</td></tr>`;
}

async function loadV2() {
  const data = await fetchJson("/api/golden/v2/dashboard");
  renderV2(data);
}

async function loadV1() {
  try {
    const data = await fetchJson("/api/golden/dashboard");
    const pair = data.songThu?.numbers?.join(" - ") || "--";
    els.v1Summary.innerHTML = `
      <div><strong>Song thủ V1:</strong> ${esc(pair)}</div>
      <div><strong>Dàn 10:</strong> ${esc((data.main10 || []).join(" "))}</div>
      <div><strong>Hiệu suất:</strong>
        ${esc(data.performance?.hits ?? 0)}/${esc(data.performance?.tracked ?? 0)}
        (${esc(data.performance?.rate ?? 0)}%)
      </div>
    `;
  } catch (e) {
    els.v1Summary.textContent = `Không tải được V1: ${e.message}`;
  }
}

async function refreshAll() {
  els.refreshBtn.disabled = true;
  els.actionMessage.textContent = "";
  try {
    await Promise.all([loadV2(), loadV1()]);
  } catch (e) {
    els.actionMessage.textContent = `Lỗi: ${e.message}`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

async function lockV2() {
  els.lockPredictionBtn.disabled = true;
  els.actionMessage.textContent = "Đang khóa prediction V2...";
  try {
    const data = await fetchJson("/api/golden/v2/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    els.actionMessage.textContent =
      data.existed
        ? "Prediction V2 ngày này đã tồn tại; hệ thống giữ nguyên bản đã khóa."
        : "Đã khóa prediction V2.";
    await loadV2();
  } catch (e) {
    els.actionMessage.textContent = `Không khóa được: ${e.message}`;
  } finally {
    els.lockPredictionBtn.disabled = false;
  }
}

async function runBacktest() {
  els.backtestBtn.disabled = true;
  els.backtestResult.textContent = "Đang chạy strict walk-forward...";
  try {
    const d = await fetchJson("/api/golden/v2/backtest?limit=10");
    els.backtestResult.innerHTML = `
      <strong>${d.testedDraws}</strong> kỳ ·
      Song thủ: <strong>${d.songThuHits}</strong> kỳ
      (${d.songThuHitRate}%) ·
      Dàn 10 có ≥1 số: <strong>${d.main10HitDraws}</strong> kỳ
      (${d.main10HitRate}%).
      <br><small>${esc(d.warning)}</small>
    `;
  } catch (e) {
    els.backtestResult.textContent = `Backtest lỗi: ${e.message}`;
  } finally {
    els.backtestBtn.disabled = false;
  }
}

$$(".version-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".version-btn").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    const v = btn.dataset.version;
    els.v1Panel.hidden = v !== "v1";
    els.v2Panel.hidden = v !== "v2";
  });
});

els.refreshBtn.addEventListener("click", refreshAll);
els.lockPredictionBtn.addEventListener("click", lockV2);
els.backtestBtn.addEventListener("click", runBacktest);

els.copyBtn.addEventListener("click", async () => {
  const numbers = stateV2?.main10 || [];
  if (!numbers.length) return;
  await navigator.clipboard.writeText(numbers.join(" "));
  const old = els.copyBtn.textContent;
  els.copyBtn.textContent = "Đã copy";
  setTimeout(() => (els.copyBtn.textContent = old), 1200);
});

refreshAll();
