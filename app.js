document.addEventListener("DOMContentLoaded", function () {
  loadDashboard();
});


async function loadDashboard() {
  setSystemStatus("Đang kết nối cơ sở dữ liệu...", "");

  try {
    const [latestRes, predictRes] = await Promise.all([
      fetch("/api/latest", {
        cache: "no-store"
      }),

      fetch("/api/predict?top=15", {
        cache: "no-store"
      })
    ]);

    if (!latestRes.ok) {
      throw new Error(
        `Latest API lỗi ${latestRes.status}`
      );
    }

    if (!predictRes.ok) {
      throw new Error(
        `Predict API lỗi ${predictRes.status}`
      );
    }

    const latest =
      await latestRes.json();

    const predict =
      await predictRes.json();

    if (!latest.success) {
      throw new Error(
        latest.message ||
        "Không đọc được kết quả"
      );
    }

    if (!predict.success) {
      throw new Error(
        predict.message ||
        "Không đọc được phân tích"
      );
    }

    renderLatest(latest);
    renderPrediction(predict);
    renderStatistics(predict);

    setSystemStatus(
      `Đã kết nối D1 • ${predict.data?.totalDraws || 0} kỳ dữ liệu`,
      "success"
    );

  } catch (error) {
    console.error("Dashboard error:", error);

    setSystemStatus(
      "Lỗi tải dữ liệu: " + error.message,
      "error"
    );

    const latestBox =
      document.getElementById(
        "latest-result"
      );

    if (latestBox) {
      latestBox.innerHTML = `
        <div class="loading-box">
          Không tải được kết quả.
        </div>
      `;
    }

    const predictionBox =
      document.getElementById(
        "today-prediction"
      );

    if (predictionBox) {
      predictionBox.innerHTML = `
        <div class="loading-box">
          Không tải được phân tích.
        </div>
      `;
    }
  }
}


/* =========================================
   KẾT QUẢ XSMB
========================================= */

function renderLatest(data) {
  const container =
    document.getElementById(
      "latest-result"
    );

  const badge =
    document.getElementById(
      "latest-date-badge"
    );

  if (!container) return;

  if (badge) {
    badge.textContent =
      formatDate(data.drawDate);
  }

  const r = data.results || {};

  const prizeRow =
    (
      name,
      values,
      columns,
      extraClass = ""
    ) => {

      const list =
        Array.isArray(values)
          ? values
          : [values];

      return `
        <div class="prize-row ${extraClass}">

          <div class="prize-name">
            ${name}
          </div>

          <div
            class="
              prize-values
              cols-${columns}
            "
          >

            ${list
              .filter(Boolean)
              .map(
                number => `
                  <span class="prize-number">
                    ${number}
                  </span>
                `
              )
              .join("")}

          </div>

        </div>
      `;
    };


  container.innerHTML = `
    <div class="xsmb-board">

      ${prizeRow(
        "ĐB",
        r.special,
        1,
        "special-row"
      )}

      ${prizeRow(
        "G1",
        r.g1,
        1
      )}

      ${prizeRow(
        "G2",
        r.g2,
        2
      )}

      ${prizeRow(
        "G3",
        r.g3,
        6
      )}

      ${prizeRow(
        "G4",
        r.g4,
        4
      )}

      ${prizeRow(
        "G5",
        r.g5,
        6
      )}

      ${prizeRow(
        "G6",
        r.g6,
        3
      )}

      ${prizeRow(
        "G7",
        r.g7,
        4,
        "g7-row"
      )}

    </div>
  `;
}


/* =========================================
   DỰ ĐOÁN
========================================= */

function renderPrediction(data) {
  const container =
    document.getElementById(
      "today-prediction"
    );

  if (!container) return;

  const numbers =
    Array.isArray(data.topNumbers)
      ? data.topNumbers
      : [];

  const pairs =
    Array.isArray(data.topPairs)
      ? data.topPairs
      : [];

  const touches =
    Array.isArray(data.topTouches)
      ? data.topTouches
      : [];

  const top1 = numbers[0];
  const top2 = numbers[1];
  const top3 = numbers[2];

  const bestPair =
    pairs[0];

  const headerDraws =
    document.getElementById(
      "header-total-draws"
    );

  if (headerDraws) {
    headerDraws.textContent =
      `${data.data?.totalDraws || 0} kỳ`;
  }


  container.innerHTML = `
    <div class="prediction-grid">

      <div
        class="
          prediction-card
          highlight
        "
      >

        <div class="prediction-title">
          Số ưu tiên
        </div>

        <div class="big-number">
          ${top1?.number || "--"}
        </div>

        <div class="score">
          Điểm:
          ${top1?.score ?? "--"}
        </div>

      </div>


      <div
        class="
          prediction-card
          pair-card
        "
      >

        <div class="prediction-title">
          Cặp đảo mạnh nhất
        </div>

        <div class="big-pair">
          ${bestPair?.pair || "--"}
        </div>

        <div class="score">
          Điểm:
          ${bestPair?.score ?? "--"}
        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Top tiếp theo
        </div>

        <div class="secondary-numbers">

          <span class="secondary-number">
            ${top2?.number || "--"}
          </span>

          <span class="secondary-number">
            ${top3?.number || "--"}
          </span>

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Chạm mạnh
        </div>

        <div class="secondary-numbers">

          ${touches
            .slice(0, 3)
            .map(
              item => `
                <span class="secondary-number">
                  ${item.digit}
                </span>
              `
            )
            .join("")}

        </div>

      </div>

    </div>

    <div class="warning-box">

      Phân tích cho
      <strong>
        ${formatDate(
          data.data?.predictionDate
        )}
      </strong>

      •
      ${data.data?.totalDraws || 0}
      kỳ dữ liệu

    </div>
  `;
}


/* =========================================
   TOP MODEL
========================================= */

function renderStatistics(data) {
  const container =
    document.getElementById(
      "analysis-detail"
    );

  if (!container) return;

  const top =
    Array.isArray(data.topNumbers)
      ? data.topNumbers.slice(0, 10)
      : [];

  if (!top.length) {
    container.innerHTML =
      "Chưa có dữ liệu thống kê.";

    return;
  }

  let rows = "";

  top.forEach(
    (item, index) => {

      rows += `
        <tr>

          <td>
            ${index + 1}
          </td>

          <td class="number-cell">
            ${item.number}
          </td>

          <td>
            ${item.score}
          </td>

          <td>
            ${item.signals?.gan ?? "-"}
          </td>

          <td>
            ${item.signals?.freq7 ?? "-"}
          </td>

          <td>
            ${item.signals?.freq30 ?? "-"}
          </td>

          <td>
            ${item.reverse || "-"}
          </td>

        </tr>
      `;
    }
  );


  container.innerHTML = `
    <div class="table-wrapper">

      <table class="analysis-table">

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
          ${rows}
        </tbody>

      </table>

    </div>

    <div class="warning-box">
      Điểm mô hình dùng để xếp hạng,
      không phải xác suất trúng.
    </div>
  `;
}


/* =========================================
   STATUS
========================================= */

function setSystemStatus(
  message,
  status
) {
  const element =
    document.getElementById(
      "system-status"
    );

  if (!element) return;

  element.textContent =
    message;

  element.className =
    `system-status ${status || ""}`;
}


/* =========================================
   DATE
========================================= */

function formatDate(value) {
  if (!value) {
    return "--/--/----";
  }

  const parts =
    String(value).split("-");

  if (parts.length !== 3) {
    return value;
  }

  return (
    `${parts[2]}/${parts[1]}/${parts[0]}`
  );
}


/* =========================================
   REFRESH
========================================= */

window.refreshAnalysis =
  async function () {

    const button =
      document.getElementById(
        "analyze-button"
      );

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


/* =========================================
   MENU
========================================= */

window.showStatistics =
  function () {

    document
      .getElementById(
        "analysis-detail"
      )
      ?.scrollIntoView({
        behavior: "smooth"
      });
  };


window.showPrediction =
  function () {

    document
      .getElementById(
        "today-prediction"
      )
      ?.scrollIntoView({
        behavior: "smooth"
      });
  };


window.showBacktest =
  function () {

    window.open(
      "/api/backtest?days=100",
      "_blank"
    );
  };


window.showHistory =
  function () {

    alert(
      "Trang lịch sử đang được phát triển."
    );
  };


/* =========================================
   THEO DÕI DỰ ĐOÁN
========================================= */

window.showTracking =
  async function () {

    const section =
      document.getElementById(
        "tracking-section"
      );

    if (!section) return;

    section.style.display =
      "block";

    section.scrollIntoView({
      behavior: "smooth"
    });

    await loadPredictionHistory();
  };


async function loadPredictionHistory() {
  const summary =
    document.getElementById(
      "tracking-summary"
    );

  const table =
    document.getElementById(
      "tracking-table"
    );

  if (!summary || !table) {
    return;
  }

  try {
    const response =
      await fetch(
        "/api/prediction-history",
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `API lỗi ${response.status}`
      );
    }

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(
        data.message ||
        "Không đọc được lịch sử"
      );
    }

    const s =
      data.summary || {};

    summary.innerHTML = `
      <div class="tracking-summary-grid">

        <div>
          <small>Kỳ hoàn thành</small>
          <strong>
            ${s.completed || 0}
          </strong>
        </div>

        <div>
          <small>Tổng lần về</small>
          <strong>
            ${s.totalHits || 0}
          </strong>
        </div>

        <div>
          <small>Tiền đánh</small>
          <strong>
            ${money(
              s.totalCost || 0
            )}
          </strong>
        </div>

        <div>
          <small>Tiền nhận</small>
          <strong>
            ${money(
              s.totalPayout || 0
            )}
          </strong>
        </div>

        <div>
          <small>Lãi/Lỗ</small>

          <strong
            class="${
              (s.totalProfit || 0) >= 0
                ? "profit"
                : "loss"
            }"
          >

            ${
              (s.totalProfit || 0) > 0
                ? "+"
                : ""
            }

            ${money(
              s.totalProfit || 0
            )}

          </strong>
        </div>

      </div>
    `;


    const history =
      Array.isArray(data.history)
        ? data.history
        : [];

    if (!history.length) {
      table.innerHTML =
        `<div class="loading-box">
          Chưa có lịch sử dự đoán.
        </div>`;

      return;
    }


    let rows = "";

    history.forEach(
      row => {

        const hits =
          row.numbers
            .map(
              number => {

                const count =
                  row.hitsByNumber?.[
                    number
                  ] || 0;

                return (
                  `${number}: ${count} lần`
                );
              }
            )
            .join("<br>");


        rows += `
          <tr>

            <td>
              ${formatDate(
                row.date
              )}
            </td>

            <td>
              <strong>
                ${row.numbers.join(
                  " - "
                )}
              </strong>
            </td>

            <td>
              ${
                row.status ===
                "pending"
                  ? "Chưa xổ"
                  : hits
              }
            </td>

            <td>
              ${
                row.status ===
                "pending"
                  ? "-"
                  : row.totalHits
              }
            </td>

            <td>
              ${money(row.cost)}
            </td>

            <td>
              ${
                row.status ===
                "pending"
                  ? "-"
                  : money(
                      row.payout
                    )
              }
            </td>

            <td
              class="${
                row.profit >= 0
                  ? "profit"
                  : "loss"
              }"
            >

              ${
                row.status ===
                "pending"
                  ? "-"
                  :
                  (
                    row.profit > 0
                      ? "+"
                      : ""
                  ) +
                  money(
                    row.profit
                  )
              }

            </td>

          </tr>
        `;
      }
    );


    table.innerHTML = `
      <div class="table-wrapper">

        <table class="tracking-table">

          <thead>
            <tr>
              <th>Ngày</th>
              <th>Dàn số</th>
              <th>Kết quả</th>
              <th>Lần về</th>
              <th>Tiền đánh</th>
              <th>Tiền nhận</th>
              <th>Lãi/Lỗ</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>

        </table>

      </div>
    `;

  } catch (error) {
    console.error(
      "Tracking error:",
      error
    );

    summary.innerHTML =
      `Không tải được dữ liệu: ${error.message}`;

    table.innerHTML = "";
  }
}


function money(value) {
  return new Intl.NumberFormat(
    "vi-VN"
  ).format(
    Number(value || 0)
  ) + "đ";
}