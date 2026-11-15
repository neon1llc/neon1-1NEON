// scripts/legal.mjs - Refresh the portal's legal pages from neon1-corpus, the one Markdown source for
// neon1's policies. The privacy and data policy, the cookie and storage notice, and the terms are
// copied at one pinned ref, front matter removed, into apps/web/src/legal. Run it after a policy
// changes in the corpus, then commit the result:
//
//   node scripts/legal.mjs v0.42.0          # a tag, a branch, or a commit of neon1-corpus
//
// All or nothing: nothing is written unless every document is found.


import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";


// --- Inputs ---


const ref = process.argv[2];
if (!ref) {
  console.error("Name a neon1-corpus ref: node scripts/legal.mjs v0.42.0");
  process.exit(1);
}
const REPO = "https://github.com/neon1llc/neon1-corpus";
const out = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/src/legal");

// Corpus file -> the portal's file for it
const DOCS = {
  "corpus/policies/privacy.md": "privacy-policy.md",
  "corpus/policies/cookies.md": "cookie-notice.md",
  "corpus/policies/terms.md": "terms-of-use.md",
};


// --- Fetch: a shallow copy of the corpus at that ref ---


const dir = mkdtempSync(join(tmpdir(), "corpus-"));
try {
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q");
  git("remote", "add", "origin", REPO);
  git("fetch", "-q", "--depth", "1", "origin", ref);
  git("checkout", "-q", "FETCH_HEAD");
  const commit = git("rev-parse", "--short", "HEAD");

  // --- Convert: drop the front matter, keep the text exactly ---
  const pages = Object.entries(DOCS).map(([from, to]) => {
    const text = readFileSync(join(dir, from), "utf8");
    const body = text.replace(/^---\n[\s\S]*?\n---\n+/, "");
    if (body === text || !body.startsWith("# ")) throw new Error(`${from} has no front matter or no title`);
    return [to, body];
  });

  // --- Write, only once every page converted ---
  for (const [to, body] of pages) writeFileSync(join(out, to), body);
  console.log(`legal pages from neon1-corpus ${ref} (${commit}): ${pages.map(([to]) => to).join(", ")}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
