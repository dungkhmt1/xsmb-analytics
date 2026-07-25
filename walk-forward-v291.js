/*
========================================================
XSMB WALK-FORWARD V2.9.1
STABILITY / REGIME TEST
========================================================

Yêu cầu:
- walk-forward-v28.js load trước
- walk-forward-v29.js load trước
- file này load cuối cùng

Không:
- thay candidate pool
- thay Feature Score
- thay trọng số
- học từ target
- thay production

Chỉ phân tích 90 ngày thành:

OLD    : offset 61 -> 90
MID    : offset 31 -> 60
RECENT : offset 1  -> 30

Mục tiêu:
Kiểm tra edge của V2.9 có ổn định theo thời gian
hay chỉ đến từ một giai đoạn.
========================================================
*/

const V291_VERSION =
  "walk-forward-v2.9.1-stability";


/*
========================================================
BLOCK CONFIG
========================================================
*/

const V291_BLOCKS = [

  {
    key: "old",

    label:
      "OLD 30",

    minOffset: 61,

    maxOffset: 90,

    expectedDays: 30
  },

  {
    key: "mid",

    label:
      "MID 30",

    minOffset: 31,

    maxOffset: 60,

    expectedDays: 30
  },

  {
    key: "recent",

    label:
      "RECENT 30",

    minOffset: 1,

    maxOffset: 30,

    expectedDays: 30
  }
];


/*
========================================================
BLOCK HELPERS
========================================================
*/

function getV291BlockDays(
  block
) {

  return v29Daily
    .filter(
      day =>

        Number(day.offset) >=
          block.minOffset

        &&

        Number(day.offset) <=
          block.maxOffset
    );
}


/*
========================================================
METRIC FOR A SINGLE BLOCK
========================================================
*/

function metricV291Block(

  days,

  modelKey,

  topKey,

  expectedDays
) {

  let availableDays = 0;

  let fullPickDays = 0;

  let hitDays = 0;

  let baselineTotal = 0;

  let requestedSize = 0;


  for (
    const day
    of days
  ) {

    const item =
      day[
        modelKey
      ]
        ?.evaluation
        ?.[topKey];


    if (!item) {
      continue;
    }


    requestedSize =
      item.requestedSize
      ||
      requestedSize;


    /*
    Không có prediction:
    không tính vào hit rate.

    Nhưng coverage vẫn bị giảm
    vì denominator là expectedDays.
    */

    if (
      item.actualPickCount <= 0
    ) {

      continue;
    }


    availableDays++;


    if (
      item.actualPickCount >=
      requestedSize
    ) {

      fullPickDays++;
    }


    if (
      item.hit
    ) {

      hitDays++;
    }


    baselineTotal +=
      Number(
        item.baselineRate
        ||
        0
      );
  }


  const hitRate =

    availableDays > 0

      ?

      hitDays /
      availableDays *
      100

      :

      0;


  const baselineRate =

    availableDays > 0

      ?

      baselineTotal /
      availableDays

      :

      0;


  const lift =
    hitRate -
    baselineRate;


  return {

    requestedSize,

    expectedDays,

    availableDays,

    fullPickDays,

    hitDays,

    hitRate:
      round(
        hitRate
      ),

    baselineRate:
      round(
        baselineRate
      ),

    lift:
      round(
        lift
      ),

    coverage:
      round(

        expectedDays > 0

          ?

          availableDays /
          expectedDays *
          100

          :

          0
      ),

    fullCoverage:
      round(

        expectedDays > 0

          ?

          fullPickDays /
          expectedDays *
          100

          :

          0
      )
  };
}


/*
========================================================
ANALYZE ONE BLOCK
========================================================
*/

function analyzeV291Block(
  block
) {

  const days =
    getV291BlockDays(
      block
    );


  const result = {

    ...block,

    actualRows:
      days.length,

    firstDate: null,

    lastDate: null,

    metrics: {}
  };


  if (
    days.length
  ) {

    const chronological =
      [
        ...days
      ]
        .sort(
          (
            a,
            b
          ) =>

            String(
              a.predictionDate
            )
              .localeCompare(
                String(
                  b.predictionDate
                )
              )
        );


    result.firstDate =
      chronological[0]
        ?.predictionDate
      ||
      null;


    result.lastDate =
      chronological[
        chronological.length -
        1
      ]
        ?.predictionDate
      ||
      null;
  }


  for (
    const topKey
    of [
      "top1",
      "top3",
      "top5"
    ]
  ) {

    const base =
      metricV291Block(

        days,

        "base",

        topKey,

        block.expectedDays
      );


    const v29 =
      metricV291Block(

        days,

        "v29",

        topKey,

        block.expectedDays
      );


    result.metrics[
      topKey
    ] = {

      base,

      v29,

      deltaLift:
        round(
          v29.lift -
          base.lift
        )
    };
  }


  return result;
}


/*
========================================================
ALL BLOCKS
========================================================
*/

function analyzeAllV291Blocks() {

  return V291_BLOCKS
    .map(
      analyzeV291Block
    );
}


/*
========================================================
FORMAT
========================================================
*/

function signedPctV291(
  value
) {

  const number =
    Number(value)
    ||
    0;


  return (
    number > 0
      ?
      "+"
      :
      ""
  )
  +
  pct(number);
}


function liftClassV291(
  value
) {

  return Number(value) >= 0
    ?
    "pos"
    :
    "neg";
}


/*
========================================================
BLOCK DATE LABEL
========================================================
*/

function blockDateV291(
  block
) {

  if (
    !block.firstDate
    ||
    !block.lastDate
  ) {

    return "--";
  }


  return (

    `${fmtDate(
      block.firstDate
    )}`

    +

    " → "

    +

    `${fmtDate(
      block.lastDate
    )}`
  );
}


/*
========================================================
STABILITY SUMMARY
========================================================
*/

function calculateStabilityV291(

  blocks,

  topKey
) {

  const valid =
    blocks.filter(
      block =>
        block.metrics[
          topKey
        ]
          .v29
          .availableDays >
        0
    );


  if (
    !valid.length
  ) {

    return {

      positiveBlocks: 0,

      improvedBlocks: 0,

      blockCount: 0,

      averageLift: 0,

      minLift: 0,

      maxLift: 0,

      spread: 0,

      status:
        "NO DATA"
    };
  }


  const lifts =
    valid.map(
      block =>
        Number(
          block
            .metrics[
              topKey
            ]
            .v29
            .lift
        )
    );


  const deltas =
    valid.map(
      block =>
        Number(
          block
            .metrics[
              topKey
            ]
            .deltaLift
        )
    );


  const positiveBlocks =
    lifts.filter(
      value =>
        value > 0
    )
      .length;


  const improvedBlocks =
    deltas.filter(
      value =>
        value > 0
    )
      .length;


  const averageLift =
    lifts.reduce(
      (
        sum,
        value
      ) =>
        sum +
        value,
      0
    )
    /
    lifts.length;


  const minLift =
    Math.min(
      ...lifts
    );


  const maxLift =
    Math.max(
      ...lifts
    );


  const spread =
    maxLift -
    minLift;


  /*
  Không phải production gate.

  Chỉ là diagnostic classification.
  */

  let status;


  if (
    positiveBlocks ===
      valid.length

    &&

    improvedBlocks >=
      2

    &&

    spread <= 10
  ) {

    status =
      "STABLE EDGE";

  }
  else if (
    positiveBlocks >= 2
  ) {

    status =
      "MIXED POSITIVE";

  }
  else if (
    positiveBlocks === 1
  ) {

    status =
      "REGIME DEPENDENT";

  }
  else {

    status =
      "NO EDGE";
  }


  return {

    positiveBlocks,

    improvedBlocks,

    blockCount:
      valid.length,

    averageLift:
      round(
        averageLift
      ),

    minLift:
      round(
        minLift
      ),

    maxLift:
      round(
        maxLift
      ),

    spread:
      round(
        spread
      ),

    status
  };
}


/*
========================================================
STATUS CLASS
========================================================
*/

function stabilityClassV291(
  status
) {

  if (
    status ===
    "STABLE EDGE"
  ) {

    return "pos";
  }


  if (
    status ===
    "NO EDGE"
  ) {

    return "neg";
  }


  return "";
}


/*
========================================================
CREATE PANEL
========================================================
*/

function ensureV291Panel() {

  let panel =
    document
      .getElementById(
        "v291-panel"
      );


  if (panel) {
    return panel;
  }


  panel =
    document.createElement(
      "div"
    );


  panel.id =
    "v291-panel";


  panel.className =
    "panel";


  const comparison =
    document
      .getElementById(
        "comparison-panel"
      );


  if (
    comparison
    &&
    comparison.parentNode
  ) {

    comparison
      .parentNode
      .insertBefore(
        panel,
        comparison.nextSibling
      );

  }
  else {

    document
      .querySelector(
        ".page"
      )
      ?.appendChild(
        panel
      );
  }


  return panel;
}


/*
========================================================
TOP BLOCK TABLE
========================================================
*/

function renderTopBlockTableV291(

  blocks,

  topKey,

  title
) {

  const rows =
    blocks
      .map(
        block => {

          const metric =
            block.metrics[
              topKey
            ];


          const base =
            metric.base;


          const v29 =
            metric.v29;


          return `

            <tr>

              <td>

                <strong>
                  ${block.label}
                </strong>

                <div
                  class="small"
                  style="margin-top:4px"
                >

                  ${blockDateV291(
                    block
                  )}

                </div>

              </td>


              <td>

                ${base.hitDays}
                /
                ${base.availableDays}

                <br>

                <strong>
                  ${pct(
                    base.hitRate
                  )}
                </strong>

              </td>


              <td>

                ${pct(
                  base.baselineRate
                )}

              </td>


              <td
                class="${
                  liftClassV291(
                    base.lift
                  )
                }"
              >

                ${signedPctV291(
                  base.lift
                )}

              </td>


              <td>

                ${v29.hitDays}
                /
                ${v29.availableDays}

                <br>

                <strong>
                  ${pct(
                    v29.hitRate
                  )}
                </strong>

              </td>


              <td>

                ${pct(
                  v29.baselineRate
                )}

              </td>


              <td
                class="${
                  liftClassV291(
                    v29.lift
                  )
                }"
              >

                ${signedPctV291(
                  v29.lift
                )}

              </td>


              <td
                class="${
                  liftClassV291(
                    metric.deltaLift
                  )
                }"
              >

                ${signedPctV291(
                  metric.deltaLift
                )}

              </td>


              <td>

                ${pct(
                  v29.coverage
                )}

              </td>

            </tr>
          `;
        }
      )
      .join("");


  return `

    <h3
      style="
        margin-top:22px;
        margin-bottom:10px;
      "
    >

      ${title}

    </h3>


    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Block
            </th>

            <th>
              V2.6.2 Hit
            </th>

            <th>
              Baseline
            </th>

            <th>
              Lift
            </th>

            <th>
              V2.9 Hit
            </th>

            <th>
              Baseline
            </th>

            <th>
              Lift
            </th>

            <th>
              Δ Lift
            </th>

            <th>
              Coverage
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


/*
========================================================
STABILITY SUMMARY TABLE
========================================================
*/

function renderStabilitySummaryV291(
  blocks
) {

  const configs = [

    {
      key: "top1",
      label: "TOP1"
    },

    {
      key: "top3",
      label: "TOP3"
    },

    {
      key: "top5",
      label: "TOP5"
    }
  ];


  const rows =
    configs
      .map(
        config => {

          const data =
            calculateStabilityV291(

              blocks,

              config.key
            );


          return `

            <tr>

              <td>

                <strong>
                  ${config.label}
                </strong>

              </td>


              <td>

                ${data.positiveBlocks}
                /
                ${data.blockCount}

              </td>


              <td>

                ${data.improvedBlocks}
                /
                ${data.blockCount}

              </td>


              <td
                class="${
                  liftClassV291(
                    data.averageLift
                  )
                }"
              >

                ${signedPctV291(
                  data.averageLift
                )}

              </td>


              <td
                class="${
                  liftClassV291(
                    data.minLift
                  )
                }"
              >

                ${signedPctV291(
                  data.minLift
                )}

              </td>


              <td
                class="${
                  liftClassV291(
                    data.maxLift
                  )
                }"
              >

                ${signedPctV291(
                  data.maxLift
                )}

              </td>


              <td>

                ${pct(
                  data.spread
                )}

              </td>


              <td
                class="${
                  stabilityClassV291(
                    data.status
                  )
                }"
              >

                <strong>
                  ${data.status}
                </strong>

              </td>

            </tr>
          `;
        }
      )
      .join("");


  return `

    <h3>
      Tổng hợp Stability
    </h3>


    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Nhóm
            </th>

            <th>
              Block Lift dương
            </th>

            <th>
              Block tốt hơn V2.6.2
            </th>

            <th>
              Avg Lift
            </th>

            <th>
              Min Lift
            </th>

            <th>
              Max Lift
            </th>

            <th>
              Spread
            </th>

            <th>
              Đánh giá
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


/*
========================================================
DIAGNOSTIC
========================================================
*/

function buildDiagnosticV291(
  blocks
) {

  const top1 =
    calculateStabilityV291(
      blocks,
      "top1"
    );


  const top3 =
    calculateStabilityV291(
      blocks,
      "top3"
    );


  const top5 =
    calculateStabilityV291(
      blocks,
      "top5"
    );


  let title;

  let text;

  let cssClass = "";


  /*
  ================================================
  CASE A
  TOP1 ổn định
  ================================================
  */

  if (
    top1.status ===
      "STABLE EDGE"
  ) {

    title =
      "Tín hiệu đáng chú ý: TOP1 tương đối ổn định";


    text =

      "V2.9 có lift dương ở cả 3 block TOP1. " +

      "Nếu kết quả này duy trì, hướng V2.10 phù hợp là " +

      "tập trung vào Top1 Selection thay vì tiếp tục tối ưu Top5.";


    cssClass =
      "pos";
  }


  /*
  ================================================
  CASE B
  REGIME
  ================================================
  */

  else if (

    top1.status ===
      "REGIME DEPENDENT"

    ||

    top3.status ===
      "REGIME DEPENDENT"

    ||

    (
      top1.spread > 15
      ||
      top3.spread > 15
    )

  ) {

    title =
      "Phát hiện dấu hiệu Regime";


    text =

      "Hiệu quả thay đổi mạnh giữa OLD / MID / RECENT. " +

      "Không nên tiếp tục dùng một bộ trọng số cố định cho mọi giai đoạn. " +

      "Hướng V2.10 nên kiểm tra Regime Detection.";


    cssClass =
      "";
  }


  /*
  ================================================
  CASE C
  MOSTLY POSITIVE
  ================================================
  */

  else if (

    top1.status ===
      "MIXED POSITIVE"

    ||

    top3.status ===
      "MIXED POSITIVE"

  ) {

    title =
      "Có tín hiệu nhưng chưa ổn định";


    text =

      "V2.9 có lợi thế ở ít nhất 2/3 block nhưng chưa nhất quán. " +

      "Chưa đủ cơ sở để thay production V2.6.2.";


    cssClass =
      "";
  }


  /*
  ================================================
  CASE D
  NO EDGE
  ================================================
  */

  else {

    title =
      "Không phát hiện edge ổn định";


    text =

      "Kết quả 90 ngày tổng hợp không được xác nhận xuyên suốt " +

      "ba giai đoạn độc lập. Không nên tiếp tục tối ưu Feature Score " +

      "trên cùng tập dữ liệu này.";


    cssClass =
      "neg";
  }


  return `

    <div
      style="
        margin-top:18px;
        padding:14px;
        border:1px solid #e4e6e8;
        border-radius:10px;
      "
    >

      <div
        class="${cssClass}"
        style="
          font-size:16px;
          font-weight:800;
          margin-bottom:7px;
        "
      >

        ${title}

      </div>


      <div
        class="small"
        style="
          font-size:13px;
        "
      >

        ${text}

      </div>


      <div
        class="small"
        style="
          margin-top:8px;
        "
      >

        Phân loại Stability chỉ là diagnostic,
        không phải xác suất trúng hay production gate.

      </div>

    </div>
  `;
}


/*
========================================================
RENDER V2.9.1
========================================================
*/

function renderV291() {

  const panel =
    ensureV291Panel();


  if (!panel) {
    return;
  }


  /*
  Stability Test cần đủ 90 offset.
  */

  const offsets =
    new Set(

      v29Daily.map(
        day =>
          Number(
            day.offset
          )
      )
    );


  const hasOld =
    [...offsets]
      .some(
        offset =>
          offset >= 61
          &&
          offset <= 90
      );


  const hasMid =
    [...offsets]
      .some(
        offset =>
          offset >= 31
          &&
          offset <= 60
      );


  const hasRecent =
    [...offsets]
      .some(
        offset =>
          offset >= 1
          &&
          offset <= 30
      );


  if (
    !hasOld
    ||
    !hasMid
    ||
    !hasRecent
  ) {

    panel.innerHTML = `

      <h2>
        V2.9.1 Stability Test
      </h2>


      <div
        style="
          padding:12px;
          background:#fff8e1;
          border-radius:9px;
          line-height:1.5;
        "
      >

        Cần chạy

        <strong>
          90 ngày
        </strong>

        để có đủ ba block độc lập:

        <br><br>

        OLD 30 → MID 30 → RECENT 30.

        <br><br>

        Hiện đã có:

        <strong>
          ${v29Daily.length}
        </strong>

        ngày kết quả.

      </div>
    `;


    return;
  }


  const blocks =
    analyzeAllV291Blocks();


  panel.innerHTML = `

    <h2>
      V2.9.1 Stability Test
    </h2>


    <p>

      Chia 90 ngày thành ba block
      không chồng nhau để kiểm tra
      Feature Score có ổn định
      theo thời gian hay không.

    </p>


    <div
      class="small"
      style="
        margin-bottom:16px;
      "
    >

      OLD = offset 61–90

      • MID = offset 31–60

      • RECENT = offset 1–30

    </div>


    ${renderStabilitySummaryV291(
      blocks
    )}


    ${renderTopBlockTableV291(
      blocks,
      "top1",
      "TOP1 theo từng block"
    )}


    ${renderTopBlockTableV291(
      blocks,
      "top3",
      "TOP3 theo từng block"
    )}


    ${renderTopBlockTableV291(
      blocks,
      "top5",
      "TOP5 theo từng block"
    )}


    ${buildDiagnosticV291(
      blocks
    )}
  `;
}


/*
========================================================
HOOK V2.9 RENDER

Giữ nguyên renderAllV29 gốc.
Sau khi V2.9 render xong,
V2.9.1 thêm Stability panel.
========================================================
*/

const originalRenderAllV291 =
  renderAllV29;


renderAllV29 =
  function(
    requestedDays
  ) {

    originalRenderAllV291(
      requestedDays
    );


    renderV291();
  };


/*
========================================================
PAGE INIT
========================================================
*/

function initV291() {

  /*
  V2.9.1 thiết kế cho 90 ngày.

  Không ép người dùng,
  chỉ chọn mặc định 90.
  */

  const select =
    document
      .getElementById(
        "test-days"
      );


  if (
    select
    &&
    select.querySelector(
      'option[value="90"]'
    )
  ) {

    select.value =
      "90";
  }


  console.log(
    `${V291_VERSION} loaded`
  );
}


/*
========================================================
INIT
========================================================
*/

if (
  document.readyState ===
  "loading"
) {

  document
    .addEventListener(
      "DOMContentLoaded",
      initV291
    );

}
else {

  initV291();
}