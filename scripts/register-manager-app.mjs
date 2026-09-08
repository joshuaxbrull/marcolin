import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { managerDestination } from "../portal/destination.js";

const OWNER = "joshuaxbrull";
const SETUP_SECONDS = 55 * 60;
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const equal = (a, b) => typeof a === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function setupOrigin(value) {
  if (!value) return "http://127.0.0.1:8736";
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use the temporary HTTPS Cloudflare Tunnel origin.");
  }
  return url.origin;
}

export function registrationManifest(origin, redirect) {
  const destination = managerDestination(origin);
  if (!destination) throw new Error("Use the deployed HTTPS manager origin.");
  return {
    name: "Marcolin Manager - joshuaxbrull", url: destination,
    description: "Manage the Marcolin Harley-Davidson shop directory.",
    public: false, hook_attributes: { active: false, url: origin + "/github/webhook" },
    default_permissions: { contents: "write", metadata: "read" }, default_events: [],
    callback_urls: [origin + "/auth/callback"], redirect_url: redirect,
    setup_url: origin + "/auth/github", request_oauth_on_install: false,
  };
}

export function validateRegistration(app) {
  if (app?.owner?.login?.toLowerCase() !== OWNER || !Number.isSafeInteger(app.id) || app.id < 1 ||
      !/^[A-Za-z0-9._-]+$/.test(app.client_id || "") ||
      !/^[a-z0-9-]+$/.test(app.slug || "") ||
      app.html_url !== `https://github.com/apps/${app.slug}` ||
      typeof app.client_secret !== "string" || !app.client_secret || app.client_secret.length > 1024 ||
      app.permissions?.contents !== "write" || app.permissions?.metadata !== "read" ||
      Object.keys(app.permissions).some(key => !["contents", "metadata"].includes(key))) {
    throw new Error("The registered app owner, permissions, or identifiers did not match the intended manager app.");
  }
  return { id: app.id, client_id: app.client_id, slug: app.slug, html_url: app.html_url, owner: OWNER };
}

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    // Wrangler's output is intentionally not forwarded during secret upload.
    child.stdout.resume(); child.stderr.resume();
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("error", () => reject(new Error("Could not start the manager setup command.")));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Manager setup command failed (exit ${code}). No secret values were printed.`)));
  });
}

async function main() {
  const destination = managerDestination(process.argv[2]);
  if (!destination) throw new Error("Usage: node scripts/register-manager-app.mjs https://YOUR-MANAGER.workers.dev");
  const origin = new URL(destination).origin;
  const config = JSON.parse(await readFile("manager/wrangler.jsonc", "utf8"));
  if (config.vars.GITHUB_CLIENT_ID) throw new Error("This manager already has an app. Use its existing GitHub settings instead of creating another.");
  const state = randomBytes(32).toString("hex"), browser = randomBytes(32).toString("hex");
  const port = 8736, host = `127.0.0.1:${port}`, base = setupOrigin(process.argv[3]);
  const secureCookie = base.startsWith("https:") ? "; Secure" : "";
  const manifest = registrationManifest(origin, base + "/callback");
  let consumed = false;
  const server = createServer(async (request, response) => {
    const send = (status, body, extra = {}) => {
      response.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; frame-ancestors 'none'; base-uri 'none'",
        ...extra,
      });
      response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Marcolin manager setup</title><body style="font:18px system-ui;max-width:640px;margin:60px auto;padding:20px">${body}</body></html>`);
    };
    if (request.headers.host !== host || request.method !== "GET") return send(403, "Request not allowed.");
    const url = new URL(request.url, base);
    if (!consumed && url.pathname === `/start/${state}`) {
      return send(200, `<h1>Connect the location manager</h1><p>Continue while signed in to GitHub as <strong>${OWNER}</strong>.</p><p>This creates a private app with repository Contents read/write and Metadata read. On the next installation screen, choose <strong>Only select repositories</strong> and <strong>marcolin</strong>.</p><form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button style="font:inherit;padding:12px">Create the private GitHub App</button></form><p>The generated secret goes directly to Cloudflare. You do not need to copy it.</p>`, { "Set-Cookie": `marcolin_setup=${browser}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SETUP_SECONDS}${secureCookie}` });
    }
    const cookie = request.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("marcolin_setup="))?.slice("marcolin_setup=".length);
    if (consumed || url.pathname !== "/callback" || !equal(url.searchParams.get("state"), state) || !equal(cookie, browser) || !/^[A-Za-z0-9_-]{16,256}$/.test(url.searchParams.get("code") || "")) return send(403, "Setup verification failed or expired. Return to the original setup link.");
    consumed = true;
    try {
      const exchange = await fetch(`https://api.github.com/app-manifests/${url.searchParams.get("code")}/conversions`, { method: "POST", headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Marcolin-manager-setup" }, signal: AbortSignal.timeout(20000) });
      if (!exchange.ok) throw new Error("GitHub could not complete the app registration.");
      const app = await exchange.json();
      const publicApp = validateRegistration(app);
      console.log("GitHub app owner and minimal permissions verified. Configuring Worker secrets.");
      await run(["node_modules/wrangler/bin/wrangler.js", "secret", "bulk", "--config", "manager/wrangler.jsonc"], JSON.stringify({ GITHUB_CLIENT_SECRET: app.client_secret, SESSION_SECRET: randomBytes(32).toString("hex") }));
      delete app.client_secret; delete app.pem; delete app.webhook_secret;
      await run(["scripts/configure-manager.mjs", origin, publicApp.client_id]);
      const deployedConfig = JSON.parse(await readFile("manager/wrangler.jsonc", "utf8"));
      deployedConfig.secrets = { required: ["GITHUB_CLIENT_SECRET", "SESSION_SECRET"] };
      await writeFile("manager/wrangler.jsonc", JSON.stringify(deployedConfig, null, 2) + "\n");
      await writeFile("manager/github-app.json", JSON.stringify(publicApp, null, 2) + "\n");
      await run(["scripts/build-manager.mjs"]);
      await run(["node_modules/wrangler/bin/wrangler.js", "deploy", "--config", "manager/wrangler.jsonc"]);
      console.log(JSON.stringify({ event: "manager_app_configured", ...publicApp, manager: origin }));
      send(200, `<h1>App connected securely</h1><p>Finish by installing it on <strong>only joshuaxbrull/marcolin</strong>. GitHub will then take you to the manager sign-in.</p><p><a href="${escape(publicApp.html_url)}/installations/new">Install the manager app</a></p>`, { "Set-Cookie": `marcolin_setup=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}` });
    } catch {
      console.error("Manager app registration could not be completed. No credentials were printed; inspect GitHub app settings before retrying.");
      send(500, "Setup could not finish. Return to Codex for help; do not paste any secrets into chat.");
      process.exitCode = 1;
    } finally { server.close(); }
  });
  const timeout = setTimeout(() => { console.error("Manager registration link expired."); server.close(); }, SETUP_SECONDS * 1000);
  server.on("close", () => clearTimeout(timeout));
  server.on("error", () => { clearTimeout(timeout); console.error("Could not start the local registration helper."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Open ${base}/start/${state}`));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(() => { console.error("Manager registration could not start. Check the deployed origin and existing app configuration."); process.exitCode = 1; });
