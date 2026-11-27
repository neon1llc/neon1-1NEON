// apps/web/src/lib/homeCounts.test.ts - The View button counts only hidden, non-repeating cards.

import { describe, expect, it } from "vitest";
import { hiddenHeld } from "./homeCounts.ts";

const c = (urgent = 0, suggested = 0, general = 0) => ({ urgent, suggested, general });

describe("hiddenHeld", () => {
  // Shown cards carry their own badges, so the button says nothing about them
  it("ignores shown cards", () => {
    expect(hiddenHeld([{ shown: true, counts: c(4, 2) }])).toBeUndefined();
  });
  // A hidden card that repeats Needs you or the calendar would count the same item twice
  it("ignores hidden mirror cards", () => {
    expect(hiddenHeld([{ shown: false, mirror: true, counts: c(6) }])).toBeUndefined();
  });
  it("leads with urgent, then suggested", () => {
    expect(hiddenHeld([{ shown: false, counts: c(1, 3) }, { shown: false, counts: c(2) }])).toEqual({ kind: "urgent", n: 3 });
    expect(hiddenHeld([{ shown: false, counts: c(0, 2, 5) }])).toEqual({ kind: "suggested", n: 2 });
  });
  // General items ("to know") never raise the button
  it("stays quiet for general items", () => {
    expect(hiddenHeld([{ shown: false, counts: c(0, 0, 9) }])).toBeUndefined();
  });
});
