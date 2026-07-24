/*
========================================================
XSMB BRIDGE PREDICT V2.4
========================================================

MỤC TIÊU

Mỗi "cầu" là MỘT quy luật vị trí cố định:

Vị trí A
+
Vị trí B
+
Chiều ghép cố định A+B hoặc B+A


Ví dụ:

ĐB[1].D4 + G4[2].D3
A+B


Nếu cùng chính xác cầu này:

20/07 sinh 27 -> 21/07 có 27
21/07 sinh 63 -> 22/07 có 63
22/07 sinh 14 -> 23/07 có 14
23/07 sinh 52 -> 24/07 có 52

=> streak = 4


Sau đó dùng đúng:

ĐB[1].D4 + G4[2].D3

ở ngày 24/07 để tạo số dự đoán 25/07.


========================================================
QUY TẮC V2.4
========================================================

streak 0  -> loại
streak 1  -> loại

streak 2  -> giữ
streak 3  -> giữ
streak 4  -> giữ
streak 5  -> giữ

streak >= 6 -> loại


Ưu tiên:

5 kỳ
4 kỳ
3 kỳ
2 kỳ


QUAN TRỌNG

- Phải còn sống sát kỳ mới nhất.
- Kỳ gần nhất gãy => loại.
- Không tìm streak cũ.
- Không cộng nhiều cầu khác nhau.
- Không biến "10 cầu" thành một cầu.
- Mỗi suggestion = một cầu vị trí riêng.
- API chỉ đọc database.
========================================================
*/


/*
========================================================
CẤU HÌNH
========================================================
*/

const VERSION =
  "bridge-v2.4";


const MIN_STREAK = 2;

const MAX_STREAK = 5;


/*
Để phát hiện cầu >= 6 kỳ,
cần tối thiểu 7 kỳ kết quả.

Lấy 16 record để dự phòng:
- record lỗi
- record chưa xổ
- dữ liệu "..."
*/

const HISTORY_LIMIT = 16;


/*
Giới hạn response để tránh
response quá lớn trên Cloudflare.
*/

const MAX_SUGGESTIONS = 100;


/*
========================================================
DANH SÁCH GIẢI
========================================================
*/

const PRIZES = [
  "special",
  "g1",
  "g2",
  "g3",
  "g4",
  "g5",
  "g6",
  "g7"
];


const LABELS = {

  special: "ĐB",

  g1: "G1",

  g2: "G2",

  g3: "G3",

  g4: "G4",

  g5: "G5",

  g6: "G6",

  g7: "G7"

};


/*
========================================================
TÁCH CÁC SỐ TRONG GIẢI
========================================================
*/

function splitPrize(value) {

  if (!value) {
    return [];
  }


  return String(value)
    .trim()
    .split(/\s+/)
    .filter(
      value =>
        /^\d+$/.test(value)
    );
}


/*
========================================================
KIỂM TRA RECORD XSMB HỢP LỆ
========================================================

Một kỳ chuẩn:

ĐB: 1 số x 5 chữ số
G1: 1 số x 5
G2: 2 số x 5
G3: 6 số x 5
G4: 4 số x 4
G5: 6 số x 4
G6: 3 số x 3
G7: 4 số x 2

Tổng = 27 số.
========================================================
*/

function validRow(row) {

  if (!row) {
    return false;
  }


  const special =
    splitPrize(
      row.special
    );


  const g1 =
    splitPrize(
      row.g1
    );


  const g2 =
    splitPrize(
      row.g2
    );


  const g3 =
    splitPrize(
      row.g3
    );


  const g4 =
    splitPrize(
      row.g4
    );


  const g5 =
    splitPrize(
      row.g5
    );


  const g6 =
    splitPrize(
      row.g6
    );


  const g7 =
    splitPrize(
      row.g7
    );


  /*
  Kiểm tra số lượng.
  */

  if (
    special.length !== 1 ||
    g1.length !== 1 ||
    g2.length !== 2 ||
    g3.length !== 6 ||
    g4.length !== 4 ||
    g5.length !== 6 ||
    g6.length !== 3 ||
    g7.length !== 4
  ) {

    return false;
  }


  /*
  Kiểm tra số chữ số.
  */

  return (

    special.every(
      value =>
        /^\d{5}$/.test(value)
    )

    &&

    g1.every(
      value =>
        /^\d{5}$/.test(value)
    )

    &&

    g2.every(
      value =>
        /^\d{5}$/.test(value)
    )

    &&

    g3.every(
      value =>
        /^\d{5}$/.test(value)
    )

    &&

    g4.every(
      value =>
        /^\d{4}$/.test(value)
    )

    &&

    g5.every(
      value =>
        /^\d{4}$/.test(value)
    )

    &&

    g6.every(
      value =>
        /^\d{3}$/.test(value)
    )

    &&

    g7.every(
      value =>
        /^\d{2}$/.test(value)
    )

  );
}


/*
========================================================
LẤY 27 LOTO CỦA MỘT KỲ
========================================================
*/

function getLotoSet(row) {

  const result =
    new Set();


  for (
    const prize of PRIZES
  ) {

    const numbers =
      splitPrize(
        row[prize]
      );


    for (
      const number of numbers
    ) {

      result.add(
        number.slice(-2)
      );
    }
  }


  return result;
}


/*
========================================================
TẠO DANH SÁCH TẤT CẢ VỊ TRÍ
========================================================

Ví dụ:

ĐB[1].D1
ĐB[1].D2
ĐB[1].D3
ĐB[1].D4
ĐB[1].D5

G1[1].D1
...

G3[6].D5

G4[1].D1
...

========================================================
*/

function getPositions(row) {

  const result = [];


  for (
    const prize of PRIZES
  ) {

    const numbers =
      splitPrize(
        row[prize]
      );


    numbers.forEach(
      (
        number,
        numberIndex
      ) => {

        for (
          let digitIndex = 0;
          digitIndex <
          number.length;
          digitIndex++
        ) {

          result.push({

            prize,

            numberIndex,

            digitIndex,

            key:
              `${prize}:` +
              `${numberIndex}:` +
              `${digitIndex}`

          });
        }
      }
    );
  }


  return result;
}


/*
========================================================
LẤY MỘT CHỮ SỐ TỪ VỊ TRÍ
========================================================
*/

function getDigit(
  row,
  position
) {

  if (
    !row ||
    !position
  ) {

    return null;
  }


  const numbers =
    splitPrize(
      row[position.prize]
    );


  const number =
    numbers[
      position.numberIndex
    ];


  if (!number) {

    return null;
  }


  const digit =
    number[
      position.digitIndex
    ];


  if (
    digit === undefined ||
    digit === null
  ) {

    return null;
  }


  return String(digit);
}


/*
========================================================
GHÉP HAI VỊ TRÍ
========================================================

reverse = false

A+B


reverse = true

B+A
========================================================
*/

function makeNumber(
  row,
  positionA,
  positionB,
  reverse = false
) {

  const digitA =
    getDigit(
      row,
      positionA
    );


  const digitB =
    getDigit(
      row,
      positionB
    );


  if (
    digitA === null ||
    digitB === null
  ) {

    return null;
  }


  if (reverse) {

    return (
      `${digitB}${digitA}`
    );
  }


  return (
    `${digitA}${digitB}`
  );
}


/*
========================================================
HIỂN THỊ TÊN VỊ TRÍ
========================================================

Ví dụ:

special / 0 / digit 3

=>

ĐB[1].D4
========================================================
*/

function positionName(
  position
) {

  const label =
    LABELS[
      position.prize
    ] ||
    position.prize;


  return (

    `${label}` +

    `[${position.numberIndex + 1}]` +

    `.D${position.digitIndex + 1}`

  );
}


/*
========================================================
NGÀY KẾ TIẾP
========================================================

Chỉ dùng để hiển thị predictionDate.

KHÔNG dùng để xác định streak.

Streak dựa trên thứ tự các kỳ hợp lệ
trong database.
========================================================
*/

function nextDate(
  dateString
) {

  const date =
    new Date(
      `${dateString}T00:00:00Z`
    );


  date.setUTCDate(
    date.getUTCDate() + 1
  );


  return date
    .toISOString()
    .slice(0, 10);
}


/*
========================================================
PHÂN TÍCH MỘT CẦU
========================================================

rows:

cũ -> mới


Ví dụ:

19
20
21
22
23
24


Bắt đầu từ gần nhất:

23 sinh số -> 24 kiểm tra

nếu đúng:

22 -> 23

nếu đúng:

21 -> 22

...


CHỈ CẦN MỘT LẦN GÃY:

STOP


Không tìm chuỗi đẹp cũ.
========================================================
*/

function analyzeBridge(
  rows,
  lotoSets,
  positionA,
  positionB,
  reverse
) {

  let streak = 0;


  const history = [];


  /*
  Bắt đầu từ cặp kỳ gần nhất.
  */

  for (
    let i =
      rows.length - 2;

    i >= 0;

    i--
  ) {

    const sourceRow =
      rows[i];


    const targetRow =
      rows[i + 1];


    /*
    Sinh số từ kỳ trước.
    */

    const generatedNumber =
      makeNumber(
        sourceRow,
        positionA,
        positionB,
        reverse
      );


    if (!generatedNumber) {

      break;
    }


    /*
    Kiểm tra số đó có xuất hiện
    trong 27 loto kỳ tiếp theo.
    */

    const hit =
      lotoSets[
        i + 1
      ].has(
        generatedNumber
      );


    /*
    Gãy => dừng ngay.
    */

    if (!hit) {

      break;
    }


    /*
    Trúng.
    */

    streak++;


    /*
    Lưu tối đa 6 kỳ để
    kiểm tra/hiển thị.
    */

    if (
      history.length < 6
    ) {

      history.push({

        sourceDate:
          sourceRow.draw_date,

        targetDate:
          targetRow.draw_date,

        number:
          generatedNumber,

        hit: true

      });
    }


    /*
    V2.4 loại cầu >= 6 kỳ.

    Vì vậy chỉ cần đếm tới 6
    là có thể dừng.
    */

    if (
      streak >= 6
    ) {

      break;
    }
  }


  return {

    streak,

    history

  };
}


/*
========================================================
ĐỘ ƯU TIÊN
========================================================
*/

function getPriority(
  streak
) {

  switch (streak) {

    case 5:
      return 4;

    case 4:
      return 3;

    case 3:
      return 2;

    case 2:
      return 1;

    default:
      return 0;
  }
}


/*
========================================================
LEVEL
========================================================
*/

function getLevel(
  streak
) {

  switch (streak) {

    case 5:
      return "priority-5";

    case 4:
      return "priority-4";

    case 3:
      return "priority-3";

    case 2:
      return "running-2";

    default:
      return "invalid";
  }
}


/*
========================================================
API
========================================================
*/

export async function onRequestGet(
  context
) {

  try {

    /*
    ====================================================
    DATABASE
    ====================================================
    */

    const DB =
      context.env.DB;


    if (!DB) {

      return Response.json(
        {

          success: false,

          module:
            "bridge-predict",

          version:
            VERSION,

          message:
            "Không tìm thấy binding DB."

        },
        {
          status: 500
        }
      );
    }


    /*
    ====================================================
    ĐỌC CÁC KỲ GẦN NHẤT
    ====================================================
    */

    const query =
      await DB
        .prepare(`
          SELECT

            draw_date,

            special,

            g1,

            g2,

            g3,

            g4,

            g5,

            g6,

            g7

          FROM results

          ORDER BY draw_date DESC

          LIMIT ?
        `)
        .bind(
          HISTORY_LIMIT
        )
        .all();


    /*
    ====================================================
    LỌC RECORD HỢP LỆ
    ====================================================

    Record kiểu:

    special = "..."

    sẽ bị loại.
    ====================================================
    */

    const rows =
      (
        query.results ||
        []
      )
        .filter(
          validRow
        )
        .reverse();


    /*
    Để xác định được >= 6 streak
    cần tối thiểu 7 kỳ hợp lệ.
    */

    if (
      rows.length < 7
    ) {

      return Response.json({

        success: false,

        module:
          "bridge-predict",

        version:
          VERSION,

        message:
          "Không đủ kỳ XSMB hợp lệ để phân tích V2.4.",

        validDraws:
          rows.length

      });
    }


    /*
    ====================================================
    KỲ MỚI NHẤT
    ====================================================
    */

    const latest =
      rows[
        rows.length - 1
      ];


    /*
    ====================================================
    TẠO LOTO SET
    ====================================================
    */

    const lotoSets =
      rows.map(
        row =>
          getLotoSet(row)
      );


    /*
    ====================================================
    TẠO DANH SÁCH VỊ TRÍ
    ====================================================
    */

    const positions =
      getPositions(
        latest
      );


    /*
    ====================================================
    KẾT QUẢ
    ====================================================
    */

    const suggestions = [];


    /*
    ====================================================
    QUÉT CẶP VỊ TRÍ
    ====================================================
    */

    for (
      let a = 0;

      a <
      positions.length;

      a++
    ) {

      const positionA =
        positions[a];


      for (
        let b =
          a + 1;

        b <
        positions.length;

        b++
      ) {

        const positionB =
          positions[b];


        /*
        ==================================================
        CHỈ GHÉP HAI GIẢI KHÁC NHAU
        ==================================================

        Cho phép:

        ĐB + G4
        G3 + G5
        G1 + G6


        Không cho:

        G3 + G3
        G5 + G5
        ==================================================
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {

          continue;
        }


        /*
        ==================================================
        KIỂM TRA HAI CHIỀU

        A+B

        B+A

        Đây là hai cầu độc lập.
        ==================================================
        */

        for (
          const reverse
          of [
            false,
            true
          ]
        ) {

          /*
          Phân tích lịch sử
          của chính cặp vị trí này.
          */

          const analysis =
            analyzeBridge(
              rows,
              lotoSets,
              positionA,
              positionB,
              reverse
            );


          /*
          ==================================================
          FILTER V2.4
          ==================================================

          Chỉ giữ:

          2
          3
          4
          5

          Loại:

          0
          1
          >=6
          ==================================================
          */

          if (
            analysis.streak <
              MIN_STREAK
            ||
            analysis.streak >
              MAX_STREAK
          ) {

            continue;
          }


          /*
          ==================================================
          SINH SỐ CHO KỲ TIẾP THEO

          Dùng chính hai vị trí
          tại kỳ mới nhất.
          ==================================================
          */

          const prediction =
            makeNumber(
              latest,
              positionA,
              positionB,
              reverse
            );


          if (!prediction) {

            continue;
          }


          /*
          ==================================================
          TÊN VỊ TRÍ
          ==================================================
          */

          const nameA =
            positionName(
              positionA
            );


          const nameB =
            positionName(
              positionB
            );


          const direction =
            reverse
              ? "B+A"
              : "A+B";


          /*
          ==================================================
          BRIDGE KEY

          ID duy nhất của cầu.

          Bao gồm:

          vị trí A
          vị trí B
          chiều
          ==================================================
          */

          const bridgeKey =

            `${positionA.key}|` +

            `${positionB.key}|` +

            `${direction}`;


          /*
          ==================================================
          BRIDGE NAME

          Hiển thị đúng thứ tự
          sinh số.
          ==================================================
          */

          const bridgeName =
            reverse

              ? (
                  `${nameB} + ` +
                  `${nameA}`
                )

              : (
                  `${nameA} + ` +
                  `${nameB}`
                );


          /*
          ==================================================
          THÊM CẦU

          MỖI ITEM = 1 CẦU.

          KHÔNG GROUP THEO NUMBER.
          ==================================================
          */

          suggestions.push({

            bridgeKey,

            number:
              prediction,

            streak:
              analysis.streak,

            priority:
              getPriority(
                analysis.streak
              ),

            level:
              getLevel(
                analysis.streak
              ),

            positionA:
              nameA,

            positionB:
              nameB,

            positionAKey:
              positionA.key,

            positionBKey:
              positionB.key,

            direction,

            bridge:
              bridgeName,

            history:
              analysis.history

          });

        }
      }
    }


    /*
    ====================================================
    XẾP HẠNG
    ====================================================

    5 kỳ trước
    4 kỳ
    3 kỳ
    2 kỳ


    Nếu cùng streak:

    sắp theo số tăng dần.

    Nếu vẫn bằng:

    bridgeKey để kết quả ổn định.
    ====================================================
    */

    suggestions.sort(
      (
        a,
        b
      ) => {

        /*
        Streak cao trước.
        */

        if (
          b.streak !==
          a.streak
        ) {

          return (
            b.streak -
            a.streak
          );
        }


        /*
        Cùng streak:
        sort number.
        */

        const numberCompare =

          Number(
            a.number
          )

          -

          Number(
            b.number
          );


        if (
          numberCompare !== 0
        ) {

          return numberCompare;
        }


        /*
        Cùng cả số:
        sort bridge key.
        */

        return (
          a.bridgeKey
            .localeCompare(
              b.bridgeKey
            )
        );
      }
    );


    /*
    ====================================================
    PHÂN NHÓM THEO STREAK
    ====================================================
    */

    const streak5 =
      suggestions.filter(
        item =>
          item.streak === 5
      );


    const streak4 =
      suggestions.filter(
        item =>
          item.streak === 4
      );


    const streak3 =
      suggestions.filter(
        item =>
          item.streak === 3
      );


    const streak2 =
      suggestions.filter(
        item =>
          item.streak === 2
      );


    /*
    ====================================================
    SỐ KHÁC NHAU
    ====================================================

    Chỉ dùng thống kê.

    KHÔNG dùng để gom cầu.
    ====================================================
    */

    const uniqueNumbers =
      [
        ...new Set(
          suggestions.map(
            item =>
              item.number
          )
        )
      ];


    /*
    ====================================================
    ĐẾM CẦU THEO SỐ

    Chỉ cung cấp thêm thông tin.

    Không ảnh hưởng xếp hạng cầu.
    ====================================================
    */

    const numberMap =
      new Map();


    for (
      const item
      of suggestions
    ) {

      if (
        !numberMap.has(
          item.number
        )
      ) {

        numberMap.set(
          item.number,
          {

            number:
              item.number,

            totalBridges: 0,

            streak5: 0,

            streak4: 0,

            streak3: 0,

            streak2: 0

          }
        );
      }


      const stat =
        numberMap.get(
          item.number
        );


      stat.totalBridges++;


      if (
        item.streak === 5
      ) {

        stat.streak5++;

      } else if (
        item.streak === 4
      ) {

        stat.streak4++;

      } else if (
        item.streak === 3
      ) {

        stat.streak3++;

      } else if (
        item.streak === 2
      ) {

        stat.streak2++;
      }
    }


    const numberSummary =
      Array.from(
        numberMap.values()
      );


    /*
    Chỉ để tham khảo.

    Ưu tiên số có cầu 5 kỳ,
    sau đó 4,3,2.

    Nhưng suggestions phía trên
    vẫn là nguồn chính.
    */

    numberSummary.sort(
      (
        a,
        b
      ) => {

        if (
          b.streak5 !==
          a.streak5
        ) {

          return (
            b.streak5 -
            a.streak5
          );
        }


        if (
          b.streak4 !==
          a.streak4
        ) {

          return (
            b.streak4 -
            a.streak4
          );
        }


        if (
          b.streak3 !==
          a.streak3
        ) {

          return (
            b.streak3 -
            a.streak3
          );
        }


        if (
          b.streak2 !==
          a.streak2
        ) {

          return (
            b.streak2 -
            a.streak2
          );
        }


        return (
          Number(a.number) -
          Number(b.number)
        );
      }
    );


    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return Response.json({

      success: true,

      module:
        "bridge-predict",

      version:
        VERSION,


      /*
      Kỳ dùng sinh dự đoán.
      */

      sourceDate:
        latest.draw_date,


      /*
      Ngày dự đoán.
      */

      predictionDate:
        nextDate(
          latest.draw_date
        ),


      /*
      Số kỳ thực tế được dùng
      trong lần phân tích này.
      */

      analyzedDraws:
        rows.length,


      /*
      Tổng số cầu 2-5 kỳ
      trước khi giới hạn response.
      */

      signalCount:
        suggestions.length,


      /*
      Số cầu thực tế trả frontend.
      */

      returnedSignalCount:
        Math.min(
          suggestions.length,
          MAX_SUGGESTIONS
        ),


      /*
      Số lượng số khác nhau.
      */

      uniqueNumberCount:
        uniqueNumbers.length,


      /*
      Danh sách số khác nhau.
      */

      uniqueNumbers,


      /*
      ==================================================
      RULE
      ==================================================
      */

      rule: {

        fixedPosition:
          true,

        fixedDirection:
          true,

        requireCurrent:
          true,

        requireContinuous:
          true,

        acceptedStreaks: [
          2,
          3,
          4,
          5
        ],

        preferredStreak:
          5,

        rejectBroken:
          true,

        rejectFromStreak:
          6,

        aggregateDifferentBridges:
          false

      },


      /*
      ==================================================
      COUNTS
      ==================================================
      */

      counts: {

        streak5:
          streak5.length,

        streak4:
          streak4.length,

        streak3:
          streak3.length,

        streak2:
          streak2.length,

        total:
          suggestions.length

      },


      /*
      ==================================================
      SUGGESTIONS

      Mỗi phần tử = 1 cầu vị trí.
      ==================================================
      */

      suggestions:
        suggestions.slice(
          0,
          MAX_SUGGESTIONS
        ),


      /*
      ==================================================
      GROUPS
      ==================================================
      */

      groups: {

        streak5:
          streak5.slice(
            0,
            30
          ),

        streak4:
          streak4.slice(
            0,
            30
          ),

        streak3:
          streak3.slice(
            0,
            30
          ),

        streak2:
          streak2.slice(
            0,
            30
          )

      },


      /*
      ==================================================
      THỐNG KÊ THEO SỐ

      Chỉ tham khảo.

      Không phải logic xác định cầu.
      ==================================================
      */

      numberSummary:
        numberSummary.slice(
          0,
          100
        ),


      note:
        "V2.4: mỗi gợi ý là một cầu vị trí cố định và chiều ghép cố định. Chỉ giữ cầu đang chạy liên tục sát kỳ mới nhất từ 2 đến 5 kỳ. Cầu gãy hoặc đã chạy từ 6 kỳ trở lên bị loại."

    });


  } catch (error) {

    /*
    ====================================================
    ERROR
    ====================================================
    */

    console.error(
      "Predict V2.4 error:",
      error
    );


    return Response.json(
      {

        success: false,

        module:
          "bridge-predict",

        version:
          VERSION,

        message:
          error?.message ||
          "Lỗi phân tích cầu V2.4."

      },
      {
        status: 500
      }
    );
  }
}