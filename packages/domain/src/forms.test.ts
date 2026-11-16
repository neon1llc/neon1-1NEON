// packages/domain/src/forms.test.ts - The shared form rules: names, junk, offensive words, email shape, minimum lengths,
// and how a place is written and split.
import { describe, expect, it } from "vitest";
import { emailShapeOk, joinPlace, looksLikeJunk, messageProblem, MIN_TEXT, nameProblem, offensive, placeShapeProblem, splitPlace, stateCode, textProblem } from "./forms.ts";

describe("names", () => {
  it("takes real names from anywhere, one name included", () => {
    for (const n of ["Dana Kim", "Mary-Jane O'Neil", "José Álvarez", "Nguyễn Văn An", "J. R. Smith", "Dick Cheney", "Raj Dikshit"]) expect(nameProblem(n)).toBeUndefined();
    expect(nameProblem("Madonna")).toBeUndefined();
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


describe("minimum lengths", () => {
  it("refuses one-letter names and answers, and keeps real short ones", () => {
    expect(nameProblem("L")).toMatch(/at least 2 letters/);
    expect(nameProblem("Li")).toBeUndefined();
    expect(nameProblem("Li Ng")).toBeUndefined();
    expect(textProblem("x", "your organization's name", MIN_TEXT)).toMatch(/at least 2 characters/);
    expect(textProblem("3M", "your organization's name", MIN_TEXT)).toBeUndefined();
    expect(textProblem("ab", "where you found neon1")).toMatch(/at least 3 characters/);
    expect(textProblem("A podcast", "where you found neon1")).toBeUndefined();
    expect(textProblem("   ", "anything")).toBeUndefined();
  });
  it("asks a contact message for a sentence's worth", () => {
    expect(messageProblem("  ")).toMatch(/what's going on/);
    expect(messageProblem("help")).toMatch(/at least 10/);
    expect(messageProblem("Our invoices are late every month.")).toBeUndefined();
  });
});
