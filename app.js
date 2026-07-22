document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
});


async function loadDashboard() {
  setSystemStatus(
    "Đang kết nối cơ sở dữ liệu...",
    ""
  );

  try {
    const [latestResponse, predictResponse] =
      await Promise.all([
        fetch("/api/latest", {
          cache: "no-store"
        }),

        fetch("/api/predict?top=15", {
          cache: "no-store"
        })
      ]);

    const latest =
      await latestResponse.json();

    const predict =
      await predictResponse.json();

    if (!latest.success) {
      throw new Error(
        latest.message ||
        "Không lấy được kết quả mới nhất"
      );
    }

    if (!predict.success) {
      throw new Error(
        predict.message ||
        "Không lấy được dữ liệu phân tích"
      );
    }

    renderLatest(latest);
    renderPrediction(predict);
    renderStatistics(predict);

    setSystemStatus(
      `Đã kết nối D1 • ${predict.data.totalDraws} kỳ dữ liệu`,
      "success"
    );

  } catch (error) {
    console.error(error);

    setSystemStatus(
      "Lỗi kết nối: " + error.message,
      "error"
    );
  }
}


/* ================================
   KẾT QUẢ MỚI NHẤT
================================ */

function renderLatest(data) {
  const container =
    document.getElementById("latest-result");

  if (!container) return;

  const r =
    data.results;

  container.innerHTML = `
    <p class="date">
      XSMB ${formatDate(data.drawDate)}
    </p>

    <div class="special">
      ${r.special}
    </div>

    <div class="result-row">
      <strong>G1:</strong>
      ${r.g1.join(" ")}
    </div>

    <div class="result-row">
      <strong>G2:</strong>
      ${r.g2.join(" ")}
    </div>

    <div class="result-row">
      <strong>G3:</strong>
      ${r.g3.join(" ")}
    </div>

    <div class="result-row">
      <strong>G4:</strong>
      ${r.g4.join(" ")}
    </div>

    <div class="result-row">
      <strong>G5:</strong>
      ${r.g5.join(" ")}
    </div>

    <div class="result-row">
      <strong>G6:</strong>
      ${r.g6.join(" ")}
    </div>

    <div class="result-row">
      <strong>G7:</strong>
      ${r.g7.join(" ")}
    </div>
  `;
}


/* ================================
   DỰ ĐOÁN
================================ */

function renderPrediction(data) {
  const container =
    document.getElementById("today-prediction");

  if (!container) return;

  const numbers =
    data.topNumbers || [];

  const pairs =
    data.topPairs || [];

  const touches =
    data.topTouches || [];

  const top1 = numbers[0];
  const top2 = numbers[1];
  const top3 = numbers[2];

  const bestPair = pairs[0];

  container.innerHTML = `
    <p class="date">
      Phân tích cho ${formatDate(
        data.data.predictionDate
      )}
    </p>

    <div class="prediction">

      <span class="pair">
        ${bestPair?.pair || "--"}
      </span>

      <p>
        Ưu tiên:
        <strong>
          ${top1?.number || "--"}
        </strong>
      </p>

      <p>
        Điểm mô hình:
        ${top1?.score || 0}
      </p>

      <p>
        Top tiếp theo:
        <strong>
          ${top2?.number || "--"}
          -
          ${top3?.number || "--"}
        </strong>
      </p>

      <p>
        Chạm mạnh:
        <strong>
          ${
            touches
              .slice(0, 3)
              .map(x => x.digit)
              .join(" - ")
          }
        </strong>
      </p>

    </div>
  `;
}


/* ================================
   BẢNG PHÂN TÍCH
================================ */

function renderStatistics(data) {
  const container =
    document.getElementById("analysis-detail");

  if (!container) return;

  const top =
    data.topNumbers.slice(0, 10);

  let html = `
    <h3>Top 10 theo mô hình</h3>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Số</th>
          <th>Điểm</th>
          <th>Gan</th>
          <th>7 kỳ</th>
          <th>30 kỳ</th>
          <th>Đảo</th>
        </tr>
      </thead>

      <tbody>
  `;

  top.forEach((item, index) => {
    html += `
      <tr>
        <td>${index + 1}</td>

        <td>
          <strong>
            ${item.number}
          </strong>
        </td>

        <td>
          ${item.score}
        </td>

        <td>
          ${item.signals.gan}
        </td>

        <td>
          ${item.signals.freq7}
        </td>

        <td>
          ${item.signals.freq30}
        </td>

        <td>
          ${item.reverse}
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>

    <p>
      Điểm chỉ dùng để xếp hạng,
      không phải xác suất trúng.
    </p>
  `;

  container.innerHTML = html;
}


/* ================================
   TRẠNG THÁI
================================ */

function setSystemStatus(message, status) {
  const el =
    document.getElementById("system-status");

  if (!el) return;

  el.textContent = message;

  el.className =
    `system-status ${status || ""}`;
}


/* ================================
   FORMAT DATE
================================ */

function formatDate(value) {
  if (!value) return "--";

  const [
    year,
    month,
    day
  ] =
    value.split("-");

  return `${day}/${month}/${year}`;
}


/* ================================
   REFRESH
================================ */

window.refreshAnalysis =
  async function () {

    const button =
      document.getElementById("analyze-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Đang phân tích...";
    }

    await loadDashboard();

    if (button) {
      button.disabled = false;
      button.textContent =
        "Phân tích hôm nay";
    }
  };


/* ================================
   MENU TẠM THỜI
================================ */

window.showStatistics =
  function () {
    document
      .getElementById("analysis-detail")
      ?.scrollIntoView({
        behavior: "smooth"
      });
  };


window.showPrediction =
  function () {
    document
      .getElementById("today-prediction")
      ?.scrollIntoView({
        behavior: "smooth"
      });
  };


window.showBacktest =
  function () {
    window.location.href =
      "/api/backtest?days=100";
  };


window.showHistory =
  function () {
    alert(
      "Trang lịch sử sẽ được tạo ở bước tiếp theo."
    );
  };