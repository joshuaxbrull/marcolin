import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "secret", "put", "SESSION_SECRET", "--config", "manager/wrangler.jsonc"], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(randomBytes(32).toString("hex") + "\n");
child.on("exit", code => { process.exitCode = code || 0; });
child.on("error", () => { console.error("Could not start Wrangler."); process.exitCode = 1; });
