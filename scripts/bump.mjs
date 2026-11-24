// scripts/bump.mjs - Writes a release number where CI reads it, so a release is one commit.
// Usage: npm run bump -- 0.28.0
// Write the "## v0.28.0 - date" entry at the top of CHANGELOG.md first (the one part written by hand); this sets
// package.json to match, the pair ci-app's "Check the release number" compares.

import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) { console.error("usage: npm run bump -- X.Y.Z"); process.exit(1); }

const top = readFileSync("CHANGELOG.md", "utf8").match(/^## v([0-9][0-9.]*[0-9a-z.-]*)/m)?.[1];
if (top !== version) { console.error(`bump: write the "## v${version}" entry at the top of CHANGELOG.md first (it says v${top})`); process.exit(1); }

const pkg = readFileSync("package.json", "utf8");
const next = pkg.replace(/^(  "version": ")[^"]*(",)$/m, `$1${version}$2`);
if (next === pkg && !pkg.includes(`"version": "${version}"`)) { console.error("bump: package.json has no top-level version line"); process.exit(1); }
writeFileSync("package.json", next);
console.log(`bump: package.json and CHANGELOG.md both say v${version}`);
