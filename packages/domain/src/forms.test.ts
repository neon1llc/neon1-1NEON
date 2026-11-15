// packages/domain/src/forms.test.ts - The shared form rules: names, junk, offensive words, email shape,
// and how a place is written and split.
import { describe, expect, it } from "vitest";
import { emailShapeOk, joinPlace, looksLikeJunk, nameProblem, offensive, placeShapeProblem, splitPlace, stateCode, textProblem } from "./forms.ts";

describe("names", () => {
  it("takes real names from anywhere, and asks for a last name unless they use one", () => {
    for (const n of ["Dana Kim", "Mary-Jane O'Neil", "José Álvarez", "Nguyễn Văn An", "J. R. Smith", "Dick Cheney", "Raj Dikshit"]) expect(nameProblem(n)).toBeUndefined();
    expect(nameProblem("Madonna")).toBe("Enter your first and last name.");
    expect(nameProblem("Madonna", true)).toBeUndefined();
  });
  it("refuses numbers, links, junk, and slurs", () => {
    expect(nameProblem("Dana 2")).toMatch(/numbers/);
    expect(nameProblem("www.x.com y")).toMatch(/links/);
    expect(nameProblem("asdf asdf")).toBe("Enter your real name.");
    expect(nameProblem("aaaaaa bbbbb")).toBe("Enter your real name.");
    expect(nameProblem("Fuck Off")).toBe("Enter your real name.");
    expect(nameProblem("")).toBe("Enter your name.");
  });
});

describe("free text", () => {
  it("passes real places and businesses whose names only contain a rude string", () => {
    for (const t of ["Cumming", "Penistone Tools", "Shiitake Farms", "Scunthorpe Plumbing", "Hancock Dental", "Studio 54", "Butts Family Dentistry"]) {
      expect(offensive(t)).toBe(false);
      expect(textProblem(t)).toBeUndefined();
    }
  });
  it("catches the unmistakable, including look-alikes and spaced letters", () => {
    for (const t of ["fuck this", "sh1t co", "f u c k", "f.u.c.k", "bullshit inc"]) expect(offensive(t)).toBe(true);
    expect(looksLikeJunk("!!!!")).toBe(true);
    expect(looksLikeJunk("test")).toBe(true);
    expect(looksLikeJunk("Test Kitchen LLC")).toBe(false);
    expect(textProblem("", "it")).toBeUndefined();
  });
});

describe("email shape", () => {
  it("takes ordinary addresses and refuses broken ones", () => {
    for (const e of ["dana@example.com", "a.b+tag@sub.example.co.uk", "x@neon1.tech"]) expect(emailShapeOk(e)).toBe(true);
    for (const e of ["dana", "dana@", "@x.com", "a..b@x.com", "a@x", "a@x.c", "a b@x.com", "a@-x.com", ".a@x.com"]) expect(emailShapeOk(e)).toBe(false);
  });
});

describe("places", () => {
  it("joins and splits city and state, and needs a state with a city", () => {
    expect(joinPlace("Albany", "NY")).toBe("Albany, NY");
    expect(joinPlace("", "ny")).toBe("New York");
    expect(splitPlace("Albany, NY")).toEqual({ city: "Albany", state: "NY" });
    expect(splitPlace("New York")).toEqual({ city: "", state: "NY" });
    expect(splitPlace("Queens, New York")).toEqual({ city: "Queens", state: "NY" });
    expect(stateCode("Puerto Rico")).toBe("PR");
    expect(placeShapeProblem("Albany", "")).toMatch(/state/);
    expect(placeShapeProblem("", "NY")).toBeUndefined();
  });
});
