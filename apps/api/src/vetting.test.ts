// apps/api/src/vetting.test.ts - The production checks that need no network: the bundled places and
// throwaway-domain lists, how place names compare, and which addresses the website check refuses.
import { describe, expect, it } from "vitest";
import { placeCheck } from "./lib/vet.ts";
import { placeKey, RealVetting } from "./vetting/real.ts";

const v = new RealVetting();

describe("places", () => {
  it("finds cities, towns, and neighborhoods in their state, in their proper spelling", async () => {
    expect(await v.place("albany", "NY")).toBe("Albany");
    expect(await v.place("Bayside", "NY")).toBe("Bayside");
    expect(await v.place("Oakland Gardens", "ny")).toBe("Oakland Gardens");
    expect(await v.place("Cumming", "GA")).toBe("Cumming");
    expect(await v.place("St. Louis", "MO")).toMatch(/Louis/);
    expect(await v.place("Saint Louis", "MO")).toMatch(/Louis/);
    expect(await v.place("Canon City", "CO")).toBeTruthy();
    expect(await v.place("Albany", "WY")).toBeTruthy();
  });
  it("refuses made-up places and cities in the wrong state", async () => {
    expect(await v.place("Gotham", "NY")).toBeUndefined();
    expect(await v.place("Asdfgh", "CA")).toBeUndefined();
    expect(await v.place("Brooklyn Heights Zzz", "NY")).toBeUndefined();
    expect(await v.place("Albany", "HI")).toBeUndefined();
  });
  it("stores a place as City, ST, the state alone, or a place outside the US as typed", async () => {
    expect(await placeCheck(v, "queens, NY")).toEqual({ place: "Queens, NY" });
    expect(await placeCheck(v, "New York, NY")).toEqual({ place: "New York, NY" });
    expect(await placeCheck(v, "NJ")).toEqual({ place: "New Jersey" });
    // Not a US state: a place outside the US, kept as typed; a US town the list misses is kept too
    expect(await placeCheck(v, "Toronto,  Canada")).toEqual({ place: "Toronto, Canada" });
    expect(await placeCheck(v, "x")).toEqual({ problem: expect.stringMatching(/at least 2/) });
    expect(await placeCheck(v, "Gotham, NY")).toEqual({ place: "Gotham, NY" });
  });
  it("compares names without case, accents, punctuation, or Saint/St", () => {
    expect(placeKey("Cañon City")).toBe(placeKey("canon city"));
    expect(placeKey("Saint Paul")).toBe(placeKey("St. Paul"));
    expect(placeKey("The Bronx")).toBe(placeKey("bronx"));
  });
});

describe("throwaway mailboxes", () => {
  it("knows the common services and their subdomains, and passes ordinary providers", async () => {
    expect(await v.disposable("mailinator.com")).toBe(true);
    expect(await v.disposable("mail.mailinator.com")).toBe(true);
    expect(await v.disposable("10minutemail.com")).toBe(true);
    for (const d of ["gmail.com", "outlook.com", "neon1.tech", "icloud.com", "yahoo.com", "proton.me"]) expect(await v.disposable(d)).toBe(false);
  });
});

describe("websites", () => {
  it("are never visited: the checks have no way to fetch an address someone typed", () => {
    expect("reachable" in v).toBe(false);
  });
});
