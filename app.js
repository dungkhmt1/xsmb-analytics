/*
========================================================
XSMB ANALYTICS FRONTEND
V2.6.2 SIMPLE UI + LIVE CARRY V2

UI chính:
1. Hiệu quả Live
2. Live Validation / Carry
3. 5 cầu ưu tiên V2.6.2

Không hiển thị xếp hạng.
========================================================
*/


document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadDashboard();
  }
);


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {

  setSystemStatus(
    "Đang kết nối dữ liệu...",
    ""
  );


  const [
    latestResult,
    statisticsResult,
    predictResult,
    liveResult
  ] = await Promise.allSettled([

    fetch(
      `/api/latest?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    ),

    fetch(
      `/api/statistics?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    ),

    fetch(
      `/api/predict?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    ),

    fetch(
      `/api/live-validation?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    )

  ]);


  let totalDraws = 0;

  let predictData = null;

  let liveData = null;


  /*
  ====================================================
  LATEST RESULT
  ====================================================
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
          "Latest API lỗi"
        );
      }


      renderLatest(
        data
      );

    }
    catch (error) {

      console.error(
        "Latest:",
        error
      );


      renderLatestError(
        error.message
      );
    }

  }
  else {

    renderLatestError(
      "Không kết nối được Latest API."
    );
  }


  /*
  ====================================================
  STATISTICS
  ====================================================
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
          "Statistics API lỗi"
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

    }
    catch (error) {

      console.error(
        "Statistics:",
        error
      );


      renderStatisticsError(
        error.message
      );
    }

  }
  else {

    renderStatisticsError(
      "Không kết nối được Statistics API."
    );
  }


  /*
  ====================================================
  PREDICT V2.6.2
  ====================================================
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
          "Predict API lỗi"
        );
      }


      predictData =
        data;


      renderPrediction(
        data,
        totalDraws
      );


      setSystemStatus(
        `D1 ${totalDraws} kỳ • ${data.version || "bridge-v2.6.2"} • ${data.suggestions?.length || 0} gợi ý`,
        "success"
      );

    }
    catch (error) {

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
  else {

    renderPredictionError(
      "Không kết nối được Predict API.",
      totalDraws
    );


    setSystemStatus(
      `D1 ${totalDraws} kỳ • Predict lỗi`,
      "error"
    );
  }


  /*
  ====================================================
  LIVE VALIDATION
  ====================================================
  */

  if (
    liveResult.status ===
    "fulfilled"
  ) {

    try {

      const response =
        liveResult.value;


      if (!response.ok) {

        throw new Error(
          `Live Validation API ${response.status}`
        );
      }


      const data =
        await response.json();


      if (!data.success) {

        throw new Error(
          data.message ||
          "Live Validation lỗi"
        );
      }


      liveData =
        data;


      renderLiveValidation(
        data
      );


      renderLivePerformance(
        data
      );

    }
    catch (error) {

      console.error(
        "LiveValidation:",
        error
      );


      renderLiveValidationError(
        error.message
      );


      renderLivePerformanceError(
        error.message
      );
    }

  }
  else {

    renderLiveValidationError(
      "Không kết nối được Live Validation API."
    );


    renderLivePerformanceError(
      "Không có dữ liệu hiệu quả Live."
    );
  }


  /*
  ====================================================
  TRƯỜNG HỢP LIVE CHƯA CÓ
  ====================================================
  */

  if (
    predictData &&
    !liveData
  ) {

    renderLivePerformanceEmpty();
  }
}


/* =====================================================
   ANALYSIS UI ORDER

   Phân tích hôm nay
        ↓
   Hiệu quả Live
        ↓
   Live Validation
        ↓
   Cầu ưu tiên
===================================================== */

function ensurePerformanceContainer() {

  let container =
    document.getElementById(
      "analysis-performance-panel"
    );


  if (container) {

    return container;
  }


  const prediction =
    document.getElementById(
      "today-prediction"
    );


  if (!prediction) {

    return null;
  }


  container =
    document.createElement(
      "div"
    );


  container.id =
    "analysis-performance-panel";


  prediction.insertAdjacentElement(
    "beforebegin",
    container
  );


  return container;
}


function ensureLiveValidationContainer() {

  let container =
    document.getElementById(
      "live-validation-panel"
    );


  if (container) {

    return container;
  }


  const prediction =
    document.getElementById(
      "today-prediction"
    );


  if (!prediction) {

    return null;
  }


  container =
    document.createElement(
      "div"
    );


  container.id =
    "live-validation-panel";


  const performance =
    ensurePerformanceContainer();


  if (performance) {

    performance.insertAdjacentElement(
      "afterend",
      container
    );

  }
  else {

    prediction.insertAdjacentElement(
      "beforebegin",
      container
    );
  }


  return container;
}


/* =====================================================
   LIVE PERFORMANCE
===================================================== */

function performanceValue(
  metric
) {

  if (
    !metric ||
    !Number(metric.tested)
  ) {

    return "Chưa có dữ liệu";
  }


  return (
    `${Number(metric.hits || 0)}` +
    "/" +
    `${Number(metric.tested || 0)}` +
    ` • ${Number(metric.hitRate || 0)}%`
  );
}


function renderLivePerformance(
  data
) {

  const container =
    ensurePerformanceContainer();


  if (!container) {

    return;
  }


  const base =
    data.performance?.base ||
    {};


  const carry =
    data.performance?.carry ||
    {};


  container.innerHTML = `

    <div class="simple-performance-box">

      <div class="simple-section-title">
        HIỆU QUẢ LIVE
      </div>


      <div class="simple-performance-group">

        <div class="simple-performance-name">
          V2.6.2
        </div>


        <div class="simple-performance-values">

          <span>
            Top1:
            <strong>
              ${performanceValue(
                base.top1
              )}
            </strong>
          </span>


          <span>
            Top3:
            <strong>
              ${performanceValue(
                base.top3
              )}
            </strong>
          </span>


          <span>
            Top5:
            <strong>
              ${performanceValue(
                base.top5
              )}
            </strong>
          </span>

        </div>


        <div class="simple-performance-count">

          Đã chấm:
          <strong>
            ${Number(base.tested || 0)}
          </strong>

          •

          Đang chờ:
          <strong>
            ${Number(base.pending || 0)}
          </strong>

        </div>

      </div>


      <div class="simple-performance-group">

        <div class="simple-performance-name">
          CARRY
        </div>


        <div class="simple-performance-values">

          <span>
            Top1:
            <strong>
              ${performanceValue(
                carry.top1
              )}
            </strong>
          </span>


          <span>
            Top3:
            <strong>
              ${performanceValue(
                carry.top3
              )}
            </strong>
          </span>


          <span>
            Top5:
            <strong>
              ${performanceValue(
                carry.top5
              )}
            </strong>
          </span>

        </div>


        <div class="simple-performance-count">

          Đã chấm:
          <strong>
            ${Number(carry.tested || 0)}
          </strong>

          •

          Đang chờ:
          <strong>
            ${Number(carry.pending || 0)}
          </strong>

        </div>

      </div>

    </div>
  `;
}


function renderLivePerformanceEmpty() {

  const container =
    ensurePerformanceContainer();


  if (!container) {

    return;
  }


  container.innerHTML = `

    <div class="simple-performance-box">

      <div class="simple-section-title">
        HIỆU QUẢ LIVE
      </div>

      <div class="simple-empty">
        Chưa có dữ liệu Live Validation.
      </div>

    </div>
  `;
}


function renderLivePerformanceError(
  message
) {

  const container =
    ensurePerformanceContainer();


  if (!container) {

    return;
  }


  container.innerHTML = `

    <div class="simple-performance-box">

      <div class="simple-section-title">
        HIỆU QUẢ LIVE
      </div>

      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>

    </div>
  `;
}


/* =====================================================
   LIVE VALIDATION
===================================================== */

function carryStatusLabel(
  status
) {

  if (
    status === "hit"
  ) {

    return `
      <span class="simple-hit">
        ✓ HIT
      </span>
    `;
  }


  if (
    status === "miss"
  ) {

    return `
      <span class="simple-miss">
        MISS
      </span>
    `;
  }


  return `
    <span class="simple-pending">
      Đang chờ
    </span>
  `;
}


/*
========================================================
CARRY HISTORY

Hiện tại:

25/07 : 94 ✓ HIT
26/07 : 77 Đang chờ
========================================================
*/

function buildCarryDisplayHistory(
  item,
  currentCarry
) {

  /*
  API tương lai có history đầy đủ.
  */

  if (
    Array.isArray(
      item.history
    ) &&
    item.history.length
  ) {

    return item.history
      .map(
        row => `

          <div class="simple-history-line">

            ${formatDateShort(
              row.date ||
              row.targetDate
            )}

            :

            <strong>
              ${escapeHtml(
                row.number
              )}
            </strong>

            ${carryStatusLabel(
              row.status
            )}

          </div>
        `
      )
      .join("");
  }


  /*
  Schema Carry V2 hiện tại.
  */

  let html = "";


  if (
    item.previousNumber &&
    item.previousHitDate
  ) {

    html += `

      <div class="simple-history-line">

        ${formatDateShort(
          item.previousHitDate
        )}

        :

        <strong>
          ${escapeHtml(
            item.previousNumber
          )}
        </strong>

        <span class="simple-hit">
          ✓ HIT
        </span>

      </div>
    `;
  }


  if (
    item.currentNumber &&
    currentCarry?.predictionDate
  ) {

    html += `

      <div class="simple-history-line">

        ${formatDateShort(
          currentCarry.predictionDate
        )}

        :

        <strong>
          ${escapeHtml(
            item.currentNumber
          )}
        </strong>

        ${carryStatusLabel(
          item.status
        )}

      </div>
    `;
  }


  if (!html) {

    html = `

      <div class="simple-history-empty">
        Chưa có lịch sử Carry.
      </div>
    `;
  }


  return html;
}


/*
========================================================
LIVE VALIDATION SIMPLE

KHÔNG HIỂN THỊ XẾP HẠNG.
========================================================
*/

function renderLiveValidation(
  data
) {

  const container =
    ensureLiveValidationContainer();


  if (!container) {

    return;
  }


  const currentCarry =
    data.currentCarry ||
    null;


  const promoted =
    Array.isArray(
      currentCarry?.promoted
    )
      ?
      currentCarry.promoted
      :
      [];


  if (
    !promoted.length
  ) {

    container.innerHTML = `

      <div class="simple-live-box">

        <div class="simple-section-title">
          LIVE VALIDATION
        </div>


        <div class="simple-empty">
          Hiện chưa có cầu Carry đang theo.
        </div>

      </div>
    `;

    return;
  }


  /*
  Chỉ dùng cầu Carry đầu tiên.
  Không hiển thị chữ #1.
  */

  const item =
    promoted[0];


  const history =
    buildCarryDisplayHistory(
      item,
      currentCarry
    );


  const streak =
    Number(
      item.carryHitStreak || 1
    );


  container.innerHTML = `

    <div class="simple-live-box">

      <div class="simple-section-title">
        LIVE VALIDATION
      </div>


      <div class="simple-live-label">
        CARRY ƯU TIÊN
      </div>


      <div class="simple-live-number">

        ${escapeHtml(
          item.currentNumber
        )}

      </div>


      <div class="simple-bridge">

        ${escapeHtml(
          item.bridge || "-"
        )}

      </div>


      <div class="simple-label">
        Lịch sử cầu chạy
      </div>


      <div class="simple-history">

        ${history}

      </div>


      <div class="simple-streak">

        Số ngày cầu chạy:

        <strong>
          ${streak} ngày
        </strong>

      </div>

    </div>
  `;
}


function renderLiveValidationError(
  message
) {

  const container =
    ensureLiveValidationContainer();


  if (!container) {

    return;
  }


  container.innerHTML = `

    <div class="simple-live-box">

      <div class="simple-section-title">
        LIVE VALIDATION
      </div>


      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>

    </div>
  `;
}


/* =====================================================
   PREDICT HELPERS
===================================================== */

function strengthName(
  value
) {

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


  if (
    value === "qualified"
  ) {

    return "ĐẠT CHUẨN";
  }


  if (
    value === "carry"
  ) {

    return "CARRY";
  }


  return String(
    value ||
    "ĐẠT CHUẨN"
  )
    .toUpperCase();
}


function strengthClass(
  value
) {

  if (
    value === "very-strong"
  ) {

    return "very-strong";
  }


  if (
    value === "strong"
  ) {

    return "strong";
  }


  return "qualified";
}


/* =====================================================
   BASE BRIDGE HISTORY
===================================================== */

function renderSimpleBridgeHistory(
  history
) {

  if (
    !Array.isArray(
      history
    ) ||
    !history.length
  ) {

    return `

      <div class="simple-history-empty">
        Chưa có lịch sử cầu.
      </div>
    `;
  }


  const sorted =
    [...history]

      .filter(
        item =>
          item &&
          item.number !== undefined &&
          item.number !== null
      )

      .sort(
        (
          a,
          b
        ) =>
          String(
            a.targetDate || ""
          )
            .localeCompare(
              String(
                b.targetDate || ""
              )
            )
      );


  if (
    !sorted.length
  ) {

    return `

      <div class="simple-history-empty">
        Chưa có lịch sử cầu.
      </div>
    `;
  }


  return `

    <div class="simple-history">

      ${
        sorted
          .map(
            item => `

              <div class="simple-history-line">

                ${formatDateShort(
                  item.sourceDate
                )}

                →

                ${formatDateShort(
                  item.targetDate
                )}

                :

                <strong>
                  ${escapeHtml(
                    item.number
                  )}
                </strong>

                <span class="simple-hit">
                  ✓
                </span>

              </div>
            `
          )
          .join("")
      }

    </div>
  `;
}


/* =====================================================
   ONE SUGGESTION CARD

   Không có ranking.
===================================================== */

function renderSimpleSuggestion(
  item
) {

  const streak =
    Number(
      item.streak || 0
    );


  return `

    <div class="simple-suggestion-card">


      <div class="simple-suggestion-header">

        <div
          class="
            simple-strength
            ${strengthClass(
              item.strength
            )}
          "
        >

          ${strengthName(
            item.strength
          )}

        </div>


        <div class="simple-number">

          ${escapeHtml(
            item.number
          )}

        </div>

      </div>


      <div class="simple-bridge">

        ${escapeHtml(
          item.bridge || "-"
        )}

      </div>


      <div class="simple-label">
        Lịch sử cầu chạy
      </div>


      ${renderSimpleBridgeHistory(
        item.history
      )}


      <div class="simple-streak">

        Số ngày cầu chạy:

        <strong>
          ${streak} ngày
        </strong>

      </div>

    </div>
  `;
}


/* =====================================================
   PREDICT V2.6.2

   Chỉ 5 cầu.
   Không ranking.
   Không score.
===================================================== */

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
      ?
      data.suggestions
      :
      [];


  const top5 =
    suggestions.slice(
      0,
      5
    );


  if (
    !top5.length
  ) {

    container.innerHTML = `

      <div class="simple-priority-box">

        <div class="simple-analysis-head">

          <strong>
            CẦU ƯU TIÊN
          </strong>


          <span class="simple-analysis-date">

            ${formatDateShort(
              data.sourceDate
            )}

            →

            ${formatDateShort(
              data.predictionDate
            )}

          </span>

        </div>


        <div class="simple-empty">

          Hôm nay chưa có cầu
          đủ tiêu chuẩn V2.6.2.

        </div>

      </div>
    `;

    return;
  }


  container.innerHTML = `

    <div class="simple-priority-box">


      <div class="simple-analysis-head">

        <div>
          <strong>
            CẦU ƯU TIÊN
          </strong>
        </div>


        <div class="simple-analysis-date">

          ${formatDateShort(
            data.sourceDate
          )}

          →

          <strong>
            ${formatDateShort(
              data.predictionDate
            )}
          </strong>

        </div>

      </div>


      <div class="simple-suggestion-list">

        ${
          top5
            .map(
              item =>
                renderSimpleSuggestion(
                  item
                )
            )
            .join("")
        }

      </div>


      <div class="simple-model-info">

        V2.6.2

        •

        DATA:
        ${totalDraws} kỳ

        •

        ${top5.length}
        cầu đang theo

      </div>

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

    <div class="simple-priority-box">

      <div class="simple-analysis-head">

        <strong>
          CẦU ƯU TIÊN
        </strong>

      </div>


      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>


      <div class="simple-model-info">

        DATA:
        ${totalDraws} kỳ

      </div>

    </div>
  `;
}


/* =====================================================
   TOTAL DRAWS
===================================================== */

function updateTotalDraws(
  total
) {

  [
    "header-total-draws",
    "total-draws",
    "data-count"
  ]
    .forEach(
      id => {

        const element =
          document.getElementById(
            id
          );


        if (element) {

          element.textContent =
            `${total} kỳ`;
        }
      }
    );
}


/* =====================================================
   LATEST RESULT
===================================================== */

function renderLatest(
  data
) {

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


  const result =

    data.results ||

    data.result ||

    data.latest ||

    data;


  const date =

    data.drawDate ||

    data.draw_date ||

    data.date ||

    result.drawDate ||

    result.draw_date ||

    result.date;


  if (badge) {

    badge.textContent =
      formatDate(
        date
      );
  }


  const prizeRow =
    (
      name,
      values,
      columns,
      extraClass = ""
    ) => {

      const list =
        Array.isArray(
          values
        )
          ?
          values
          :
          values
            ?
            String(
              values
            )
              .trim()
              .split(/\s+/)
            :
            [];


      return `

        <div class="prize-row ${extraClass}">

          <div class="prize-name">
            ${name}
          </div>


          <div class="prize-values cols-${columns}">

            ${
              list
                .filter(Boolean)
                .map(
                  value => `

                    <span class="prize-number">

                      ${escapeHtml(
                        value
                      )}

                    </span>
                  `
                )
                .join("")
            }

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

  const container =
    document.getElementById(
      "latest-result"
    );


  if (!container) {

    return;
  }


  container.innerHTML = `

    <div class="loading-box">

      ${escapeHtml(
        message
      )}

    </div>
  `;
}


/* =====================================================
   STATISTICS
===================================================== */

function renderStatistics(
  data
) {

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
      ?
      data.numbers
      :
      [];


  if (
    !numbers.length
  ) {

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

          const number =
            String(
              item.number ??
              ""
            )
              .padStart(
                2,
                "0"
              );


          const reverse =
            number
              .split("")
              .reverse()
              .join("");


          return `

            <tr>

              <td>
                ${index + 1}
              </td>


              <td class="number-cell">

                ${escapeHtml(
                  number
                )}

              </td>


              <td>
                ${item.score}
              </td>


              <td>
                ${item.gan ?? 0}
              </td>


              <td>
                ${item.freq7 ?? 0}
              </td>


              <td>
                ${item.freq30 ?? 0}
              </td>


              <td>

                ${escapeHtml(
                  reverse
                )}

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


    <div class="warning-box">

      DATA:

      <strong>
        ${data.totalDraws || 0} kỳ
      </strong>


      ${
        data.latestDate

          ?

          `• đến <strong>${
            formatDate(
              data.latestDate
            )
          }</strong>`

          :

          ""
      }

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

      ${escapeHtml(
        message
      )}

    </div>
  `;
}


/* =====================================================
   SYSTEM STATUS
===================================================== */

function setSystemStatus(
  message,
  status = ""
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
    `system-status ${status}`;
}


/* =====================================================
   DATE / HTML HELPERS
===================================================== */

function formatDate(
  value
) {

  if (!value) {

    return "--/--/----";
  }


  const date =
    String(
      value
    )
      .split("T")[0]
      .split(" ")[0];


  const parts =
    date.split("-");


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


function formatDateShort(
  value
) {

  if (!value) {

    return "--/--";
  }


  const date =
    String(
      value
    )
      .split("T")[0]
      .split(" ")[0];


  const parts =
    date.split("-");


  if (
    parts.length !== 3
  ) {

    return escapeHtml(
      value
    );
  }


  return (
    `${parts[2]}/` +
    `${parts[1]}`
  );
}


function escapeHtml(
  value
) {

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


function money(
  value
) {

  return (
    `${new Intl.NumberFormat(
      "vi-VN"
    )
      .format(
        Number(
          value || 0
        )
      )}đ`
  );
}


/* =====================================================
   REFRESH
===================================================== */

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

    }
    finally {

      if (button) {

        button.disabled =
          false;


        button.textContent =
          "Phân tích hôm nay";
      }
    }
  };


/* =====================================================
   NAVIGATION
===================================================== */

function setActiveNav(
  index
) {

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

    setActiveNav(
      0
    );


    document
      .getElementById(
        "analysis-performance-panel"
      )
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  };


window.showStatistics =
  function () {

    setActiveNav(
      1
    );


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

    const tracking =
      document.getElementById(
        "tracking-section"
      );


    if (tracking) {

      window.showTracking();

      return;
    }


    window.open(
      "/api/prediction-history",
      "_blank"
    );
  };


/* =====================================================
   TRACKING
===================================================== */

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


  summary.innerHTML = `

    <div class="loading-box">
      Đang tải lịch sử...
    </div>
  `;


  table.innerHTML =
    "";


  try {

    const response =
      await fetch(
        `/api/prediction-history?t=${Date.now()}`,
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
        "Không đọc được lịch sử dự đoán."
      );
    }


    const s =
      data.summary ||
      {};


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
                ?
                "profit"
                :
                "loss"
            }"
          >

            ${
              Number(
                s.totalProfit || 0
              ) > 0
                ?
                "+"
                :
                ""
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
        ?
        data.history
        :
        [];


    if (
      !history.length
    ) {

      table.innerHTML = `

        <div class="loading-box">
          Chưa có lịch sử dự đoán.
        </div>
      `;

      return;
    }


    const rows =
      history
        .map(
          row => {

            const numbers =
              Array.isArray(
                row.numbers
              )
                ?
                row.numbers
                :
                [];


            const hits =
              numbers
                .map(
                  number => {

                    const count =
                      row
                        .hitsByNumber
                        ?.[number]
                      ||
                      0;


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


            return `

              <tr>

                <td>
                  ${formatDate(
                    row.date
                  )}
                </td>


                <td>

                  <strong>

                    ${
                      numbers
                        .map(
                          escapeHtml
                        )
                        .join(" - ")
                    }

                  </strong>

                </td>


                <td>

                  ${
                    pending
                      ?
                      "Chưa xổ"
                      :
                      hits
                  }

                </td>


                <td>

                  ${
                    pending
                      ?
                      "-"
                      :
                      row.totalHits || 0
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
                      ?
                      "-"
                      :
                      money(
                        row.payout
                      )
                  }

                </td>


                <td
                  class="${
                    profit >= 0
                      ?
                      "profit"
                      :
                      "loss"
                  }"
                >

                  ${
                    pending
                      ?
                      "-"
                      :
                      `${
                        profit > 0
                          ?
                          "+"
                          :
                          ""
                      }${money(profit)}`
                  }

                </td>

              </tr>
            `;
          }
        )
        .join("");


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

  }
  catch (error) {

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


    table.innerHTML =
      "";
  }
}


/* =====================================================
   CẦU 5 CHỮ SỐ
===================================================== */

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
        `/api/five-digit-bridge?t=${Date.now()}`,
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
        "Không đọc được cầu 5 chữ số."
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

  }
  catch (error) {

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
      ?
      data.signals
      :
      [];


  const suggestions =
    Array.isArray(
      data.suggestions
    )
      ?
      data.suggestions
      :
      [];


  if (
    !signals.length
  ) {

    container.innerHTML = `

      <div class="warning-box">

        <strong>
          ${formatDate(
            data.sourceDate
          )}
        </strong>

        không có tín hiệu cầu
        5 chữ số phù hợp.

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
      .slice(
        0,
        10
      )
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
              ?
              "Cầu chạy 2 ngày"
              :
              signal.streak === 1
                ?
                "Cầu chạy 1 ngày"
                :
                "Cầu mới";


          return `

            <div class="prediction-card">

              <div class="prediction-title">

                ${escapeHtml(
                  signal.prizeLabel ||
                  signal.prize ||
                  "5 số"
                )}

              </div>


              <div class="score">

                Nguồn:

                <strong>

                  ${escapeHtml(
                    signal.sourceNumber ||
                    ""
                  )}

                </strong>

              </div>


              <div class="big-pair">

                ${escapeHtml(
                  signal.direct ||
                  ""
                )}

                ${
                  signal.reverse
                    ?
                    ` - ${escapeHtml(
                      signal.reverse
                    )}`
                    :
                    ""
                }

              </div>


              <div class="score">

                ${
                  signal.pattern
                    ?
                    `Pattern: ${escapeHtml(
                      signal.pattern
                    )}`
                    :
                    ""
                }

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


    ${
      topNumbers
        ?
        `
          <div class="secondary-numbers">
            ${topNumbers}
          </div>
        `
        :
        ""
    }


    <div class="prediction-grid">

      ${cards}

    </div>


    <div class="warning-box">

      Module cầu 5 chữ số hoạt động
      độc lập với Predict V2.6.2.

    </div>
  `;
}