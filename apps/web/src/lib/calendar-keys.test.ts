// apps/web/src/lib/calendar-keys.test.ts - The month's keyboard: one tab stop, and arrows between days.

import { describe, expect, it } from "vitest";
import { moveDay, tabDay } from "./calendar-keys.ts";


// November 2026 starts on a Sunday: six blanks, then 30 days, so the 1st is the last column of the first row
const LEAD = 6, COUNT = 30;
const days = Array.from({ length: COUNT }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);

describe("moveDay", () => {
  it("steps a day with left and right, and a week with up and down", () => {
    expect(moveDay("ArrowRight", 4, COUNT, LEAD)).toBe(5);
    expect(moveDay("ArrowLeft", 4, COUNT, LEAD)).toBe(3);
    expect(moveDay("ArrowDown", 4, COUNT, LEAD)).toBe(11);
    expect(moveDay("ArrowUp", 11, COUNT, LEAD)).toBe(4);
  });
  it("stays on the edge day rather than leaving the month", () => {
    expect(moveDay("ArrowLeft", 0, COUNT, LEAD)).toBe(0);
    expect(moveDay("ArrowRight", 29, COUNT, LEAD)).toBe(29);
    expect(moveDay("ArrowUp", 3, COUNT, LEAD)).toBe(3);
    expect(moveDay("ArrowDown", 25, COUNT, LEAD)).toBe(25);
  });
  it("finds the ends of the week with Home and End, Monday first", () => {
    // The 4th (index 3) is a Wednesday here: Monday is the 2nd, Sunday the 8th
    expect(moveDay("Home", 3, COUNT, LEAD)).toBe(1);
    expect(moveDay("End", 3, COUNT, LEAD)).toBe(7);
    // The 1st is a Sunday alone in its row: both ends are itself
    expect(moveDay("Home", 0, COUNT, LEAD)).toBe(0);
    expect(moveDay("End", 0, COUNT, LEAD)).toBe(0);
    // The 23rd is a Monday: its week ends on the 29th; the 30th starts a last row of one
    expect(moveDay("End", 22, COUNT, LEAD)).toBe(28);
    expect(moveDay("End", 29, COUNT, LEAD)).toBe(29);
  });
  it("leaves other keys alone", () => {
    expect(moveDay("Tab", 4, COUNT, LEAD)).toBeUndefined();
    expect(moveDay("Enter", 4, COUNT, LEAD)).toBeUndefined();
  });
});

describe("tabDay", () => {
  it("is exactly one day, preferring the last focused, then the picked day, then today, then the 1st", () => {
    expect(tabDay("2026-11", days, "2026-11-12", "2026-11-05", "2026-11-20")).toBe("2026-11-12");
    expect(tabDay("2026-11", days, undefined, "2026-11-05", "2026-11-20")).toBe("2026-11-05");
    expect(tabDay("2026-11", days, undefined, undefined, "2026-11-20")).toBe("2026-11-20");
    expect(tabDay("2026-11", days)).toBe("2026-11-01");
  });
  it("ignores a day from another month, such as after stepping to the next one", () => {
    expect(tabDay("2026-12", days.map((d) => d.replace("-11-", "-12-")), "2026-11-12", "2026-11-05", "2026-11-20")).toBe("2026-12-01");
  });
});
