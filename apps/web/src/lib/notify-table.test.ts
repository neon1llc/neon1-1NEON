// apps/web/src/lib/notify-table.test.ts - The profile's notification switches stay on a phone's screen.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "app.css"), "utf8");

describe("the notification table", () => {
  it("has no minimum width, which pushed the switches off a phone's screen", () => {
    expect(css).not.toMatch(/\.notify-table\s*\{[^}]*min-width/);
  });
});
