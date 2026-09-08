import { readFile, writeFile } from "node:fs/promises";
import { managerDestination } from "../portal/destination.js";
const [origin, clientId] = process.argv.slice(2);
const destination = managerDestination(origin);
if (!destination || !/^[A-Za-z0-9._-]+$/.test(clientId || "")) {
  console.error("Usage: node scripts/configure-manager.mjs https://YOUR-MANAGER.workers.dev GITHUB_APP_CLIENT_ID");
  process.exit(1);
}
const config = JSON.parse(await readFile("manager/wrangler.jsonc", "utf8"));
config.vars = { ...config.vars, PORTAL_ORIGIN: new URL(destination).origin, GITHUB_CLIENT_ID: clientId };
const manifest = JSON.parse(await readFile("manager/github-app-manifest.json", "utf8"));
manifest.url = destination;
manifest.callback_urls = [config.vars.PORTAL_ORIGIN + "/auth/callback"];
await writeFile("manager/wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
await writeFile("manager/github-app-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
await writeFile("portal/config.json", JSON.stringify({ managerOrigin: config.vars.PORTAL_ORIGIN }, null, 2) + "\n");
console.log("Updated the Worker, GitHub App callback, and old portal redirect. Set secrets using Wrangler before deploying.");
