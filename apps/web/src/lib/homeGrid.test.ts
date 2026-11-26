import { describe, expect, it } from "vitest";
import { compact, flow, move, reconcile, sizeAt, snap } from "./homeGrid.ts";

const S = [{ key: "S", w: 3, h: 4 }, { key: "M", w: 6, h: 7 }, { key: "L", w: 6, h: 11 }];

describe("home grid", () => {
  it("packs cards upward with no gaps", () => {
    expect(compact([{ id: "a", x: 0, y: 5, w: 6, h: 2 }, { id: "b", x: 6, y: 9, w: 6, h: 2 }]).map((c) => c.y)).toEqual([0, 0]);
  });
  it("pushes the card a moved card lands on below it", () => {
    const cells = flow([{ id: "a", w: 12, h: 2 }, { id: "b", w: 12, h: 3 }], 12);
    const out = compact(move(cells, "b", { y: 0 }, 12));
    expect(out.find((c) => c.id === "b")!.y).toBe(0);
    expect(out.find((c) => c.id === "a")!.y).toBe(3);
  });
  it("keeps a moved card inside the grid", () => {
    expect(move([{ id: "a", x: 0, y: 0, w: 6, h: 2 }], "a", { x: 10 }, 12)[0]!.x).toBe(6);
  });
  it("snaps a free size to the nearest preset", () => {
    expect(snap(4.2, 5, S).key).toBe("S");
    expect(snap(5.8, 8, S).key).toBe("M");
    expect(snap(6, 10, S).key).toBe("L");
  });
  it("maps presets to a phone's four columns", () => {
    expect(sizeAt(S[0]!, "narrow").w).toBe(2);
    expect(sizeAt(S[1]!, "narrow").w).toBe(4);
  });
  it("keeps saved places and adds new cards where they fit", () => {
    const out = reconcile([{ id: "a", x: 6, y: 0, w: 6, h: 2 }, { id: "gone", x: 0, y: 0, w: 6, h: 2 }], [{ id: "a", w: 6, h: 2 }, { id: "b", w: 6, h: 2 }], 12);
    expect(out).toEqual([{ id: "a", x: 6, y: 0, w: 6, h: 2 }, { id: "b", x: 0, y: 0, w: 6, h: 2 }]);
  });
  it("clamps a wide layout's cards to a narrower grid", () => {
    expect(reconcile([{ id: "a", x: 6, y: 0, w: 6, h: 2 }], [{ id: "a", w: 4, h: 2 }], 4)[0]).toEqual({ id: "a", x: 0, y: 0, w: 4, h: 2 });
  });
});

import { resizeTo, tidy, viewFor } from "./homeGrid.ts";
describe("free sizing", () => {
  const P = [{ key: "S", w: 3, h: 4 }, { key: "M", w: 6, h: 7 }, { key: "L", w: 6, h: 11 }];
  it("lands on a preset within about a cell of it", () => {
    expect(resizeTo(5.5, 7.8, P, 12)).toEqual({ w: 6, h: 7, preset: "M" });
  });
  it("stays free between presets", () => {
    expect(resizeTo(8.2, 9.1, P, 12)).toEqual({ w: 8, h: 9 });
  });
  it("shows the layout of the widest preset that fits, then the tallest", () => {
    expect(viewFor({ w: 8, h: 9 }, P)).toBe("M");
    expect(viewFor({ w: 2, h: 2 }, P)).toBe("S");
    // A card fitted shorter than its preset keeps that preset's layout
    expect(viewFor({ w: 6, h: 4 }, P)).toBe("M");
    expect(viewFor({ w: 6, h: 12 }, P)).toBe("L");
  });
  it("tidies urgent cards first, packed with no gaps", () => {
    const out = tidy([{ id: "a", x: 0, y: 9, w: 6, h: 2 }, { id: "b", x: 6, y: 0, w: 6, h: 2 }], (id) => (id === "a" ? 0 : 1), 12);
    expect(out.find((c) => c.id === "a")).toMatchObject({ x: 0, y: 0 });
  });
});
