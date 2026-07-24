/*
========================================================
XSMB BRIDGE PREDICT V2.3
========================================================

ĐỊNH NGHĨA CẦU:

Một cầu =

Vị trí A cố định
+
Vị trí B cố định
+
Chiều ghép cố định A+B hoặc B+A

Ví dụ:

ĐB[1].D4 + G4[2].D3
A+B

Nếu:

Kỳ N:
hai vị trí tạo 27
→ kỳ N+1 có loto 27

Kỳ N+1:
cùng hai vị trí tạo 63
→ kỳ N+2 có loto 63

Kỳ N+2:
cùng hai vị trí tạo 14
→ kỳ N+3 có loto 14

=> chính cầu vị trí này chạy 3 kỳ.


QUY TẮC V2.3:

- streak 0: loại
- streak 1: loại
- streak 2: giữ
- streak 3: ưu tiên cao
- streak >= 4: loại

QUAN TRỌNG:

- Phải chạy liên tục sát kỳ mới nhất.
- Nếu lần gần nhất gãy => loại.
- Không tìm lại streak cũ.
- Không gom nhiều cầu khác nhau thành một cầu.
- Mỗi suggestion = một cầu vị trí cụ thể.
- API chỉ READ database.
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
TÁCH CÁC SỐ TRONG MỘT GIẢI
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
      value => /^\d+$/.test(value)
    );
}


/*
========================================================
KIỂM TRA MỘT KỲ CÓ ĐỦ DỮ LIỆU XSMB
========================================================
*/

function validRow(row) {

  if (!row) {
    return false;
  }

  const special =
    splitPrize(row.special);

  const g1 =
    splitPrize(row.g1);

  const g2 =
    splitPrize(row.g2);

  const g3 =
    splitPrize(row.g3);

  const g4 =
    splitPrize(row.g4);

  const g5 =
    splitPrize(row.g5);

  const g6 =
    splitPrize(row.g6);

  const g7 =
    splitPrize(row.g7);


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


  return (
    special.every(
      value => /^\d{5}$/.test(value)
    )
    &&
    g1.every(
      value => /^\d{5}$/.test(value)
    )
    &&
    g2.every(
      value => /^\d{5}$/.test(value)
    )
    &&
    g3.every(
      value => /^\d{5}$/.test(value)
    )
    &&
    g4.every(
      value => /^\d{4}$/.test(value)
    )
    &&
    g5.every(
      value => /^\d{4}$/.test(value)
    )
    &&
    g6.every(
      value => /^\d{3}$/.test(value)
    )
    &&
    g7.every(
      value => /^\d{2}$/.test(value)
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


  for (const prize of PRIZES) {

    const numbers =
      splitPrize(
        row[prize]
      );


    for (const number of numbers) {

      result.add(
        number.slice(-2)
      );
    }
  }


  return result;
}


/*
========================================================
TẠO DANH SÁCH TẤT CẢ VỊ TRÍ CHỮ SỐ
========================================================

Ví dụ:

special[0] digit 0
special[0] digit 1
...

g3[0] digit 0
g3[0] digit 1
...

========================================================
*/

function getPositions(row) {

  const result = [];


  for (const prize of PRIZES) {

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
          digitIndex < number.length;
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
LẤY CHỮ SỐ TẠI MỘT VỊ TRÍ
========================================================
*/

function getDigit(
  row,
  position
) {

  if (!row) {
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


  return digit;
}


/*
========================================================
GHÉP HAI VỊ TRÍ
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


  return reverse
    ? `${digitB}${digitA}`
    : `${digitA}${digitB}`;
}


/*
========================================================
TÊN VỊ TRÍ CHO FRONTEND
========================================================
*/

function positionName(position) {

  const label =
    LABELS[position.prize] ||
    position.prize;


  return (
    `${label}` +
    `[${position.numberIndex + 1}]` +
    `.D${position.digitIndex + 1}`
  );
}


/*
========================================================
NGÀY DỰ ĐOÁN

Chỉ dùng để hiển thị.

Không dùng hàm này để quyết định cầu sống/gãy.
========================================================
*/

function nextDate(dateString) {

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
PHÂN TÍCH MỘT CẦU VỊ TRÍ CỤ THỂ
========================================================

rows được sắp:

cũ -> mới

Ví dụ:

20
21
22
23

Ta bắt đầu kiểm tra:

22 sinh số -> 23 có?
21 sinh số -> 22 có?
20 sinh số -> 21 có?

Chỉ cần lần đầu tiên không trúng:
STOP.

Như vậy streak luôn là streak sát hiện tại.
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


  for (
    let i = rows.length - 2;
    i >= 0;
    i--
  ) {

    const sourceRow =
      rows[i];


    const targetRow =
      rows[i + 1];


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


    const hit =
      lotoSets[i + 1]
        .has(generatedNumber);


    /*
    Nếu kỳ sát nhất gãy,
    cầu chết ngay.

    Không tiếp tục tìm lịch sử cũ.
    */

    if (!hit) {
      break;
    }


    streak++;


    /*
    Lưu lịch sử để giao diện
    có thể chứng minh cầu chạy.
    */

    if (history.length < 3) {

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
    4 kỳ là đủ để biết cầu
    phải bị loại.
    */

    if (streak >= 4) {
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
API
========================================================
*/

export async function onRequestGet(
  context
) {

  try {

    const DB =
      context.env.DB;


    if (!DB) {

      return Response.json(
        {

          success: false,

          module:
            "bridge-predict",

          version:
            "bridge-v2.3",

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
    KHÔNG CẦN QUÉT 199 KỲ

    Cầu chỉ được giữ tới streak 3.
    Ta cần một ít kỳ gần nhất để xác định
    cầu 2 / 3 / >=4.

    Lấy 12 record để vẫn có dư địa nếu
    có record lỗi hoặc chưa xổ.
    ====================================================
    */

    const HISTORY_LIMIT = 12;


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
    LOẠI RECORD KHÔNG HỢP LỆ

    Ví dụ record:

    special = "..."
    g1 = "..."

    sẽ không được sử dụng.
    ====================================================
    */

    const rows =
      (query.results || [])
        .filter(validRow)
        .reverse();


    if (
      rows.length < 5
    ) {

      return Response.json({

        success: false,

        module:
          "bridge-predict",

        version:
          "bridge-v2.3",

        message:
          "Không đủ kỳ XSMB hợp lệ để phân tích cầu V2.3.",

        validDraws:
          rows.length

      });
    }


    const latest =
      rows[
        rows.length - 1
      ];


    /*
    ====================================================
    LOTO CỦA TỪNG KỲ
    ====================================================
    */

    const lotoSets =
      rows.map(
        row =>
          getLotoSet(row)
      );


    /*
    ====================================================
    DANH SÁCH VỊ TRÍ

    Cấu trúc giải XSMB cố định nên
    lấy từ kỳ mới nhất là đủ.
    ====================================================
    */

    const positions =
      getPositions(
        latest
      );


    const suggestions = [];


    /*
    ====================================================
    QUÉT TỪNG CẶP VỊ TRÍ
    ====================================================
    */

    for (
      let a = 0;
      a < positions.length;
      a++
    ) {

      const positionA =
        positions[a];


      for (
        let b = a + 1;
        b < positions.length;
        b++
      ) {

        const positionB =
          positions[b];


        /*
        Theo logic hiện tại:
        hai vị trí phải thuộc
        hai giải khác nhau.

        Ví dụ hợp lệ:

        ĐB + G4
        G3 + G5
        G1 + G6

        Không ghép:

        G3 + G3
        */

        if (
          positionA.prize ===
          positionB.prize
        ) {
          continue;
        }


        /*
        ==================================================
        HAI CHIỀU GHÉP LÀ HAI CẦU KHÁC NHAU

        A+B
        B+A
        ==================================================
        */

        for (
          const reverse
          of [false, true]
        ) {

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
          LOGIC V2.3

          CHỈ GIỮ CHÍNH XÁC:

          streak 2
          streak 3

          0/1:
          chưa đủ cầu.

          >=4:
          loại vì đã vượt vùng ưu tiên.
          ==================================================
          */

          if (
            analysis.streak !== 2 &&
            analysis.streak !== 3
          ) {
            continue;
          }


          /*
          ==================================================
          LẤY CHÍNH CẶP VỊ TRÍ ĐÓ
          Ở KỲ MỚI NHẤT
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
          ID DUY NHẤT CỦA CẦU.

          Vị trí + chiều ghép.
          */

          const bridgeKey =
            `${positionA.key}|` +
            `${positionB.key}|` +
            `${direction}`;


          suggestions.push({

            bridgeKey,

            number:
              prediction,

            streak:
              analysis.streak,

            priority:
              analysis.streak === 3
                ? 2
                : 1,

            level:
              analysis.streak === 3
                ? "priority-3"
                : "running-2",

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
              reverse
                ? `${nameB} + ${nameA}`
                : `${nameA} + ${nameB}`,

            history:
              analysis.history

          });
        }
      }
    }


    /*
    ====================================================
    XẾP HẠNG

    KHÔNG GOM THEO NUMBER.

    Mỗi item vẫn là một cầu vị trí độc lập.

    3 kỳ đứng trước.
    2 kỳ đứng sau.

    Nếu cùng streak:
    sắp theo số chỉ để kết quả ổn định.
    ====================================================
    */

    suggestions.sort(
      (a, b) => {

        if (
          b.streak !==
          a.streak
        ) {

          return (
            b.streak -
            a.streak
          );
        }


        const numberCompare =
          Number(a.number) -
          Number(b.number);


        if (
          numberCompare !== 0
        ) {

          return numberCompare;
        }


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
    PHÂN NHÓM
    ====================================================
    */

    const priority3 =
      suggestions.filter(
        item =>
          item.streak === 3
      );


    const running2 =
      suggestions.filter(
        item =>
          item.streak === 2
      );


    /*
    ====================================================
    SỐ KHÁC NHAU ĐƯỢC GỢI Ý

    Đây chỉ là thông tin thống kê.
    Không dùng để gom cầu.
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
    RESPONSE
    ====================================================
    */

    return Response.json({

      success: true,

      module:
        "bridge-predict",

      version:
        "bridge-v2.3",

      sourceDate:
        latest.draw_date,

      predictionDate:
        nextDate(
          latest.draw_date
        ),

      analyzedDraws:
        rows.length,

      signalCount:
        suggestions.length,

      uniqueNumberCount:
        uniqueNumbers.length,

      uniqueNumbers,


      rule: {

        fixedPosition:
          true,

        fixedDirection:
          true,

        requireCurrent:
          true,

        acceptedStreaks: [
          2,
          3
        ],

        preferredStreak:
          3,

        rejectBroken:
          true,

        rejectFromStreak:
          4,

        aggregateDifferentBridges:
          false

      },


      /*
      Mỗi suggestion = 1 cầu.
      */

      suggestions:
        suggestions.slice(
          0,
          50
        ),


      groups: {

        priority3:
          priority3.slice(
            0,
            30
          ),

        running2:
          running2.slice(
            0,
            30
          )

      },


      note:
        "Mỗi gợi ý là một cầu vị trí cố định. Chỉ giữ cầu đang chạy liên tục 2 hoặc 3 kỳ sát kỳ mới nhất. Cầu gãy hoặc chạy từ 4 kỳ trở lên bị loại."

    });


  } catch (error) {

    console.error(
      "Predict V2.3 error:",
      error
    );


    return Response.json(
      {

        success: false,

        module:
          "bridge-predict",

        version:
          "bridge-v2.3",

        message:
          error?.message ||
          "Lỗi phân tích cầu V2.3."

      },
      {
        status: 500
      }
    );
  }
}