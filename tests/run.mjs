import { readdir } from "node:fs/promises";
// Run in one process so test execution does not depend on subprocess filesystem snapshots.
for (const file of (await readdir(new URL(".", import.meta.url))).filter(file => file.endsWith(".test.js")).sort()) await import(new URL(file, import.meta.url));
