class TextCollector {
  constructor() {
    this.text = "";
  }

  text(chunk) {
    this.text += chunk.text;
  }
}

export async function onRequestGet(context) {
  try {
    const SOURCE_URL = "https://xoso.com.vn/xsmb-20-07-2026.html";

    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      return Response.json({
        success: false,
        message: `Không tải được website nguồn: ${response.status}`
      }, { status: 500 });
    }

    const html = await response.text();

    return Response.json({
      success: true,
      message: "Đã tải HTML thành công",
      htmlLength: html.length
    });

  } catch (error) {
    return Response.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
}