// apps/web/src/styles/layout-contract.test.ts - Layout promises that live in the stylesheet: the desktop type scale, and the free
// account's Home grid, which no other check would notice breaking.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "app.css"), "utf8");
const sentinel = readFileSync(join(__dirname, "sentinel.css"), "utf8");

describe("type and spacing scales", () => {
  // The base scale belongs to neon1.tech's shared/neon1.css; this stylesheet may only use its steps and add portal-level ones
  const STEPS = new Set(["xs", "sm", "ui", "md", "base", "lg", "xl", "2xl", "3xl", "title", "input"]);
  it("defines no base step of its own and uses only steps that exist", () => {
    expect(css).not.toMatch(/--type\b/);
    expect(css).not.toMatch(/--fs-(xs|sm|ui|md|base|lg|xl|2xl|3xl):/);
    expect(css).not.toMatch(/--sp-\d:/);
    const used = new Set([...css.matchAll(/var\(--fs-([\w]+)\)/g)].map((m) => m[1]));
    expect([...used].filter((u) => !STEPS.has(u!))).toEqual([]);
    const spaces = new Set([...css.matchAll(/var\(--sp-(\d)\)/g)].map((m) => Number(m[1])));
    expect([...spaces].filter((n) => n > 7)).toEqual([]);
  });
  it("sizes text only by naming a step (a size written as a number is the rare, commented exception)", () => {
    const loose = [...css.matchAll(/(?<![\w-])font(?:-size)?:([^;{}]*)/g)].map((m) => m[0]).filter((d) => /\d(px|rem)\b/.test(d) && !/var\(--fs-/.test(d) && !/clamp\(|1em\/0/.test(d));
    expect(loose).toEqual([]);
  });
  it("keeps card and section titles at the compact-body step, above the helper text step", () => {
    expect(css).toMatch(/\.card-h \{[^}]*font-size: var\(--fs-md\)/);
    expect(css).toMatch(/\.section-h \{[^}]*font-size: var\(--fs-md\)/);
    expect(css).toMatch(/\.field-label \{[^}]*font: var\(--fs-sm\)/);
  });
});

describe("page content", () => {
  it("is centered, with the gutter either side on top of its 1280px, so a wide screen leaves equal space and 1440 has 28px each", () => {
    expect(css).toMatch(/\.content \{[^}]*max-width: calc\(1280px \+ 2 \* var\(--gut\)\); width: 100%; margin-inline: auto;/);
  });
});

describe("a free account's Home", () => {
  it("lays its cards out in the two Home columns, not in a grid of its own keyed to the expiry card", () => {
    // A rule on whatever contains `.keep-card` once squeezed that card into a fifth of its column
    expect(css).not.toMatch(/:has\(> \.keep-card\)/);
    expect(css).toMatch(/\.home \{ display: grid; grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\);/);
    expect(css).toMatch(/\.home-side \{ display: grid; gap: var\(--sp-4\); \}/);
  });
  it("leaves no other margin between the cards for the column's own 16px gap to add to", () => {
    expect(css).not.toMatch(/\.next-step-ask\) \+ \.card/);
    expect(css).toMatch(/\.home-main \{ display: grid; gap: var\(--sp-4\);/);
  });
});

describe("focus and touch", () => {
  it("shows no ring on the heading a page puts focus on when it arrives", () => {
    expect(css).toMatch(/h1\[tabindex="-1"\]:focus-visible, \.page-title:focus-visible \{ outline: none; \}/);
  });
  it("gives a touch screen 44px targets in the top bar and the menu", () => {
    const block = /@media \(pointer: coarse\) \{\s*\.icon-btn, \.cal-nav \.icon-btn \{ width: 44px; height: 44px; flex: none; \}[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(block).toMatch(/\.search-btn \{ min-height: 44px; min-width: 44px; flex: none; \}/);
    expect(block).toMatch(/--row: 44px;/);
    // The picker stays one icon box tall; the row around it is its 44px hit area
    expect(block).not.toMatch(/\.org-full \.org[^{]*\{ height: 44px; \}/);
    expect(block).toMatch(/\.org-full \.org::after \{ content: ""; position: absolute; inset: -8px 0; \}/);
    expect(block).toMatch(/\.menu-theme-switch::after \{ content: ""; position: absolute; inset: -9px 0; \}/);
  });
});

describe("the menu's two marks", () => {
  it("paint one size of ink, with the rings drawn 64/60 larger than the ink they paint", () => {
    expect(css).toMatch(/:root \{ --mark-ink: 30px; \}/);
    expect(css).toMatch(/\.side \.ico\.mark, \.top-brand \.mark-box, \.side \.ico\.site-mark \{ width: var\(--mark-ink\); height: var\(--mark-ink\); \}/);
    expect(css).toMatch(/\.side \.ico\.mark svg, \.top-brand svg \{ width: calc\(var\(--mark-ink\) \* 64 \/ 60\); height: calc\(var\(--mark-ink\) \* 64 \/ 60\); margin: calc\(\(var\(--mark-ink\) - var\(--mark-ink\) \* 64 \/ 60\) \/ 2\); \}/);
  });
});

describe("Sentinel stays plain on the sample project", () => {
  it("drops the Matrix prompt mark from its title", () => {
    expect(sentinel).toMatch(/\[data-style="sentinel"\] \.example \.page-title::before \{ content: none; \}/);
  });
});


describe("touch targets", () => {
  // The design standard asks 44 by 44 for primary controls on a touch screen
  it("grows buttons and fields to 44px under a coarse pointer", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\n  \.btn, \.btn\.btn-sm \{ min-height: 44px; \}/);
    expect(css).toMatch(/\.chip::after \{ content: ""; position: absolute; inset: -9px 0; \}/);
  });
});
