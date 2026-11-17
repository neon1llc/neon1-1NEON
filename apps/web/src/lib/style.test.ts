// apps/web/src/lib/style.test.ts - Browser and account preference compatibility across both theme families.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeLook, readLook, resolveTheme, saveLook, setStyleChoice } from "./style.ts";

// Fresh browser storage for each scenario; the device is deliberately dark
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});

describe("theme and mode", () => {
  it("does not inherit the device's dark mode when changing family", () => {
    expect(readLook()).toBe("awake");
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
