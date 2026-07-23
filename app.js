document.addEventListener(
  "DOMContentLoaded",
  function () {
    loadDashboard();
  }
);


/* =========================================
   DASHBOARD
========================================= */

async function loadDashboard() {
  setSystemStatus(
    "Đang kết nối cơ sở dữ liệu...",
    ""
  );

  try {
    /*
      Latest + Statistics là dữ liệu chính.

      Predict được xử lý độc lập để nếu
      thuật toán dự đoán gặp lỗi thì
      dashboard vẫn hiển thị 199 kỳ.
    */

    const [
      latestRes,
      statisticsRes
    ] = await Promise.all([
      fetch("/api/latest", {
        cache: "no-store"
      }),

      fetch("/api/statistics", {
        cache: "no-store"
      })
    ]);


    if (!latestRes.ok) {
      throw new Error(
        `Latest API lỗi ${latestRes.status}`
      );
    }


    if (!statisticsRes.ok) {
      throw new Error(
        `Statistics API lỗi ${statisticsRes.status}`
      );
    }


    const latest =
      await latestRes.json();

    const statistics =
      await statisticsRes.json();


    if (!latest.success) {
      throw new Error(
        latest.message ||
        "Không đọc được kết quả mới nhất"
      );
    }


    if (!statistics.success) {
      throw new Error(
        statistics.message ||
        "Không đọc được thống kê"
      );
    }


    /*
      Hiển thị kết quả trước.
    */

    renderLatest(latest);


    /*
      Tổng số kỳ lấy từ Statistics.
    */

    const totalDraws =
      Number(
        statistics.totalDraws || 0
      );


    updateTotalDraws(
      totalDraws
    );


    renderStatistics(
      statistics
    );


    setSystemStatus(
      `Đã kết nối D1 • ${totalDraws} kỳ dữ liệu`,
      "success"
    );


    /*
      Predict tải riêng.

      Nếu Predict lỗi:
      KHÔNG làm hỏng toàn dashboard.
    */

    await loadPrediction(
      totalDraws
    );


  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );


    setSystemStatus(
      "Lỗi tải dữ liệu: " +
      error.message,
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
  }
}


/* =========================================
   LOAD PREDICT RIÊNG
========================================= */

async function loadPrediction(
  totalDraws
) {
  const container =
    document.getElementById(
      "today-prediction"
    );


  if (container) {
    container.innerHTML = `
      <div class="loading-box">
        Đang dò cầu vị trí...
      </div>
    `;
  }


  try {
    const response =
      await fetch(
        "/api/predict?minStreak=2",
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        `Predict API lỗi ${response.status}`
      );
    }


    const data =
      await response.json();


    renderPrediction(
      data,
      totalDraws
    );


  } catch (error) {
    console.error(
      "Predict error:",
      error
    );


    if (container) {
      container.innerHTML = `
        <div class="loading-box">
          Chưa tải được phân tích cầu.
        </div>

        <div class="warning-box">
          Database vẫn hoạt động:
          <strong>
            ${totalDraws} kỳ
          </strong>.
          <br>
          Predict:
          ${escapeHtml(
            error.message
          )}
        </div>
      `;
    }
  }
}


/* =========================================
   UPDATE DATA HEADER
========================================= */

function updateTotalDraws(
  totalDraws
) {
  const possibleIds = [
    "header-total-draws",
    "total-draws",
    "data-count"
  ];


  for (const id of possibleIds) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        `${totalDraws} kỳ`;
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


  const r =
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
   DỰ ĐOÁN CẦU
========================================= */

function renderPrediction(
  data,
  totalDraws = 0
) {
  const container =
    document.getElementById(
      "today-prediction"
    );


  if (!container) {
    return;
  }


  if (!data?.success) {
    container.innerHTML = `
      <div class="loading-box">
        Chưa có phân tích cầu hợp lệ.
      </div>

      <div class="warning-box">
        ${escapeHtml(
          data?.message ||
          "Không tìm được cầu."
        )}

        <br>

        Database:
        <strong>
          ${totalDraws} kỳ
        </strong>
      </div>
    `;

    return;
  }


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ? data.suggestions
      : [];


  if (!suggestions.length) {
    container.innerHTML = `
      <div class="loading-box">

        Hiện chưa phát hiện cầu vị trí
        đang chạy từ

        <strong>
          ${data.minStreak || 2}
        </strong>

        kỳ trở lên.

      </div>


      <div class="warning-box">

        Phân tích cho:

        <strong>
          ${formatDate(
            data.predictionDate
          )}
        </strong>

        <br>

        Database:
        ${totalDraws} kỳ

        • Dò cầu trên:
        ${data.analyzedDraws || 0} kỳ gần nhất

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


  const secondary =
    top.slice(
      1,
      6
    );


  const bestBridge =
    Array.isArray(
      top1?.bridges
    )
      ? top1.bridges[0]
      : null;


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

          Cầu chạy:

          <strong>
            ${top1?.bestStreak || 0}
            kỳ
          </strong>

        </div>

        <div class="score">

          ${top1?.bridgeCount || 0}
          cầu vị trí cùng chỉ

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Top tiếp theo
        </div>

        <div class="secondary-numbers">

          ${secondary
            .map(
              item => `
                <span
                  class="secondary-number"
                >
                  ${item.number}
                </span>
              `
            )
            .join("")}

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Cầu mạnh nhất
        </div>

        <div class="score">

          ${
            bestBridge
              ? `
                ${bestBridge.positionA}
                +
                ${bestBridge.positionB}
              `
              : "--"
          }

        </div>

        <div class="score">

          ${
            bestBridge
              ? `
                ${bestBridge.direction}

                • chạy

                ${bestBridge.streak}
                kỳ
              `
              : ""
          }

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Cầu hoạt động
        </div>

        <div class="big-number">
          ${data.activeBridgeCount || 0}
        </div>

        <div class="score">
          cầu vị trí
        </div>

      </div>


    </div>


    <div class="top-suggestion-list">

      ${top
        .map(
          (item, index) => `
            <div class="suggestion-row">

              <strong>
                #${index + 1}
                &nbsp;
                ${item.number}
              </strong>

              <span>

                ${item.bestStreak}
                kỳ

                •

                ${item.bridgeCount}
                cầu

              </span>

            </div>
          `
        )
        .join("")}

    </div>


    <div class="warning-box">

      Phân tích cầu cho

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

      • ${data.analyzedDraws || 0}
      kỳ gần nhất dùng để dò cầu.

      <br>

      Điểm/cầu chỉ dùng để
      xếp hạng tín hiệu,
      không phải xác suất trúng.

    </div>
  `;
}


/* =========================================
   THỐNG KÊ
========================================= */

function renderStatistics(data) {
  const container =
    document.getElementById(
      "analysis-detail"
    );


  if (!container) {
    return;
  }


  const numbers =
    Array.isArray(data.numbers)
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


  /*
    Điểm chỉ dùng xếp hạng
    thống kê hiện tại.
  */

  const ranked =
    numbers
      .map(item => {

        const score =
          (
            Number(
              item.freq7 || 0
            ) * 5
          )
          +
          (
            Number(
              item.freq30 || 0
            ) * 2
          )
          +
          (
            Number(
              item.freq100 || 0
            ) * 0.2
          );


        return {
          ...item,

          score:
            Number(
              score.toFixed(1)
            )
        };

      })
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(
        0,
        10
      );


  let rows = "";


  ranked.forEach(
    (item, index) => {

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

      Dữ liệu:

      <strong>
        ${data.totalDraws || 0} kỳ
      </strong>

      • cập nhật đến

      <strong>
        ${formatDate(
          data.latestDate
        )}
      </strong>.

      <br>

      Điểm thống kê chỉ dùng
      để xếp hạng,
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


  if (!element) {
    return;
  }


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


  const text =
    String(value);


  const parts =
    text.split("-");


  if (parts.length !== 3) {
    return text;
  }


  return (
    `${parts[2]}/${parts[1]}/${parts[0]}`
  );
}


/* =========================================
   ESCAPE HTML
========================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
   NAVIGATION
========================================= */

function setActiveNav(index) {
  const items =
    document.querySelectorAll(
      ".bottom-nav .nav-item"
    );


  items.forEach(
    (item, i) => {

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

    setActiveNav(3);

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
   TRACKING
========================================= */

window.showTracking =
  async function () {

    setActiveNav(2);


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
          Array.isArray(row.numbers)
            ? row.numbers
            : [];


        const hits =
          numbers
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
                ${numbers.join(
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
                Number(
                  row.profit || 0
                ) >= 0
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
                    Number(
                      row.profit || 0
                    ) > 0
                      ? "+"
                      : ""
                  )
                  +
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
      `Không tải được dữ liệu: ${
        escapeHtml(
          error.message
        )
      }`;


    table.innerHTML = "";
  }
}


/* =========================================
   MONEY
========================================= */

function money(value) {
  return new Intl.NumberFormat(
    "vi-VN"
  ).format(
    Number(value || 0)
  ) + "đ";
}/* =================================================
   CẦU 5 CHỮ SỐ
   Module độc lập
================================================= */


window.showFiveDigitBridge =
  async function () {

    const section =
      document.getElementById(
        "five-digit-section"
      );


    if (!section) {
      console.error(
        "Không tìm thấy five-digit-section"
      );

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


  const dateBadge =
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
        `API lỗi ${response.status}`
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


    if (dateBadge) {

      dateBadge.textContent =
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
      "Five digit bridge:",
      error
    );


    container.innerHTML = `

      <div class="loading-box">

        Không tải được cầu 5 chữ số.

        <br><br>

        ${escapeFiveDigit(
          error.message
        )}

      </div>

    `;
  }
}


/* =================================================
   RENDER
================================================= */

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


  /*
  Không có tín hiệu.
  */

  if (!signals.length) {

    container.innerHTML = `

      <div class="warning-box">

        <strong>
          ${formatDate(
            data.sourceDate
          )}
        </strong>

        không xuất hiện tín hiệu
        cầu 5 chữ số phù hợp.

        <br><br>

        Đã phân tích
        ${data.analyzedDraws || 0}
        kỳ gần nhất.

      </div>

    `;

    return;
  }


  /*
  ================================================
  DÀN ƯU TIÊN
  ================================================
  */

  const topSuggestions =
    suggestions.slice(
      0,
      10
    );


  const suggestionHTML =
    topSuggestions
      .map(
        item => `

          <span
            class="secondary-number"
            title="
              ${item.signalCount}
              tín hiệu
            "
          >

            ${escapeFiveDigit(
              item.number
            )}

          </span>

        `
      )
      .join("");


  /*
  ================================================
  CARD TỪNG CẦU
  ================================================
  */

  let cards = "";


  signals.forEach(
    signal => {

      let status =
        "Cầu mới";


      if (
        signal.streak === 1
      ) {

        status =
          "Cầu chạy 1 ngày";
      }


      if (
        signal.streak >= 2
      ) {

        status =
          "Cầu chạy 2 ngày";
      }


      const patternRate =
        signal.patternStats?.rate;


      const positionRate =
        signal.positionStats?.rate;


      cards += `

        <div class="prediction-card">

          <div class="prediction-title">

            ${escapeFiveDigit(
              signal.prizeLabel
            )}.${signal.index}

          </div>


          <div class="score">

            Nguồn:

            <strong>
              ${escapeFiveDigit(
                signal.sourceNumber
              )}
            </strong>

          </div>


          <div class="big-pair">

            ${escapeFiveDigit(
              signal.direct
            )}

            -

            ${escapeFiveDigit(
              signal.reverse
            )}

          </div>


          <div class="score">

            Pattern:

            <strong>
              ${escapeFiveDigit(
                signal.pattern
              )}
            </strong>

          </div>


          <div class="score">

            ${status}

          </div>


          <div class="score">

            Pattern lịch sử:

            ${
              patternRate === null ||
              patternRate === undefined

                ? "Chưa đủ dữ liệu"

                :
                `${patternRate}%`
            }

          </div>


          <div class="score">

            Vị trí lịch sử:

            ${
              positionRate === null ||
              positionRate === undefined

                ? "Chưa đủ dữ liệu"

                :
                `${positionRate}%`
            }

          </div>


          <div class="score">

            Điểm:

            <strong>
              ${signal.score}
            </strong>

          </div>

        </div>

      `;
    }
  );


  /*
  ================================================
  HTML
  ================================================
  */

  container.innerHTML = `

    <div class="warning-box">

      Nguồn:

      <strong>
        ${formatDate(
          data.sourceDate
        )}
      </strong>

      <br>

      Dự đoán kỳ:

      <strong>
        ${formatDate(
          data.predictionDate
        )}
      </strong>

      <br>

      Theo dõi tối đa:

      <strong>
        ${formatDate(
          data.secondPredictionDate
        )}
      </strong>

      <br>

      Phân tích:
      ${data.analyzedDraws || 0}
      kỳ

    </div>


    <div class="section-header">

      <div>

        <div class="section-label">
          DÀN CẦU
        </div>

        <h3>
          Số ưu tiên
        </h3>

      </div>

    </div>


    <div class="secondary-numbers">

      ${suggestionHTML}

    </div>


    <div class="section-header">

      <div>

        <div class="section-label">
          CHI TIẾT
        </div>

        <h3>
          Các cầu đang có
        </h3>

      </div>

    </div>


    <div class="prediction-grid">

      ${cards}

    </div>


    <div class="warning-box">

      Chỉ xét ĐB, G1, G2 và G3.

      <br>

      Điều kiện:
      số có đúng 5 chữ số và
      chỉ chứa 2 chữ số khác nhau.

      <br>

      Ví dụ:
      66606 → 06 - 60.

      <br><br>

      Điểm chỉ dùng để xếp hạng
      tín hiệu, không phải xác suất trúng.

    </div>

  `;
}


/* =================================================
   ESCAPE
================================================= */

function escapeFiveDigit(value) {

  return String(
    value ?? ""
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}