export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function fail(message, status = 500, extra = {}) {
  return json({ success: false, error: message, ...extra }, status);
}

export function positiveInt(value, fallback, max) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}
