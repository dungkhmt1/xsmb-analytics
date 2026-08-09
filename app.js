/*
========================================================
XSMB ANALYTICS FRONTEND
V2.7 STABILIZATION
========================================================

- Không tự gọi /api/save-prediction khi mở trang.
- Mỗi API lỗi độc lập.
- Có timeout.
- Không cache API.
- Giữ:
  + Latest
  + Bridge Predict V2.6.2
  + Live Validation
  + Tracking
  + Cầu 5 chữ số
========================================================
*/


document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadDashboard();
  }
);


/* =====================================================
   API HELPER
===================================================== */

async function apiFetch(
  url,
  options = {},
  timeoutMs = 15000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const separator =
      url.includes("?")
        ? "&"
        : "?";

    const response =
      await fetch(
        `${url}${separator}t=${Date.now()}`,
        {
          ...options,
          cache: "no-store",
          signal: controller.signal
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
        data.error ||
        "API trả về success=false"
      );
    }

    return data;
  }
  catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "API phản hồi quá lâu."
      );
    }

    throw error;
  }
  finally {
    clearTimeout(timer);
  }
}


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {
  setSystemStatus(
    "Đang kết nối dữ liệu...",
    ""
  );


  /*
  V2.7.1:
  Homepage chỉ READ.

  Việc lưu/chấm prediction nhiều ngày do:
  /api/update
        ↓
  /api/tracking-sync

  Không còn phụ thuộc người dùng mở website.
  */
  const [
    latestResult,
    statisticsResult,
    predictResult,
    liveResult
  ] =
    await Promise.allSettled([
      apiFetch(
        "/api/latest"
      ),

      apiFetch(
        "/api/statistics"
      ),

      apiFetch(
        "/api/predict",
        {},
        20000
      ),

      apiFetch(
        "/api/live-validation",
        {},
        15000
      )
    ]);


  let totalDraws = 0;


  if (
    latestResult.status ===
    "fulfilled"
  ) {
    renderLatest(
      latestResult.value
    );
  }
  else {
    console.error(
      "Latest:",
      latestResult.reason
    );

    renderLatestError(
      latestResult.reason?.message ||
      "Không kết nối được Latest API."
    );
  }


  if (
    statisticsResult.status ===
    "fulfilled"
  ) {
    totalDraws =
      Number(
        statisticsResult
          .value
          ?.totalDraws
        ||
        0
      );

    updateTotalDraws(
      totalDraws
    );
  }
  else {
    console.error(
      "Statistics:",
      statisticsResult.reason
    );
  }


  if (
    predictResult.status ===
    "fulfilled"
  ) {
    const data =
      predictResult.value;

    renderPrediction(
      data,
      totalDraws
    );

    setSystemStatus(
      `D1 ${totalDraws} kỳ • ` +
      `${data.version || "bridge-v2.7.1"} • ` +
      `${Math.min(
        5,
        data.suggestions?.length || 0
      )} cặp AB-BA`,
      "success"
    );
  }
  else {
    console.error(
      "Predict:",
      predictResult.reason
    );

    renderPredictionError(
      predictResult.reason?.message ||
      "Không kết nối được Predict API.",
      totalDraws
    );

    setSystemStatus(
      `D1 ${totalDraws} kỳ • Predict lỗi`,
      "error"
    );
  }


  if (
    liveResult.status ===
    "fulfilled"
  ) {
    renderLiveValidation(
      liveResult.value
    );
  }
  else {
    console.error(
      "Live Validation:",
      liveResult.reason
    );

    renderLiveValidationError(
      liveResult.reason?.message ||
      "Không kết nối được Live Validation API."
    );
  }
}


/* =====================================================
   TOTAL DATA
===================================================== */

function updateTotalDraws(total) {
  [
    "header-total-draws",
    "total-draws",
    "data-count"
  ]
    .forEach(
      id => {
        const element =
          document.getElementById(id);

        if (element) {
          element.textContent =
            `${total} kỳ`;
        }
      }
    );
}


/* =====================================================
   LATEST
===================================================== */

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
      formatDate(date);
  }

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
          : values
            ? String(values)
                .trim()
                .split(/\s+/)
            : [];

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
                      ${escapeHtml(value)}
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


function renderLatestError(message) {
  const container =
    document.getElementById(
      "latest-result"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="skeleton-box">
      ${escapeHtml(message)}
    </div>
  `;
}


/* =====================================================
   LIVE VALIDATION
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


function normalizeCarryStatus(status) {
  const value =
    String(status || "")
      .toLowerCase();

  if (value === "hit") {
    return "hit";
  }

  if (value === "miss") {
    return "miss";
  }

  return "pending";
}


function carryStatusText(status) {
  const value =
    normalizeCarryStatus(status);

  if (value === "hit") {
    return "HIT";
  }

  if (value === "miss") {
    return "MISS";
  }

  return "ĐANG CHỜ";
}


function carryStatusIcon(status) {
  const value =
    normalizeCarryStatus(status);

  if (value === "hit") {
    return "✓";
  }

  if (value === "miss") {
    return "×";
  }

  return "•";
}


function getCarryHistory(
  item,
  currentCarry
) {
  let history = [];

  if (
    Array.isArray(item?.history) &&
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
                  ? "hit"
                  : row.hit === false
                    ? "miss"
                    : "pending"
              )
          })
        )
        .filter(
          row =>
            row.date &&
            row.number !== "--"
        );
  }


  if (!history.length) {
    if (
      item?.previousNumber &&
      item?.previousHitDate
    ) {
      history.push({
        date:
          item.previousHitDate,

        number:
          item.previousPair
          ||
          (
            Array.isArray(
              item.previousPairNumbers
            )
              ? item.previousPairNumbers.join(" - ")
              : normalizeDisplayNumber(
                  item.previousNumber
                )
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
          item.currentPair
          ||
          (
            Array.isArray(
              item.currentPairNumbers
            )
              ? item.currentPairNumbers.join(" - ")
              : normalizeDisplayNumber(
                  item.currentNumber
                )
          ),

        status:
          item.status ||
          "pending"
      });
    }
  }


  const map =
    new Map();

  for (const row of history) {
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


function getCarryHitStreak(
  item,
  history
) {
  const explicit =
    Number(
      item?.carryHitStreak || 0
    );

  if (explicit > 0) {
    return explicit;
  }

  let streak = 0;

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

    if (status === "pending") {
      continue;
    }

    if (status === "hit") {
      streak++;
      continue;
    }

    break;
  }

  return streak;
}


function getLastCarryHit(history) {
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


function renderCarryTransition(
  previousHit,
  currentNumber,
  currentStatus
) {
  if (!previousHit) {
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


function renderCarryFullHistory(history) {
  if (!history.length) {
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
                ? `• ${missCount} MISS`
                : ""
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
                          ? "current"
                          : ""
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


function renderLiveValidation(data) {
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
      ? currentCarry.promoted
      : Array.isArray(
          currentCarry?.items
        )
        ? currentCarry.items
        : [];


  if (!promoted.length) {
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


  const item =
    promoted[0];

  const history =
    getCarryHistory(
      item,
      currentCarry
    );

  const currentNumber =
    item.currentPair
      ||
      (
        Array.isArray(
          item.currentPairNumbers
        )
          ? item.currentPairNumbers.join(" - ")
          : normalizeDisplayNumber(
              item.currentNumber ||
              item.number
            )
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


      ${renderCarryTransition(
        previousHit,
        currentNumber,
        currentStatus
      )}


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


      ${renderCarryFullHistory(
        history
      )}

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
   PREDICTION
===================================================== */


function getPairNumbers(item) {
  if (
    Array.isArray(
      item?.pairNumbers
    ) &&
    item.pairNumbers.length
  ) {
    return [
      ...new Set(
        item.pairNumbers
          .map(
            normalizeDisplayNumber
          )
          .filter(
            number =>
              number !== "--"
          )
      )
    ];
  }

  const a =
    normalizeDisplayNumber(
      item?.number
    );

  if (a === "--") {
    return [];
  }

  const reverse =
    item?.reverseNumber
      ? normalizeDisplayNumber(
          item.reverseNumber
        )
      : `${a[1]}${a[0]}`;

  return a === reverse
    ? [a]
    : [a, reverse];
}


function getPairText(item) {
  if (item?.pair) {
    return String(
      item.pair
    );
  }

  const pair =
    getPairNumbers(
      item
    );

  if (!pair.length) {
    return "--";
  }

  return pair.length === 1
    ? pair[0]
    : `${pair[0]} - ${pair[1]}`;
}


function strengthName(value) {
  if (value === "very-strong") {
    return "RẤT MẠNH";
  }

  if (value === "strong") {
    return "MẠNH";
  }

  if (value === "qualified") {
    return "ĐÁNG CHÚ Ý";
  }

  return "GỢI Ý";
}


function strengthClass(value) {
  if (value === "very-strong") {
    return "pick-strength-max";
  }

  if (value === "strong") {
    return "pick-strength-strong";
  }

  return "pick-strength-normal";
}


function renderPickHistory(history) {
  if (
    !Array.isArray(history) ||
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

  if (!rows.length) {
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


function renderPrimaryPick(item) {
  const pair =
    getPairText(
      item
    );

  return `
    <article class="pick-primary">

      <div class="pick-primary-top">
        <span class="pick-primary-label">
          GỢI Ý CHÍNH AB-BA
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
          pair
        )}
      </div>


      <div class="pick-primary-message">
        ${
          item.carryPriority
            ? `ƯU TIÊN: tiếp tục vị trí đã HIT ${
                item.previousHitDate
                  ? formatDate(
                      item.previousHitDate
                    )
                  : ""
              }`
            : "AB hoặc BA xuất hiện đều tính HIT"
        }
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


function renderSecondaryPick(item) {
  const pair =
    getPairText(
      item
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
          pair
        )}
      </div>


      <div class="pick-card-bridge">
        ${
          item.carryPriority
            ? `<strong>ƯU TIÊN HIT</strong><br>`
            : ""
        }

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

  const top5 =
    suggestions.slice(0, 5);


  if (!top5.length) {
    container.innerHTML = `
      <section class="pick-panel">

        <div class="pick-panel-header">
          <div>
            <div class="pick-panel-title">
              DÀN CẶP GỢI Ý AB-BA
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
    top5.slice(1);


  container.innerHTML = `
    <section class="pick-panel">

      <div class="pick-panel-header">
        <div>
          <div class="pick-panel-title">
            DÀN CẶP GỢI Ý AB-BA
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
          CẶP
        </div>
      </div>


      ${renderPrimaryPick(
        primary
      )}


      ${
        secondary.length
          ? `
            <div class="pick-secondary-title">
              CÁC CẶP ĐÁNG CHÚ Ý KHÁC
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
          : ""
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
          AB-BA V2.7
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
        DÀN CẶP GỢI Ý AB-BA
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

function datePart(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .split("T")[0]
    .split(" ")[0];
}


function formatDate(value) {
  if (!value) {
    return "--/--/----";
  }

  const parts =
    datePart(value)
      .split("-");

  if (parts.length !== 3) {
    return escapeHtml(value);
  }

  return (
    `${parts[2]}/` +
    `${parts[1]}/` +
    `${parts[0]}`
  );
}


function formatDateShort(value) {
  if (!value) {
    return "--/--";
  }

  const parts =
    datePart(value)
      .split("-");

  if (parts.length !== 3) {
    return escapeHtml(value);
  }

  return (
    `${parts[2]}/` +
    `${parts[1]}`
  );
}


function normalizeDisplayNumber(value) {
  const digits =
    String(value ?? "")
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
    .slice(-2);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function money(value) {
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
    await loadDashboard();
  };


/* =====================================================
   NAVIGATION
===================================================== */

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


window.showTracking =
  async function () {
    setActiveNav(1);

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


window.showFiveDigitBridge =
  async function () {
    setActiveNav(2);

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


/* =====================================================
   TRACKING
===================================================== */

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
    <div class="skeleton-box">
      Đang tải toàn bộ cặp AB-BA...
    </div>
  `;

  table.innerHTML = "";


  try {
    const data =
      await apiFetch(
        "/api/prediction-history?limit=60",
        {},
        15000
      );


    const s =
      data.summary || {};


    summary.innerHTML = `
      <div class="tracking-summary-grid">

        <div>
          <small>Kỳ hoàn thành</small>
          <strong>${s.completed || 0}</strong>
        </div>

        <div>
          <small>Cặp đã chấm</small>
          <strong>${s.evaluatedPairs || 0}</strong>
        </div>

        <div>
          <small>Cặp HIT</small>
          <strong class="profit">${s.hitPairs || 0}</strong>
        </div>

        <div>
          <small>Cặp MISS</small>
          <strong class="loss">${s.missPairs || 0}</strong>
        </div>

        <div>
          <small>Tỷ lệ HIT</small>
          <strong class="profit">
            ${Number(
              s.pairHitRate || 0
            ).toFixed(1)}%
          </strong>
        </div>

        <div>
          <small>Tỷ lệ MISS</small>
          <strong class="loss">
            ${Number(
              s.pairMissRate || 0
            ).toFixed(1)}%
          </strong>
        </div>

      </div>


      <div class="warning-box">
        Top1:
        <strong>
          ${Number(
            s.top1?.hitRate || 0
          ).toFixed(1)}%
        </strong>

        · Top3:
        <strong>
          ${Number(
            s.top3?.hitRate || 0
          ).toFixed(1)}%
        </strong>

        · Top5:
        <strong>
          ${Number(
            s.top5?.hitRate || 0
          ).toFixed(1)}%
        </strong>

        <br>

        Một cặp được tính HIT khi
        <strong>AB hoặc BA</strong>
        xuất hiện trong kết quả.
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
        <div class="skeleton-box">
          Chưa có lịch sử AB-BA.
        </div>
      `;

      return;
    }


    table.innerHTML =
      history
        .map(
          day => {
            const pairs =
              Array.isArray(
                day.pairs
              )
                ? day.pairs
                : [];


            const rows =
              pairs
                .map(
                  item => {
                    const status =
                      item.status ||
                      "pending";

                    const statusText =
                      status === "hit"
                        ? `✓ HIT${
                            item.hitNumber
                              ? ` (${escapeHtml(
                                  item.hitNumber
                                )})`
                              : ""
                          }`
                        : status === "miss"
                          ? "✕ MISS"
                          : "• CHỜ";

                    const statusClass =
                      status === "hit"
                        ? "profit"
                        : status === "miss"
                          ? "loss"
                          : "";


                    return `
                      <tr>

                        <td>
                          #${escapeHtml(
                            item.rank
                          )}
                        </td>

                        <td>
                          <strong>
                            ${escapeHtml(
                              item.pair
                            )}
                          </strong>
                        </td>

                        <td class="${statusClass}">
                          <strong>
                            ${statusText}
                          </strong>
                        </td>

                        <td>
                          ${escapeHtml(
                            item.bridge || "-"
                          )}
                        </td>

                        <td>
                          ${Number(
                            item.score || 0
                          ).toFixed(1)}
                        </td>

                      </tr>
                    `;
                  }
                )
                .join("");


            const dayStatus =
              day.status ===
              "completed"
                ? `
                  <span class="profit">
                    ${day.hitPairs || 0} HIT
                  </span>
                  /
                  <span class="loss">
                    ${day.missPairs || 0} MISS
                  </span>
                  ·
                  ${Number(
                    day.pairHitRate || 0
                  ).toFixed(1)}%
                `
                : `
                  <span>Chờ kết quả</span>
                `;


            return `
              <div
                class="prediction-card"
                style="margin-bottom:14px;"
              >

                <div
                  class="card-header"
                  style="margin-bottom:12px;"
                >
                  <div>
                    <div class="section-label">
                      ${formatDate(
                        day.date
                      )}
                    </div>

                    <h3
                      style="
                        margin:4px 0 0;
                        font-size:16px;
                      "
                    >
                      ${day.pairCount || 0}
                      cặp AB-BA
                    </h3>
                  </div>

                  <div
                    style="
                      text-align:right;
                      font-size:13px;
                    "
                  >
                    ${dayStatus}
                  </div>
                </div>


                <div class="table-wrapper">

                  <table class="tracking-table">

                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Cặp</th>
                        <th>Kết quả</th>
                        <th>Cầu</th>
                        <th>Điểm</th>
                      </tr>
                    </thead>

                    <tbody>
                      ${rows}
                    </tbody>

                  </table>

                </div>

              </div>
            `;
          }
        )
        .join("");
  }
  catch (error) {
    console.error(
      "Tracking AB-BA:",
      error
    );

    summary.innerHTML = `
      <div class="skeleton-box">
        ${escapeHtml(
          error.message
        )}
      </div>
    `;

    table.innerHTML = "";
  }
}


/* =====================================================
   CẦU 5 CHỮ SỐ
===================================================== */

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
    <div class="skeleton-box">
      Đang phân tích cầu 5 chữ số...
    </div>
  `;


  try {
    const data =
      await apiFetch(
        "/api/five-digit-bridge",
        {},
        20000
      );

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
      <div class="skeleton-box">
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
              : signal.streak === 1
                ? "Cầu chạy 1 ngày"
                : "Cầu mới";

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
                    ? ` - ${escapeHtml(
                        signal.reverse
                      )}`
                    : ""
                }
              </div>

              <div class="score">
                ${
                  signal.pattern
                    ? `Pattern: ${escapeHtml(
                        signal.pattern
                      )}`
                    : ""
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
        ? `
          <div class="secondary-numbers">
            ${topNumbers}
          </div>
        `
        : ""
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
