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
function renderPrediction(data) {
  const headerDraws =
  document.getElementById(
    "header-total-draws"
  );

if (
  headerDraws &&
  data.data?.totalDraws
) {
  headerDraws.textContent =
    `${data.data.totalDraws} kỳ`;
}

  const container =
    document.getElementById(
      "today-prediction"
    );

  if (!container) return;


  const numbers =
    data.topNumbers || [];

  const pairs =
    data.topPairs || [];

  const touches =
    data.topTouches || [];


  const top1 =
    numbers[0];

  const top2 =
    numbers[1];

  const top3 =
    numbers[2];

  const bestPair =
    pairs[0];


  container.innerHTML = `

    <div class="prediction-grid">


      <div
        class="
          prediction-card
          highlight
        "
      >

        <div
          class="
            prediction-title
          "
        >
          Số ưu tiên
        </div>

        <div class="big-number">
          ${top1?.number || "--"}
        </div>

        <div class="score">
          Điểm:
          ${top1?.score || 0}
        </div>

      </div>


      <div
        class="
          prediction-card
          pair-card
        "
      >

        <div
          class="
            prediction-title
          "
        >
          Cặp đảo mạnh nhất
        </div>

        <div class="big-pair">
          ${bestPair?.pair || "--"}
        </div>

        <div class="score">
          Điểm cặp:
          ${bestPair?.score || 0}
        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Top tiếp theo
        </div>

        <div
          class="
            secondary-numbers
          "
        >

          <span
            class="
              secondary-number
            "
          >
            ${top2?.number || "--"}
          </span>

          <span
            class="
              secondary-number
            "
          >
            ${top3?.number || "--"}
          </span>

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Chạm mạnh
        </div>

        <div
          class="
            secondary-numbers
          "
        >

          ${touches
            .slice(0, 3)
            .map(
              item => `
                <span
                  class="
                    secondary-number
                  "
                >
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
          data.data.predictionDate
        )}
      </strong>

      • ${data.data.totalDraws}
      kỳ dữ liệu

      • Điểm là chỉ số xếp hạng,
      không phải xác suất trúng.

    </div>
  `;
}

function renderStatistics(data) {

  const container =
    document.getElementById(
      "analysis-detail"
    );

  if (!container) return;

  const top =
    data.topNumbers
      .slice(0, 10);


  let rows = "";


  top.forEach(
    (item, index) => {

      rows += `
        <tr>

          <td>
            ${index + 1}
          </td>

          <td
            class="
              number-cell
            "
          >
            ${item.number}
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

    }
  );


  container.innerHTML = `

    <div class="table-wrapper">

      <table
        class="
          analysis-table
        "
      >

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

      Ba vị trí đầu được tô nổi bật
      để dễ quan sát.

    </div>
  `;
}

/* ================================
   KẾT QUẢ MỚI NHẤT
================================ */

function renderLatest(data) {

  const container =
    document.getElementById(
      "latest-result"
    );

  const dateBadge =
    document.getElementById(
      "latest-date-badge"
    );

  if (!container) return;

  const r = data.results;

  if (dateBadge) {
    dateBadge.textContent =
      formatDate(
        data.drawDate
      );
  }


  function prizeValues(
    values,
    columns,
    extraClass = ""
  ) {

    const list =
      Array.isArray(values)
        ? values
        : [values];

    return `
      <div
        class="
          prize-values
          cols-${columns}
          ${extraClass}
        "
      >

        ${list
          .map(
            number => `
              <span
                class="prize-number"
              >
                ${number}
              </span>
            `
          )
          .join("")}

      </div>
    `;
  }


  container.innerHTML = `

    <div class="xsmb-board">

      <div class="
        prize-row
        special-row
      ">

        <div class="prize-name">
          ĐB
        </div>

        ${prizeValues(
          r.special,
          1
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G1
        </div>

        ${prizeValues(
          r.g1,
          1
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G2
        </div>

        ${prizeValues(
          r.g2,
          2
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G3
        </div>

        ${prizeValues(
          r.g3,
          6
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G4
        </div>

        ${prizeValues(
          r.g4,
          4
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G5
        </div>

        ${prizeValues(
          r.g5,
          6
        )}

      </div>


      <div class="prize-row">

        <div class="prize-name">
          G6
        </div>

        ${prizeValues(
          r.g6,
          3
        )}

      </div>


      <div class="
        prize-row
        g7-row
      ">

        <div class="prize-name">
          G7
        </div>

        ${prizeValues(
          r.g7,
          4
        )}

      </div>

    </div>
  `;
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
  window.showTracking =
  async function () {

    const section =
      document.getElementById(
        "tracking-section"
      );

    if (!section) {
      return;
    }

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

  try {
    const response =
      await fetch(
        "/api/prediction-history",
        {
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    if (!data.success) {
      throw new Error(
        data.message
      );
    }

    /*
     * Tổng kết
     */

    const s =
      data.summary;

    summary.innerHTML = `
      <div class="tracking-summary-grid">

        <div>
          <small>Tổng kỳ</small>
          <strong>
            ${s.completed}
          </strong>
        </div>

        <div>
          <small>Tổng lần về</small>
          <strong>
            ${s.totalHits}
          </strong>
        </div>

        <div>
          <small>Tổng tiền đánh</small>
          <strong>
            ${money(s.totalCost)}
          </strong>
        </div>

        <div>
          <small>Tổng tiền nhận</small>
          <strong>
            ${money(s.totalPayout)}
          </strong>
        </div>

        <div>
          <small>Lãi / Lỗ</small>

          <strong
            class="${
              s.totalProfit >= 0
                ? "profit"
                : "loss"
            }"
          >
            ${
              s.totalProfit >= 0
                ? "+"
                : ""
            }

            ${money(
              s.totalProfit
            )}
          </strong>
        </div>

      </div>
    `;

    /*
     * Bảng từng ngày
     */

    let html = `
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
    `;

    for (
      const row
      of data.history
    ) {
      let resultText = "";

      for (
        const number
        of row.numbers
      ) {
        const hits =
          row.hitsByNumber?.[
            number
          ] || 0;

        resultText += `
          <div>
            ${number}:
            <strong>
              ${hits}
            </strong>
            lần
          </div>
        `;
      }

      if (
        row.status ===
        "pending"
      ) {
        html += `
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
              Chưa xổ
            </td>

            <td>-</td>

            <td>
              ${money(
                row.cost
              )}
            </td>

            <td>-</td>

            <td>-</td>

          </tr>
        `;

        continue;
      }

      html += `
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
            ${resultText}
          </td>

          <td>
            <strong>
              ${row.totalHits}
            </strong>
          </td>

          <td>
            ${money(
              row.cost
            )}
          </td>

          <td>
            ${money(
              row.payout
            )}
          </td>

          <td
            class="${
              row.profit >= 0
                ? "profit"
                : "loss"
            }"
          >

            ${
              row.profit >= 0
                ? "+"
                : ""
            }

            ${money(
              row.profit
            )}

          </td>

        </tr>
      `;
    }

    html += `
        </tbody>
      </table>
      </div>
    `;

    table.innerHTML =
      html;

  } catch (error) {
    summary.innerHTML =
      "Không tải được dữ liệu: " +
      error.message;
  }
}


function money(value) {
  return new Intl.NumberFormat(
    "vi-VN"
  ).format(
    Number(value || 0)
  ) + "đ";
}