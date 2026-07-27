function flattenUnknown(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap(flattenUnknown);
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (typeof value !== "string") {
    return [];
  }

  const text = value.trim();
  if (!text) return [];

  // Hỗ trợ dữ liệu lưu JSON string.
  if (
    (text.startsWith("[") && text.endsWith("]")) ||
    (text.startsWith("{") && text.endsWith("}"))
  ) {
    try {
      return flattenUnknown(JSON.parse(text));
    } catch {
      // Nếu không phải JSON hợp lệ, tiếp tục parse như text thường.
    }
  }

  // Hỗ trợ "86786 24867", "86786,24867", xuống dòng...
  return text
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizePrizeValues(value) {
  return flattenUnknown(value)
    .map((item) => String(item).replace(/\D/g, ""))
    .filter(Boolean);
}

export function extractLotoNumbers(draw, columns) {
  const numbers = [];

  for (const column of columns) {
    const prizeValues = normalizePrizeValues(draw[column]);

    for (const prize of prizeValues) {
      if (prize.length >= 2) {
        numbers.push(prize.slice(-2).padStart(2, "0"));
      }
    }
  }

  return numbers;
}

export function dateAddDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
