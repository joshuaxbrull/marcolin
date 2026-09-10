import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { randomUUID, webcrypto } from "node:crypto";
import worker, { seal, REPOSITORY } from "../manager/src/worker.js";
import { LOCATOR_ORIGIN, analyticsSummary, pruneAnalytics } from "../manager/src/analytics.js";
import { createTracker } from "../harleydavidson/js/analytics.js";
const migration = await readFile("manager/migrations/0001_event_analytics.sql", "utf8");
const origin = "https://manager.example";
const credentials = { PORTAL_ORIGIN: origin, GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-only", SESSION_SECRET: "a".repeat(64) };
const event = (type = "visit", source = "card", locationId = null) => ({ id: randomUUID(), type, source, locationId });
function fixture(t) {
  const sql = new DatabaseSync(":memory:"); sql.exec(migration); t.after(() => sql.close());
  // Exercise the actual migration and prepared SQL against SQLite, without a network service.
  const db = {
    prepare(query) {
      const statement = sql.prepare(query); let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() { return { success: true, meta: statement.run(...args) }; },
        async all() { return { success: true, results: statement.all(...args).map(row => ({ ...row })) }; }
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try { const result = []; for (const statement of statements) result.push(await statement.all()); sql.exec("COMMIT"); return result; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    }
  };
  const env = { ...credentials, ANALYTICS_DB: db, EVENT_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  return { sql, env };
}
function collect(env, value, headers = {}, options = {}) {
  return worker.fetch(new Request(origin + "/events", { method: "POST", headers: { Origin: LOCATOR_ORIGIN, "Content-Type": "text/plain;charset=UTF-8", ...headers }, body: JSON.stringify(value), ...options }), env);
}
async function managerRequest(env, path = "/api/analytics") {
  const session = await seal({ token: "test-user-token", csrf: "csrf", expires: Date.now() + 10000 }, env, "session");
  return worker.fetch(new Request(origin + path, { headers: { Cookie: `__Host-marcolin_session=${session}` } }), env);
}
function insert(sql, at, type, source = "card", id = null) {
  sql.prepare("INSERT INTO analytics_events VALUES (?, ?, ?, ?, ?)").run(randomUUID(), at, type, source, id);
}

test("collector stores only anonymous events, accepts newly added shop IDs, and deduplicates retries", async t => {
  const { sql, env } = fixture(t), visit = event();
  const responses = await Promise.all(Array.from({ length: 3 }, () => collect(env, visit)));
  for (const response of responses) {
    assert.equal(response.status, 204); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), LOCATOR_ORIGIN);
    assert.equal(response.headers.get("Set-Cookie"), null);
  }
  const id = 1788973200000;
  assert.equal((await collect(env, event("select", "card", id))).status, 204);
  const rows = sql.prepare("SELECT * FROM analytics_events ORDER BY event_type").all();
  assert.equal(rows.length, 2); assert.equal(rows[0].location_id, id);
  assert.deepEqual(Object.keys(rows[0]), ["event_id", "recorded_at", "event_type", "source", "location_id"]);
  assert.ok(Math.abs(rows[0].recorded_at - Date.now() / 1000) < 3);
});
test("public collection restricts origin and methods without exposing a report", async t => {
  const { sql, env } = fixture(t);
  for (const value of ["null", "https://attacker.example", "https://joshuaxbrull.github.io.attacker.example"]) {
    const response = await collect(env, event(), { Origin: value });
    assert.equal(response.status, 403); assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  assert.equal((await worker.fetch(new Request(origin + "/events", { headers: { Origin: LOCATOR_ORIGIN } }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(origin + "/events", { method: "OPTIONS", headers: { Origin: LOCATOR_ORIGIN } }), env)).status, 204);
  assert.equal((await collect(env, event(), { "Content-Type": "text/html" })).status, 415);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analytics_events").get().n, 0);
});
test("collector rejects extra personal data, malformed IDs, invalid actions, and unbounded bodies", async t => {
  const { sql, env } = fixture(t);
  const valid = event();
  for (const input of [null, [], { ...valid, lat: 38.3 }, { ...valid, id: [valid.id] }, { ...valid, id: "x" }, { ...valid, type: "sale" }, { ...valid, source: "anywhere" }, { ...valid, locationId: 1 }, event("call", "direct", null), event("select", "card", 1.5), event("directions", "card", "1; DROP TABLE analytics_events"), event("select", "card", Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal((await collect(env, input)).status, 422);
  }
  assert.equal((await collect(env, valid, {}, { body: "{" })).status, 400);
  assert.equal((await collect(env, valid, { "Content-Length": "1025" })).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(1025))); controller.close(); } });
  assert.equal((await collect(env, valid, {}, { body: stream, duplex: "half" })).status, 413);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analytics_events").get().n, 0);
});
test("a stalled event body is cancelled after the read deadline", async t => {
  const { env } = fixture(t); let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const response = await collect(env, event(), {}, { body, duplex: "half" });
  assert.equal(response.status, 408); assert.equal(cancelled, true);
});
test("rate limits and unavailable storage fail without recording events or exposing internals", async t => {
  const { env, sql } = fixture(t);
  const limited = await collect({ ...env, EVENT_RATE_LIMITER: { limit: async () => ({ success: false }) } }, event());
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal((await collect({ ...env, EVENT_RATE_LIMITER: null }, event())).status, 503);
  const failed = await collect({ ...env, ANALYTICS_DB: { prepare() { throw new Error("private infrastructure detail"); } } }, event());
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("private infrastructure"));
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analytics_events").get().n, 0);
});
test("reports require a valid GitHub session and current repository write permission", async t => {
  const { env } = fixture(t);
  assert.equal((await worker.fetch(new Request(origin + "/api/analytics"), env)).status, 401);
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ full_name: REPOSITORY, permissions: { push: false } });
  assert.equal((await managerRequest(env)).status, 403);
  globalThis.fetch = async () => Response.json({ full_name: REPOSITORY, permissions: { push: true } });
  const response = await managerRequest(env);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.deepEqual((await response.json()).totals, { visits: 0, qrVisits: 0, directVisits: 0, selections: 0, directions: 0, calls: 0 });
});
test("summary uses UTC date boundaries, source filters, and separate action counts", async t => {
  const { env, sql } = fixture(t), now = Date.UTC(2026, 8, 9, 15, 30), midnight = Date.UTC(2026, 8, 9) / 1000;
  const from = midnight - 6 * 86400;
  insert(sql, from - 1, "visit"); insert(sql, from, "visit");
  insert(sql, midnight, "visit", "direct"); insert(sql, midnight, "select", "card", 2);
  insert(sql, midnight, "directions", "card", 2); insert(sql, midnight, "call", "direct", 1788973200000);
  insert(sql, Math.floor(now / 1000) + 1, "visit");
  const report = await analyticsSummary(env, new URL(origin + "/api/analytics?days=7"), now);
  assert.deepEqual(report.totals, { visits: 2, qrVisits: 1, directVisits: 1, selections: 1, directions: 1, calls: 1 });
  assert.equal(report.daily[0].day, "2026-09-09"); assert.equal(report.daily[1].day, "2026-09-03");
  assert.equal(report.shops[0].locationId, 2); assert.equal(report.shops[1].locationId, 1788973200000);
  const card = await analyticsSummary(env, new URL(origin + "/api/analytics?days=7&source=card"), now);
  assert.equal(card.totals.calls, 0); assert.equal(card.totals.visits, 1); assert.equal(card.shops.length, 1);
  for (const query of ["days=365", "days=-1", "source=' OR 1=1 --"]) await assert.rejects(analyticsSummary(env, new URL(origin + "/api/analytics?" + query), now), error => error.status === 422);
});
test("daily retention removes only events outside the 90-day reporting window", async t => {
  const { env, sql } = fixture(t), now = Date.UTC(2026, 8, 9, 15), cutoff = Date.UTC(2026, 8, 9) / 1000 - 89 * 86400;
  insert(sql, cutoff - 1, "visit"); insert(sql, cutoff, "visit"); insert(sql, Math.floor(now / 1000), "visit");
  await pruneAnalytics(env, now);
  assert.deepEqual(sql.prepare("SELECT recorded_at FROM analytics_events ORDER BY recorded_at").all().map(row => row.recorded_at), [cutoff, now / 1000]);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analytics_state").get().n, 1);
});
function browserFixture(overrides = {}) {
  const calls = [];
  const browser = { location: { href: LOCATOR_ORIGIN + "/marcolin/harleydavidson/?entry=card&search=private#private" }, navigator: { onLine: true }, crypto: webcrypto, fetch: async (...args) => { calls.push(args); return new Response(null, { status: 204 }); }, ...overrides };
  return { browser, calls };
}
test("client counts one visit per load and sends only allowed fields without cookies or referrers", async () => {
  const { browser, calls } = browserFixture(), track = createTracker(browser);
  track("visit"); track("visit"); track("select", 2); track("directions", 2); track("call", 2);
  assert.equal(calls.length, 4);
  const events = calls.map(([, options]) => JSON.parse(options.body));
  assert.deepEqual(events.map(e => e.type), ["visit", "select", "directions", "call"]);
  assert.equal(new Set(events.map(e => e.id)).size, 4);
  for (const [, options] of calls) {
    assert.equal(options.keepalive, true); assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store"); assert.equal(options.referrerPolicy, "no-referrer");
    assert.deepEqual(Object.keys(JSON.parse(options.body)), ["id", "type", "source", "locationId"]);
    assert.equal(JSON.parse(options.body).source, "card"); assert.ok(!options.body.includes("private"));
  }
  const direct = browserFixture({ location: { href: LOCATOR_ORIGIN + "/marcolin/harleydavidson/" } });
  createTracker(direct.browser)("visit"); assert.equal(JSON.parse(direct.calls[0][1].body).source, "direct");
});
test("blocked, offline, and opted-out tracking never interferes with the locator", async () => {
  for (const navigator of [{ onLine: false }, { doNotTrack: "1" }, { globalPrivacyControl: true }]) {
    const { browser, calls } = browserFixture({ navigator }); createTracker(browser)("visit"); assert.equal(calls.length, 0);
  }
  for (const fetch of [() => { throw new Error("blocked"); }, async () => { throw new Error("offline"); }]) {
    const { browser } = browserFixture({ fetch }); assert.doesNotThrow(() => createTracker(browser)("directions", 2));
  }
  await new Promise(resolve => setImmediate(resolve));
});
