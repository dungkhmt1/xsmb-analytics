/*
========================================================
XSMB ANALYTICS FRONTEND
V2.6.2 + LIVE VALIDATION CARRY
CLEAN HOME UI
========================================================

TRANG CHỦ:

1. Kết quả XSMB mới nhất

2. Phân tích hôm nay
   - LIVE VALIDATION
   - Dàn số gợi ý

3. Không hiển thị:
   - Hiệu quả Live
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

  const now = Date.now();

  const [
    latestResult,
    statisticsResult,
    predictResult,
    liveResult,
    trackingResult
  ] = await Promise.allSettled([

    fetch(
      `/api/latest?t=${now}`,
      {
        cache: "no-store"
      }
    ),

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
    ),

    fetch(
      `/api/save-prediction?t=${now}`,
      {
        cache: "no-store"
      }
    )

  ]);

  let totalDraws = 0;

  /*
  ====================================================
  KẾT QUẢ MỚI NHẤT
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

    }
    catch (error) {

      console.error(
        "Statistics:",
        error
      );
    }

  }


  hideModelTopSection();


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


      renderLiveValidation(
        data
      );

    }
    catch (error) {

      console.error(
        "Live Validation:",
        error
      );


      renderLiveValidationError(
        error.message
      );
    }

  }
  else {

    renderLiveValidationError(
      "Không kết nối được Live Validation API."
    );
  }
}


/* =====================================================
   ẨN TOP SỐ THEO MÔ HÌNH
===================================================== */

function hideModelTopSection() {

  const detail =
    document.getElementById(
      "analysis-detail"
    );


  if (detail) {

    detail.style.display =
      "none";
  }


  const headings =
    document.querySelectorAll(
      "h1, h2, h3, h4, .section-title, .card-title"
    );


  headings.forEach(
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
}


/* =====================================================
   TOTAL DATA
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
   KẾT QUẢ XSMB MỚI NHẤT
===================================================== */

function renderLatest(data) {

  const box =
    document.getElementById(
      "latestResult"
    );

  if (!box) {
    return;
  }


  if (
    !data ||
    !data.success ||
    !data.results
  ) {

    box.innerHTML = `
      <div class="result-empty">
        Không có dữ liệu kết quả.
      </div>
    `;

    return;
  }


  const drawDate =
    data.drawDate;

  const r =
    data.results;


  /*
  ====================================================
  LƯU NGÀY ĐANG XEM
  ====================================================
  */

  window.currentResultDate =
    drawDate;


  /*
  ====================================================
  FORMAT GIẢI
  ====================================================
  */

  const values = value => {

    const arr =
      Array.isArray(value)
        ? value
        : value
          ? [value]
          : [];

    return arr
      .map(
        number => `
          <span class="result-number">
            ${escapeHtml(String(number))}
          </span>
        `
      )
      .join("");
  };


  box.innerHTML = `

    <section class="xsmb-result-card">

      <div class="result-date-navigation">

        <button
          type="button"
          class="result-nav-button"
          onclick="changeResultDate(-1)"
          aria-label="Ngày trước"
        >
          ‹
        </button>


        <button
          type="button"
          class="result-date-button"
          onclick="openResultDatePicker()"
        >

          <span class="result-date-label">
            KẾT QUẢ XSMB
          </span>

          <strong>
            ${formatDate(drawDate)}
          </strong>

          <span class="result-date-hint">
            Chọn ngày
          </span>

        </button>


        <button
          type="button"
          class="result-nav-button"
          onclick="changeResultDate(1)"
          aria-label="Ngày sau"
        >
          ›
        </button>

      </div>


      <input
        id="resultDatePicker"
        class="result-date-picker"
        type="date"
        value="${escapeHtml(drawDate)}"
        max="${todayISO()}"
        onchange="selectResultDate(this.value)"
      >


      <div class="result-table">

        <div class="result-row special-row">

          <div class="result-prize">
            ĐB
          </div>

          <div class="result-values special-number">
            ${values(r.special)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G1
          </div>

          <div class="result-values">
            ${values(r.g1)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G2
          </div>

          <div class="result-values">
            ${values(r.g2)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G3
          </div>

          <div class="result-values">
            ${values(r.g3)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G4
          </div>

          <div class="result-values">
            ${values(r.g4)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G5
          </div>

          <div class="result-values">
            ${values(r.g5)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G6
          </div>

          <div class="result-values">
            ${values(r.g6)}
          </div>

        </div>


        <div class="result-row">

          <div class="result-prize">
            G7
          </div>

          <div class="result-values g7-values">
            ${values(r.g7)}
          </div>

        </div>

      </div>

    </section>
  `;
}
/*
====================================================
RESULT HISTORY
Chỉ đọc kết quả.
KHÔNG chạy Predict / Save / Carry.
====================================================
*/


function todayISO() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}



function openResultDatePicker() {

  const picker =
    document.getElementById(
      "resultDatePicker"
    );

  if (!picker) {
    return;
  }


  /*
  Chrome / Edge / Android mới
  */

  if (
    typeof picker.showPicker ===
    "function"
  ) {

    try {

      picker.showPicker();
      return;

    } catch (_) {
      // fallback
    }
  }


  picker.focus();
  picker.click();
}



async function selectResultDate(date) {

  if (!date) {
    return;
  }

  await loadResultByDate(date);
}



async function changeResultDate(offset) {

  const current =
    window.currentResultDate;

  if (!current) {
    return;
  }


  const date =
    new Date(
      `${current}T12:00:00`
    );


  date.setDate(
    date.getDate() + offset
  );


  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");


  const target =
    `${year}-${month}-${day}`;


  /*
  Không cho đi sang tương lai.
  */

  if (
    target > todayISO()
  ) {
    return;
  }


  await loadResultByDate(
    target
  );
}



async function loadResultByDate(date) {

  const box =
    document.getElementById(
      "latestResult"
    );

  if (!box) {
    return;
  }


  box.innerHTML = `

    <div class="result-loading">

      <div class="result-loading-title">
        Đang tải kết quả
      </div>

      <strong>
        ${formatDate(date)}
      </strong>

    </div>
  `;


  try {

    const response =
      await fetch(
        `/api/result?date=${encodeURIComponent(date)}&t=${Date.now()}`,
        {
          cache: "no-store"
        }
      );


    let data;

    try {

      data =
        await response.json();

    } catch (_) {

      throw new Error(
        `API trả dữ liệu không hợp lệ (HTTP ${response.status})`
      );
    }


    if (
      !response.ok ||
      !data.success
    ) {

      throw new Error(
        data.message ||
        "Không có kết quả ngày này."
      );
    }


    /*
    ====================================================
    CHỈ RENDER KẾT QUẢ

    Không gọi:
    loadDashboard()
    predict
    save-prediction
    live-validation
    ====================================================
    */

    renderLatest(data);


  } catch (error) {

    console.error(
      "RESULT HISTORY:",
      error
    );


    renderResultNotFound(
      date,
      error.message
    );
  }
}



function renderResultNotFound(
  date,
  message
) {

  const box =
    document.getElementById(
      "latestResult"
    );

  if (!box) {
    return;
  }


  window.currentResultDate =
    date;


  box.innerHTML = `

    <section class="xsmb-result-card">

      <div class="result-date-navigation">

        <button
          type="button"
          class="result-nav-button"
          onclick="changeResultDate(-1)"
        >
          ‹
        </button>


        <button
          type="button"
          class="result-date-button"
          onclick="openResultDatePicker()"
        >

          <span class="result-date-label">
            KẾT QUẢ XSMB
          </span>

          <strong>
            ${formatDate(date)}
          </strong>

          <span class="result-date-hint">
            Chọn ngày
          </span>

        </button>


        <button
          type="button"
          class="result-nav-button"
          onclick="changeResultDate(1)"
        >
          ›
        </button>

      </div>


      <input
        id="resultDatePicker"
        class="result-date-picker"
        type="date"
        value="${escapeHtml(date)}"
        max="${todayISO()}"
        onchange="selectResultDate(this.value)"
      >


      <div class="result-not-found">

        <strong>
          Không có kết quả
        </strong>

        <span>
          ${escapeHtml(
            message ||
            "Không tìm thấy dữ liệu cho ngày này."
          )}
        </span>

      </div>

    </section>
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
   LIVE VALIDATION CONTAINER
===================================================== */
/* =====================================================
   LIVE VALIDATION - VISUAL UI V3
===================================================== */

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
    document.createElement("div");


  container.id =
    "live-validation-panel";


  prediction.insertAdjacentElement(
    "beforebegin",
    container
  );


  return container;
}


/* =====================================================
   STATUS
===================================================== */

function normalizeCarryStatus(
  status
) {

  const value =
    String(status || "")
      .toLowerCase();


  if (
    value === "hit"
  ) {
    return "hit";
  }


  if (
    value === "miss"
  ) {
    return "miss";
  }


  return "pending";
}


function carryStatusText(
  status
) {

  const value =
    normalizeCarryStatus(
      status
    );


  if (
    value === "hit"
  ) {
    return "HIT";
  }


  if (
    value === "miss"
  ) {
    return "MISS";
  }


  return "ĐANG CHỜ";
}


function carryStatusIcon(
  status
) {

  const value =
    normalizeCarryStatus(
      status
    );


  if (
    value === "hit"
  ) {
    return "✓";
  }


  if (
    value === "miss"
  ) {
    return "×";
  }


  return "•";
}


/* =====================================================
   GET CARRY HISTORY
===================================================== */

function getCarryHistory(
  item,
  currentCarry
) {

  let history = [];


  /*
  ====================================================
  FULL HISTORY TỪ API
  ====================================================
  */

  if (
    Array.isArray(
      item?.history
    ) &&
    item.history.length
  ) {

    history =
      item.history
        .map(
          row => ({

            date:
              row.date ||
              row.targetDate ||
              row.predictionDate ||
              null,

            sourceDate:
              row.sourceDate ||
              null,

            number:
              normalizeDisplayNumber(
                row.number
              ),

            status:
              row.status ||
              (
                row.hit === true
                  ?
                  "hit"
                  :
                  row.hit === false
                    ?
                    "miss"
                    :
                    "pending"
              )
          })
        )
        .filter(
          row =>
            row.date &&
            row.number !== "--"
        );
  }


  /*
  ====================================================
  FALLBACK SCHEMA HIỆN TẠI
  ====================================================
  */

  if (
    !history.length
  ) {

    if (
      item?.previousNumber &&
      item?.previousHitDate
    ) {

      history.push({

        date:
          item.previousHitDate,

        number:
          normalizeDisplayNumber(
            item.previousNumber
          ),

        status:
          "hit"
      });
    }


    if (
      item?.currentNumber &&
      currentCarry?.predictionDate
    ) {

      history.push({

        date:
          currentCarry.predictionDate,

        number:
          normalizeDisplayNumber(
            item.currentNumber
          ),

        status:
          item.status ||
          "pending"
      });
    }
  }


  /*
  ====================================================
  DEDUPE THEO DATE + NUMBER
  ====================================================
  */

  const map =
    new Map();


  for (
    const row
    of history
  ) {

    const key =
      `${row.date}|${row.number}`;


    map.set(
      key,
      row
    );
  }


  return [
    ...map.values()
  ]
    .sort(
      (
        a,
        b
      ) =>
        String(a.date)
          .localeCompare(
            String(b.date)
          )
    );
}


/* =====================================================
   HIT STREAK
===================================================== */

function getCarryHitStreak(
  item,
  history
) {

  const explicit =
    Number(
      item?.carryHitStreak || 0
    );


  if (
    explicit > 0
  ) {
    return explicit;
  }


  let streak =
    0;


  for (
    let i =
      history.length - 1;
    i >= 0;
    i--
  ) {

    const status =
      normalizeCarryStatus(
        history[i].status
      );


    if (
      status === "pending"
    ) {
      continue;
    }


    if (
      status === "hit"
    ) {

      streak++;

      continue;
    }


    break;
  }


  return streak;
}


/* =====================================================
   PREVIOUS HIT
===================================================== */

function getLastCarryHit(
  history
) {

  for (
    let i =
      history.length - 1;
    i >= 0;
    i--
  ) {

    if (
      normalizeCarryStatus(
        history[i].status
      ) === "hit"
    ) {

      return history[i];
    }
  }


  return null;
}


/* =====================================================
   HERO TRANSITION

   Ví dụ:
   98 ✓ HIT  →  06 ĐANG CHỜ
===================================================== */

function renderCarryTransition(
  previousHit,
  currentNumber,
  currentStatus
) {

  if (
    !previousHit
  ) {
    return "";
  }


  return `

    <div class="live-transition">


      <div class="live-transition-side">

        <div class="live-transition-label">
          ĐÃ VỀ
        </div>


        <div class="live-transition-number hit">

          ${escapeHtml(
            previousHit.number
          )}

        </div>


        <div class="live-transition-status hit">

          ✓ HIT

        </div>

      </div>


      <div class="live-transition-arrow">

        <span></span>

      </div>


      <div class="live-transition-side">

        <div class="live-transition-label">
          TIẾP THEO
        </div>


        <div class="live-transition-number current">

          ${escapeHtml(
            currentNumber
          )}

        </div>


        <div
          class="
            live-transition-status
            ${normalizeCarryStatus(
              currentStatus
            )}
          "
        >

          ${carryStatusText(
            currentStatus
          )}

        </div>

      </div>


    </div>
  `;
}


/* =====================================================
   FULL HISTORY LIST
===================================================== */

function renderCarryFullHistory(
  history
) {

  if (
    !history.length
  ) {

    return `

      <div class="live-empty">

        Chưa có lịch sử cầu.

      </div>
    `;
  }


  const hitCount =
    history.filter(
      row =>
        normalizeCarryStatus(
          row.status
        ) === "hit"
    ).length;


  const missCount =
    history.filter(
      row =>
        normalizeCarryStatus(
          row.status
        ) === "miss"
    ).length;


  return `

    <div class="live-history-section">


      <div class="live-history-heading">

        <div>

          <div class="live-history-title">
            LỊCH SỬ CẦU
          </div>


          <div class="live-history-summary">

            ${history.length} ngày

            •

            <strong>
              ${hitCount} HIT
            </strong>

            ${
              missCount
                ?
                `• ${missCount} MISS`
                :
                ""
            }

          </div>

        </div>

      </div>


      <div class="live-history-table">


        ${
          history
            .map(
              (
                row,
                index
              ) => {

                const status =
                  normalizeCarryStatus(
                    row.status
                  );


                const isLast =
                  index ===
                  history.length - 1;


                return `

                  <div
                    class="
                      live-history-item
                      ${status}
                      ${
                        isLast
                          ?
                          "current"
                          :
                          ""
                      }
                    "
                  >


                    <div class="live-history-date">

                      ${formatDateShort(
                        row.date
                      )}

                    </div>


                    <div
                      class="
                        live-history-number
                        ${status}
                      "
                    >

                      ${escapeHtml(
                        row.number
                      )}

                    </div>


                    <div
                      class="
                        live-history-status
                        ${status}
                      "
                    >

                      <span>

                        ${carryStatusIcon(
                          status
                        )}

                      </span>


                      ${carryStatusText(
                        status
                      )}

                    </div>


                  </div>
                `;
              }
            )
            .join("")
        }


      </div>


    </div>
  `;
}


/* =====================================================
   LIVE VALIDATION MAIN
===================================================== */

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
      Array.isArray(
        currentCarry?.items
      )
        ?
        currentCarry.items
        :
        [];


  /*
  ====================================================
  NO CARRY
  ====================================================
  */

  if (
    !promoted.length
  ) {

    container.innerHTML = `

      <section class="live-card">


        <div class="live-card-header">

          <div>

            <div class="live-title">

              LIVE VALIDATION

            </div>


            <div class="live-subtitle">

              Theo dõi cầu vừa HIT

            </div>

          </div>


          <div class="live-badge">

            <span></span>

            LIVE

          </div>

        </div>


        <div class="live-empty">

          Chưa có cầu đủ điều kiện
          để tiếp tục theo dõi.

        </div>


      </section>
    `;

    return;
  }


  /*
  ====================================================
  PRIMARY CARRY
  ====================================================
  */

  const item =
    promoted[0];


  const history =
    getCarryHistory(
      item,
      currentCarry
    );


  const currentNumber =
    normalizeDisplayNumber(

      item.currentNumber ||

      item.number
    );


  const currentStatus =
    item.status ||
    "pending";


  const previousHit =
    getLastCarryHit(
      history.filter(
        row =>
          row.number !==
          currentNumber
          ||
          normalizeCarryStatus(
            row.status
          ) !== "pending"
      )
    );


  const streak =
    getCarryHitStreak(
      item,
      history
    );


  const bridge =

    item.bridge ||

    item.carrySources?.[0]?.bridge ||

    "-";


  container.innerHTML = `

    <section class="live-card">


      <!-- HEADER -->

      <div class="live-card-header">


        <div>

          <div class="live-title">

            LIVE VALIDATION

          </div>


          <div class="live-subtitle">

            Cầu vừa HIT đang được
            tiếp tục theo dõi

          </div>

        </div>


        <div class="live-badge">

          <span></span>

          LIVE

        </div>


      </div>


      <!-- HERO NUMBER -->

      <div class="live-hero">


        <div class="live-hero-label">

          SỐ ĐANG THEO

        </div>


        <div class="live-hero-number">

          ${escapeHtml(
            currentNumber
          )}

        </div>


        <div class="live-hero-bottom">


          <span>

            ${formatDate(
              currentCarry
                ?.predictionDate
            )}

          </span>


          <span
            class="
              live-current-status
              ${normalizeCarryStatus(
                currentStatus
              )}
            "
          >

            ${carryStatusText(
              currentStatus
            )}

          </span>


        </div>


      </div>


      <!-- PREVIOUS → CURRENT -->

      ${renderCarryTransition(

        previousHit,

        currentNumber,

        currentStatus
      )}


      <!-- BRIDGE -->

      <div class="live-bridge-card">


        <div class="live-bridge-icon">

          ↗

        </div>


        <div class="live-bridge-content">

          <span>
            VỊ TRÍ CẦU
          </span>


          <strong>

            ${escapeHtml(
              bridge
            )}

          </strong>

        </div>


      </div>


      <!-- STREAK -->

      <div class="live-streak-card">


        <div class="live-streak-icon">

          🔥

        </div>


        <div>

          <span>

            Chuỗi HIT hiện tại

          </span>


          <strong>

            ${streak}
            ngày

          </strong>

        </div>


      </div>


      <!-- HISTORY -->

      ${renderCarryFullHistory(
        history
      )}


    </section>
  `;
}


/* =====================================================
   ERROR
===================================================== */

function renderLiveValidationError(
  message
) {

  const container =
    ensureLiveValidationContainer();


  if (!container) {
    return;
  }


  container.innerHTML = `

    <section class="live-card">


      <div class="live-card-header">

        <div>

          <div class="live-title">
            LIVE VALIDATION
          </div>

        </div>


        <div class="live-badge">

          <span></span>

          LIVE

        </div>

      </div>


      <div class="live-empty">

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


/* =====================================================
   HISTORY CẦU GỢI Ý
===================================================== */

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
                    normalizeDisplayNumber(
                      item.number
                    )
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


/* =====================================================
   GỢI Ý CHÍNH
===================================================== */

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


/* =====================================================
   GỢI Ý PHỤ
===================================================== */

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
   RENDER DÀN SỐ GỢI Ý
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


  /*
  Chỉ hiển thị 5 số đầu tiên
  theo thứ tự nội bộ V2.6.2.

  Không hiển thị ranking.
  */

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


    const target =

      document.getElementById(
        "live-validation-panel"
      )

      ||

      document.getElementById(
        "today-prediction"
      );


    target?.scrollIntoView({

      behavior: "smooth",
      block: "start"

    });
  };


/*
Top số theo mô hình đã bỏ.
Giữ function để index.html cũ không lỗi.
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

                      `${escapeHtml(
                        number
                      )}: ` +

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