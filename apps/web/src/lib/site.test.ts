// apps/web/src/lib/site.test.ts - 1NEON never links to the production site by its full address: a link to the site is a
// path, so dev stays on dev (a hardcoded https://neon1.tech sent dev's report-a-bug link to production, where it 404ed).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ownSite } from "./site.ts";

const SRC = join(import.meta.dirname, "..");
// Where the production address is right: canonical links and Open Graph for search engines, the copied policies, and
// the walkthrough's and demo's made-up mail, which show the real address on purpose
const ALLOWED = [/^lib\/head\.ts$/, /^lib\/head\.test\.ts$/, /^legal\//, /^live\//, /^demo\//, /\.test\.tsx?$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}

describe("links to the site", () => {
  it("rewrites the production address to a path and leaves others alone", () => {
    expect(ownSite("https://neon1.tech/knowledge/policy/")).toBe("/knowledge/policy/");
    expect(ownSite("https://neon1.tech")).toBe("/");
    expect(ownSite("https://neon1.tech/1NEON/live?play=free#x")).toBe("/1NEON/live?play=free#x");
    expect(ownSite("https://example.com/a")).toBe("https://example.com/a");
    expect(ownSite("https://neon1.tech.evil.example/a")).toBe("https://neon1.tech.evil.example/a");
    expect(ownSite("/report-bug/")).toBe("/report-bug/");
  });

  it("has no hardcoded production site address in the app's code", () => {
    const bad: string[] = [];
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).replaceAll("\\", "/");
      if (ALLOWED.some((a) => a.test(rel))) continue;
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        // Comments may name the site
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
        if (/https?:\/\/(www\.)?neon1\.tech/.test(line)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(bad, "link to the site by path (see lib/site.ts)").toEqual([]);
  });
});
