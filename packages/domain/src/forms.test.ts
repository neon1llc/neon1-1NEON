// packages/domain/src/forms.test.ts - The shared form rules: names, junk, offensive words, email shape, minimum lengths,
// and how a place is written and split.
import { describe, expect, it } from "vitest";
import { claimsToBeNeon1, cleanName, orgNameProblem, emailShapeOk, joinPlace, looksLikeJunk, messageProblem, MIN_TEXT, nameProblem, offensive, placeShapeProblem, splitPlace, stateCode, textProblem } from "./forms.ts";

describe("names", () => {
  it("takes real names from anywhere, one name included", () => {
    for (const n of ["Tomas Greer", "Mary-Jane O'Neil", "José Álvarez", "Nguyễn Văn An", "J. R. Smith", "Dick Cheney", "Priya Dikshit"]) expect(nameProblem(n)).toBeUndefined();
    expect(nameProblem("Madonna")).toBeUndefined();
  });
  it("refuses numbers, links, junk, and slurs", () => {
    expect(nameProblem("Tomas 2")).toMatch(/numbers/);
    expect(nameProblem("www.x.com y")).toMatch(/links/);
    expect(nameProblem("asdf asdf")).toBe("Enter your real name.");
    expect(nameProblem("aaaaaa bbbbb")).toBe("Enter your real name.");
    expect(nameProblem("Fuck Off")).toBe("Enter your real name.");
    expect(nameProblem("")).toBe("Enter your name.");
  });
});

describe("the name rule", () => {
  it("takes names in many alphabets, with their punctuation", () => {
    for (const n of ["Zoë D’Angelo", "Jean-Luc O'Brien Jr.", "Gal·la Puig", "Дмитрий Иванов", "Ελένη Παπαδοπούλου", "محمد علي", "प्रिया शर्मा", "ปิยะ สุขใจ", "王伟", "山田 たろう", "タナカ ケン", "김민준", "John Smith 王伟", "Pradeep Kumar", "Anil Pradeep", "Priya Tathineni", "Neo Mokoena", "Neo", "Joe Root", "Sam Staff", "TEST-Client-Account"]) expect(nameProblem(n), n).toBeUndefined();
  });
  it("stores one spelling", () => {
    expect(cleanName("  Ｄａｎａ \u00a0 Kim ")).toBe("Dana Kim");
    expect(cleanName("𝐏𝐫𝐢𝐲𝐚")).toBe("Priya");
    expect(cleanName("Mary\u2011Jane")).toBe("Mary-Jane");
    expect(cleanName("Zoe\u0308")).toBe("Zoë");
  });
  it("refuses invisible and direction characters", () => {
    for (const ch of ["\u0000", "\u200b", "\u200c", "\u200d", "\u200e", "\u202e", "\u2066", "\ufeff", "\u00ad", "\u034f", "\u3164", "\ufe0f", "\u{e0041}"]) expect(nameProblem(`Da${ch}na Kim`), JSON.stringify(ch)).toMatch(/hidden/);
    expect(orgNameProblem("Ac\u202eme")).toMatch(/hidden/);
  });
  it("refuses brackets, symbols, and emoji", () => {
    for (const n of ["[TEST] Dana", "Dana (Kim)", "Dana <b>", "Dana_Kim", "Dana, Kim", "Dana ✔", "Dana 😀", "'Dana", "Dana \u0301Kim"]) expect(nameProblem(n), n).toBeDefined();
  });
  it("refuses mixed alphabets in a word and piled-up marks", () => {
    expect(nameProblem("D\u0430na Kim")).toMatch(/one alphabet/);
    expect(nameProblem("Dana Kim\u0300\u0301\u0302\u0303\u0304\u0305")).toMatch(/accent/);
    expect(nameProblem("Dana Kiq\u0301\u0301")).toMatch(/accent/);
    expect(nameProblem("A".repeat(40) + " " + "Bo".repeat(21))).toMatch(/80/);
  });
  it("keeps neon1's names for neon1, look-alikes included", () => {
    for (const n of ["neon1", "NEON1", "1NEON", "1 N E O N", "ne0n1 Support", "Neon One", "Dana from neon1", "Admin", "adm1n", "Site Admin", "Administrator", "Moderator", "Support", "Support Team", "Security", "Neon Support", "Neo AI", "Official", "Pradeep", "PRADEEP.", "Pra deep", "Pradeep Tathineni", "Tathineni Pradeep", "Pradeep T.", "Pradeep Support", "Рrаdеер", "Ｐｒａｄｅｅｐ", "Prádeep", "ѕуѕтем", "P.r.a.d.e.e.p"]) expect(claimsToBeNeon1(n), n).toBe(true);
    for (const n of ["Pradeep Kumar", "Pradeep T Rao", "Neo", "Neon", "Teamsworth", "Admiral Jones", "Supriya Das", "Tamara Root"]) expect(claimsToBeNeon1(n), n).toBe(false);
    expect(nameProblem("Pradeep")).toBe("Add your last name.");
    expect(nameProblem("Support Team")).toMatch(/reserved/);
    expect(nameProblem("Pradeep Tathineni", { neon1: true })).toBeUndefined();
    expect(orgNameProblem("neon1 Billing")).toMatch(/reserved/);
    expect(orgNameProblem("Studio 54")).toBeUndefined();
    expect(orgNameProblem("Pradeep Consulting")).toBeUndefined();
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
    for (const e of ["tomas@example.com", "a.b+tag@sub.example.co.uk", "x@neon1.tech"]) expect(emailShapeOk(e)).toBe(true);
    for (const e of ["dana", "tomas@", "@x.com", "a..b@x.com", "a@x", "a@x.c", "a b@x.com", "a@-x.com", ".a@x.com"]) expect(emailShapeOk(e)).toBe(false);
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
