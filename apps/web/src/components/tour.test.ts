// apps/web/src/components/tour.test.ts - Every spotlight step in Help.tsx points at a data-tour name
// that some page or component puts on an element, so a renamed or removed target can't leave a step
// that silently never shows.


import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";


const SRC = new URL("..", import.meta.url).pathname;

/** Every source file under a folder, tests left out */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}


describe("tour targets", () => {
  // Help.tsx is read as text: importing it needs a browser
  const help = readFileSync(join(SRC, "components/Help.tsx"), "utf8");
  const code = sources(SRC).filter((f) => !f.endsWith("Help.tsx")).map((f) => readFileSync(f, "utf8")).join("\n");
  const names = [...new Set([...help.matchAll(/\bat: "([\w-]+)"/g)].map((m) => m[1]!))];

  it("has steps to check", () => {
    expect(names.length).toBeGreaterThan(10);
  });

  // Hooks the onboarding work adds in Prospect.tsx and Readiness.tsx; delete this list once they land
  const PENDING = new Set(["next-step-ask", "get-to-know", "readiness"]);

  it("finds every step's element in the source", () => {
    const missing = names.filter((at) => !PENDING.has(at)).filter((at) => !new RegExp(`(data-)?tour="${at}"`).test(code));
    expect(missing).toEqual([]);
  });
});
