/*
========================================================
XSMB WALK-FORWARD V2.9
FEATURE SCORE
========================================================

V2.9:
- không học Base Rank
- không update model từ target
- không dùng kết quả target để ranking
- cùng candidate pool/filter với V2.6.2

Feature Score:

30% Wilson Edge
25% Posterior Edge
15% Recent Posterior Edge
10% Stability
10% Sample Reliability
10% Independent Consensus

walk-forward-v28.js phải load trước.
========================================================
*/

const V29_VERSION =
  "walk-forward-v2.9";

const V29_MODEL =
  "bridge-v2.9-feature-score";


/*
========================================================
WEIGHTS
========================================================
*/

const V29_WEIGHTS = {

  wilsonEdge: 0.30,

  posteriorEdge: 0.25,

  recentPosteriorEdge: 0.15,

  stability: 0.10,

  sampleReliability: 0.10,

  consensus: 0.10
};


/*
========================================================
STATE
========================================================
*/

let v29Running = false;

let v29Stop = false;

let v29Daily = [];


/*
========================================================
NORMALIZATION
========================================================
*/

function normalizeRange(
  value,
  low,
  high
) {

  if (
    high <= low
  ) {
    return 0;
  }


  return clamp(

    (
      (
        Number(value) -
        low
      )
      /
      (
        high -
        low
      )
    )
    *
    100,

    0,

    100
  );
}


/*
========================================================
WILSON EDGE FEATURE

-2% -> 0
20% -> 100
========================================================
*/

function featureWilsonEdge(
  value
) {

  return normalizeRange(
    value,
    -2,
    20
  );
}


/*
========================================================
POSTERIOR EDGE FEATURE

0% -> 0
15% -> 100
========================================================
*/

function featurePosteriorEdge(
  value
) {

  return normalizeRange(
    value,
    0,
    15
  );
}


/*
========================================================
RECENT POSTERIOR EDGE

-10% -> 0
15% -> 100
========================================================
*/

function featureRecentEdge(
  value
) {

  return normalizeRange(
    value,
    -10,
    15
  );
}


/*
========================================================
CONSENSUS FEATURE

1 độc lập = 35
2 = 65
3 = 85
4+ = 100
========================================================
*/

function featureConsensus(
  independent
) {

  const n =
    Number(
      independent
    );


  if (
    n >= 4
  ) {
    return 100;
  }


  if (
    n === 3
  ) {
    return 85;
  }


  if (
    n === 2
  ) {
    return 65;
  }


  return 35;
}


/*
========================================================
V2.9 FEATURE SCORE
========================================================
*/

function calculateFeatureScore(
  item
) {

  const components = {

    wilsonEdge:
      featureWilsonEdge(
        item.wilsonEdge
      ),

    posteriorEdge:
      featurePosteriorEdge(
        item.posteriorEdge
      ),

    recentPosteriorEdge:
      featureRecentEdge(
        item.recentPosteriorEdge
      ),

    stability:
      clamp(
        item.stabilityScore,
        0,
        100
      ),

    sampleReliability:
      clamp(
        item.sampleReliability,
        0,
        100
      ),

    consensus:
      featureConsensus(
        item.independentConsensus
      )
  };


  const score =

    components.wilsonEdge *
    V29_WEIGHTS.wilsonEdge

    +

    components.posteriorEdge *
    V29_WEIGHTS.posteriorEdge

    +

    components.recentPosteriorEdge *
    V29_WEIGHTS.recentPosteriorEdge

    +

    components.stability *
    V29_WEIGHTS.stability

    +

    components.sampleReliability *
    V29_WEIGHTS.sampleReliability

    +

    components.consensus *
    V29_WEIGHTS.consensus;


  return {

    score:
      round(
        score
      ),

    components: {

      wilsonEdge:
        round(
          components.wilsonEdge
        ),

      posteriorEdge:
        round(
          components.posteriorEdge
        ),

      recentPosteriorEdge:
        round(
          components.recentPosteriorEdge
        ),

      stability:
        round(
          components.stability
        ),

      sampleReliability:
        round(
          components.sampleReliability
        ),

      consensus:
        round(
          components.consensus
        )
    }
  };
}


/*
========================================================
BUILD ALL QUALIFIED CANDIDATES

Đây là candidate pool chung
cho V2.6.2 và V2.9.
========================================================
*/

function buildCandidatePoolV29(
  targetIndex,
  modelWindow,
  minTrain
) {

  const engine =
    wf28Engine;


  const rows =
    engine.rows;


  const sourceIndex =
    targetIndex - 1;


  const trainStart =
    Math.max(
      0,
      targetIndex -
      modelWindow
    );


  const trainDraws =
    targetIndex -
    trainStart;


  if (
    trainDraws <
    minTrain
  ) {

    return null;
  }


  const baselineRate =
    baselineForRange(
      rows,
      trainStart,
      sourceIndex
    );


  /*
  ================================================
  CURRENT ACTIVE RULES
  ================================================
  */

  const active = [];


  for (
    let ruleIndex = 0;
    ruleIndex <
      engine.rules.length;
    ruleIndex++
  ) {

    const streak =
      currentStreak(

        engine,

        ruleIndex,

        trainStart,

        sourceIndex
      );


    if (

      streak <
        MIN_CURRENT_STREAK

      ||

      streak >
        MAX_CURRENT_STREAK

    ) {

      continue;
    }


    const rule =
      engine.rules[
        ruleIndex
      ];


    const numberValue =
      numberForRule(

        engine.digitRows[
          sourceIndex
        ],

        rule
      );


    active.push({

      ruleIndex,

      numberValue,

      number:
        numberText(
          numberValue
        ),

      streak,

      bridge:
        rule.bridge,

      bridgeKey:
        rule.bridgeKey,

      positionAKey:
        rule.positionAKey,

      positionBKey:
        rule.positionBKey
    });
  }


  /*
  ================================================
  SAME FILTERS AS V2.6.2
  ================================================
  */

  const tested = [];


  const rejected = {

    insufficientSamples: 0,

    lowRate: 0,

    lowEdge: 0,

    lowWilsonEdge: 0
  };


  for (
    const candidate
    of active
  ) {

    const performance =
      analyzeRule(

        engine,

        candidate.ruleIndex,

        trainStart,

        sourceIndex,

        candidate.streak,

        baselineRate
      );


    if (
      performance.opportunities <
      MIN_SAMPLES
    ) {

      rejected
        .insufficientSamples++;

      continue;
    }


    if (
      performance.continuationRate <
      MIN_RATE
    ) {

      rejected.lowRate++;

      continue;
    }


    if (
      performance.edge <
      MIN_EDGE
    ) {

      rejected.lowEdge++;

      continue;
    }


    if (
      performance.wilsonEdge <
      MIN_WILSON_EDGE
    ) {

      rejected
        .lowWilsonEdge++;

      continue;
    }


    tested.push({

      ...candidate,

      ...performance
    });
  }


  /*
  ================================================
  GROUP BY PREDICTED NUMBER
  ================================================
  */

  const groups =
    new Map();


  for (
    const item
    of tested
  ) {

    if (
      !groups.has(
        item.number
      )
    ) {

      groups.set(
        item.number,
        []
      );
    }


    groups
      .get(
        item.number
      )
      .push(
        item
      );
  }


  /*
  ================================================
  CONSENSUS + BASE SCORE
  ================================================
  */

  const enriched =
    tested.map(
      item => {

        const group =
          groups.get(
            item.number
          )
          ||
          [item];


        const independent =
          calculateIndependent(
            group
          );


        const related =
          group.length;


        const consensusBonus =
          Math.min(

            8,

            Math.max(
              0,
              independent - 1
            )
            *
            2
          );


        const correlationPenalty =

          related > 1

            ?

            (
              1 -
              independent /
              related
            )
            *
            10

            :

            0;


        const recentAdjustment =

          item.recentStatus ===
            "active"

            ?

            4

            :

            item.recentStatus ===
              "historical-only"

              ?

              -6

              :

              0;


        const baseScore =
          clamp(

            item.rawScore

            +

            consensusBonus

            -

            correlationPenalty

            +

            recentAdjustment,

            0,

            100
          );


        const strength =
          classifyStrength(

            item,

            independent,

            baseScore
          );


        const enrichedItem = {

          ...item,

          independentConsensus:
            independent,

          relatedBridgeCount:
            related,

          consensusBonus:
            round(
              consensusBonus
            ),

          correlationPenalty:
            round(
              correlationPenalty
            ),

          recentAdjustment,

          baseScore:
            round(
              baseScore
            ),

          strength
        };


        const feature =
          calculateFeatureScore(
            enrichedItem
          );


        return {

          ...enrichedItem,

          featureScore:
            feature.score,

          featureComponents:
            feature.components
        };
      }
    );


  return {

    sourceIndex,

    targetIndex,

    trainStart,

    trainDraws,

    baselineRate:
      round(
        baselineRate
      ),

    activeCandidateCount:
      active.length,

    qualifiedBridgeCount:
      enriched.length,

    rejected,

    candidates:
      enriched
  };
}


/*
========================================================
BASE V2.6.2 SORT
========================================================
*/

function sortBaseV262(
  candidates
) {

  const strengthRank = {

    "very-strong": 4,

    strong: 3,

    historical: 2,

    qualified: 1
  };


  return [
    ...candidates
  ]
    .sort(
      (
        a,
        b
      ) =>

        (
          strengthRank[
            b.strength
          ]
          -
          strengthRank[
            a.strength
          ]
        )

        ||

        (
          b.baseScore -
          a.baseScore
        )

        ||

        (
          b.wilsonEdge -
          a.wilsonEdge
        )

        ||

        (
          b.opportunities -
          a.opportunities
        )

        ||

        (
          b.stabilityScore -
          a.stabilityScore
        )
    );
}


/*
========================================================
V2.9 SORT

Không ưu tiên:
- Base Rank
- Strong
- Qualified
- active / limited

Chỉ Feature Score.
========================================================
*/

function sortV29(
  candidates
) {

  return [
    ...candidates
  ]
    .filter(
      item =>
        item.recentStatus !==
        "historical-only"
    )
    .sort(
      (
        a,
        b
      ) =>

        (
          b.featureScore -
          a.featureScore
        )

        ||

        (
          b.wilsonEdge -
          a.wilsonEdge
        )

        ||

        (
          b.posteriorEdge -
          a.posteriorEdge
        )

        ||

        (
          b.recentPosteriorEdge -
          a.recentPosteriorEdge
        )

        ||

        (
          b.opportunities -
          a.opportunities
        )

        ||

        (
          b.baseScore -
          a.baseScore
        )
    );
}


/*
========================================================
DEDUPE NUMBER

Mỗi predicted number chỉ lấy
candidate tốt nhất theo ranking đó.
========================================================
*/

function dedupeRankingV29(
  ranked,
  targetFlags,
  model
) {

  const seen =
    new Set();


  const result =
    [];


  for (
    const item
    of ranked
  ) {

    if (
      item.recentStatus ===
      "historical-only"
    ) {

      continue;
    }


    if (
      seen.has(
        item.number
      )
    ) {

      continue;
    }


    seen.add(
      item.number
    );


    result.push({

      rank:
        result.length + 1,

      model,

      number:
        item.number,

      numberValue:
        item.numberValue,

      bridge:
        item.bridge,

      bridgeKey:
        item.bridgeKey,

      streak:
        item.streak,

      opportunities:
        item.opportunities,

      continued:
        item.continued,

      continuationRate:
        item.continuationRate,

      baselineRate:
        item.baselineRate,

      edge:
        item.edge,

      wilsonEdge:
        item.wilsonEdge,

      posteriorEdge:
        item.posteriorEdge,

      recentPosteriorEdge:
        item.recentPosteriorEdge,

      stabilityScore:
        item.stabilityScore,

      sampleReliability:
        item.sampleReliability,

      independentConsensus:
        item.independentConsensus,

      recentStatus:
        item.recentStatus,

      strength:
        item.strength,

      baseScore:
        item.baseScore,

      featureScore:
        item.featureScore,

      featureComponents:
        item.featureComponents,

      hit:
        Boolean(
          targetFlags[
            item.numberValue
          ]
        )
    });


    if (
      result.length >=
      MAX_RECOMMENDATIONS
    ) {

      break;
    }
  }


  return result;
}


/*
========================================================
PREDICT ONE DAY
========================================================
*/

function predictHistoricalDayV29(
  targetIndex,
  modelWindow,
  minTrain
) {

  const pool =
    buildCandidatePoolV29(

      targetIndex,

      modelWindow,

      minTrain
    );


  if (!pool) {
    return null;
  }


  const target =
    wf28Engine.rows[
      targetIndex
    ];


  /*
  V2.6.2
  */

  const baseRanked =
    sortBaseV262(
      pool.candidates
    );


  const base =
    dedupeRankingV29(

      baseRanked,

      target.lotoFlags,

      WF28_BASE_MODEL
    );


  /*
  V2.9
  */

  const v29Ranked =
    sortV29(
      pool.candidates
    );


  const v29 =
    dedupeRankingV29(

      v29Ranked,

      target.lotoFlags,

      V29_MODEL
    );


  return {

    sourceDate:
      wf28Engine.rows[
        pool.sourceIndex
      ]
        .draw_date,

    predictionDate:
      target.draw_date,

    trainDraws:
      pool.trainDraws,

    modelWindow,

    baselineRate:
      pool.baselineRate,

    actualUniqueLotoCount:
      target.lotoCount,

    activeCandidateCount:
      pool.activeCandidateCount,

    qualifiedBridgeCount:
      pool.qualifiedBridgeCount,

    rejected:
      pool.rejected,


    base: {

      recommendations:
        base,

      evaluation: {

        top1:
          evaluateTop(
            base,
            target.lotoCount,
            1
          ),

        top3:
          evaluateTop(
            base,
            target.lotoCount,
            3
          ),

        top5:
          evaluateTop(
            base,
            target.lotoCount,
            5
          )
      }
    },


    v29: {

      recommendations:
        v29,

      evaluation: {

        top1:
          evaluateTop(
            v29,
            target.lotoCount,
            1
          ),

        top3:
          evaluateTop(
            v29,
            target.lotoCount,
            3
          ),

        top5:
          evaluateTop(
            v29,
            target.lotoCount,
            5
          )
      }
    }
  };
}


/*
========================================================
METRIC
========================================================
*/

function metricV29(
  model,
  top,
  requestedDays
) {

  let availableDays = 0;

  let fullPickDays = 0;

  let hits = 0;

  let baselineSum = 0;

  let requestedSize = 0;


  for (
    const day
    of v29Daily
  ) {

    const item =
      day[
        model
      ]
        ?.evaluation
        ?.[top];


    if (!item) {
      continue;
    }


    requestedSize =
      item.requestedSize
      ||
      requestedSize;


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

      hits++;
    }


    baselineSum +=
      item.baselineRate;
  }


  const hitRate =

    availableDays

      ?

      hits /
      availableDays *
      100

      :

      0;


  const baselineRate =

    availableDays

      ?

      baselineSum /
      availableDays

      :

      0;


  return {

    hits,

    availableDays,

    requestedSize,

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
        hitRate -
        baselineRate
      ),

    coverage:
      round(

        requestedDays

          ?

          availableDays /
          requestedDays *
          100

          :

          0
      ),

    fullCoverage:
      round(

        requestedDays

          ?

          fullPickDays /
          requestedDays *
          100

          :

          0
      )
  };
}


/*
========================================================
COMPARISON
========================================================
*/

function renderComparisonV29(
  requestedDays
) {

  const rows =
    [
      "top1",
      "top3",
      "top5"
    ]
      .map(
        top => {

          const base =
            metricV29(
              "base",
              top,
              requestedDays
            );


          const model =
            metricV29(
              "v29",
              top,
              requestedDays
            );


          const delta =
            round(
              model.lift -
              base.lift
            );


          return `

            <tr>

              <td>
                <strong>
                  ${top.toUpperCase()}
                </strong>
              </td>


              <td>
                ${pct(base.hitRate)}
                (${base.hits}/${base.availableDays})
              </td>


              <td>
                ${pct(base.baselineRate)}
              </td>


              <td
                class="${
                  base.lift >= 0
                    ?
                    "pos"
                    :
                    "neg"
                }"
              >
                ${
                  base.lift > 0
                    ?
                    "+"
                    :
                    ""
                }
                ${pct(base.lift)}
              </td>


              <td>
                ${pct(model.hitRate)}
                (${model.hits}/${model.availableDays})
              </td>


              <td>
                ${pct(model.baselineRate)}
              </td>


              <td
                class="${
                  model.lift >= 0
                    ?
                    "pos"
                    :
                    "neg"
                }"
              >
                ${
                  model.lift > 0
                    ?
                    "+"
                    :
                    ""
                }
                ${pct(model.lift)}
              </td>


              <td
                class="${
                  delta >= 0
                    ?
                    "pos"
                    :
                    "neg"
                }"
              >
                ${
                  delta > 0
                    ?
                    "+"
                    :
                    ""
                }
                ${pct(delta)}
              </td>


              <td>
                ${pct(model.coverage)}
              </td>

            </tr>
          `;
        }
      )
      .join("");


  document
    .getElementById(
      "comparison-table"
    )
    .innerHTML = `

      <table>

        <thead>

          <tr>

            <th>
              Nhóm
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
    `;


  document
    .getElementById(
      "comparison-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
RANK BUCKET
========================================================
*/

function rankBucketsV29(
  model
) {

  const map = {};


  for (
    const day
    of v29Daily
  ) {

    const recs =
      (
        day[
          model
        ]
          ?.recommendations
        ||
        []
      )
        .slice(
          0,
          5
        );


    recs.forEach(
      (
        item,
        index
      ) => {

        const rank =
          index + 1;


        if (
          !map[rank]
        ) {

          map[rank] = {

            signals: 0,

            hits: 0
          };
        }


        map[rank]
          .signals++;


        if (
          item.hit
        ) {

          map[rank]
            .hits++;
        }
      }
    );
  }


  return map;
}


/*
========================================================
RENDER RANK
========================================================
*/

function renderRankBucketV29(
  map
) {

  return `

    <table>

      <thead>

        <tr>

          <th>Rank</th>

          <th>Signals</th>

          <th>Hits</th>

          <th>Hit rate</th>

        </tr>

      </thead>


      <tbody>

        ${
          Object.entries(
            map
          )
            .map(
              (
                [
                  rank,
                  data
                ]
              ) => {

                const rate =

                  data.signals

                    ?

                    data.hits /
                    data.signals *
                    100

                    :

                    0;


                return `

                  <tr>

                    <td>
                      <strong>
                        #${rank}
                      </strong>
                    </td>

                    <td>
                      ${data.signals}
                    </td>

                    <td>
                      ${data.hits}
                    </td>

                    <td>
                      ${pct(rate)}
                    </td>

                  </tr>
                `;
              }
            )
            .join("")
        }

      </tbody>

    </table>
  `;
}


function renderRanksV29() {

  document
    .getElementById(
      "base-rank"
    )
    .innerHTML =
      renderRankBucketV29(
        rankBucketsV29(
          "base"
        )
      );


  document
    .getElementById(
      "v29-rank"
    )
    .innerHTML =
      renderRankBucketV29(
        rankBucketsV29(
          "v29"
        )
      );


  document
    .getElementById(
      "rank-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
FEATURE SCORE BUCKETS
========================================================
*/

function scoreBucketName(
  score
) {

  if (
    score >= 80
  ) {
    return "80+";
  }


  if (
    score >= 70
  ) {
    return "70–79";
  }


  if (
    score >= 60
  ) {
    return "60–69";
  }


  if (
    score >= 50
  ) {
    return "50–59";
  }


  return "<50";
}


function renderScoreBucketsV29() {

  const order = [
    "80+",
    "70–79",
    "60–69",
    "50–59",
    "<50"
  ];


  const map = {};


  for (
    const day
    of v29Daily
  ) {

    const recs =
      (
        day.v29
          ?.recommendations
        ||
        []
      )
        .slice(
          0,
          5
        );


    for (
      const item
      of recs
    ) {

      const key =
        scoreBucketName(
          item.featureScore
        );


      if (
        !map[key]
      ) {

        map[key] = {

          signals: 0,

          hits: 0,

          scoreSum: 0
        };
      }


      map[key].signals++;

      map[key].scoreSum +=
        item.featureScore;


      if (
        item.hit
      ) {

        map[key].hits++;
      }
    }
  }


  const rows =
    order
      .filter(
        key =>
          map[key]
      )
      .map(
        key => {

          const data =
            map[key];


          const rate =

            data.hits /
            data.signals *
            100;


          return `

            <tr>

              <td>
                <strong>
                  ${key}
                </strong>
              </td>

              <td>
                ${data.signals}
              </td>

              <td>
                ${data.hits}
              </td>

              <td>
                ${pct(rate)}
              </td>

              <td>
                ${
                  round(
                    data.scoreSum /
                    data.signals
                  )
                }
              </td>

            </tr>
          `;
        }
      )
      .join("");


  document
    .getElementById(
      "score-table"
    )
    .innerHTML = `

      <table>

        <thead>

          <tr>

            <th>
              Feature Score
            </th>

            <th>
              Signals
            </th>

            <th>
              Hits
            </th>

            <th>
              Hit rate
            </th>

            <th>
              Avg Score
            </th>

          </tr>

        </thead>


        <tbody>
          ${rows}
        </tbody>

      </table>
    `;


  document
    .getElementById(
      "score-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
DAILY TABLE
========================================================
*/

function renderDailyV29() {

  const rows =
    [
      ...v29Daily
    ]
      .sort(
        (
          a,
          b
        ) =>
          a.offset -
          b.offset
      )
      .map(
        day => {

          const base =
            day.base
              .recommendations
              .slice(
                0,
                5
              );


          const v29 =
            day.v29
              .recommendations
              .slice(
                0,
                5
              );


          const nums =
            (
              list,
              showScore
            ) => {

              if (
                !list.length
              ) {
                return "-";
              }


              return list
                .map(
                  item => `

                    <span
                      class="
                        num
                        ${item.hit ? "hit" : ""}
                      "
                      title="${
                        showScore
                          ?
                          `Feature Score ${item.featureScore}`
                          :
                          `Base Score ${item.baseScore}`
                      }"
                    >

                      ${esc(item.number)}

                    </span>
                  `
                )
                .join("");
            };


          const status =
            hit =>
              hit

                ?

                `<span class="pos">HIT</span>`

                :

                `<span class="neg">MISS</span>`;


          return `

            <tr>

              <td>
                ${day.offset}
              </td>


              <td>
                ${fmtDate(day.sourceDate)}
                →
                ${fmtDate(day.predictionDate)}
              </td>


              <td>
                ${nums(base, false)}
              </td>


              <td>
                ${
                  status(
                    day.base
                      .evaluation
                      .top3
                      .hit
                  )
                }
              </td>


              <td>
                ${nums(v29, true)}
              </td>


              <td>
                ${
                  status(
                    day.v29
                      .evaluation
                      .top3
                      .hit
                  )
                }
              </td>


              <td>
                ${day.activeCandidateCount}
              </td>


              <td>
                ${day.qualifiedBridgeCount}
              </td>

            </tr>
          `;
        }
      )
      .join("");


  document
    .getElementById(
      "daily-table"
    )
    .innerHTML = `

      <table>

        <thead>

          <tr>

            <th>Offset</th>

            <th>Kỳ</th>

            <th>V2.6.2 Top5</th>

            <th>Base Top3</th>

            <th>V2.9 Top5</th>

            <th>V2.9 Top3</th>

            <th>Active</th>

            <th>Qualified</th>

          </tr>

        </thead>


        <tbody>
          ${rows}
        </tbody>

      </table>
    `;


  document
    .getElementById(
      "daily-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


/*
========================================================
RENDER ALL
========================================================
*/

function renderAllV29(
  requestedDays
) {

  if (
    !v29Daily.length
  ) {
    return;
  }


  renderComparisonV29(
    requestedDays
  );


  renderRanksV29();


  renderScoreBucketsV29();


  renderDailyV29();
}


/*
========================================================
ERROR
========================================================
*/

function showErrorV29(
  message
) {

  document
    .getElementById(
      "error-text"
    )
    .textContent =
      message;


  document
    .getElementById(
      "error-panel"
    )
    .classList
    .remove(
      "hidden"
    );
}


function clearErrorV29() {

  document
    .getElementById(
      "error-panel"
    )
    .classList
    .add(
      "hidden"
    );
}


/*
========================================================
START WALK-FORWARD
========================================================
*/

async function startWalkForwardV29() {

  if (
    v29Running
  ) {
    return;
  }


  v29Running = true;

  v29Stop = false;

  v29Daily = [];


  clearErrorV29();


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


  [
    "comparison-panel",
    "rank-panel",
    "score-panel",
    "daily-panel"
  ]
    .forEach(
      id =>
        document
          .getElementById(
            id
          )
          .classList
          .add(
            "hidden"
          )
    );


  try {

    /*
    Reuse D1 loader + local engine
    từ V2.8.
    */

    if (
      !wf28Engine
    ) {

      await loadEngine();
    }


    const requestedDays =
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


    const latestTargetIndex =
      wf28Engine.rows.length -
      1;


    const earliestTargetIndex =
      Math.max(
        minTrain,
        wf28Engine.rows.length -
        requestedDays
      );


    const actualDays =
      latestTargetIndex -
      earliestTargetIndex +
      1;


    if (
      actualDays <= 0
    ) {

      throw new Error(
        "Không đủ dữ liệu để chạy V2.9."
      );
    }


    setProgress(
      0,
      actualDays
    );


    let done = 0;


    /*
    Chạy từ ngày cũ → mới.

    V2.9 không học gì từ target,
    nên thứ tự này chỉ để báo cáo.
    */

    for (
      let targetIndex =
        earliestTargetIndex;

      targetIndex <=
        latestTargetIndex;

      targetIndex++
    ) {

      if (
        v29Stop
      ) {
        break;
      }


      const date =
        wf28Engine.rows[
          targetIndex
        ]
          .draw_date;


      setStatus(

        `V2.9 ` +

        `${done + 1}/${actualDays}` +

        ` • ${fmtDate(date)}` +

        ` • local CPU`
      );


      const result =
        predictHistoricalDayV29(

          targetIndex,

          modelWindow,

          minTrain
        );


      if (
        result
      ) {

        result.offset =
          wf28Engine.rows.length -
          targetIndex;


        v29Daily.push(
          result
        );


        renderAllV29(
          actualDays
        );
      }


      done++;


      setProgress(
        done,
        actualDays
      );


      await sleep(15);
    }


    if (
      v29Stop
    ) {

      setStatus(

        `Đã dừng sau ` +

        `${v29Daily.length} ngày.`
      );

    }
    else {

      const top3 =
        metricV29(
          "v29",
          "top3",
          actualDays
        );


      setStatus(

        `Hoàn tất ${v29Daily.length} ngày` +

        ` • ${V29_VERSION}` +

        ` • Top3 Lift ` +

        `${
          top3.lift > 0
            ?
            "+"
            :
            ""
        }${pct(top3.lift)}`
      );
    }

  }
  catch (
    error
  ) {

    console.error(
      error
    );


    showErrorV29(

      error?.message
      ||
      "Lỗi Walk-forward V2.9."
    );


    setStatus(
      "Có lỗi."
    );

  }
  finally {

    v29Running =
      false;


    startButton.disabled =
      false;


    stopButton.disabled =
      true;
  }
}


/*
========================================================
STOP
========================================================
*/

function stopWalkForwardV29() {

  v29Stop =
    true;


  setStatus(
    "Sẽ dừng sau ngày đang tính..."
  );
}


console.log(
  `${V29_VERSION} loaded`
);