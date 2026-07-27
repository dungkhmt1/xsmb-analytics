const $ = (selector) => document.querySelector(selector);

const els = {
  refreshBtn: $("#refreshBtn"),
  latestDate: $("#latestDate"),
  songThu: $("#songThu"),
  pairScore: $("#pairScore"),
  main10: $("#main10"),
  details: $("#details"),
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

const categoryLabels = {
  golden: "Phong độ Vàng",
  gan: "Số Gan",
  explosion: "Điểm Nổ",
  headTail: "Đầu–Đuôi Nóng",
  support: "Bổ trợ",
};

let dashboardState = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  if (!iso) return "--/--/----";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function renderMain10(numbers) {
  els.main10.innerHTML = numbers
    .map(
      (number) =>
        `<div class="number-chip">${escapeHtml(number)}</div>`,
    )
    .join("");
}

function renderDetails(details) {
  els.details.innerHTML = details
    .map((item) => {
      const category = item.category || "support";
      return `
        <article class="detail-row">
          <div class="detail-number">${escapeHtml(item.number)}</div>

          <div class="badge badge-${escapeHtml(category)}">
            ${escapeHtml(categoryLabels[category] || category)}
          </div>

          <div class="detail-reason">
            ${escapeHtml(item.reason)}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHistory(rows) {
  if (!rows.length) {
    els.historyBody.innerHTML = `
      <tr>
        <td colspan="3" class="muted">Chưa có dự đoán đã khóa.</td>
      </tr>
    `;
    return;
  }

  els.historyBody.innerHTML = rows
    .map((row) => {
      let result = `<span class="pending">Chờ kết quả</span>`;

      if (row.evaluated) {
        result = row.hit
          ? `<span class="hit">✓ Nổ (${escapeHtml(row.hitNumber)})</span>`
          : `<span class="miss">✕ Trượt</span>`;
      }

      return `
        <tr>
          <td>${formatDate(row.predictionDate)}</td>
          <td><strong>${escapeHtml(row.songThu.join(" - "))}</strong></td>
          <td>${result}</td>
        </tr>
      `;
    })
    .join("");
}

function renderDashboard(data) {
  dashboardState = data;

  els.latestDate.textContent =
    `Dữ liệu đến ${formatDate(data.latestDataDate)}`;

  if (data.songThu?.numbers?.length === 2) {
    const [a, b] = data.songThu.numbers;
    els.songThu.innerHTML = `
      <span>${escapeHtml(a)}</span>
      <span class="dash">—</span>
      <span>${escapeHtml(b)}</span>
    `;
    els.pairScore.textContent =
      Number(data.songThu.pairScore).toFixed(0);
  }

  renderMain10(data.main10 || []);
  renderDetails(data.details || []);

  els.tracked.textContent = data.performance?.tracked ?? 0;
  els.hits.textContent = data.performance?.hits ?? 0;
  els.rate.textContent = `${data.performance?.rate ?? 0}%`;

  renderHistory(data.history || []);
}

async function loadDashboard() {
  els.refreshBtn.disabled = true;

  try {
    const data = await fetchJson("/api/golden/dashboard");
    renderDashboard(data);
  } catch (error) {
    els.actionMessage.textContent =
      `Lỗi tải dữ liệu: ${error.message}`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

async function copyMain10() {
  const numbers = dashboardState?.main10 || [];
  if (!numbers.length) return;

  await navigator.clipboard.writeText(numbers.join(" "));
  const old = els.copyBtn.textContent;
  els.copyBtn.textContent = "Đã copy";

  setTimeout(() => {
    els.copyBtn.textContent = old;
  }, 1300);
}

async function lockPrediction() {
  els.lockPredictionBtn.disabled = true;
  els.actionMessage.textContent = "Đang khóa dự đoán...";

  try {
    const data = await fetchJson("/api/golden/predict", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });

    els.actionMessage.textContent =
      data.message || "Đã khóa dự đoán thành công.";

    await loadDashboard();
  } catch (error) {
    els.actionMessage.textContent =
      `Không khóa được dự đoán: ${error.message}`;
  } finally {
    els.lockPredictionBtn.disabled = false;
  }
}

async function runBacktest() {
  els.backtestBtn.disabled = true;
  els.backtestResult.textContent = "Đang chạy walk-forward...";

  try {
    const data = await fetchJson("/api/golden/backtest?limit=20");

    els.backtestResult.innerHTML = `
      Đã kiểm tra <strong>${data.testedDraws}</strong> kỳ,
      trúng <strong>${data.hits}</strong> kỳ,
      tỷ lệ <strong>${data.hitRate}%</strong>.
      <br />
      <small>${escapeHtml(data.warning)}</small>
    `;
  } catch (error) {
    els.backtestResult.textContent =
      `Backtest lỗi: ${error.message}`;
  } finally {
    els.backtestBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener("click", loadDashboard);
els.copyBtn.addEventListener("click", copyMain10);
els.lockPredictionBtn.addEventListener("click", lockPrediction);
els.backtestBtn.addEventListener("click", runBacktest);

loadDashboard();
