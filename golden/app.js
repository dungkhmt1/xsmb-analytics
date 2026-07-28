const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  refreshBtn: $("#refreshBtn"),

  v1Panel: $("#v1Panel"),
  v2Panel: $("#v2Panel"),
  v1Summary: $("#v1Summary"),

  latestDate: $("#latestDate"),
  songThu: $("#songThu"),
  pairScore: $("#pairScore"),

  main10: $("#main10"),
  details: $("#details"),

  weights: $("#weights"),
  calibrationInfo: $("#calibrationInfo"),

  copyBtn: $("#copyBtn"),

  tracked: $("#tracked"),
  hits: $("#hits"),
  rate: $("#rate"),

  historyBody: $("#historyBody"),

  backtestBtn: $("#backtestBtn"),
  backtestResult: $("#backtestResult"),
};

let stateV2 = null;


/* =====================================================
   HELPERS
===================================================== */

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function dateVN(iso) {
  if (!iso) {
    return "--/--/----";
  }

  const [year, month, day] =
    String(iso)
      .slice(0, 10)
      .split("-");

  if (!year || !month || !day) {
    return esc(iso);
  }

  return `${day}/${month}/${year}`;
}


async function fetchJson(
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
    const response =
      await fetch(
        `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`,
        {
          ...options,
          cache: "no-store",
          signal: controller.signal,
        }
      );

    const data =
      await response
        .json()
        .catch(() => ({}));

    if (
      !response.ok ||
      data.success === false
    ) {
      throw new Error(
        data.error ||
        data.message ||
        `HTTP ${response.status}`
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


function modelLabel(name) {
  return {
    frequency: "Frequency",
    cycle: "Cycle",
    position: "Position",
    temporal: "Temporal",
  }[name] || name;
}


/* =====================================================
   RENDER V2
===================================================== */

function renderV2(data) {
  stateV2 = data;

  if (els.latestDate) {
    els.latestDate.textContent =
      `Dữ liệu đến ${dateVN(data.sourceLatestDate)} · ` +
      `dự đoán ${dateVN(data.predictionDate)}`;
  }


  if (els.songThu) {
    const [a, b] =
      Array.isArray(data.songThu)
        ? data.songThu
        : ["--", "--"];

    els.songThu.innerHTML = `
      <span>${esc(a)}</span>
      <span class="dash">—</span>
      <span>${esc(b)}</span>
    `;
  }


  if (els.pairScore) {
    els.pairScore.textContent =
      Number(
        data.pairScore ?? 0
      )
        .toFixed(0);
  }


  if (els.main10) {
    els.main10.innerHTML =
      (data.main10 || [])
        .map(
          number => `
            <div class="number-chip">
              ${esc(number)}
            </div>
          `
        )
        .join("");
  }


  if (els.details) {
    els.details.innerHTML =
      (data.details || [])
        .map(
          item => `
            <article class="detail-row">

              <div class="detail-number">
                ${esc(item.number)}
              </div>

              <div class="detail-main">

                <div>
                  <strong>
                    ${esc(
                      modelLabel(
                        item.strongestModel
                      )
                    )}
                  </strong>

                  · Final
                  ${Number(
                    item.finalScore ?? 0
                  ).toFixed(1)}
                </div>

                <div class="detail-reason">
                  Top10 đồng thuận:
                  ${esc(
                    item.modelsInTop10 ?? 0
                  )}/4
                  · Gap:
                  ${esc(item.gap ?? "--")}
                  · Cycle median:
                  ${esc(
                    item.cycleMedian ?? "--"
                  )}
                  · Momentum 10/30:
                  ${esc(
                    item.momentum10_30 ?? "--"
                  )}
                </div>

              </div>

            </article>
          `
        )
        .join("");
  }


  if (els.weights) {
    els.weights.innerHTML =
      Object.entries(
        data.modelWeights || {}
      )
        .map(
          ([name, weight]) => `
            <article class="weight-box">
              <span>
                ${esc(modelLabel(name))}
              </span>

              <strong>
                ${
                  (
                    Number(weight || 0) *
                    100
                  )
                    .toFixed(1)
                }%
              </strong>
            </article>
          `
        )
        .join("");
  }


  if (els.calibrationInfo) {
    els.calibrationInfo.textContent =
      `Trọng số được hiệu chỉnh từ ` +
      `${data.calibration?.tested ?? 0} ` +
      `kỳ walk-forward gần nhất.`;
  }


  if (els.tracked) {
    els.tracked.textContent =
      data.performance?.tracked ?? 0;
  }


  if (els.hits) {
    els.hits.textContent =
      data.performance?.hits ?? 0;
  }


  if (els.rate) {
    els.rate.textContent =
      `${data.performance?.rate ?? 0}%`;
  }


  if (els.historyBody) {
    const rows =
      Array.isArray(data.history)
        ? data.history
        : [];

    els.historyBody.innerHTML =
      rows.length
        ?
        rows
          .map(
            row => {
              let result =
                `<span class="pending">Chờ kết quả</span>`;

              if (row.evaluated) {
                result =
                  row.hit
                    ?
                    `<span class="hit">
                      ✓ Nổ (${esc(row.hitNumber)})
                    </span>`
                    :
                    `<span class="miss">
                      ✕ Trượt
                    </span>`;
              }

              return `
                <tr>
                  <td>
                    ${dateVN(
                      row.predictionDate
                    )}
                  </td>

                  <td>
                    <strong>
                      ${esc(
                        Array.isArray(row.songThu)
                          ? row.songThu.join(" - ")
                          : "--"
                      )}
                    </strong>
                  </td>

                  <td>
                    ${result}
                  </td>
                </tr>
              `;
            }
          )
          .join("")
        :
        `
          <tr>
            <td
              colspan="3"
              class="muted"
            >
              Chưa có prediction V2 đã khóa.
            </td>
          </tr>
        `;
  }
}


/* =====================================================
   LOAD V2
===================================================== */

async function loadV2() {
  const data =
    await fetchJson(
      "/api/golden/v2/dashboard"
    );

  renderV2(data);

  return data;
}


/* =====================================================
   LOAD V1
===================================================== */

async function loadV1() {
  if (!els.v1Summary) {
    return null;
  }

  try {
    const data =
      await fetchJson(
        "/api/golden/dashboard"
      );

    const pair =
      data.songThu?.numbers?.join(" - ")
      ||
      "--";

    els.v1Summary.innerHTML = `
      <div>
        <strong>
          Song thủ V1:
        </strong>
        ${esc(pair)}
      </div>

      <div>
        <strong>
          Dàn 10:
        </strong>
        ${esc(
          (data.main10 || []).join(" ")
        )}
      </div>

      <div>
        <strong>
          Hiệu suất:
        </strong>

        ${esc(
          data.performance?.hits ?? 0
        )}
        /
        ${esc(
          data.performance?.tracked ?? 0
        )}

        (
        ${esc(
          data.performance?.rate ?? 0
        )}%
        )
      </div>
    `;

    return data;
  }
  catch (error) {
    console.error(
      "Golden V1:",
      error
    );

    els.v1Summary.textContent =
      `Không tải được V1: ${error.message}`;

    return null;
  }
}


/* =====================================================
   REFRESH
===================================================== */

async function refreshAll() {
  if (els.refreshBtn) {
    els.refreshBtn.disabled = true;
  }

  try {
    const results =
      await Promise.allSettled([
        loadV2(),
        loadV1()
      ]);

    const v2Result =
      results[0];

    if (
      v2Result.status ===
      "rejected"
    ) {
      console.error(
        "Golden V2:",
        v2Result.reason
      );

      if (els.latestDate) {
        els.latestDate.textContent =
          `Không tải được Golden V2: ` +
          `${v2Result.reason?.message || "Lỗi không xác định"}`;
      }
    }
  }
  finally {
    if (els.refreshBtn) {
      els.refreshBtn.disabled = false;
    }
  }
}


/* =====================================================
   BACKTEST
===================================================== */

async function runBacktest() {
  if (
    !els.backtestBtn ||
    !els.backtestResult
  ) {
    return;
  }

  els.backtestBtn.disabled =
    true;

  els.backtestResult.textContent =
    "Đang chạy strict walk-forward...";

  try {
    const data =
      await fetchJson(
        "/api/golden/v2/backtest?limit=10",
        {},
        30000
      );

    els.backtestResult.innerHTML = `
      <strong>
        ${esc(data.testedDraws)}
      </strong>
      kỳ ·

      Song thủ:
      <strong>
        ${esc(data.songThuHits)}
      </strong>
      kỳ
      (${esc(data.songThuHitRate)}%)

      · Dàn 10 có ≥1 số:
      <strong>
        ${esc(data.main10HitDraws)}
      </strong>
      kỳ
      (${esc(data.main10HitRate)}%).

      <br>

      <small>
        ${esc(data.warning)}
      </small>
    `;
  }
  catch (error) {
    console.error(
      "Golden V2 Backtest:",
      error
    );

    els.backtestResult.textContent =
      `Backtest lỗi: ${error.message}`;
  }
  finally {
    els.backtestBtn.disabled =
      false;
  }
}


/* =====================================================
   VERSION SWITCH
===================================================== */

$$(".version-btn")
  .forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          $$(".version-btn")
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          button.classList.add(
            "active"
          );

          const version =
            button.dataset.version;

          if (els.v1Panel) {
            els.v1Panel.hidden =
              version !== "v1";
          }

          if (els.v2Panel) {
            els.v2Panel.hidden =
              version !== "v2";
          }
        }
      );
    }
  );


/* =====================================================
   EVENTS
===================================================== */

if (els.refreshBtn) {
  els.refreshBtn.addEventListener(
    "click",
    refreshAll
  );
}


if (els.backtestBtn) {
  els.backtestBtn.addEventListener(
    "click",
    runBacktest
  );
}


if (els.copyBtn) {
  els.copyBtn.addEventListener(
    "click",
    async () => {
      const numbers =
        stateV2?.main10 || [];

      if (!numbers.length) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          numbers.join(" ")
        );

        const oldText =
          els.copyBtn.textContent;

        els.copyBtn.textContent =
          "Đã copy";

        setTimeout(
          () => {
            els.copyBtn.textContent =
              oldText;
          },
          1200
        );
      }
      catch (error) {
        console.error(
          "Clipboard:",
          error
        );
      }
    }
  );
}


/* =====================================================
   START
===================================================== */

refreshAll();
