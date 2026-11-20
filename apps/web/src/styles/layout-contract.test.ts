// apps/web/src/styles/layout-contract.test.ts - Layout promises that live in the stylesheet: the desktop type scale, and the free
// account's Home grid, which no other check would notice breaking.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "app.css"), "utf8");
const sentinel = readFileSync(join(__dirname, "sentinel.css"), "utf8");

describe("desktop type scale", () => {
  it("is 1.1 on desktop, so 100% zoom reads like the 110% it was designed at, and 1 on a phone", () => {
    expect(css).toMatch(/:root \{ --type: 1; \}\s*@media \(min-width: 901px\) \{ :root \{ --type: 1\.1; \} \}/);
  });
  it("grows the pixel-fixed controls and widths with it", () => {
    for (const rule of [/\.btn \{[^}]*min-height: calc\(36px \* var\(--type\)\)/, /\.content \{[^}]*max-width: calc\(1280px \* var\(--type\)\)/, /\.example-body \{ max-width: calc\(920px \* var\(--type\)\)/, /input, textarea, select \{[^}]*min-height: calc\(40px \* var\(--type\)\)/]) expect(css).toMatch(rule);
  });
});

describe("a free account's Home", () => {
  it("puts its top cards in one grid with a single 16px gap, two columns on desktop and one on a phone", () => {
    expect(css).toMatch(/:has\(> \.keep-card\) \{ display: grid; grid-template-columns: minmax\(0, 1fr\); gap: 16px;/);
    expect(css).toMatch(/@media \(min-width: 901px\) \{\s*:has\(> \.keep-card\) \{ grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\);/);
  });
  it("leaves no other margin between the cards for the grid to add to", () => {
    expect(css).toMatch(/:has\(> \.keep-card\) > \* \{ grid-column: 1 \/ -1; margin-top: 0; margin-bottom: 0; \}/);
    expect(css).toMatch(/:not\(:has\(> \.keep-card\)\) > :is\(\.prospect-note, \.keep-card, \.next-step-ask\) \+ \.card \{ margin-top: 16px; \}/);
  });
});

describe("Sentinel stays plain on the sample project", () => {
  it("drops the Matrix prompt mark from its title", () => {
    expect(sentinel).toMatch(/\[data-style="sentinel"\] \.example \.page-title::before \{ content: none; \}/);
  });
});
