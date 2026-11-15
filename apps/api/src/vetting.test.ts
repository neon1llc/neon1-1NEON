// apps/api/src/vetting.test.ts - The production checks that need no network: the bundled places and
// throwaway-domain lists, how place names compare, and which addresses the website check refuses.
import { describe, expect, it } from "vitest";
import { placeCheck } from "./lib/vet.ts";
import { placeKey, privateAddress, RealVetting } from "./vetting/real.ts";

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
  it("stores a checked place as City, ST, or the state alone", async () => {
    expect(await placeCheck(v, "queens, NY")).toEqual({ place: "Queens, NY" });
    expect(await placeCheck(v, "New York, NY")).toEqual({ place: "New York, NY" });
    expect(await placeCheck(v, "NJ")).toEqual({ place: "New Jersey" });
    expect(await placeCheck(v, "Albany")).toEqual({ problem: expect.stringMatching(/state/) });
    expect(await placeCheck(v, "Gotham, NY")).toEqual({ problem: expect.stringMatching(/couldn't find Gotham in New York/) });
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

describe("the website check's guard", () => {
  it("refuses private, loopback, link-local, and metadata addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(privateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111", "172.32.0.1"]) expect(privateAddress(ip)).toBe(false);
  });
  it("refuses other ports and schemes without asking anyone", async () => {
    expect(await v.reachable("http://example.com:8080/")).toBe("refused");
    expect(await v.reachable("ftp://example.com/")).toBe("refused");
  });
});
