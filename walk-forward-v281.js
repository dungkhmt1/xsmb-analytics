/*
========================================================
XSMB V2.8.1 - FROZEN HOLDOUT
========================================================

Yêu cầu:
- walk-forward-v28.js phải được load trước file này.
- Dùng toàn bộ engine V2.8 hiện tại.
- Chỉ thay quy trình validation.

Quy trình:

PAST
  ↓
60 ngày CALIBRATION
  ↓
FREEZE rank calibrator
  ↓
30 / 60 ngày HOLDOUT
  ↓
KHÔNG update calibrator trong holdout

Không future leakage.
========================================================
*/

const V281_VERSION =
  "walk-forward-v2.8.1-frozen";

const V281_MODEL =
  "bridge-v2.8.1-frozen-rank-calibration";


/*
========================================================
CONFIG
========================================================
*/

const V281_CALIBRATION_DAYS = 60;


/*
========================================================
STATE
========================================================
*/

let v281FrozenCalibration = [];

let v281CalibrationDaysUsed = 0;

let v281HoldoutDaysUsed = 0;


/*
========================================================
FROZEN COMBINE
========================================================
*/

function combineFrozenV281(
  baseDay,
  frozenCalibrator
) {

  /*
  rerankV28 chỉ đọc calibrator.

  Quan trọng:
  frozenCalibrator sẽ KHÔNG được
  update trong giai đoạn holdout.
  */

  const recommendations =
    rerankV28(
      baseDay.recommendations,
      frozenCalibrator,
      baseDay.baselineRate
    );


  return {

    sourceDate:
      baseDay.sourceDate,

    predictionDate:
      baseDay.predictionDate,

    trainDraws:
      baseDay.trainDraws,

    modelWindow:
      baseDay.modelWindow,

    baselineRate:
      baseDay.baselineRate,

    actualUniqueLotoCount:
      baseDay.actualUniqueLotoCount,

    activeCandidateCount:
      baseDay.activeCandidateCount,

    qualifiedBridgeCount:
      baseDay.qualifiedBridgeCount,

    rejected:
      baseDay.rejected,


    /*
    ================================================
    V2.6.2 BASE
    ================================================
    */

    base: {

      model:
        WF28_BASE_MODEL,

      recommendations:
        baseDay.recommendations,

      evaluation: {

        top1:
          baseDay.evaluation.top1,

        top3:
          baseDay.evaluation.top3,

        top5:
          baseDay.evaluation.top5
      }
    },


    /*
    ================================================
    V2.8.1 FROZEN
    ================================================
    */

    v28: {

      model:
        V281_MODEL,

      recommendations,

      evaluation: {

        top1:
          evaluateTop(
            recommendations,
            baseDay.actualUniqueLotoCount,
            1
          ),

        top3:
          evaluateTop(
            recommendations,
            baseDay.actualUniqueLotoCount,
            3
          ),

        top5:
          evaluateTop(
            recommendations,
            baseDay.actualUniqueLotoCount,
            5
          )
      }
    }
  };
}


/*
========================================================
DECISION METRICS
========================================================
*/

function calculateV281Decision(
  testedDays
) {

  const base1 =
    metricFor(
      "base",
      "top1",
      testedDays
    );


  const base3 =
    metricFor(
      "base",
      "top3",
      testedDays
    );


  const base5 =
    metricFor(
      "base",
      "top5",
      testedDays
    );


  const v281 =
    metricFor(
      "v28",
      "top1",
      testedDays
    );


  const v283 =
    metricFor(
      "v28",
      "top3",
      testedDays
    );


  const v285 =
    metricFor(
      "v28",
      "top5",
      testedDays
    );


  const top1Delta =
    round(
      v281.lift -
      base1.lift
    );


  const top3Delta =
    round(
      v283.lift -
      base3.lift
    );


  const top5Delta =
    round(
      v285.lift -
      base5.lift
    );


  /*
  ================================================
  PRODUCTION GATE

  Không phải chứng minh thống kê tuyệt đối.
  Đây là gate kỹ thuật để quyết định
  có nên thử production hay không.
  ================================================
  */

  const top1Okay =
    top1Delta >= -3;


  const top3Okay =
    v283.lift >= 5
    &&
    top3Delta >= 5;


  const top5Okay =
    v285.lift >= -2;


  const coverageOkay =
    v283.coverage >= 90;


  const pass =
    top1Okay
    &&
    top3Okay
    &&
    top5Okay
    &&
    coverageOkay;


  return {

    pass,

    base1,
    base3,
    base5,

    v281,
    v283,
    v285,

    top1Delta,
    top3Delta,
    top5Delta,

    top1Okay,
    top3Okay,
    top5Okay,
    coverageOkay
  };
}


/*
========================================================
DECISION PANEL
========================================================
*/

function renderV281Decision(
  testedDays
) {

  const decision =
    calculateV281Decision(
      testedDays
    );


  let panel =
    document.getElementById(
      "v281-decision-panel"
    );


  if (!panel) {

    panel =
      document.createElement(
        "div"
      );


    panel.id =
      "v281-decision-panel";


    panel.className =
      "panel";


    const comparisonPanel =
      document.getElementById(
        "comparison-panel"
      );


    if (
      comparisonPanel
      &&
      comparisonPanel.parentNode
    ) {

      comparisonPanel
        .parentNode
        .insertBefore(
          panel,
          comparisonPanel.nextSibling
        );

    }
    else {

      document.body
        .appendChild(
          panel
        );
    }
  }


  const statusClass =
    decision.pass
      ?
      "pos"
      :
      "neg";


  const statusText =
    decision.pass
      ?
      "PASS — V2.8.1 đạt production gate"
      :
      "FAIL — chưa đủ điều kiện production";


  panel.innerHTML = `

    <h2>
      V2.8.1 Frozen Holdout
    </h2>


    <p>

      Calibration:

      <strong>
        ${v281CalibrationDaysUsed} ngày
      </strong>

      • Frozen Holdout:

      <strong>
        ${v281HoldoutDaysUsed} ngày
      </strong>

    </p>


    <p
      class="${statusClass}"
      style="
        font-size:18px;
        font-weight:800;
      "
    >

      ${statusText}

    </p>


    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Gate
            </th>

            <th>
              V2.6.2
            </th>

            <th>
              V2.8.1
            </th>

            <th>
              Δ
            </th>

            <th>
              Điều kiện
            </th>

            <th>
              Kết quả
            </th>

          </tr>

        </thead>


        <tbody>

          <tr>

            <td>
              TOP1 Lift
            </td>

            <td>
              ${pct(
                decision.base1.lift
              )}
            </td>

            <td>
              ${pct(
                decision.v281.lift
              )}
            </td>

            <td>
              ${
                decision.top1Delta > 0
                  ?
                  "+"
                  :
                  ""
              }
              ${pct(
                decision.top1Delta
              )}
            </td>

            <td>
              Δ ≥ -3%
            </td>

            <td
              class="${
                decision.top1Okay
                  ?
                  "pos"
                  :
                  "neg"
              }"
            >

              ${
                decision.top1Okay
                  ?
                  "PASS"
                  :
                  "FAIL"
              }

            </td>

          </tr>


          <tr>

            <td>
              TOP3 Lift
            </td>

            <td>
              ${pct(
                decision.base3.lift
              )}
            </td>

            <td>
              ${pct(
                decision.v283.lift
              )}
            </td>

            <td>

              ${
                decision.top3Delta > 0
                  ?
                  "+"
                  :
                  ""
              }

              ${pct(
                decision.top3Delta
              )}

            </td>

            <td>
              Lift ≥ +5%
              và Δ ≥ +5%
            </td>

            <td
              class="${
                decision.top3Okay
                  ?
                  "pos"
                  :
                  "neg"
              }"
            >

              ${
                decision.top3Okay
                  ?
                  "PASS"
                  :
                  "FAIL"
              }

            </td>

          </tr>


          <tr>

            <td>
              TOP5 Lift
            </td>

            <td>
              ${pct(
                decision.base5.lift
              )}
            </td>

            <td>
              ${pct(
                decision.v285.lift
              )}
            </td>

            <td>

              ${
                decision.top5Delta > 0
                  ?
                  "+"
                  :
                  ""
              }

              ${pct(
                decision.top5Delta
              )}

            </td>

            <td>
              Lift ≥ -2%
            </td>

            <td
              class="${
                decision.top5Okay
                  ?
                  "pos"
                  :
                  "neg"
              }"
            >

              ${
                decision.top5Okay
                  ?
                  "PASS"
                  :
                  "FAIL"
              }

            </td>

          </tr>


          <tr>

            <td>
              TOP3 Coverage
            </td>

            <td>
              -
            </td>

            <td>
              ${pct(
                decision.v283.coverage
              )}
            </td>

            <td>
              -
            </td>

            <td>
              ≥ 90%
            </td>

            <td
              class="${
                decision.coverageOkay
                  ?
                  "pos"
                  :
                  "neg"
              }"
            >

              ${
                decision.coverageOkay
                  ?
                  "PASS"
                  :
                  "FAIL"
              }

            </td>

          </tr>

        </tbody>

      </table>

    </div>


    <div
      class="small"
      style="
        margin-top:12px;
      "
    >

      Trong toàn bộ holdout,
      rank calibrator được đóng băng.
      Không có kết quả target nào được
      đưa trở lại calibrator.

    </div>
  `;
}


/*
========================================================
OVERRIDE RENDER ALL
========================================================
*/

const originalRenderAllV28 =
  renderAll;


renderAll =
  function(
    testedDays
  ) {

    originalRenderAllV28(
      testedDays
    );


    renderV281Decision(
      testedDays
    );
  };


/*
========================================================
OVERRIDE START

Tên hàm giữ nguyên để HTML V2.8
không phải thay onclick.
========================================================
*/

startWalkForwardV28 =
  async function() {

    if (
      wf28Running
    ) {
      return;
    }


    wf28Running =
      true;


    wf28Stop =
      false;


    wf28Daily =
      [];


    v281FrozenCalibration =
      [];


    v281CalibrationDaysUsed =
      0;


    v281HoldoutDaysUsed =
      0;


    hideError();


    const startButton =
      document.getElementById(
        "start-button"
      );


    const stopButton =
      document.getElementById(
        "stop-button"
      );


    startButton.disabled =
      true;


    stopButton.disabled =
      false;


    /*
    Hide old results.
    */

    [
      "comparison-panel",
      "detail-panel",
      "daily-panel"
    ]
      .forEach(
        id => {

          const element =
            document.getElementById(
              id
            );


          if (element) {

            element.classList
              .add(
                "hidden"
              );
          }
        }
      );


    const oldDecision =
      document.getElementById(
        "v281-decision-panel"
      );


    if (
      oldDecision
    ) {

      oldDecision.remove();
    }


    try {

      /*
      ================================================
      LOAD ENGINE
      ================================================
      */

      if (
        !wf28Engine
      ) {

        await loadEngine();
      }


      const requestedHoldoutDays =
        Number(
          document
            .getElementById(
              "test-days"
            )
            .value
        );


      const modelWindow =
        Number(
          document
            .getElementById(
              "model-window"
            )
            .value
        );


      const minTrain =
        Number(
          document
            .getElementById(
              "min-train"
            )
            .value
        );


      const rows =
        wf28Engine.rows;


      /*
      ================================================
      HOLDOUT RANGE
      ================================================
      */

      const latestTargetIndex =
        rows.length - 1;


      const earliestAllowedTarget =
        minTrain;


      const maximumPossibleHoldout =
        latestTargetIndex -
        earliestAllowedTarget +
        1;


      const holdoutDays =
        Math.min(
          requestedHoldoutDays,
          maximumPossibleHoldout
        );


      if (
        holdoutDays <= 0
      ) {

        throw new Error(
          "Không đủ dữ liệu để tạo holdout."
        );
      }


      /*
      30-day holdout:

      testStart =
      rowCount - 30
      */

      const holdoutStartIndex =
        rows.length -
        holdoutDays;


      /*
      ================================================
      CALIBRATION RANGE

      Nằm hoàn toàn trước holdout.
      ================================================
      */

      const desiredCalibrationStart =
        holdoutStartIndex -
        V281_CALIBRATION_DAYS;


      const calibrationStartIndex =
        Math.max(
          earliestAllowedTarget,
          desiredCalibrationStart
        );


      const calibrationEndIndex =
        holdoutStartIndex -
        1;


      const actualCalibrationDays =
        calibrationEndIndex >=
          calibrationStartIndex

          ?

          calibrationEndIndex -
          calibrationStartIndex +
          1

          :

          0;


      if (
        actualCalibrationDays <
        10
      ) {

        throw new Error(

          `Chỉ có ${actualCalibrationDays} ngày calibration. ` +

          `Cần ít nhất 10 ngày. ` +

          `Hãy giảm số ngày holdout hoặc Min Train.`
        );
      }


      v281CalibrationDaysUsed =
        actualCalibrationDays;


      v281HoldoutDaysUsed =
        holdoutDays;


      /*
      ================================================
      CREATE CALIBRATOR
      ================================================
      */

      const calibrator =
        createRankCalibrator();


      const totalWork =
        actualCalibrationDays +
        holdoutDays;


      let processed =
        0;


      setProgress(
        0,
        totalWork
      );


      /*
      ================================================
      PHASE 1
      CALIBRATION

      Có updateRankCalibrator().
      ================================================
      */

      for (
        let targetIndex =
          calibrationStartIndex;

        targetIndex <=
          calibrationEndIndex;

        targetIndex++
      ) {

        if (
          wf28Stop
        ) {
          break;
        }


        setStatus(

          `CALIBRATION ` +

          `${processed + 1}` +

          `/` +

          `${totalWork}` +

          ` • ` +

          `${fmtDate(
            rows[
              targetIndex
            ]
              .draw_date
          )}`
        );


        const baseDay =
          predictBaseHistoricalDay(

            targetIndex,

            modelWindow,

            minTrain
          );


        if (
          baseDay
        ) {

          /*
          Dự đoán trước.
          */

          combineBaseAndV28(
            baseDay,
            calibrator
          );


          /*
          Sau khi ngày đó kết thúc
          mới update calibration.
          */

          updateRankCalibrator(

            calibrator,

            baseDay.recommendations,

            baseDay.baselineRate
          );
        }


        processed++;


        setProgress(
          processed,
          totalWork
        );


        await sleep(15);
      }


      if (
        wf28Stop
      ) {

        setStatus(
          "Đã dừng trong giai đoạn calibration."
        );


        return;
      }


      /*
      ================================================
      FREEZE
      ================================================
      */

      v281FrozenCalibration =
        calibratorSnapshot(
          calibrator
        );


      wf28LastCalibration =
        v281FrozenCalibration;


      renderCalibrationSnapshot();


      setStatus(

        `ĐÃ FREEZE calibration ` +

        `${actualCalibrationDays} ngày.` +

        ` Bắt đầu holdout...`
      );


      await sleep(300);


      /*
      ================================================
      PHASE 2
      FROZEN HOLDOUT

      TUYỆT ĐỐI KHÔNG:
      updateRankCalibrator()
      ================================================
      */

      for (
        let targetIndex =
          holdoutStartIndex;

        targetIndex <=
          latestTargetIndex;

        targetIndex++
      ) {

        if (
          wf28Stop
        ) {
          break;
        }


        const holdoutNumber =
          targetIndex -
          holdoutStartIndex +
          1;


        setStatus(

          `FROZEN HOLDOUT ` +

          `${holdoutNumber}` +

          `/` +

          `${holdoutDays}` +

          ` • ` +

          `${fmtDate(
            rows[
              targetIndex
            ]
              .draw_date
          )}`
        );


        /*
        Base V2.6.2 prediction.
        */

        const baseDay =
          predictBaseHistoricalDay(

            targetIndex,

            modelWindow,

            minTrain
          );


        if (
          baseDay
        ) {

          /*
          Re-rank bằng calibrator
          đã freeze.
          */

          const combined =
            combineFrozenV281(

              baseDay,

              calibrator
            );


          combined.offset =
            rows.length -
            targetIndex;


          wf28Daily.push(
            combined
          );


          /*
          Không có:
          updateRankCalibrator(...)
          */


          renderAll(
            holdoutDays
          );
        }


        processed++;


        setProgress(
          processed,
          totalWork
        );


        await sleep(15);
      }


      /*
      ================================================
      FINAL
      ================================================
      */

      renderCalibrationSnapshot();


      renderAll(
        holdoutDays
      );


      if (
        wf28Stop
      ) {

        setStatus(

          `Đã dừng • ` +

          `${wf28Daily.length}` +

          ` ngày frozen holdout.`
        );

      }
      else {

        const decision =
          calculateV281Decision(
            holdoutDays
          );


        setStatus(

          `Hoàn tất ` +

          `${wf28Daily.length}` +

          ` ngày Frozen Holdout` +

          ` • calibration ` +

          `${actualCalibrationDays} ngày` +

          ` • ` +

          (
            decision.pass
              ?
              "PRODUCTION GATE: PASS"
              :
              "PRODUCTION GATE: FAIL"
          )
        );
      }

    }
    catch (
      error
    ) {

      console.error(
        error
      );


      showError(

        error?.message
        ||
        "Lỗi V2.8.1 Frozen Holdout."
      );


      setStatus(
        "Có lỗi."
      );

    }
    finally {

      wf28Running =
        false;


      startButton.disabled =
        false;


      stopButton.disabled =
        true;
    }
  };


/*
========================================================
STOP OVERRIDE
========================================================
*/

stopWalkForwardV28 =
  function() {

    wf28Stop =
      true;


    setStatus(
      "Sẽ dừng sau ngày đang tính..."
    );
  };


console.log(
  `${V281_VERSION} loaded`
);