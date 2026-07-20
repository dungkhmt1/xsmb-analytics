export async function onRequestGet() {
  try {
    const SOURCE_URL =
      "https://xoso.com.vn/xsmb-20-07-2026.html";

    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"
      }
    });

    if (!response.ok) {
      return Response.json({
        success: false,
        status: response.status
      });
    }

    const html = await response.text();

    const keyword = "39128";
    const position = html.indexOf(keyword);

    if (position === -1) {
      return Response.json({
        success: false,
        message: "Không tìm thấy giải đặc biệt 39128 trong HTML",
        htmlLength: html.length
      });
    }

    const start = Math.max(0, position - 1500);
    const end = Math.min(html.length, position + 3000);

    return new Response(
      html.substring(start, end),
      {
        headers: {
          "content-type": "text/plain;charset=UTF-8"
        }
      }
    );

  } catch (error) {
    return Response.json({
      success: false,
      message: error.message
    });
  }
}