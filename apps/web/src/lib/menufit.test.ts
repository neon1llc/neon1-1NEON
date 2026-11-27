import { describe, expect, it } from "vitest";
import { fitRoom } from "./menufit.ts";

describe("fitRoom", () => {
  it("ends above the visible end of the screen", () => {
    expect(fitRoom(200, 700, [])).toBe(488);
  });
  it("ends above a bar drawn over the bottom", () => {
    expect(fitRoom(200, 700, [640])).toBe(428);
  });
  it("keeps a few rows when there's almost no room", () => {
    expect(fitRoom(380, 400, [])).toBe(120);
  });
});
