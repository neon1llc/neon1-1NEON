#!/usr/bin/env node
// Check built JavaScript chunks against their recorded sizes with a small growth allowance.

import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";


const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const OUT = join(ROOT, "apps/web/dist/1NEON/assets");
const config = JSON.parse(await readFile(join(SCRIPT_DIR, "web-build-budget.json"), "utf8"));
const names = (await readdir(OUT)).filter((name) => name.endsWith(".js") && !name.endsWith(".js.map"));
const groups = new Map();

for (const name of names) {
  const key = basename(name).split("-")[0];
  const bytes = await readFile(join(OUT, name));
  const total = groups.get(key) ?? { bytes: 0, gzip: 0 };
  total.bytes += bytes.byteLength;
  total.gzip += gzipSync(bytes, { level: 9 }).byteLength;
  groups.set(key, total);
}

const expected = new Set(Object.keys(config.baselineBytes));
const errors = [];
const allowance = 1 + config.allowancePercent / 100;
console.log(`Web JavaScript chunk budget (${config.allowancePercent}% over the recorded ${names.length}-chunk build)`);
console.log("chunk group             raw bytes  gzip bytes  cap");

for (const [key, current] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  const baseline = config.baselineBytes[key];
  if (baseline === undefined) {
    errors.push(`new chunk group ${key}: ${current.bytes} bytes; add a reviewed baseline`);
    console.log(`${key.padEnd(24)} ${String(current.bytes).padStart(10)} ${String(current.gzip).padStart(11)}  NEW`);
    continue;
  }
  expected.delete(key);
  const cap = Math.ceil(baseline * allowance);
  console.log(`${key.padEnd(24)} ${String(current.bytes).padStart(10)} ${String(current.gzip).padStart(11)}  ${cap}`);
  if (current.bytes > cap) errors.push(`${key}: ${current.bytes} bytes exceeds ${cap} (${config.allowancePercent}% over ${baseline})`);
}

for (const key of expected) errors.push(`missing chunk group ${key}; review the changed chunk inventory and baseline`);

const total = [...groups.values()].reduce((sum, group) => sum + group.bytes, 0);
const totalBaseline = Object.values(config.baselineBytes).reduce((sum, bytes) => sum + bytes, 0);
const totalCap = Math.ceil(totalBaseline * allowance);
console.log(`TOTAL                    ${String(total).padStart(10)}             ${totalCap}`);
if (total > totalCap) errors.push(`total: ${total} bytes exceeds ${totalCap} (${config.allowancePercent}% over ${totalBaseline})`);

if (errors.length) {
  console.error("\nWeb build budget exceeded:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("All chunk groups are within budget.");
}
