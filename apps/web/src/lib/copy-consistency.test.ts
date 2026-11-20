// apps/web/src/lib/copy-consistency.test.ts - The first call is one fact. neon1's booking link is a free 30-minute event
// (corpus v0.50.2: engagement/contact.md, guides/first-call.md), so no screen, walkthrough, help text, or email may say another length.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = [join(__dirname, ".."), join(__dirname, "../../../api/src")];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.(tsx?|md|json)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}
const sources = roots.flatMap(files).map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("the first call is 30 minutes everywhere", () => {
  it("reads the sources it checks", () => expect(sources.length).toBeGreaterThan(50));
  it("never says the intro call is 15, 20, or 45 minutes", () => {
    const wrong = /\b(?:15|20|45|fifteen|twenty|forty-five)[- ]minute (?:free |intro(?:duction)? |first |discovery )?(?:call|consultation|chat)\b|\bcalls? for (?:fifteen|twenty|forty-five) minutes\b/i;
    expect(sources.filter((s) => wrong.test(s.text)).map((s) => s.path)).toEqual([]);
  });
  it("names 30 minutes wherever the free account offers the booking link", () => {
    for (const name of ["components/Prospect.tsx", "pages/Contact.tsx", "components/Shell.tsx"]) {
      const text = readFileSync(join(__dirname, "..", name), "utf8");
      expect(text, name).toMatch(/30-minute call/);
    }
  });
});
