import { collectEvent, analyticsSummary, pruneAnalytics } from "./analytics.js";
import { validateLocations } from "../../shared/locations.js";

export const REPOSITORY = "joshuaxbrull/marcolin";
export const DIRECTORY_PATH = "harleydavidson/data/locations.json";
const CONTENTS = `/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}`;
const PUBLIC_DIRECTORY = "https://joshuaxbrull.github.io/marcolin/harleydavidson/data/locations.json";
const SESSION = "__Host-marcolin_session";
const LOGIN = "__Host-marcolin_login";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = bytes => { let text = ""; for (let at = 0; at < bytes.length; at += 16384) text += String.fromCharCode(...bytes.subarray(at, at + 16384)); return btoa(text); };
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const url64 = bytes => b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
const unurl64 = value => unb64(value.replaceAll("-", "+").replaceAll("_", "/"));
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function headers(extra = {}) {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", ...extra };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: headers({ "Content-Type": "application/json" }) });
function cookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function cookies(request) { return Object.fromEntries((request.headers.get("Cookie") || "").split(";").map(part => part.trim().split(/=(.*)/s).slice(0, 2)).filter(p => p.length === 2)); }
function configured(env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !/^[a-f0-9]{64}$/i.test(env.SESSION_SECRET || "") || !env.PORTAL_ORIGIN) throw new HttpError(503, "Manager sign-in is awaiting account configuration. Contact the site owner.");
}
async function secretKey(env) {
  return crypto.subtle.importKey("raw", Uint8Array.from(env.SESSION_SECRET.match(/../g), hex => parseInt(hex, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(value, env, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${env.PORTAL_ORIGIN}|${purpose}`) }, await secretKey(env), encoder.encode(JSON.stringify(value)));
  return `${url64(iv)}.${url64(new Uint8Array(encrypted))}`;
}
export async function unseal(value, env, purpose) {
  try {
    const [iv, data] = String(value).split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unurl64(iv), additionalData: encoder.encode(`${env.PORTAL_ORIGIN}|${purpose}`) }, await secretKey(env), unurl64(data));
    const result = JSON.parse(decoder.decode(plain));
    return result.expires > Date.now() ? result : null;
  } catch { return null; }
}
async function upstream(url, options = {}) {
  try { return await fetch(url, { ...options, signal: AbortSignal.timeout(12000) }); }
  catch { throw new HttpError(502, "Could not reach the publishing service. Your draft has been kept; retry shortly."); }
}
async function github(path, token, options = {}) {
  const response = await upstream(`https://api.github.com${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Marcolin-Location-Manager", ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new HttpError(401, "Your GitHub session expired. Sign in again; your draft is kept in this tab.");
    if (response.status === 409) throw new HttpError(409, "Another manager changed the directory. Review the changes before publishing.");
    if (response.status === 403 || response.status === 404) throw new HttpError(403, "This GitHub account needs write access to the Marcolin repository and authorization for its manager app.");
    throw new HttpError(response.status === 422 ? 422 : 502, body.message || "GitHub could not publish this change.");
  }
  return body;
}
async function authorize(request, env) {
  configured(env);
  const session = await unseal(cookies(request)[SESSION], env, "session");
  if (!session) throw new HttpError(401, "Sign in with GitHub to manage locations.");
  const repo = await github(`/repos/${REPOSITORY}`, session.token);
  if (repo.full_name?.toLowerCase() !== REPOSITORY.toLowerCase() || !repo.permissions?.push) throw new HttpError(403, "Your GitHub account does not have permission to manage this directory.");
  return session;
}
function requireWrite(request, session, env) {
  if (request.headers.get("Origin") !== env.PORTAL_ORIGIN || request.headers.get("X-CSRF-Token") !== session.csrf) throw new HttpError(403, "This request could not be verified. Reload the manager portal and try again.");
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new HttpError(415, "Expected a JSON request.");
}
export async function gitBlobSha(text) {
  const bytes = encoder.encode(text);
  const prefix = encoder.encode(`blob ${bytes.length}\0`);
  const buffer = new Uint8Array(prefix.length + bytes.length); buffer.set(prefix); buffer.set(bytes, prefix.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", buffer)), n => n.toString(16).padStart(2, "0")).join("");
}
async function readDirectory(token) {
  const meta = await github(`${CONTENTS}?ref=main`, token);
  if (meta.encoding !== "base64" || !meta.content) throw new HttpError(502, "The directory could not be read. Editing remains disabled.");
  return { records: validateLocations(JSON.parse(decoder.decode(unb64(meta.content.replace(/\s/g, ""))))), sha: meta.sha };
}
function redirect(url, setCookies = []) {
  const h = new Headers(headers({ Location: url }));
  setCookies.forEach(value => h.append("Set-Cookie", value));
  return new Response(null, { status: 302, headers: h });
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/events") return collectEvent(request, env);
  if (url.pathname === "/auth/github" && request.method === "GET") {
    configured(env);
    const state = random(), verifier = random();
    const challenge = url64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
    const login = await seal({ state, verifier, expires: Date.now() + 600000 }, env, "login");
    const params = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${env.PORTAL_ORIGIN}/auth/callback`, state, code_challenge: challenge, code_challenge_method: "S256" });
    return redirect(`https://github.com/login/oauth/authorize?${params}`, [cookie(LOGIN, login, 600)]);
  }
  if (url.pathname === "/auth/callback" && request.method === "GET") {
    configured(env);
    const login = await unseal(cookies(request)[LOGIN], env, "login");
    if (!login || login.state !== url.searchParams.get("state")) throw new HttpError(400, "Sign-in verification expired or failed. Start sign-in again.");
    if (url.searchParams.has("error")) return redirect(`${env.PORTAL_ORIGIN}/?login=cancelled`, [cookie(LOGIN, "", 0)]);
    const code = url.searchParams.get("code");
    if (!code || code.length > 500) throw new HttpError(400, "GitHub did not supply a valid sign-in code.");
    const response = await upstream("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${env.PORTAL_ORIGIN}/auth/callback`, code_verifier: login.verifier }) });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new HttpError(401, "GitHub could not complete sign-in. Try signing in again.");
    const repo = await github(`/repos/${REPOSITORY}`, result.access_token);
    if (!repo.permissions?.push) throw new HttpError(403, "Ask the site owner for write access to the Marcolin repository.");
    const user = await github("/user", result.access_token);
    const age = Math.min(28800, Number(result.expires_in) || 28800);
    const session = await seal({ token: result.access_token, login: user.login, csrf: random(), expires: Date.now() + age * 1000 }, env, "session");
    return redirect(env.PORTAL_ORIGIN + "/", [cookie(SESSION, session, age), cookie(LOGIN, "", 0)]);
  }
  if (url.pathname.startsWith("/api/") || url.pathname === "/auth/logout") {
    const session = await authorize(request, env);
    if (url.pathname === "/api/analytics" && request.method === "GET") return json(await analyticsSummary(env, url));
    if (url.pathname === "/api/session" && request.method === "GET") return json({ login: session.login, csrf: session.csrf, expires: session.expires });
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      requireWrite(request, session, env);
      return new Response(null, { status: 204, headers: headers({ "Set-Cookie": cookie(SESSION, "", 0) }) });
    }
    if (url.pathname === "/api/locations" && request.method === "GET") return json(await readDirectory(session.token));
    if (url.pathname === "/api/locations" && request.method === "PUT") {
      requireWrite(request, session, env);
      const body = await request.text();
      if (encoder.encode(body).length > 1000000) throw new HttpError(413, "This directory is too large to publish.");
      let input, records;
      try { input = JSON.parse(body); records = validateLocations(input.records); } catch (error) { throw new HttpError(422, error.message); }
      if (!/^[a-f0-9]{40}$/.test(input.baseSha || "")) throw new HttpError(422, "Load the directory before saving.");
      const content = JSON.stringify(records, null, 2) + "\n";
      // Use the SHA loaded with this draft, never the latest SHA with stale content.
      const saved = await github(CONTENTS, session.token, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `Update locator locations (${session.login})`, branch: "main", sha: input.baseSha, content: b64(encoder.encode(content)) }) });
      return json({ sha: saved.content.sha, commitSha: saved.commit.sha });
    }
    if (url.pathname === "/api/publication" && request.method === "GET") {
      const sha = url.searchParams.get("sha");
      if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new HttpError(422, "Invalid publication identifier.");
      const response = await upstream(`${PUBLIC_DIRECTORY}?verify=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return json({ status: "publishing" });
      const text = await response.text();
      if (await gitBlobSha(text) === sha) return json({ status: "live" });
      const latest = await readDirectory(session.token);
      return json({ status: latest.sha === sha ? "publishing" : "superseded" });
    }
    return json({ error: "Endpoint not found." }, 404);
  }
  if (url.pathname.startsWith("/auth/")) return json({ error: "Endpoint not found." }, 404);
  const asset = await env.ASSETS.fetch(request);
  const secured = new Response(asset.body, asset);
  for (const [key, value] of Object.entries(headers())) secured.headers.set(key, value);
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io https://nominatim.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return secured;
}
export default {
  async scheduled(controller, env) { await pruneAnalytics(env, controller.scheduledTime); },
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) { return json({ error: error.status ? error.message : "The manager service could not complete the request. Your draft has been kept." }, error.status || 500); }
  }
};
