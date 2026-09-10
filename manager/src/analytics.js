export const LOCATOR_ORIGIN = "https://joshuaxbrull.github.io";
export const RETENTION_DAYS = 90;
const DAY = 86400;
const LIMIT_BYTES = 1024;
const TYPES = new Set(["visit", "select", "directions", "call"]);
const SOURCES = new Set(["card", "direct"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function database(env) {
  if (!env.ANALYTICS_DB) fail(503, "Activity reporting is not configured yet.");
  return env.ANALYTICS_DB;
}
async function readEvent(request) {
  if (Number(request.headers.get("Content-Length")) > LIMIT_BYTES) fail(413, "Event is too large.");
  if (!request.body) fail(400, "Missing event.");
  const reader = request.body.getReader();
  let size = 0, timer;
  const chunks = [];
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({ expired: true }), 5000); });
  try {
    while (true) {
      const { value, done, expired } = await Promise.race([reader.read(), deadline]);
      if (expired) fail(408, "Event timed out.");
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT_BYTES) fail(413, "Event is too large.");
      chunks.push(value);
    }
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  let event;
  try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(400, "Invalid event JSON."); }
  if (!event || Array.isArray(event) || Object.keys(event).sort().join(",") !== "id,locationId,source,type" ||
      typeof event.id !== "string" || !UUID.test(event.id) || !TYPES.has(event.type) || !SOURCES.has(event.source) ||
      (event.type === "visit" ? event.locationId !== null : !Number.isSafeInteger(event.locationId) || event.locationId <= 0)) {
    fail(422, "Invalid event.");
  }
  return { ...event, id: event.id.toLowerCase() };
}

// This is the only public write endpoint. It cannot read counts or change the directory.
export async function collectEvent(request, env) {
  const allowed = request.headers.get("Origin") === LOCATOR_ORIGIN;
  const headers = {
    "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Content-Type": "application/json",
    ...(allowed ? { "Access-Control-Allow-Origin": LOCATOR_ORIGIN } : {})
  };
  try {
    if (!allowed) fail(403, "Origin is not allowed.");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } });
    const type = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (type !== "text/plain" && type !== "application/json") fail(415, "Expected an event document.");
    const db = database(env);
    if (!env.EVENT_RATE_LIMITER) fail(503, "Activity collection is temporarily unavailable.");
    // Cloudflare supplies this header. It is used only for a generous abuse limit;
    // no IP, user agent, referrer, GPS coordinates, or visitor identity goes into D1.
    const { success } = await env.EVENT_RATE_LIMITER.limit({ key: `marcolin-events:${request.headers.get("CF-Connecting-IP") || "local"}` });
    if (!success) return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    const event = await readEvent(request);
    await db.prepare(`INSERT INTO analytics_events (event_id, recorded_at, event_type, source, location_id)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`)
      .bind(event.id, Math.floor(Date.now() / 1000), event.type, event.source, event.locationId).run();
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.status ? error.message : "Activity collection is temporarily unavailable." }), { status: error.status || 503, headers });
  }
}

const COUNTS = `COALESCE(SUM(event_type = 'visit'), 0) AS visits,
  COALESCE(SUM(event_type = 'visit' AND source = 'card'), 0) AS qrVisits,
  COALESCE(SUM(event_type = 'visit' AND source = 'direct'), 0) AS directVisits,
  COALESCE(SUM(event_type = 'select'), 0) AS selections,
  COALESCE(SUM(event_type = 'directions'), 0) AS directions,
  COALESCE(SUM(event_type = 'call'), 0) AS calls`;

// Called only after the manager Worker has checked the GitHub session and write access.
export async function analyticsSummary(env, url, now = Date.now()) {
  const days = Number(url.searchParams.get("days") || "30");
  const source = url.searchParams.get("source") || "all";
  if (![7, 30, 90].includes(days) || !["all", ...SOURCES].includes(source)) fail(422, "Choose 7, 30, or 90 days and a valid source.");
  const from = Math.floor(now / (DAY * 1000)) * DAY - (days - 1) * DAY;
  const to = Math.floor(now / 1000) + 1;
  const db = database(env);
  const where = "recorded_at >= ? AND recorded_at < ? AND (? = 'all' OR source = ?)";
  const query = sql => db.prepare(sql).bind(from, to, source, source);
  const [totals, daily, shops, state] = await db.batch([
    query(`SELECT ${COUNTS} FROM analytics_events WHERE ${where}`),
    query(`SELECT date(recorded_at, 'unixepoch') AS day, ${COUNTS} FROM analytics_events WHERE ${where} GROUP BY day ORDER BY day DESC`),
    query(`SELECT location_id AS locationId, ${COUNTS} FROM analytics_events WHERE ${where} AND location_id IS NOT NULL GROUP BY location_id ORDER BY (selections + directions + calls) DESC, location_id ASC LIMIT 25`),
    db.prepare("SELECT started_at AS startedAt FROM analytics_state WHERE id = 1")
  ]);
  return {
    days, source, timezone: "UTC", retentionDays: RETENTION_DAYS,
    from: new Date(from * 1000).toISOString(), generatedAt: new Date(now).toISOString(),
    startedAt: new Date(state.results[0].startedAt * 1000).toISOString(),
    totals: totals.results[0], daily: daily.results, shops: shops.results
  };
}

export async function pruneAnalytics(env, now = Date.now()) {
  const before = Math.floor(now / (DAY * 1000)) * DAY - (RETENTION_DAYS - 1) * DAY;
  await database(env).prepare("DELETE FROM analytics_events WHERE recorded_at < ?").bind(before).run();
}
