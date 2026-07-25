/*
========================================================
XSMB ANALYTICS FRONTEND
V2.6.1 CALIBRATION
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
  LATEST
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
          "Latest lỗi"
        );
      }


      renderLatest(data);

    } catch (error) {

      renderLatestError(
        error.message
      );
    }
  }


  /*
  STATISTICS
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
          `Statistics ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Statistics lỗi"
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

      renderStatisticsError(
        error.message
      );
    }
  }


  /*
  PREDICT
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
          `Predict ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Predict lỗi"
        );
      }



      setSystemStatus(

        `D1 ${totalDraws} kỳ • V2.6.1 • ` +

        `${data.counts?.veryStrong || 0} rất mạnh • ` +

        `${data.counts?.strong || 0} mạnh`,

        "success"
      );

    } catch (error) {

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


  const date =
    data.drawDate ||
    data.draw_date ||
    data.date;


  if (badge) {

    badge.textContent =
      formatDate(date);
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

          <div class="prize-values cols-${columns}">

            ${list
              .filter(Boolean)
              .map(
                value => `

                  <span class="prize-number">

                    ${escapeHtml(value)}

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
PREDICTION
========================================================
*/

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


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ? data.suggestions
      : [];


  const strengthName =
    value => {

      if (
        value === "very-strong"
      ) {
        return "RẤT MẠNH";
      }


      if (
        value === "strong"
      ) {
        return "MẠNH";
      }


      return "ĐẠT CHUẨN";
    };


  const recentName =
    value => {

      if (
        value === "active"
      ) {
        return "Gần đây: tốt";
      }


      if (
        value === "limited"
      ) {
        return "Gần đây: ít mẫu";
      }


      return "Chỉ mạnh lịch sử";
    };


  /*
  Không có prediction đủ chuẩn.
  */

  if (!suggestions.length) {

    container.innerHTML = `

      <div class="loading-box">

        Hôm nay chưa có cầu đủ
        tiêu chuẩn dự đoán V2.6.2.

      </div>


      <div class="warning-box">

        Cầu đang sống:

        <strong>
          ${data.activeCandidateCount || 0}
        </strong>

        <br>

        Qua kiểm định:

        <strong>
          ${data.qualifiedCount || 0}
        </strong>

        <br>

        Chỉ có giá trị lịch sử:

        <strong>
          ${data.historicalOnlyCount || 0}
        </strong>

        <br>

        Gợi ý hiện tại:

        <strong>
          0
        </strong>

      </div>

    `;

    return;
  }


  const top =
    suggestions.slice(
      0,
      10
    );


  const best =
    top[0];


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

              &nbsp;

              ${strengthName(
                item.strength
              )}

            </div>


            <div>

              ${escapeHtml(
                item.bridge
              )}

            </div>


            <div>

              Cầu:

              <strong>
                ${item.streak} kỳ
              </strong>

              • ${recentName(
                item.recentStatus
              )}

              • mẫu 60 kỳ:
              ${item.recentSamples}

            </div>


            <div>

              Lịch sử:

              <strong>

                ${item.continued}
                /
                ${item.opportunities}

              </strong>

              =
              ${item.continuationRate}%

            </div>


            <div>

              Baseline:
              ${item.baselineRate}%

              • Edge:

              <strong>

                ${
                  item.edge >= 0
                    ? "+"
                    : ""
                }

                ${item.edge}%

              </strong>

            </div>


            <div>

              Wilson:
              ${item.wilsonLowerBound}%

              • Wilson Edge:

              <strong>

                ${
                  item.wilsonEdge >= 0
                    ? "+"
                    : ""
                }

                ${item.wilsonEdge}%

              </strong>

            </div>


            <div>

              30 kỳ:
              ${item.rate30}%
              (${item.samples30})

              • 60:
              ${item.rate60}%
              (${item.samples60})

              • 100:
              ${item.rate100}%
              (${item.samples100})

            </div>


            <div>

              Stability:
              ${item.stabilityScore}

              • Independent:
              ${item.independentConsensus}

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
            best.number
          )}

        </div>


        <div class="score">

          ${strengthName(
            best.strength
          )}

        </div>


        <div class="score">

          ${escapeHtml(
            best.bridge
          )}

        </div>


        <div class="score">

          Cầu hiện tại:

          <strong>
            ${best.streak} kỳ
          </strong>

        </div>


        <div class="score">

          ${recentName(
            best.recentStatus
          )}

          • ${best.recentSamples}
          mẫu / 60 kỳ

        </div>


        <div class="score">

          ${best.continued}
          /
          ${best.opportunities}

          =

          <strong>
            ${best.continuationRate}%
          </strong>

        </div>


        <div class="score">

          Wilson Edge:

          <strong>

            ${
              best.wilsonEdge >= 0
                ? "+"
                : ""
            }

            ${best.wilsonEdge}%

          </strong>

        </div>


        <div class="score">

          Score:

          <strong>
            ${best.score}
          </strong>

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Rất mạnh
        </div>

        <div class="big-number">

          ${data.counts?.veryStrong || 0}

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Mạnh
        </div>

        <div class="big-number">

          ${data.counts?.strong || 0}

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">
          Gợi ý
        </div>

        <div class="big-number">

          ${data.recommendationCount || 0}

        </div>

        <div class="score">

          Historical loại:
          ${data.historicalOnlyCount || 0}

        </div>

      </div>

    </div>


    <div class="top-suggestion-list">

      ${list}

    </div>


    <div class="warning-box">

      <strong>
        Predict V2.6.2
      </strong>

      <br><br>

      Nguồn:

      <strong>
        ${formatDate(
          data.sourceDate
        )}
      </strong>

      • dự đoán:

      <strong>
        ${formatDate(
          data.predictionDate
        )}
      </strong>

      <br>

      Database:
      ${totalDraws} kỳ

      • kiểm định:
      ${data.analyzedDraws} kỳ

      • baseline:
      ${data.baselineRate}%

      <br><br>

      Điều kiện mặc định:

      ≥ ${data.rule?.minSamples} mẫu

      • rate ≥
      ${data.rule?.minContinuationRate}%

      • edge ≥
      ${data.rule?.minEdgeVsBaseline}%

      • Wilson Edge ≥
      ${data.rule?.minWilsonEdge}%

      <br>

      Cầu không đủ bằng chứng trong
      60 kỳ gần nhất được chuyển sang
      nhóm lịch sử và không dùng
      làm gợi ý hôm nay.

    </div>

  `;
}
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


  if (!suggestions.length) {

    container.innerHTML = `

      <div class="loading-box">

        Hôm nay chưa có cầu
        vượt bộ lọc V2.6.1.

      </div>


      <div class="warning-box">

        Cầu đang sống:

        <strong>
          ${data.activeCandidateCount || 0}
        </strong>

        <br>

        Thiếu sample:

        <strong>
          ${data.rejected?.insufficientSamples || 0}
        </strong>

        <br>

        Rate thấp:

        <strong>
          ${data.rejected?.lowRate || 0}
        </strong>

        <br>

        Edge thấp:

        <strong>
          ${data.rejected?.lowEdge || 0}
        </strong>

        <br>

        Wilson Edge thấp:

        <strong>
          ${data.rejected?.lowWilsonEdge || 0}
        </strong>

      </div>
    `;

    return;
  }


  const top =
    suggestions.slice(
      0,
      10
    );


  const best =
    top[0];


  const strengthName =
    value => {

      if (
        value ===
        "very-strong"
      ) {

        return "RẤT MẠNH";
      }


      if (
        value ===
        "strong"
      ) {

        return "MẠNH";
      }


      return "ĐẠT CHUẨN";
    };


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

              &nbsp;

              ${strengthName(
                item.strength
              )}

            </div>


            <div>

              ${escapeHtml(
                item.bridge
              )}

            </div>


            <div>

              Cầu hiện tại:

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

              =
              ${item.continuationRate}%

            </div>


            <div>

              Baseline:

              ${item.baselineRate}%

              • Edge:

              <strong>

                ${
                  item.edge >= 0
                    ? "+"
                    : ""
                }

                ${item.edge}%

              </strong>

            </div>


            <div>

              Wilson:

              ${item.wilsonLowerBound}%

              • Wilson Edge:

              <strong>

                ${
                  item.wilsonEdge >= 0
                    ? "+"
                    : ""
                }

                ${item.wilsonEdge}%

              </strong>

            </div>


            <div>

              30:
              ${item.rate30}%
              (${item.samples30})

              • 60:
              ${item.rate60}%
              (${item.samples60})

              • 100:
              ${item.rate100}%
              (${item.samples100})

            </div>


            <div>

              Stability:

              ${item.stabilityScore}

              • Independent:

              ${item.independentConsensus}

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
            best.number
          )}

        </div>


        <div class="score">

          ${strengthName(
            best.strength
          )}

        </div>


        <div class="score">

          ${escapeHtml(
            best.bridge
          )}

        </div>


        <div class="score">

          ${best.continued}
          /
          ${best.opportunities}

          =

          <strong>
            ${best.continuationRate}%
          </strong>

        </div>


        <div class="score">

          Edge:

          <strong>

            ${
              best.edge >= 0
                ? "+"
                : ""
            }

            ${best.edge}%

          </strong>

        </div>


        <div class="score">

          Wilson Edge:

          <strong>

            ${
              best.wilsonEdge >= 0
                ? "+"
                : ""
            }

            ${best.wilsonEdge}%

          </strong>

        </div>


        <div class="score">

          Score:
          <strong>
            ${best.score}
          </strong>

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">

          Rất mạnh

        </div>

        <div class="big-number">

          ${data.counts?.veryStrong || 0}

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">

          Mạnh

        </div>

        <div class="big-number">

          ${data.counts?.strong || 0}

        </div>

      </div>


      <div class="prediction-card">

        <div class="prediction-title">

          Tổng đạt lọc

        </div>

        <div class="big-number">

          ${data.qualifiedCount || 0}

        </div>

      </div>

    </div>


    <div class="top-suggestion-list">

      ${list}

    </div>


    <div class="warning-box">

      <strong>
        Predict V2.6.1 Calibration
      </strong>

      <br><br>

      DATA:
      ${totalDraws} kỳ

      • Backtest:
      ${data.analyzedDraws} kỳ

      • Baseline:
      ${data.baselineRate}%

      <br>

      Bộ lọc mặc định:

      ≥ ${data.rule?.minSamples}
      mẫu

      • rate ≥
      ${data.rule?.minContinuationRate}%

      • edge ≥
      ${data.rule?.minEdgeVsBaseline}%

      <br><br>

      Score không phải xác suất trúng.

    </div>
  `;
}


/*
========================================================
HISTORY
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


  return `

    <div class="bridge-history">

      ${[...history]
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
        .join("")}

    </div>
  `;
}


function renderPredictionError(
  message,
  totalDraws
) {

  const element =
    document.getElementById(
      "today-prediction"
    );


  if (!element) {
    return;
  }


  element.innerHTML = `

    <div class="loading-box">

      ${escapeHtml(message)}

    </div>

    <div class="warning-box">

      Database:

      ${totalDraws || 0} kỳ

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

    container.innerHTML =
      "Chưa có dữ liệu thống kê.";

    return;
  }


  const ranked =
    numbers
      .map(
        item => ({

          ...item,

          score:
            Number(
              (
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
                ) * 0.2
              )
              .toFixed(1)
            )

        })
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


  const rows =
    ranked
      .map(
        (
          item,
          index
        ) => {

          const reverse =
            String(
              item.number
            )
              .split("")
              .reverse()
              .join("");


          return `

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
      )
      .join("");


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
  `;
}


function renderStatisticsError(
  message
) {

  const element =
    document.getElementById(
      "analysis-detail"
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
HELPERS
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
    return value;
  }


  return (
    `${parts[2]}/` +
    `${parts[1]}/` +
    `${parts[0]}`
  );
}


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


/*
========================================================
NAV
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