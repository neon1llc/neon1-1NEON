// packages/domain/src/timezone.test.ts - The email time format across daylight saving, leap days,
// zones without it, and bad input.
import { describe, expect, it } from "vitest";
import { formatWhen, isTimeZone } from "./timing.ts";

const at = (iso: string) => new Date(iso);

describe("formatWhen", () => {
  it("shows winter and summer abbreviations for the same zone", () => {
    expect(formatWhen(at("2026-11-15T13:25:00Z"), "America/New_York")).toBe("Nov 15, 2026, 8:25 AM EST (13:25 UTC)");
    expect(formatWhen(at("2026-07-15T12:25:00Z"), "America/New_York")).toBe("Jul 15, 2026, 8:25 AM EDT (12:25 UTC)");
  });

  it("flips at the March spring-forward instant (2026-03-08 07:00 UTC)", () => {
    expect(formatWhen(at("2026-03-08T06:59:00Z"), "America/New_York")).toBe("Mar 8, 2026, 1:59 AM EST (06:59 UTC)");
    expect(formatWhen(at("2026-03-08T07:00:00Z"), "America/New_York")).toBe("Mar 8, 2026, 3:00 AM EDT (07:00 UTC)");
  });

  it("flips at the November fall-back instant (2026-11-01 06:00 UTC), and the repeated hour reads both ways", () => {
    expect(formatWhen(at("2026-11-01T05:30:00Z"), "America/New_York")).toBe("Nov 1, 2026, 1:30 AM EDT (05:30 UTC)");
    expect(formatWhen(at("2026-11-01T06:30:00Z"), "America/New_York")).toBe("Nov 1, 2026, 1:30 AM EST (06:30 UTC)");
  });

  it("handles Feb 29 in a leap year, and a year that isn't", () => {
    expect(formatWhen(at("2028-02-29T17:00:00Z"), "America/Chicago")).toBe("Feb 29, 2028, 11:00 AM CST (17:00 UTC)");
    expect(formatWhen(at("2028-03-01T04:00:00Z"), "America/Los_Angeles")).toBe("Feb 29, 2028, 8:00 PM PST (04:00 UTC, Mar 1)");
    // 1900 and 2100 are not leap years, so Feb 28 is followed by Mar 1
    expect(formatWhen(at("2100-03-01T00:30:00Z"), "America/New_York")).toBe("Feb 28, 2100, 7:30 PM EST (00:30 UTC, Mar 1)");
  });

  it("uses the UTC date in the parenthesis only when it differs", () => {
    expect(formatWhen(at("2026-11-16T03:10:00Z"), "America/Los_Angeles")).toBe("Nov 15, 2026, 7:10 PM PST (03:10 UTC, Nov 16)");
    expect(formatWhen(at("2026-11-16T15:10:00Z"), "Asia/Kolkata")).toBe("Nov 16, 2026, 8:40 PM GMT+5:30 (15:10 UTC)");
  });

  it("follows zones with other rules: Europe's dates, half-hour offsets, no daylight saving", () => {
    expect(formatWhen(at("2026-03-29T00:59:00Z"), "Europe/Berlin")).toBe("Mar 29, 2026, 1:59 AM GMT+1 (00:59 UTC)");
    expect(formatWhen(at("2026-03-29T01:00:00Z"), "Europe/Berlin")).toBe("Mar 29, 2026, 3:00 AM GMT+2 (01:00 UTC)");
    expect(formatWhen(at("2026-07-01T00:00:00Z"), "America/Phoenix")).toBe("Jun 30, 2026, 5:00 PM MST (00:00 UTC, Jul 1)");
  });

  it("is plain when the zone is UTC, and never repeats itself", () => {
    expect(formatWhen(at("2026-11-15T13:25:00Z"), "UTC")).toBe("Nov 15, 2026, 1:25 PM UTC");
  });

  it("falls back to neon1's own zone for nothing, junk, or an empty string", () => {
    const want = "Nov 15, 2026, 8:25 AM EST (13:25 UTC)";
    for (const z of [undefined, "", "Mars/Olympus", "EST5EDT; DROP", "x".repeat(80)]) expect(formatWhen(at("2026-11-15T13:25:00Z"), z)).toBe(want);
  });

  it("uses a plain space before AM and PM", () => {
    expect(formatWhen(at("2026-11-15T13:25:00Z"), "America/New_York")).not.toMatch(/[  ]/);
  });
});

describe("isTimeZone", () => {
  it("accepts real zones and rejects the rest", () => {
    for (const z of ["America/New_York", "Europe/Berlin", "Asia/Kolkata", "UTC"]) expect(isTimeZone(z)).toBe(true);
    for (const z of ["", "Nope/Nowhere", 5, null, undefined, "a".repeat(65)]) expect(isTimeZone(z)).toBe(false);
  });
});
