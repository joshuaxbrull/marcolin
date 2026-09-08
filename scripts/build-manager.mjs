import { mkdir, cp, copyFile, readFile, writeFile } from "node:fs/promises";
await mkdir("manager/dist/shared", { recursive: true });
await mkdir("manager/dist/vendor", { recursive: true });
await cp("manager/public", "manager/dist", { recursive: true });
await copyFile("shared/locations.js", "manager/dist/shared/locations.js");
await cp("node_modules/leaflet/dist", "manager/dist/vendor/leaflet", { recursive: true });
console.log("Manager assets built; credentials remain in Worker secrets.");

await writeFile("manager/dist/draft.js", (await readFile("manager/public/draft.js", "utf8")).replace("../../shared/locations.js", "./shared/locations.js"));
