/*
========================================================
XSMB ANALYTICS FRONTEND
V2.6.2 + LIVE CARRY V2
SIMPLE / USER-FOCUSED UI
========================================================

TRANG CHỦ:

1. Kết quả XSMB mới nhất

2. Phân tích hôm nay
   - Hiệu quả Live
   - Live Validation / Carry
   - Dàn số gợi ý

3. Không hiển thị:
   - Top số theo mô hình
   - Score
   - Wilson
   - Edge
   - Ranking #1 #2 #3...

4. Giữ:
   - Tracking
   - Backtest
   - Cầu 5 chữ số
========================================================
*/


document.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
    Loại bỏ khu vực
    "Top số theo mô hình"
    khỏi trang chủ.
    */
    hideModelTopSection();

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


  const now =
    Date.now();


  const [
    latestResult,
    statisticsResult,
    predictResult,
    liveResult
  ] =
    await Promise.allSettled([

      fetch(
        `/api/latest?t=${now}`,
        {
          cache: "no-store"
        }
      ),

      /*
      Statistics vẫn được gọi
      chỉ để lấy totalDraws.

      Không render bảng
      Top số theo mô hình.
      */
      fetch(
        `/api/statistics?t=${now}`,
        {
          cache: "no-store"
        }
      ),

      fetch(
        `/api/predict?t=${now}`,
        {
          cache: "no-store"
        }
      ),

      fetch(
        `/api/live-validation?t=${now}`,
        {
          cache: "no-store"
        }
      )

    ]);


  let totalDraws = 0;


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
  CHỈ LẤY SỐ KỲ DATA
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


      /*
      Không gọi:
      renderStatistics(data)
      */

      hideModelTopSection();

    }
    catch (error) {

      console.error(
        "Statistics:",
        error
      );


      hideModelTopSection();
    }

  }
  else {

    hideModelTopSection();
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


      renderPrediction(
        data,
        totalDraws
      );


      setSystemStatus(

        `D1 ${totalDraws} kỳ • ` +

        `${data.version || "bridge-v2.6.2"} • ` +

        `${Math.min(
          5,
          data.suggestions?.length || 0
        )} số gợi ý`,

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


      /*
      Thứ tự giao diện:

      HIỆU QUẢ
      LIVE VALIDATION
      DÀN SỐ
      */

      renderLivePerformance(
        data
      );


      renderLiveValidation(
        data
      );

    }
    catch (error) {

      console.error(
        "LiveValidation:",
        error
      );


      renderLivePerformanceError(
        error.message
      );


      renderLiveValidationError(
        error.message
      );
    }

  }
  else {

    renderLivePerformanceError(
      "Không đọc được dữ liệu Live."
    );


    renderLiveValidationError(
      "Không kết nối được Live Validation API."
    );
  }
}


/* =====================================================
   REMOVE "TOP SỐ THEO MÔ HÌNH"
===================================================== */

function hideModelTopSection() {

  /*
  Ẩn trực tiếp analysis-detail.
  */

  const detail =
    document.getElementById(
      "analysis-detail"
    );


  if (detail) {

    detail.style.display =
      "none";
  }


  /*
  Tìm heading:
  "Top số theo mô hình"

  Nếu tìm thấy thì ẩn cả section/card
  chứa heading đó.
  */

  const elements =
    document.querySelectorAll(
      "h1, h2, h3, h4, .section-title, .card-title"
    );


  elements.forEach(
    element => {

      const text =
        String(
          element.textContent || ""
        )
          .trim()
          .toLowerCase();


      if (
        !text.includes(
          "top số theo mô hình"
        )
      ) {

        return;
      }


      const section =
        element.closest(
          "section, .card, .panel, .content-card"
        );


      if (section) {

        section.style.display =
          "none";

      }
      else {

        element.style.display =
          "none";
      }
    }
  );


  /*
  Nếu bottom navigation
  có nút "Thống kê",
  ẩn nó để tránh bấm vào
  section đã bỏ.
  */

  document
    .querySelectorAll(
      ".bottom-nav .nav-item"
    )
    .forEach(
      element => {

        const text =
          String(
            element.textContent || ""
          )
            .trim()
            .toLowerCase();


        if (
          text.includes(
            "thống kê"
          )
        ) {

          element.style.display =
            "none";
        }
      }
    );
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
   PHÂN TÍCH HÔM NAY
   CONTAINERS
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
    !Number(
      metric.tested
    )
  ) {

    return `
      <strong>--</strong>
      <small>Chưa đủ dữ liệu</small>
    `;
  }


  return `

    <strong>
      ${Number(
        metric.hitRate || 0
      )}%
    </strong>

    <small>

      ${Number(
        metric.hits || 0
      )}

      /

      ${Number(
        metric.tested || 0
      )}

      kỳ

    </small>
  `;
}


function performanceMetric(
  title,
  metric
) {

  return `

    <div class="live-metric">

      <span class="live-metric-title">
        ${title}
      </span>

      ${performanceValue(
        metric
      )}

    </div>
  `;
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

    <section class="live-performance-panel">

      <div class="live-performance-header">

        <div>

          <div class="simple-section-title">
            HIỆU QUẢ LIVE
          </div>

          <div class="live-performance-subtitle">
            Theo dõi kết quả thực tế
          </div>

        </div>

      </div>


      <div class="live-performance-model">

        <div class="live-performance-model-name">

          V2.6.2

          <span>
            ${Number(
              base.tested || 0
            )} kỳ đã chấm
          </span>

        </div>


        <div class="live-performance-grid">

          ${performanceMetric(
            "1 số",
            base.top1
          )}

          ${performanceMetric(
            "3 số",
            base.top3
          )}

          ${performanceMetric(
            "5 số",
            base.top5
          )}

        </div>

      </div>


      <div class="live-performance-model carry-performance">

        <div class="live-performance-model-name">

          CARRY

          <span>

            ${Number(
              carry.tested || 0
            )} kỳ đã chấm

            ${
              Number(
                carry.pending || 0
              )
                ?
                `• ${Number(
                  carry.pending
                )} đang chờ`
                :
                ""
            }

          </span>

        </div>


        <div class="live-performance-grid">

          ${performanceMetric(
            "1 số",
            carry.top1
          )}

          ${performanceMetric(
            "3 số",
            carry.top3
          )}

          ${performanceMetric(
            "5 số",
            carry.top5
          )}

        </div>

      </div>

    </section>
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

    <section class="live-performance-panel">

      <div class="simple-section-title">
        HIỆU QUẢ LIVE
      </div>

      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>

    </section>
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
      <span class="carry-status hit">
        ✓ HIT
      </span>
    `;
  }


  if (
    status === "miss"
  ) {

    return `
      <span class="carry-status miss">
        MISS
      </span>
    `;
  }


  return `
    <span class="carry-status pending">
      ĐANG CHỜ
    </span>
  `;
}


function buildCarryDisplayHistory(
  item,
  currentCarry
) {

  /*
  API tương lai có history
  đầy đủ thì ưu tiên sử dụng.
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

          <div class="carry-history-row">

            <span>

              ${formatDateShort(
                row.date ||
                row.targetDate
              )}

            </span>

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

  let html =
    "";


  if (
    item.previousNumber &&
    item.previousHitDate
  ) {

    html += `

      <div class="carry-history-row">

        <span>

          ${formatDateShort(
            item.previousHitDate
          )}

        </span>

        <strong>

          ${escapeHtml(
            item.previousNumber
          )}

        </strong>

        <span class="carry-status hit">
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

      <div class="carry-history-row">

        <span>

          ${formatDateShort(
            currentCarry.predictionDate
          )}

        </span>

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


  return (
    html ||
    `

      <div class="simple-empty">
        Chưa có lịch sử Carry.
      </div>
    `
  );
}


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

      <section class="carry-panel">

        <div class="simple-section-title">
          LIVE VALIDATION
        </div>


        <div class="simple-empty">

          Hiện chưa có cầu Carry
          đang được ưu tiên.

        </div>

      </section>
    `;

    return;
  }


  /*
  Chỉ hiển thị cầu Carry
  ưu tiên đầu tiên.

  Không hiển thị ranking #1.
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

    <section class="carry-panel">


      <div class="carry-header">

        <div>

          <div class="simple-section-title">
            LIVE VALIDATION
          </div>

          <div class="carry-header-subtitle">
            Cầu đang được tiếp tục sau khi HIT
          </div>

        </div>


        <div class="carry-badge">
          CARRY
        </div>

      </div>


      <div class="carry-main">

        <div class="carry-main-label">
          SỐ ƯU TIÊN
        </div>


        <div class="carry-number">

          ${escapeHtml(
            item.currentNumber
          )}

        </div>


        <div class="carry-date">

          Dự đoán

          <strong>

            ${formatDate(
              currentCarry?.predictionDate
            )}

          </strong>

        </div>

      </div>


      <div class="carry-bridge-box">

        <span>
          Vị trí cầu
        </span>

        <strong>

          ${escapeHtml(
            item.bridge || "-"
          )}

        </strong>

      </div>


      <div class="carry-history-title">
        LỊCH SỬ CẦU CHẠY
      </div>


      <div class="carry-history">

        ${history}

      </div>


      <div class="carry-streak">

        <span>
          Cầu đã chạy
        </span>

        <strong>
          ${streak} ngày
        </strong>

      </div>

    </section>
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

    <section class="carry-panel">

      <div class="simple-section-title">
        LIVE VALIDATION
      </div>

      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>

    </section>
  `;
}


/* =====================================================
   DÀN SỐ GỢI Ý
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

    return "ĐÁNG CHÚ Ý";
  }


  return "GỢI Ý";
}


function strengthClass(
  value
) {

  if (
    value === "very-strong"
  ) {

    return "pick-strength-max";
  }


  if (
    value === "strong"
  ) {

    return "pick-strength-strong";
  }


  return "pick-strength-normal";
}


/*
========================================================
LỊCH SỬ NGẮN CỦA CẦU

Ví dụ:

24/07   82 ✓
25/07   69 ✓
========================================================
*/

function renderPickHistory(
  history
) {

  if (
    !Array.isArray(
      history
    ) ||
    !history.length
  ) {

    return `

      <div class="pick-history-empty">
        Chưa có lịch sử cầu.
      </div>
    `;
  }


  const rows =
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
    !rows.length
  ) {

    return `

      <div class="pick-history-empty">
        Chưa có lịch sử cầu.
      </div>
    `;
  }


  return `

    <div class="pick-history">

      ${
        rows
          .map(
            item => `

              <div class="pick-history-chip">

                <span class="pick-history-date">

                  ${formatDateShort(
                    item.targetDate
                  )}

                </span>


                <strong>

                  ${escapeHtml(
                    item.number
                  )}

                </strong>


                <span class="pick-history-hit">
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


/*
========================================================
GỢI Ý CHÍNH

Không ghi #1.

Sử dụng kích thước số lớn
để người dùng nhận biết
ngay số đáng chú ý nhất.
========================================================
*/

function renderPrimaryPick(
  item
) {

  const number =
    normalizeDisplayNumber(
      item.number
    );


  return `

    <article class="pick-primary">


      <div class="pick-primary-top">

        <span class="pick-primary-label">
          GỢI Ý CHÍNH
        </span>


        <span
          class="
            pick-strength
            ${strengthClass(
              item.strength
            )}
          "
        >

          ${strengthName(
            item.strength
          )}

        </span>

      </div>


      <div class="pick-primary-number">

        ${escapeHtml(
          number
        )}

      </div>


      <div class="pick-primary-message">

        Số đáng chú ý nhất
        trong nhóm gợi ý hôm nay

      </div>


      <div class="pick-primary-bridge">

        <span>
          Vị trí cầu
        </span>

        <strong>

          ${escapeHtml(
            item.bridge || "-"
          )}

        </strong>

      </div>


      <div class="pick-section-label">
        Lịch sử cầu chạy
      </div>


      ${renderPickHistory(
        item.history
      )}


      <div class="pick-primary-streak">

        <span>
          Cầu chạy
        </span>

        <strong>

          ${Number(
            item.streak || 0
          )}
          ngày

        </strong>

      </div>

    </article>
  `;
}


/*
========================================================
CÁC SỐ GỢI Ý CÒN LẠI
========================================================
*/

function renderSecondaryPick(
  item
) {

  const number =
    normalizeDisplayNumber(
      item.number
    );


  return `

    <article class="pick-card">


      <div class="pick-card-top">

        <span
          class="
            pick-strength
            ${strengthClass(
              item.strength
            )}
          "
        >

          ${strengthName(
            item.strength
          )}

        </span>

      </div>


      <div class="pick-number">

        ${escapeHtml(
          number
        )}

      </div>


      <div class="pick-card-bridge">

        ${escapeHtml(
          item.bridge || "-"
        )}

      </div>


      ${renderPickHistory(
        item.history
      )}


      <div class="pick-card-streak">

        Cầu chạy

        <strong>

          ${Number(
            item.streak || 0
          )}
          ngày

        </strong>

      </div>

    </article>
  `;
}


/* =====================================================
   RENDER PREDICTION

   TOP 5 THEO THỨ TỰ MODEL
   NHƯNG KHÔNG HIỂN THỊ RANK.
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

      <section class="pick-panel">

        <div class="pick-panel-header">

          <div>

            <div class="pick-panel-title">
              DÀN SỐ GỢI Ý
            </div>


            <div class="pick-panel-subtitle">

              ${formatDate(
                data.predictionDate
              )}

            </div>

          </div>

        </div>


        <div class="simple-empty">

          Hôm nay chưa có cầu
          đủ điều kiện lựa chọn.

        </div>

      </section>
    `;

    return;
  }


  const primary =
    top5[0];


  const secondary =
    top5.slice(
      1
    );


  container.innerHTML = `

    <section class="pick-panel">


      <div class="pick-panel-header">

        <div>

          <div class="pick-panel-title">
            DÀN SỐ GỢI Ý
          </div>


          <div class="pick-panel-subtitle">

            Dự đoán ngày

            <strong>

              ${formatDate(
                data.predictionDate
              )}

            </strong>

          </div>

        </div>


        <div class="pick-count-badge">

          ${top5.length}
          SỐ

        </div>

      </div>


      ${renderPrimaryPick(
        primary
      )}


      ${
        secondary.length
          ?
          `

            <div class="pick-secondary-title">

              CÁC SỐ ĐÁNG CHÚ Ý KHÁC

            </div>


            <div class="pick-grid">

              ${
                secondary
                  .map(
                    item =>
                      renderSecondaryPick(
                        item
                      )
                  )
                  .join("")
              }

            </div>
          `
          :
          ""
      }


      <div class="pick-footer">

        <span>

          Nguồn

          <strong>

            ${formatDateShort(
              data.sourceDate
            )}

          </strong>

          →

          <strong>

            ${formatDateShort(
              data.predictionDate
            )}

          </strong>

        </span>


        <span>

          V2.6.2

          •

          ${totalDraws}
          kỳ dữ liệu

        </span>

      </div>

    </section>
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

    <section class="pick-panel">

      <div class="pick-panel-title">
        DÀN SỐ GỢI Ý
      </div>


      <div class="simple-empty">

        ${escapeHtml(
          message
        )}

      </div>


      <div class="pick-footer">

        DATA:
        ${totalDraws} kỳ

      </div>

    </section>
  `;
}


/* =====================================================
   STATUS
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
   HELPERS
===================================================== */

function datePart(
  value
) {

  if (!value) {

    return "";
  }


  return String(
    value
  )
    .split("T")[0]
    .split(" ")[0];
}


function formatDate(
  value
) {

  if (!value) {

    return "--/--/----";
  }


  const parts =
    datePart(
      value
    )
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


function formatDateShort(
  value
) {

  if (!value) {

    return "--/--";
  }


  const parts =
    datePart(
      value
    )
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
    `${parts[1]}`
  );
}


function normalizeDisplayNumber(
  value
) {

  const digits =
    String(
      value ?? ""
    )
      .replace(
        /\D/g,
        ""
      );


  if (!digits) {

    return "--";
  }


  return digits
    .padStart(
      2,
      "0"
    )
    .slice(
      -2
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
   REFRESH ANALYSIS
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


/*
========================================================
PHÂN TÍCH
========================================================
*/

window.showPrediction =
  function () {

    setActiveNav(
      0
    );


    const target =

      document.getElementById(
        "analysis-performance-panel"
      )

      ||

      document.getElementById(
        "today-prediction"
      );


    target?.scrollIntoView({

      behavior:
        "smooth",

      block:
        "start"
    });
  };


/*
========================================================
GIỮ TƯƠNG THÍCH INDEX CŨ

Top số theo mô hình đã bỏ.
Nếu index.html còn gọi showStatistics()
thì đưa người dùng về Phân tích hôm nay.
========================================================
*/

window.showStatistics =
  function () {

    window.showPrediction();
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

    const section =
      document.getElementById(
        "tracking-section"
      );


    if (section) {

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

      behavior:
        "smooth",

      block:
        "start"
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

                      `${escapeHtml(
                        number
                      )}: ` +

                      `${count} lần`
                    );
                  }
                )
                .join(
                  "<br>"
                );


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
                        .join(
                          " - "
                        )
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
                      }${money(
                        profit
                      )}`
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
   MODULE ĐỘC LẬP
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

      behavior:
        "smooth",

      block:
        "start"
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