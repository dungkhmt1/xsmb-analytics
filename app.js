/*
========================================================
XSMB ANALYTICS
FRONTEND V2.5
========================================================
*/


document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadDashboard();
  }
);


/*
========================================================
DASHBOARD
========================================================
*/

async function loadDashboard() {

  setSystemStatus(
    "Đang kết nối dữ liệu...",
    ""
  );


  const [
    latestResult,
    statisticsResult,
    predictResult
  ] =
    await Promise.allSettled([

      fetch(
        "/api/latest",
        {
          cache: "no-store"
        }
      ),

      fetch(
        "/api/statistics",
        {
          cache: "no-store"
        }
      ),

      fetch(
        "/api/predict",
        {
          cache: "no-store"
        }
      )

    ]);


  let totalDraws = 0;


  /*
  ======================================================
  LATEST
  ======================================================
  */

  if (
    latestResult.status ===
    "fulfilled"
  ) {

    try {

      const response =
        latestResult.value;


      if (!response.ok) {

        throw new Error(
          `Latest API ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Không đọc được kết quả."
        );
      }


      renderLatest(data);

    } catch (error) {

      console.error(
        "Latest:",
        error
      );


      renderLatestError(
        error.message
      );
    }
  }


  /*
  ======================================================
  STATISTICS
  ======================================================
  */

  if (
    statisticsResult.status ===
    "fulfilled"
  ) {

    try {

      const response =
        statisticsResult.value;


      if (!response.ok) {

        throw new Error(
          `Statistics API ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Không đọc được thống kê."
        );
      }


      totalDraws =
        Number(
          data.totalDraws || 0
        );


      updateTotalDraws(
        totalDraws
      );


      renderStatistics(
        data
      );

    } catch (error) {

      console.error(
        "Statistics:",
        error
      );


      renderStatisticsError(
        error.message
      );
    }
  }


  /*
  ======================================================
  PREDICT
  ======================================================
  */

  if (
    predictResult.status ===
    "fulfilled"
  ) {

    try {

      const response =
        predictResult.value;


      if (!response.ok) {

        throw new Error(
          `Predict API ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Không đọc được Predict."
        );
      }


      renderPrediction(
        data,
        totalDraws
      );


      setSystemStatus(
        `D1 ${totalDraws} kỳ • V2.5 • ${data.qualifiedCount || 0} cầu đạt chuẩn`,
        "success"
      );

    } catch (error) {

      console.error(
        "Predict:",
        error
      );


      renderPredictionError(
        error.message,
        totalDraws
      );


      setSystemStatus(
        `D1 ${totalDraws} kỳ • Predict lỗi`,
        "error"
      );
    }
  }
}


/*
========================================================
TOTAL DRAWS
========================================================
*/

function updateTotalDraws(total) {

  const ids = [
    "header-total-draws",
    "total-draws",
    "data-count"
  ];


  for (const id of ids) {

    const element =
      document.getElementById(id);


    if (element) {

      element.textContent =
        `${total} kỳ`;
    }
  }
}


/*
========================================================
LATEST
========================================================
*/

function renderLatest(data) {

  const container =
    document.getElementById(
      "latest-result"
    );


  const badge =
    document.getElementById(
      "latest-date-badge"
    );


  if (!container) {
    return;
  }


  const drawDate =
    data.drawDate ||
    data.draw_date ||
    data.date;


  if (badge) {

    badge.textContent =
      formatDate(drawDate);
  }


  const result =
    data.results || {};


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

          : (
              values
                ? String(values)
                    .trim()
                    .split(/\s+/)
                : []
            );


      return `

        <div
          class="
            prize-row
            ${extraClass}
          "
        >

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
                    ${escapeHtml(number)}
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
        result.special,
        1,
        "special-row"
      )}

      ${prizeRow(
        "G1",
        result.g1,
        1
      )}

      ${prizeRow(
        "G2",
        result.g2,
        2
      )}

      ${prizeRow(
        "G3",
        result.g3,
        6
      )}

      ${prizeRow(
        "G4",
        result.g4,
        4
      )}

      ${prizeRow(
        "G5",
        result.g5,
        6
      )}

      ${prizeRow(
        "G6",
        result.g6,
        3
      )}

      ${prizeRow(
        "G7",
        result.g7,
        4,
        "g7-row"
      )}

    </div>
  `;
}


function renderLatestError(
  message
) {

  const element =
    document.getElementById(
      "latest-result"
    );


  if (!element) {
    return;
  }


  element.innerHTML = `

    <div class="loading-box">
      ${escapeHtml(message)}
    </div>
  `;
}


/*
========================================================
PREDICT V2.5
========================================================
*/

function renderPrediction(
  data,
  totalDraws
) {

  const container =
    document.getElementById(
      "today-prediction"
    );


  if (!container) {
    return;
  }


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ? data.suggestions
      : [];


  /*
  Không có cầu đạt bộ lọc V2.5.
  */

  if (!suggestions.length) {

    container.innerHTML = `

      <div class="loading-box">

        Không có cầu nào đạt
        bộ lọc V2.5 hôm nay.

      </div>


      <div class="warning-box">

        Cầu đang sống trước backtest:

        <strong>
          ${data.activeCandidateCount || 0}
        </strong>

        <br>

        Không đủ mẫu:

        <strong>
          ${
            data.rejected
              ?.insufficientSamples ||
            0
          }
        </strong>

        <br>

        Không đạt tỷ lệ tiếp diễn:

        <strong>
          ${
            data.rejected
              ?.lowContinuationRate ||
            0
          }
        </strong>

        <br><br>

        Ngưỡng:

        ≥ ${data.rule?.minSamples || 0}
        mẫu

        • ≥
        ${
          data.rule
            ?.minContinuationRate ||
          0
        }%

      </div>
    `;


    return;
  }


  const top =
    suggestions.slice(
      0,
      10
    );


  const top1 =
    top[0];


  const strengthText =
    value => {

      if (
        value === "very-strong"
      ) {
        return "Rất mạnh";
      }


      if (
        value === "strong"
      ) {
        return "Mạnh";
      }


      return "Đạt chuẩn";
    };


  /*
  TOP 1
  */

  const topCard = `

    <div
      class="
        prediction-card
        highlight
      "
    >

      <div class="prediction-title">
        Cầu ưu tiên #1
      </div>


      <div class="big-number">

        ${escapeHtml(
          top1.number
        )}

      </div>


      <div class="score">

        ${escapeHtml(
          top1.bridge
        )}

      </div>


      <div class="score">

        Cầu hiện tại:

        <strong>
          ${top1.streak} kỳ
        </strong>

      </div>


      <div class="score">

        Backtest:

        <strong>

          ${top1.continued}
          /
          ${top1.opportunities}

        </strong>

      </div>


      <div class="score">

        Tiếp diễn:

        <strong>
          ${top1.continuationRate}%
        </strong>

      </div>


      <div class="score">

        Điểm V2.5:

        <strong>
          ${top1.score}
        </strong>

      </div>


      <div class="score">

        ${strengthText(
          top1.strength
        )}

      </div>

    </div>
  `;


  /*
  THỐNG KÊ TÓM TẮT
  */

  const summaryCards = `

    <div class="prediction-card">

      <div class="prediction-title">
        Cầu đang sống
      </div>

      <div class="big-number">

        ${data.activeCandidateCount || 0}

      </div>

      <div class="score">
        Trước backtest
      </div>

    </div>


    <div class="prediction-card">

      <div class="prediction-title">
        Qua bộ lọc
      </div>

      <div class="big-number">

        ${data.qualifiedCount || 0}

      </div>

      <div class="score">
        Cầu đạt chuẩn
      </div>

    </div>


    <div class="prediction-card">

      <div class="prediction-title">
        Số khác nhau
      </div>

      <div class="big-number">

        ${data.uniqueNumberCount || 0}

      </div>

      <div class="score">
        Sau backtest
      </div>

    </div>
  `;


  /*
  DANH SÁCH TOP
  */

  const list =
    top
      .map(
        (
          item,
          index
        ) => `

          <div class="suggestion-row">

            <div>

              <strong>

                #${index + 1}
                &nbsp;

                <span class="number-cell">
                  ${escapeHtml(
                    item.number
                  )}
                </span>

              </strong>

            </div>


            <div>

              ${escapeHtml(
                item.bridge
              )}

            </div>


            <div>

              Hiện tại:

              <strong>
                ${item.streak} kỳ
              </strong>

            </div>


            <div>

              Lịch sử:

              <strong>
                ${item.continued}
                /
                ${item.opportunities}
              </strong>

              tiếp tục

            </div>


            <div>

              Tỷ lệ:

              <strong>
                ${item.continuationRate}%
              </strong>

              • Wilson:

              ${item.wilsonLowerBound}%

            </div>


            <div>

              Gần đây:

              ${item.weightedRate}%

              • Score:

              <strong>
                ${item.score}
              </strong>

            </div>


            ${renderBridgeHistory(
              item.history
            )}

          </div>
        `
      )
      .join("");


  container.innerHTML = `

    <div class="prediction-grid">

      ${topCard}

      ${summaryCards}

    </div>


    <div class="top-suggestion-list">

      ${list}

    </div>


    <div class="warning-box">

      <strong>
        Predict V2.5
      </strong>

      <br><br>

      Nguồn:

      <strong>
        ${formatDate(
          data.sourceDate
        )}
      </strong>

      • Dự đoán:

      <strong>
        ${formatDate(
          data.predictionDate
        )}
      </strong>

      <br>

      Database:

      <strong>
        ${totalDraws} kỳ
      </strong>

      • Backtest:

      <strong>
        ${data.analyzedDraws} kỳ
      </strong>

      <br><br>

      Bộ lọc:

      cầu hiện tại 2–5 kỳ

      • ít nhất
      ${data.rule?.minSamples}
      cơ hội lịch sử

      • tỷ lệ tiếp diễn ≥
      ${
        data.rule
          ?.minContinuationRate
      }%.

      <br>

      Score chỉ dùng xếp hạng,
      không phải xác suất trúng.

    </div>
  `;
}


/*
========================================================
BRIDGE HISTORY
========================================================
*/

function renderBridgeHistory(
  history
) {

  if (
    !Array.isArray(history) ||
    !history.length
  ) {
    return "";
  }


  const rows =
    [...history]
      .reverse()
      .map(
        item => `

          <div class="bridge-history-item">

            ${formatDate(
              item.sourceDate
            )}

            →

            ${formatDate(
              item.targetDate
            )}

            :

            <strong>
              ${escapeHtml(
                item.number
              )}
            </strong>

            ✓

          </div>
        `
      )
      .join("");


  return `

    <div class="bridge-history">

      ${rows}

    </div>
  `;
}


function renderPredictionError(
  message,
  totalDraws = 0
) {

  const container =
    document.getElementById(
      "today-prediction"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <div class="loading-box">

      Predict V2.5 chưa tải được.

      <br>

      ${escapeHtml(message)}

    </div>


    <div class="warning-box">

      Database vẫn có

      <strong>
        ${totalDraws} kỳ
      </strong>.

    </div>
  `;
}


/*
========================================================
STATISTICS
========================================================
*/

function renderStatistics(data) {

  const container =
    document.getElementById(
      "analysis-detail"
    );


  if (!container) {
    return;
  }


  const numbers =
    Array.isArray(
      data.numbers
    )
      ? data.numbers
      : [];


  if (!numbers.length) {

    container.innerHTML = `

      <div class="loading-box">
        Chưa có dữ liệu thống kê.
      </div>
    `;

    return;
  }


  const ranked =
    numbers
      .map(
        item => {

          const score =

            Number(
              item.freq7 || 0
            ) * 5

            +

            Number(
              item.freq30 || 0
            ) * 2

            +

            Number(
              item.freq100 || 0
            ) * 0.2;


          return {

            ...item,

            score:
              Number(
                score.toFixed(1)
              )

          };
        }
      )

      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )

      .slice(
        0,
        10
      );


  let rows = "";


  ranked.forEach(
    (
      item,
      index
    ) => {

      const reverse =
        String(item.number)
          .split("")
          .reverse()
          .join("");


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
            ${item.gan}
          </td>

          <td>
            ${item.freq7}
          </td>

          <td>
            ${item.freq30}
          </td>

          <td>
            ${reverse}
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

      DATA:

      <strong>
        ${data.totalDraws || 0} kỳ
      </strong>

      • đến

      <strong>
        ${formatDate(
          data.latestDate
        )}
      </strong>.

    </div>
  `;
}


function renderStatisticsError(
  message
) {

  const container =
    document.getElementById(
      "analysis-detail"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <div class="loading-box">

      ${escapeHtml(message)}

    </div>
  `;
}


/*
========================================================
SYSTEM STATUS
========================================================
*/

function setSystemStatus(
  message,
  status
) {

  const element =
    document.getElementById(
      "system-status"
    );


  if (!element) {
    return;
  }


  element.textContent =
    message;


  element.className =
    `system-status ${status || ""}`;
}


/*
========================================================
DATE
========================================================
*/

function formatDate(value) {

  if (!value) {

    return "--/--/----";
  }


  const parts =
    String(value)
      .split("-");


  if (
    parts.length !== 3
  ) {

    return escapeHtml(value);
  }


  return (
    `${parts[2]}/` +
    `${parts[1]}/` +
    `${parts[0]}`
  );
}


/*
========================================================
ESCAPE
========================================================
*/

function escapeHtml(value) {

  return String(
    value ?? ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}


/*
========================================================
REFRESH
========================================================
*/

window.refreshAnalysis =
  async function () {

    const button =
      document.getElementById(
        "analyze-button"
      );


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Đang phân tích...";
    }


    try {

      await loadDashboard();

    } finally {

      if (button) {

        button.disabled =
          false;

        button.textContent =
          "Phân tích hôm nay";
      }
    }
  };


/*
========================================================
NAVIGATION
========================================================
*/

function setActiveNav(index) {

  const items =
    document.querySelectorAll(
      ".bottom-nav .nav-item"
    );


  items.forEach(
    (
      item,
      i
    ) => {

      item.classList.toggle(
        "active",
        i === index
      );
    }
  );
}


window.showPrediction =
  function () {

    setActiveNav(0);


    document
      .getElementById(
        "today-prediction"
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  };


window.showStatistics =
  function () {

    setActiveNav(1);


    document
      .getElementById(
        "analysis-detail"
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
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


/*
========================================================
TRACKING
========================================================
*/

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


    await loadPredictionHistory();


    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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


  if (
    !summary ||
    !table
  ) {
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
        `API ${response.status}`
      );
    }


    const data =
      await response.json();


    if (!data.success) {

      throw new Error(
        data.message ||
        "Không đọc được lịch sử."
      );
    }


    const s =
      data.summary || {};


    summary.innerHTML = `

      <div class="tracking-summary-grid">

        <div>

          <small>
            Kỳ hoàn thành
          </small>

          <strong>
            ${s.completed || 0}
          </strong>

        </div>


        <div>

          <small>
            Tổng lần về
          </small>

          <strong>
            ${s.totalHits || 0}
          </strong>

        </div>


        <div>

          <small>
            Tiền đánh
          </small>

          <strong>
            ${money(
              s.totalCost || 0
            )}
          </strong>

        </div>


        <div>

          <small>
            Tiền nhận
          </small>

          <strong>
            ${money(
              s.totalPayout || 0
            )}
          </strong>

        </div>


        <div>

          <small>
            Lãi/Lỗ
          </small>

          <strong
            class="${
              Number(
                s.totalProfit || 0
              ) >= 0

                ? "profit"

                : "loss"
            }"
          >

            ${
              Number(
                s.totalProfit || 0
              ) > 0

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
      Array.isArray(
        data.history
      )
        ? data.history
        : [];


    if (!history.length) {

      table.innerHTML = `

        <div class="loading-box">

          Chưa có lịch sử dự đoán.

        </div>
      `;

      return;
    }


    let rows = "";


    history.forEach(
      row => {

        const numbers =
          Array.isArray(
            row.numbers
          )
            ? row.numbers
            : [];


        const hits =
          numbers
            .map(
              number => {

                const count =

                  row.hitsByNumber?.[
                    number
                  ]

                  || 0;


                return (
                  `${escapeHtml(number)}: ` +
                  `${count} lần`
                );
              }
            )

            .join("<br>");


        const pending =
          row.status ===
          "pending";


        const profit =
          Number(
            row.profit || 0
          );


        rows += `

          <tr>

            <td>

              ${formatDate(
                row.date
              )}

            </td>


            <td>

              <strong>

                ${numbers
                  .map(
                    escapeHtml
                  )
                  .join(
                    " - "
                  )}

              </strong>

            </td>


            <td>

              ${
                pending
                  ? "Chưa xổ"
                  : hits
              }

            </td>


            <td>

              ${
                pending
                  ? "-"
                  : (
                      row.totalHits ||
                      0
                    )
              }

            </td>


            <td>

              ${money(
                row.cost
              )}

            </td>


            <td>

              ${
                pending
                  ? "-"
                  : money(
                      row.payout
                    )
              }

            </td>


            <td
              class="${
                profit >= 0
                  ? "profit"
                  : "loss"
              }"
            >

              ${
                pending

                  ? "-"

                  :
                  (
                    profit > 0
                      ? "+"
                      : ""
                  )
                  +
                  money(profit)
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
      "Tracking:",
      error
    );


    summary.innerHTML = `

      <div class="loading-box">

        ${escapeHtml(
          error.message
        )}

      </div>
    `;


    table.innerHTML = "";
  }
}


/*
========================================================
MONEY
========================================================
*/

function money(value) {

  return (

    new Intl.NumberFormat(
      "vi-VN"
    )
      .format(
        Number(value || 0)
      )

    +

    "đ"
  );
}


/*
========================================================
CẦU 5 CHỮ SỐ
MODULE ĐỘC LẬP
========================================================
*/

window.showFiveDigitBridge =
  async function () {

    const section =
      document.getElementById(
        "five-digit-section"
      );


    if (!section) {
      return;
    }


    section.style.display =
      "block";


    await loadFiveDigitBridge();


    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };


async function loadFiveDigitBridge() {

  const container =
    document.getElementById(
      "five-digit-content"
    );


  const badge =
    document.getElementById(
      "five-digit-date"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <div class="loading-box">

      Đang phân tích cầu 5 chữ số...

    </div>
  `;


  try {

    const response =
      await fetch(
        "/api/five-digit-bridge",
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `API ${response.status}`
      );
    }


    const data =
      await response.json();


    if (!data.success) {

      throw new Error(
        data.message ||
        "Không đọc được dữ liệu."
      );
    }


    if (badge) {

      badge.textContent =
        formatDate(
          data.sourceDate
        );
    }


    renderFiveDigitBridge(
      data,
      container
    );


  } catch (error) {

    console.error(
      "FiveDigit:",
      error
    );


    container.innerHTML = `

      <div class="loading-box">

        ${escapeHtml(
          error.message
        )}

      </div>
    `;
  }
}


function renderFiveDigitBridge(
  data,
  container
) {

  const signals =
    Array.isArray(
      data.signals
    )
      ? data.signals
      : [];


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ? data.suggestions
      : [];


  if (!signals.length) {

    container.innerHTML = `

      <div class="warning-box">

        <strong>
          ${formatDate(
            data.sourceDate
          )}
        </strong>

        không có tín hiệu
        cầu 5 chữ số phù hợp.

        <br>

        Đã đọc
        ${data.analyzedDraws || 0}
        kỳ.

      </div>
    `;

    return;
  }


  const topNumbers =
    suggestions
      .slice(0, 10)
      .map(
        item => `

          <span class="secondary-number">

            ${escapeHtml(
              item.number
            )}

          </span>
        `
      )
      .join("");


  const cards =
    signals
      .map(
        signal => {

          const status =
            signal.streak >= 2

              ? "Cầu chạy 2 ngày"

              : (
                  signal.streak === 1
                    ? "Cầu chạy 1 ngày"
                    : "Cầu mới"
                );


          return `

            <div class="prediction-card">

              <div class="prediction-title">

                ${escapeHtml(
                  signal.prizeLabel
                )}.${signal.index}

              </div>


              <div class="score">

                Nguồn:

                <strong>

                  ${escapeHtml(
                    signal.sourceNumber
                  )}

                </strong>

              </div>


              <div class="big-pair">

                ${escapeHtml(
                  signal.direct
                )}

                -

                ${escapeHtml(
                  signal.reverse
                )}

              </div>


              <div class="score">

                Pattern:

                ${escapeHtml(
                  signal.pattern
                )}

              </div>


              <div class="score">

                ${status}

              </div>

            </div>
          `;

        }
      )
      .join("");


  container.innerHTML = `

    <div class="warning-box">

      Nguồn:

      <strong>
        ${formatDate(
          data.sourceDate
        )}
      </strong>

      • Dự đoán:

      <strong>
        ${formatDate(
          data.predictionDate
        )}
      </strong>

    </div>


    <div class="secondary-numbers">

      ${topNumbers}

    </div>


    <div class="prediction-grid">

      ${cards}

    </div>


    <div class="warning-box">

      Module cầu 5 chữ số
      hoạt động độc lập với Predict V2.5.

    </div>
  `;
}