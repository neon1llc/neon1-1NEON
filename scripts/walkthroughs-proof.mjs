// scripts/walkthroughs-proof.mjs - Says whether this commit's walkthroughs already passed in CI on identical inputs.
// Prints key=value lines for $GITHUB_OUTPUT: fingerprint, site, skip (true or false).
//
// The walkthroughs play the built web app (apps/web, packages) against the site's shared styles, which they fetch
// from the live neon1.tech. So the fingerprint is the hash of every tracked file those depend on (the web app, the
// packages, the scripts, the lockfile and root config, the workflows) with the root package.json's "version" taken
// out, plus the version of the site that is live now. A release commit that only moves the changelog, the API, the
// docs, the infra or the release number keeps the fingerprint of the dev commit it came from. Any other difference
// gives another fingerprint, and the whole suite runs.
//
// A run counts as proof only if it uploaded a walkthrough-proof artifact: the artifact is written after the
// walkthroughs passed (or after they were skipped on this same proof), on the dev or main branch. Any error, here or
// in the gh calls, means skip=false: the suite runs.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INPUTS = ["apps/web", "packages", "scripts", "package-lock.json", "tsconfig.base.json", ".nvmrc", ".github"];
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts });

export function fingerprint(rev) {
  const files = run("git", ["ls-tree", "-r", rev, "--", ...INPUTS]);
  const pkg = JSON.parse(run("git", ["show", `${rev}:package.json`]));
  delete pkg.version;
  return createHash("sha256").update(files).update(JSON.stringify(pkg)).digest("hex");
}

async function liveSite() {
  const res = await fetch(`${process.env.NEON1_SITE ?? "https://neon1.tech"}/version.json`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`site version: ${res.status}`);
  return String((await res.json()).version);
}

function proofs() {
  const found = [];
  const sources = [["ci.yml", "dev"], ["ci.yml", "main"], ["deploy.yml", "main"]];
  for (const [workflow, branch] of sources) {
    const list = JSON.parse(run("gh", ["run", "list", "--workflow", workflow, "--branch", branch, "--status", "success", "--limit", "12", "--json", "databaseId,headSha"]));
    for (const r of list) found.push(r);
  }
  return found;
}

async function main() {
  let fp = "", site = "", skip = false;
  try {
    fp = fingerprint("HEAD");
    site = await liveSite();
    for (const r of proofs()) {
      const dir = mkdtempSync(join(tmpdir(), "proof-"));
      try { run("gh", ["run", "download", String(r.databaseId), "-n", "walkthrough-proof", "-D", dir]); } catch { continue; }
      const file = readdirSync(dir).find((f) => f.endsWith(".json"));
      if (!file) continue;
      const proof = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (proof.fingerprint === fp && proof.site === site) { skip = true; console.error(`proof: run ${r.databaseId} (${r.headSha.slice(0, 7)}) passed on these inputs and site v${site}`); break; }
    }
    if (!skip) console.error("proof: no earlier passing run has these inputs and this live site; the walkthroughs run");
  } catch (e) {
    skip = false;
    console.error(`proof: ${String(e.message ?? e).split("\n")[0]}; the walkthroughs run`);
  }
  console.log(`fingerprint=${fp}\nsite=${site}\nskip=${skip}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  if (process.argv[2] === "fingerprint") console.log(fingerprint(process.argv[3] ?? "HEAD"));
  else await main();
}
