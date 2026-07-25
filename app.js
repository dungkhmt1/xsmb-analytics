/*
========================================================
XSMB ANALYTICS FRONTEND
V2.6.2 + BRIDGE RESULT + LIVE CARRY
========================================================
*/

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
});


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard() {

  setSystemStatus(
    "Đang kết nối dữ liệu...",
    ""
  );


  /*
  LIVE VALIDATION là API bổ sung.

  Nếu API này chưa tồn tại thì các phần:
  latest / statistics / predict
  vẫn hoạt động bình thường.
  */

  const [
    latestResult,
    statisticsResult,
    predictResult,
    liveResult
  ] = await Promise.allSettled([

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
    ),

    fetch(
      `/api/live-validation?t=${Date.now()}`,
      {
        cache: "no-store"
      }
    )

  ]);


  let totalDraws = 0;


  /* ===================================================
     LATEST RESULT
  =================================================== */

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


  /* ===================================================
     STATISTICS
  =================================================== */

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


  /* ===================================================
     PREDICT V2.6.2
  =================================================== */

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
          "Predict lỗi"
        );
      }


      renderPrediction(
        data,
        totalDraws
      );


      setSystemStatus(

        `D1 ${totalDraws} kỳ • ` +

        `${data.version || "bridge-v2.6.2"} • ` +

        `${data.counts?.veryStrong || 0} rất mạnh • ` +

        `${data.counts?.strong || 0} mạnh`,

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


  /* ===================================================
     LIVE VALIDATION / CARRY
  =================================================== */

  if (
    liveResult.status ===
    "fulfilled"
  ) {

    try {

      const response =
        liveResult.value;


      /*
      API chưa được tạo:
      không làm hỏng dashboard.
      */

      if (
        response.status === 404
      ) {

        removeLiveValidationPanel();

      }
      else {

        if (!response.ok) {

          throw new Error(
            `Live API ${response.status}`
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
    .forEach(id => {

      const element =
        document.getElementById(
          id
        );


      if (element) {

        element.textContent =
          `${total} kỳ`;
      }
    });
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


  /*
  Hỗ trợ các schema /api/latest
  đã dùng trước đây.
  */

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
        Array.isArray(values)

          ?

          values

          :

          values

            ?

            String(values)
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


/* =====================================================
   BRIDGE HISTORY HELPERS
===================================================== */

/*
========================================================
Lấy kỳ HIT gần nhất của chính cầu.

Ví dụ history:

24/07 -> 25/07 : 69
23/07 -> 24/07 : 82

=> trả 25/07 : 69
========================================================
*/

function getLatestBridgeResult(
  history
) {

  if (
    !Array.isArray(history) ||
    !history.length
  ) {
    return null;
  }


  const valid =
    history
      .filter(
        item =>
          item &&
          item.targetDate &&
          item.number !== undefined &&
          item.number !== null
      );


  if (!valid.length) {
    return null;
  }


  valid.sort(
    (a, b) =>
      String(
        b.targetDate
      )
        .localeCompare(
          String(
            a.targetDate
          )
        )
  );


  return valid[0];
}


/*
========================================================
Hiển thị thật rõ kết quả gần nhất.

Ví dụ:

KẾT QUẢ CẦU GẦN NHẤT
25/07/2026 • 69 ✓ HIT

24/07 → 25/07
========================================================
*/

function renderLatestBridgeResult(
  history
) {

  const latest =
    getLatestBridgeResult(
      history
    );


  if (!latest) {

    return `

      <div class="score">

        Kết quả cầu gần nhất:

        <strong>
          Chưa có dữ liệu
        </strong>

      </div>
    `;
  }


  return `

    <div
      class="score bridge-latest-result"
      style="
        margin-top:8px;
        padding:8px 10px;
        border-radius:8px;
        background:rgba(22,163,74,.10);
      "
    >

      <div>

        <strong>
          KẾT QUẢ CẦU GẦN NHẤT
        </strong>

      </div>


      <div
        style="
          margin-top:4px;
          font-size:16px;
        "
      >

        <strong>
          ${formatDate(
            latest.targetDate
          )}

          •

          <span class="number-cell">
            ${escapeHtml(
              latest.number
            )}
          </span>

          ✓ HIT
        </strong>

      </div>


      <div
        style="
          margin-top:3px;
          opacity:.8;
        "
      >

        ${formatDate(
          latest.sourceDate
        )}

        →

        ${formatDate(
          latest.targetDate
        )}

      </div>

    </div>
  `;
}


/*
========================================================
Hiển thị số mà cùng cầu đang sinh hôm nay.

Ví dụ:

25/07 -> 26/07
Số hiện tại: 85
ĐANG CHỜ KẾT QUẢ
========================================================
*/

function renderCurrentBridgePrediction(
  item,
  sourceDate,
  predictionDate
) {

  if (
    !item?.number
  ) {
    return "";
  }


  return `

    <div
      class="score"
      style="
        margin-top:8px;
        padding:8px 10px;
        border-radius:8px;
        background:rgba(37,99,235,.08);
      "
    >

      <div>
        <strong>
          SỐ CẦU ĐANG SINH
        </strong>
      </div>


      <div
        style="
          margin-top:4px;
        "
      >

        ${formatDate(
          sourceDate
        )}

        →

        ${formatDate(
          predictionDate
        )}

      </div>


      <div
        style="
          margin-top:3px;
          font-size:16px;
        "
      >

        Số:

        <strong
          class="number-cell"
        >
          ${escapeHtml(
            item.number
          )}
        </strong>

        •

        ĐANG CHỜ

      </div>

    </div>
  `;
}


/*
========================================================
Toàn bộ streak hiện tại của cầu.
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


  const sorted =
    [...history]
      .sort(
        (a, b) =>
          String(
            a.targetDate || ""
          )
            .localeCompare(
              String(
                b.targetDate || ""
              )
            )
      );


  return `

    <div class="bridge-history">

      <div
        style="
          margin-top:8px;
          font-weight:600;
        "
      >
        Lịch sử cầu đang chạy:
      </div>

      ${
        sorted
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

                ✓ HIT

              </div>

            `
          )
          .join("")
      }

    </div>
  `;
}


/* =====================================================
   PREDICT V2.6.2
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


      if (
        value ===
        "qualified"
      ) {
        return "ĐẠT CHUẨN";
      }


      return String(
        value ||
        "ĐẠT CHUẨN"
      )
        .toUpperCase();
    };


  const recentName =
    value => {

      if (
        value ===
        "active"
      ) {
        return "Gần đây: tốt";
      }


      if (
        value ===
        "limited"
      ) {
        return "Gần đây: ít mẫu";
      }


      if (
        value ===
        "historical-only"
      ) {
        return "Chỉ mạnh lịch sử";
      }


      return (
        value ||
        "-"
      );
    };


  if (
    !suggestions.length
  ) {

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


  /*
  ====================================================
  DANH SÁCH CÁC CẦU

  Điểm mới:
  - hiện kết quả 25/07 của từng cầu
  - hiện số đang sinh cho 26/07
  ====================================================
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

              &nbsp;

              ${strengthName(
                item.strength
              )}

            </div>


            <div
              style="
                margin-top:5px;
                font-weight:600;
              "
            >

              ${escapeHtml(
                item.bridge
              )}

            </div>


            ${renderLatestBridgeResult(
              item.history
            )}


            ${renderCurrentBridgePrediction(
              item,
              data.sourceDate,
              data.predictionDate
            )}


            <div
              style="
                margin-top:8px;
              "
            >

              Cầu hiện tại:

              <strong>
                ${item.streak} kỳ
              </strong>

              •

              ${recentName(
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
                ${signed(
                  item.edge
                )}%
              </strong>

            </div>


            <div>

              Wilson:

              ${item.wilsonLowerBound}%

              • Wilson Edge:

              <strong>

                ${signed(
                  item.wilsonEdge
                )}%

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


  /*
  ====================================================
  CARD TOP 1
  ====================================================
  */

  container.innerHTML = `

    <div class="prediction-grid">


      <div class="prediction-card highlight">

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


        <div
          class="score"
          style="
            font-weight:600;
          "
        >

          ${escapeHtml(
            best.bridge
          )}

        </div>


        ${renderLatestBridgeResult(
          best.history
        )}


        ${renderCurrentBridgePrediction(
          best,
          data.sourceDate,
          data.predictionDate
        )}


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

          •

          ${best.recentSamples}
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

            ${signed(
              best.wilsonEdge
            )}%

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

          ${
            data.recommendationCount ||
            suggestions.length
          }

        </div>

        <div class="score">

          Historical loại:

          ${data.historicalOnlyCount || 0}

        </div>

      </div>

    </div>


    <div
      class="warning-box"
      style="
        margin-top:12px;
      "
    >

      <strong>
        CÁCH ĐỌC CẦU HÔM NAY
      </strong>

      <br><br>

      Ví dụ một cầu hiển thị:

      <br>

      <strong>
        24/07 → 25/07 : 69 ✓ HIT
      </strong>

      <br>

      có nghĩa cùng vị trí cầu đó
      đã sinh số 69 từ kết quả 24/07
      và 69 xuất hiện trong kết quả
      25/07.

      <br><br>

      Sau đó dùng chính vị trí đó
      trên kết quả 25/07 để sinh
      số mới cho 26/07.

    </div>


    <div class="top-suggestion-list">

      ${list}

    </div>


    <div class="warning-box">

      <strong>

        Predict

        ${escapeHtml(
          data.version ||
          "V2.6.2"
        )}

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

      ${data.analyzedDraws || 0} kỳ

      • baseline:

      ${data.baselineRate ?? 0}%

      <br><br>


      Điều kiện mặc định:

      ≥

      ${data.rule?.minSamples ?? "-"}

      mẫu

      • rate ≥

      ${data.rule?.minContinuationRate ?? "-"}%

      • edge ≥

      ${data.rule?.minEdgeVsBaseline ?? "-"}%

      • Wilson Edge ≥

      ${data.rule?.minWilsonEdge ?? "-"}%

      <br>


      Cầu không đủ bằng chứng
      trong 60 kỳ gần nhất được
      chuyển sang nhóm lịch sử
      và không dùng làm gợi ý hôm nay.

    </div>
  `;
}


/* =====================================================
   PREDICTION ERROR
===================================================== */

function renderPredictionError(
  message,
  totalDraws = 0
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

      ${escapeHtml(
        message
      )}

    </div>


    <div class="warning-box">

      Database:

      <strong>
        ${totalDraws} kỳ
      </strong>

    </div>
  `;
}


/* =====================================================
   LIVE VALIDATION UI
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
    document.createElement(
      "div"
    );


  container.id =
    "live-validation-panel";


  prediction.insertAdjacentElement(
    "beforebegin",
    container
  );


  return container;
}


function removeLiveValidationPanel() {

  document
    .getElementById(
      "live-validation-panel"
    )
    ?.remove();
}


function liveStatusText(
  status
) {

  if (
    status ===
    "hit"
  ) {

    return "✓ HIT";
  }


  if (
    status ===
    "miss"
  ) {

    return "✕ MISS";
  }


  return "ĐANG CHỜ";
}


function performanceText(
  metric
) {

  if (
    !metric ||
    !metric.tested
  ) {

    return "Chưa đủ dữ liệu";
  }


  return (

    `${metric.hits}` +

    "/" +

    `${metric.tested}` +

    ` = ${metric.hitRate}%`
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


  const lastHit =
    data.lastHit ||
    null;


  const currentCarry =
    data.currentCarry ||
    null;


  let hitHTML = "";


  if (
    lastHit &&
    Array.isArray(
      lastHit.hits
    ) &&
    lastHit.hits.length
  ) {

    hitHTML =
      lastHit.hits
        .map(
          hit => `

            <div class="prediction-card highlight">

              <div class="prediction-title">

                Cầu BASE vừa HIT

              </div>


              <div class="big-number">

                ${escapeHtml(
                  hit.number
                )}

              </div>


              <div class="score">

                <strong>

                  ${formatDate(
                    lastHit.date
                  )}

                  • ✓ HIT

                </strong>

              </div>


              <div class="score">

                Rank V2.6.2:

                <strong>

                  #${hit.rank || "-"}

                </strong>

              </div>


              <div class="score">

                ${escapeHtml(
                  hit.bridge ||
                  ""
                )}

              </div>


              <div class="score">

                Score:

                <strong>

                  ${
                    hit.score ??
                    "-"
                  }

                </strong>

              </div>

            </div>

          `
        )
        .join("");

  }
  else {

    hitHTML = `

      <div class="prediction-card">

        <div class="prediction-title">

          Cầu BASE vừa HIT

        </div>

        <div class="score">

          Chưa ghi nhận cầu HIT.

        </div>

      </div>
    `;
  }


  const promoted =
    Array.isArray(
      currentCarry?.promoted
    )

      ?

      currentCarry.promoted

      :

      [];


  let carryHTML = "";


  if (
    promoted.length
  ) {

    carryHTML =
      promoted
        .map(
          item => {

            const status =
              liveStatusText(
                item.status
              );


            const baseStatus =

              item.currentBaseQualified

                ?

                "Cầu vẫn đạt lọc V2.6.2"

                :

                "Carry riêng - cầu không nằm trong BASE hôm nay";


            return `

              <div class="prediction-card highlight">

                <div class="prediction-title">

                  Carry ưu tiên
                  #${item.liveRank || 1}

                </div>


                <div class="big-number">

                  ${escapeHtml(
                    item.currentNumber
                  )}

                </div>


                <div class="score">

                  Cầu trước:

                  <strong>

                    ${escapeHtml(
                      item.previousNumber ||
                      "--"
                    )}

                    ✓ HIT

                  </strong>

                </div>


                <div class="score">

                  ${formatDate(
                    item.previousHitDate
                  )}

                  :

                  ${escapeHtml(
                    item.previousNumber ||
                    "--"
                  )}

                  →

                  <strong>

                    ${escapeHtml(
                      item.currentNumber
                    )}

                  </strong>

                </div>


                <div class="score">

                  Dự đoán:

                  <strong>

                    ${formatDate(
                      currentCarry
                        ?.predictionDate
                    )}

                  </strong>

                  •

                  <strong>

                    ${status}

                  </strong>

                </div>


                <div class="score">

                  Carry streak:

                  <strong>

                    ${item.carryHitStreak || 1}

                  </strong>

                </div>


                <div class="score">

                  ${escapeHtml(
                    item.bridge ||
                    ""
                  )}

                </div>


                <div class="score">

                  ${escapeHtml(
                    baseStatus
                  )}

                </div>

              </div>
            `;
          }
        )
        .join("");

  }
  else {

    carryHTML = `

      <div class="prediction-card">

        <div class="prediction-title">

          Carry

        </div>

        <div class="score">

          Hiện không có cầu
          Carry đang theo.

        </div>

      </div>
    `;
  }


  const basePerformance =
    data.performance?.base ||
    {};


  const carryPerformance =
    data.performance?.carry ||
    {};


  container.innerHTML = `

    <div class="warning-box">

      <strong>

        LIVE VALIDATION • CARRY V2

      </strong>

      <br><br>

      Cầu đã HIT được giữ nguyên
      bridgeKey và đọc lại trên kết
      quả mới nhất để sinh số kế tiếp.

    </div>


    <div class="prediction-grid">

      ${hitHTML}

      ${carryHTML}

    </div>


    <div class="warning-box">

      <strong>
        So sánh Live
      </strong>

      <br><br>


      BASE V2.6.2

      • Top1:

      <strong>

        ${performanceText(
          basePerformance.top1
        )}

      </strong>

      • Top3:

      <strong>

        ${performanceText(
          basePerformance.top3
        )}

      </strong>

      • Top5:

      <strong>

        ${performanceText(
          basePerformance.top5
        )}

      </strong>

      <br>


      CARRY V2

      • Top1:

      <strong>

        ${performanceText(
          carryPerformance.top1
        )}

      </strong>

      • Top3:

      <strong>

        ${performanceText(
          carryPerformance.top3
        )}

      </strong>

      • Top5:

      <strong>

        ${performanceText(
          carryPerformance.top5
        )}

      </strong>

      <br><br>


      BASE:

      ${basePerformance.tested || 0}
      kỳ đã chấm

      •

      ${basePerformance.pending || 0}
      đang chờ.

      <br>


      CARRY:

      ${carryPerformance.tested || 0}
      kỳ đã chấm

      •

      ${carryPerformance.pending || 0}
      đang chờ.

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

    <div class="warning-box">

      <strong>
        LIVE VALIDATION
      </strong>

      <br>

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

  const element =
    document.getElementById(
      "analysis-detail"
    );


  if (!element) {
    return;
  }


  element.innerHTML = `

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
   GENERAL HELPERS
===================================================== */

function formatDate(
  value
) {

  if (!value) {

    return "--/--/----";
  }


  const text =
    String(
      value
    );


  /*
  Hỗ trợ ISO datetime.
  */

  const datePart =
    text.split("T")[0]
      .split(" ")[0];


  const parts =
    datePart
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


function escapeHtml(
  value
) {

  return String(
    value ??
    ""
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


function signed(
  value
) {

  const number =
    Number(
      value || 0
    );


  return (

    `${number >= 0 ? "+" : ""}` +

    `${number}`
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
        "today-prediction"
      )
      ?.scrollIntoView({

        behavior:
          "smooth",

        block:
          "start"

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

        behavior:
          "smooth",

        block:
          "start"

      });
  };


window.showBacktest =
  function () {

    window.open(
      "/api/backtest?days=100",
      "_blank"
    );
  };


/*
Giữ tương thích nếu index.html
còn nút Lịch sử.
*/

window.showHistory =
  function () {

    const trackingSection =
      document.getElementById(
        "tracking-section"
      );


    if (
      trackingSection
    ) {

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
        "/api/prediction-history",
        {
          cache:
            "no-store"
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

                      (
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
                      }${
                        money(
                          profit
                        )
                      }`
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
   CẦU 5 CHỮ SỐ - MODULE ĐỘC LẬP
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
        "/api/five-digit-bridge",
        {
          cache:
            "no-store"
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

                    ` - ${
                      escapeHtml(
                        signal.reverse
                      )
                    }`

                    :

                    ""
                }

              </div>


              <div class="score">

                ${
                  signal.pattern

                    ?

                    `Pattern: ${
                      escapeHtml(
                        signal.pattern
                      )
                    }`

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