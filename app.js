/*
========================================================
XSMB ANALYTICS FRONTEND
Compatible: Bridge V2.3
========================================================
*/


document.addEventListener(
  "DOMContentLoaded",
  function () {

    loadDashboard();

  }
);


/*
========================================================
LOAD DASHBOARD
========================================================
*/

async function loadDashboard() {

  setSystemStatus(
    "Đang kết nối cơ sở dữ liệu...",
    ""
  );


  try {

    /*
    Latest và Predict độc lập.

    Nếu predict lỗi thì vẫn cố đọc latest.
    */

    const [
      latestResult,
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
          "/api/predict",
          {
            cache: "no-store"
          }
        )

      ]);


    /*
    ====================================================
    LATEST
    ====================================================
    */

    let latest = null;


    if (
      latestResult.status ===
      "fulfilled"
    ) {

      const response =
        latestResult.value;


      if (response.ok) {

        latest =
          await response.json();


        if (latest.success) {

          renderLatest(
            latest
          );

        } else {

          renderLatestError(
            latest.message ||
            "Không đọc được kết quả."
          );
        }

      } else {

        renderLatestError(
          `Latest API lỗi ${response.status}`
        );
      }

    } else {

      renderLatestError(
        "Không kết nối được Latest API."
      );
    }


    /*
    ====================================================
    PREDICT
    ====================================================
    */

    let predict = null;


    if (
      predictResult.status ===
      "fulfilled"
    ) {

      const response =
        predictResult.value;


      if (response.ok) {

        predict =
          await response.json();


        if (predict.success) {

          renderPrediction(
            predict
          );


          renderStatistics(
            predict
          );

        } else {

          renderPredictionError(
            predict.message ||
            "Không đọc được phân tích."
          );


          renderStatisticsError(
            predict.message ||
            "Không có dữ liệu."
          );
        }

      } else {

        renderPredictionError(
          `Predict API lỗi ${response.status}`
        );


        renderStatisticsError(
          `Predict API lỗi ${response.status}`
        );
      }

    } else {

      renderPredictionError(
        "Không kết nối được Predict API."
      );


      renderStatisticsError(
        "Không kết nối được Predict API."
      );
    }


    /*
    ====================================================
    HEADER TOTAL DRAWS

    /api/predict hiện chỉ phân tích một số kỳ gần nhất,
    nên không gọi analyzedDraws là tổng database.
    ====================================================
    */

    const headerDraws =
      document.getElementById(
        "header-total-draws"
      );


    if (headerDraws) {

      if (
        latest?.totalDraws !==
        undefined
      ) {

        headerDraws.textContent =
          `${latest.totalDraws} kỳ`;

      } else if (
        predict?.analyzedDraws !==
        undefined
      ) {

        headerDraws.textContent =
          `${predict.analyzedDraws} kỳ phân tích`;

      } else {

        headerDraws.textContent =
          "--";
      }
    }


    /*
    ====================================================
    STATUS
    ====================================================
    */

    if (
      latest?.success &&
      predict?.success
    ) {

      setSystemStatus(
        `Đã kết nối • Cầu V2.3 • ${predict.signalCount || 0} tín hiệu`,
        "success"
      );

    } else if (
      latest?.success
    ) {

      setSystemStatus(
        "Đã tải kết quả • Phân tích cầu đang lỗi",
        "error"
      );

    } else {

      setSystemStatus(
        "Không tải được dữ liệu",
        "error"
      );
    }

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
  }
}


/*
========================================================
KẾT QUẢ XSMB
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


  if (badge) {

    badge.textContent =
      formatDate(
        data.drawDate
      );
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
          : [values];


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


function renderLatestError(
  message
) {

  const container =
    document.getElementById(
      "latest-result"
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
DỰ ĐOÁN V2.3
========================================================
*/

function renderPrediction(data) {

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
  ======================================================
  KHÔNG CÓ CẦU

  Đây không phải lỗi.

  Có thể hôm nay không tồn tại
  cầu 2/3 kỳ hợp lệ.
  ======================================================
  */

  if (!suggestions.length) {

    container.innerHTML = `

      <div class="loading-box">

        Không có cầu vị trí
        đang chạy đúng 2–3 kỳ
        sát kỳ hiện tại.

      </div>


      <div class="warning-box">

        Nguồn:
        <strong>
          ${formatDate(
            data.sourceDate
          )}
        </strong>

        <br>

        Dự đoán:
        <strong>
          ${formatDate(
            data.predictionDate
          )}
        </strong>

        <br>

        Cầu gãy và cầu từ
        4 kỳ trở lên đã bị loại.

      </div>

    `;

    return;
  }


  /*
  ======================================================
  TOP 1

  Mỗi item = 1 cầu cụ thể.
  ======================================================
  */

  const top1 =
    suggestions[0];


  /*
  ======================================================
  DANH SÁCH TOP

  Hiển thị tối đa 15 cầu.
  ======================================================
  */

  const top =
    suggestions.slice(
      0,
      15
    );


  container.innerHTML = `

    <div class="prediction-grid">


      <!-- TOP 1 -->

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

          Chạy liên tục:

          <strong>
            ${top1.streak} kỳ
          </strong>

        </div>


        <div class="score">

          ${escapeHtml(
            top1.bridge
          )}

        </div>


        <div class="score">

          Chiều:
          <strong>
            ${escapeHtml(
              top1.direction
            )}
          </strong>

        </div>

      </div>


      <!-- CẦU 3 KỲ -->

      <div class="prediction-card">

        <div class="prediction-title">
          Cầu 3 kỳ
        </div>


        <div class="big-number">

          ${
            Array.isArray(
              data.groups?.priority3
            )
              ? data.groups
                  .priority3
                  .length
              : 0
          }

        </div>


        <div class="score">
          Nhóm ưu tiên cao nhất
        </div>

      </div>


      <!-- CẦU 2 KỲ -->

      <div class="prediction-card">

        <div class="prediction-title">
          Cầu 2 kỳ
        </div>


        <div class="big-number">

          ${
            Array.isArray(
              data.groups?.running2
            )
              ? data.groups
                  .running2
                  .length
              : 0
          }

        </div>


        <div class="score">
          Nhóm đang chạy
        </div>

      </div>


      <!-- SỐ KHÁC NHAU -->

      <div class="prediction-card">

        <div class="prediction-title">
          Số được chỉ
        </div>


        <div class="big-number">

          ${
            data.uniqueNumberCount ||
            0
          }

        </div>


        <div class="score">
          Số khác nhau
        </div>

      </div>

    </div>


    <!-- DANH SÁCH CẦU -->

    <div class="top-suggestion-list">

      ${top
        .map(
          (
            item,
            index
          ) => {

            return `

              <div
                class="
                  suggestion-row
                  bridge-row
                "
              >

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

                  <strong>
                    ${item.streak} kỳ
                  </strong>

                  &nbsp;•&nbsp;

                  ${escapeHtml(
                    item.bridge
                  )}

                </div>


                <div>

                  Chiều:
                  ${escapeHtml(
                    item.direction
                  )}

                </div>


                ${renderBridgeHistory(
                  item.history
                )}

              </div>

            `;

          }
        )
        .join("")}

    </div>


    <div class="warning-box">

      <strong>
        Logic cầu V2.3
      </strong>

      <br><br>

      Mỗi dòng là
      <strong>
        một cặp vị trí cố định
      </strong>.

      <br>

      Chỉ giữ cầu chạy liên tục
      <strong>
        2 hoặc 3 kỳ
      </strong>
      sát dữ liệu mới nhất.

      <br>

      Cầu đã gãy hoặc chạy từ
      <strong>
        4 kỳ
      </strong>
      trở lên không được gợi ý.

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

    </div>

  `;
}


/*
========================================================
LỊCH SỬ CỦA MỘT CẦU

Ví dụ:

21/07 → 22/07 : 27 ✓
22/07 → 23/07 : 63 ✓
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


  /*
  API đang lưu từ mới -> cũ.

  reverse() để giao diện đọc
  theo thứ tự thời gian.
  */

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
  message
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

      Không tải được phân tích cầu.

      <br>

      ${escapeHtml(message)}

    </div>

  `;
}


/*
========================================================
CHI TIẾT PHÂN TÍCH
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


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ? data.suggestions.slice(
          0,
          20
        )
      : [];


  if (!suggestions.length) {

    container.innerHTML = `

      <div class="loading-box">

        Không có cầu 2–3 kỳ
        hợp lệ ở kỳ hiện tại.

      </div>

    `;

    return;
  }


  let rows = "";


  suggestions.forEach(
    (
      item,
      index
    ) => {

      rows += `

        <tr>

          <td>
            ${index + 1}
          </td>

          <td class="number-cell">

            <strong>
              ${escapeHtml(
                item.number
              )}
            </strong>

          </td>

          <td>

            <strong>
              ${item.streak}
            </strong>

          </td>

          <td>

            ${escapeHtml(
              item.positionA
            )}

          </td>

          <td>

            ${escapeHtml(
              item.positionB
            )}

          </td>

          <td>

            ${escapeHtml(
              item.direction
            )}

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

            <th>
              Số
            </th>

            <th>
              Kỳ
            </th>

            <th>
              Vị trí A
            </th>

            <th>
              Vị trí B
            </th>

            <th>
              Ghép
            </th>

          </tr>

        </thead>


        <tbody>

          ${rows}

        </tbody>

      </table>

    </div>


    <div class="warning-box">

      Mỗi hàng là một cầu vị trí
      độc lập.

      Không cộng nhiều vị trí
      khác nhau thành một cầu.

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
STATUS
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

    return escapeHtml(
      value
    );
  }


  return (
    `${parts[2]}/` +
    `${parts[1]}/` +
    `${parts[0]}`
  );
}


/*
========================================================
ESCAPE HTML
========================================================
*/

function escapeHtml(value) {

  if (
    value === undefined ||
    value === null
  ) {

    return "";
  }


  return String(value)
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
BOTTOM NAV
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


/*
========================================================
SHOW PREDICTION
========================================================
*/

window.showPrediction =
  function () {

    setActiveNav(0);


    document
      .getElementById(
        "today-prediction"
      )
      ?.scrollIntoView({

        behavior:
          "smooth",

        block:
          "start"

      });
  };


/*
========================================================
SHOW STATISTICS
========================================================
*/

window.showStatistics =
  function () {

    setActiveNav(1);


    document
      .getElementById(
        "analysis-detail"
      )
      ?.scrollIntoView({

        behavior:
          "smooth",

        block:
          "start"

      });
  };


/*
========================================================
TRACKING
========================================================
*/

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

      behavior:
        "smooth",

      block:
        "start"

    });
  };


/*
========================================================
BACKTEST
========================================================
*/

window.showBacktest =
  function () {

    setActiveNav(3);


    window.open(
      "/api/backtest?days=100",
      "_blank"
    );
  };


/*
========================================================
HISTORY
========================================================
*/

window.showHistory =
  function () {

    alert(
      "Trang lịch sử đang được phát triển."
    );
  };


/*
========================================================
PREDICTION HISTORY
========================================================
*/

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


  summary.innerHTML = `

    <div class="loading-box">
      Đang tải lịch sử...
    </div>

  `;


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
                s.totalProfit ||
                0
              ) >= 0
                ? "profit"
                : "loss"
            }"
          >

            ${
              Number(
                s.totalProfit ||
                0
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
                  ] || 0;


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
                    money(
                      profit
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

              <th>
                Ngày
              </th>

              <th>
                Dàn số
              </th>

              <th>
                Kết quả
              </th>

              <th>
                Lần về
              </th>

              <th>
                Tiền đánh
              </th>

              <th>
                Tiền nhận
              </th>

              <th>
                Lãi/Lỗ
              </th>

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


    summary.innerHTML = `

      <div class="loading-box">

        Không tải được dữ liệu:

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