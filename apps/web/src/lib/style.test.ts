// apps/web/src/lib/style.test.ts - Browser and account preference compatibility across both theme families.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOOK_EVENT, normalizeLook, readLook, resolveTheme, saveLook, setStyleChoice } from "./style.ts";

// Fresh browser storage for each scenario; the device is deliberately dark
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});

describe("theme and mode", () => {
  it("does not inherit the device's dark mode when changing family", () => {
    expect(readLook()).toBe("providence");
    setStyleChoice("sentinel");
    expect(readLook()).toBe("providence");
  });
  it("keeps each mode across a family round trip", () => {
    for (const look of ["awake", "plugged"] as const) {
      saveLook(look);
      setStyleChoice("sentinel");
      expect(readLook()).toBe(look === "awake" ? "providence" : "desert-of-the-real");
      setStyleChoice("matrix");
      expect(readLook()).toBe(look);
    }
  });
  it("migrates legacy family and mode without changing their appearance", () => {
    values.set("neon1.style", "business"); values.set("neon1.theme.business", "lamp");
    expect(readLook()).toBe("desert-of-the-real");
    expect(values.get("neon1.mode")).toBe("dark");
    expect(normalizeLook("matrix")).toBe("plugged");
    expect(normalizeLook("alert")).toBe("providence");
  });
  it("retains account mode when the landing overrides its family", () => {
    setStyleChoice("sentinel");
    expect(resolveTheme("matrix")).toBe("desert-of-the-real");
    expect(resolveTheme("awake")).toBe("providence");
    expect(resolveTheme("device")).toBe("desert-of-the-real");
  });
});

it("retains a choice when storage is readable but writes fail", () => {
  values.set("neon1.mode", "light");
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: () => { throw Error("quota"); } });
  saveLook("desert-of-the-real");
  expect(readLook()).toBe("desert-of-the-real");
  // Clear the failed-write fallback through a successful subsequent choice.
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  saveLook("awake");
});

// Two switches on one page (the menu's mode and family) both redraw from a pick made with either one
it("announces a pick to the page it was made on", () => {
  const events: string[] = [];
  vi.stubGlobal("dispatchEvent", (e: Event) => { events.push(e.type); return true; });
  saveLook("plugged");
  saveLook("providence");
  expect(events).toEqual([LOOK_EVENT, LOOK_EVENT]);
  // The other axis is never put back: the newest pick is what's read
  expect(readLook()).toBe("providence");
});
